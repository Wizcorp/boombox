require('soundmanager2');

var soundManager = window.soundManager;
var sm2Loaded = false; // Indicates whether SM2 has been loaded or not.
var queue = {}; // Queue where we stuff adds and plays before SM2 has been loaded.
var channels = {}; // Maps of the created channels where sounds are played
var settings = {}; // General settings for each channel (only volume at the moment)
var sounds = {}; // list of available sounds

var volumeTransitions = {
	none: function (soundId, volume, cb) {
		var sound = sounds[soundId];
		clearInterval(sound.interval);
		sound.isInTransition = false;
		sound.setVolume(volume);
		if (cb) {
			cb(soundId);
		}
	},
	fadeTo: function (soundId, volume, cb) {
		var time = 500;
		var step = 50;

		var sound = sounds[soundId];

		sound.transitionCallBack = cb;
		sound.isInTransition = true;

		var diff = volume - sound.volume;
		var volumeStep = step * diff / time;

		clearInterval(sound.interval);
		sound.interval = setInterval(function () {
			var newVolume = sound.volume + volumeStep;
			newVolume = volumeStep > 0 ? Math.min(newVolume, volume) : Math.max(newVolume, volume);

			sound.setVolume(newVolume);

			if (newVolume === volume) {
				clearInterval(sound.interval);
				sound.isInTransition = false;
				sound.transitionCallBack = null;

				if (cb) {
					cb(soundId);
				}
			}
		}, step);
	}
};

function deleteSound() {
	// this === sound object
	this.setVolume(0);
	delete this.channel[this.id];
	this.channel = false;
}

function loopSound() {
	// this === sound object
	this.play({
		onfinish: loopSound,
		onstop: deleteSound
	});
}

function playSound(channelName, soundId, params) {
	params = params || {};

	var channel = channels[channelName];

	var sound = sounds[soundId];
	sound.channel = channel;

	if (params.restart) {
		sound.setPosition(0);
	}

	var options = { onstop: deleteSound };

	options.onload = function () {
		if (sound.playState !== 1) {
			sound.play();
		}
	};

	options.onfinish = function () {
		if (params.loop) {
			return loopSound.call(sound);
		}

		deleteSound.call(sound);

		if (typeof params.onfinish === 'function') {
			params.onfinish();
		}
	};

	channel[soundId] = sound.play(options);
}

function stopSound(id) {
	var sound = sounds[id];

	if (sound) {
		sound.stop();
	}
}

function add(id, url) {

	//Check if SM2 is loaded. If not, stuff it in a queue so we can set up the audio later.
	if (!sm2Loaded) {
		queue[id] = {
			action: 'add',
			id: id,
			url: url
		};

		return;
	}

	sounds[id] = soundManager.createSound({
		id: id,
		url: url,
		volume: 0,
		autoPlay: false,
		autoLoad: false
	});

	sounds[id].channel = false;
}

//Set up the sound manager.
soundManager.setup({
	url: '/',
	preferFlash: false,
	onready: function () {
		sm2Loaded = true;

		var sounds = Object.keys(queue);

		while (sounds.length) {
			var queueId = sounds.pop();
			var queued = queue[queueId];

			delete queue[queueId];

			if (queued.action === 'add') {
				add(queued.id, queued.url);
			} else if (queued.action === 'play') {
				exports.play(queued.channel, queued.id, queued.params);
			}
		}
	}
});


function loadSettings() {
	try {
		var loadedSettings = localStorage.getItem('boomBox') || '{}';
		settings = JSON.parse(loadedSettings);
	} catch (e) {
		console.warn('[BoomBox]', 'Could not load the settings', e);
	}
}

loadSettings();


exports.saveSettings = function () {
	try {
		localStorage.setItem('boomBox', JSON.stringify(settings));
	} catch (e) {
		console.warn('[BoomBox]', 'Could not save the settings', e);
	}
};

exports.getChannelVolume = function (channelName) {
	if (!settings[channelName]) {
		return 0;
	}
	return settings[channelName].volume;
};

exports.addChannel = function (name, volume) {
	if (!channels[name]) {
		channels[name] = {};
		settings[name] = settings[name] || { volume: volume };
	}
};

exports.add = function (name, url) {
	if (sounds[name]) {
		return;
	}

	add(name, url);
};

function skipTransition(sound) {
	clearInterval(sound.interval);
	sound.isInTransition = false;

	if (sound.transitionCallBack) {
		sound.transitionCallBack(sound.id);
		sound.transitionCallBack = null;
	}
}

function onError(error, onFinish) {
	if (typeof onFinish === 'function') {
		onFinish();
	}
	return console.warn('[BoomBox]', error);
}

exports.play = function (channelName, id, params) {
	params = params || {};
	var channel = channels[channelName];

	if (!channel) {
		return onError('Unknown channel ' + channelName, params.onfinish);
	}

	var sound;
	// if the sound is already playing and we don't want to restart it
	if (channel[id] && !params.restart) {
		sound = sounds[id];

		// the sound volume is not in transition (fade) or it has
		// just been started (fade in): we don't restart the sound.
		if (sound.isStarting || !sound.isInTransition) {
			return;
		}

		// the sound volume is in transition. we skip the transition and start the new requested one.
		skipTransition(sound);
	}

	if (!sounds[id]) {
		if (queue[id]) {
			return onError('The sound ' + id + ' is not loaded yet.', params.onfinish);
		} else if (!params.path) {
			return onError('The sound ' + id + ' does not exist.', params.onfinish);
		}

		add(id, params.path);
	}

	if (!sm2Loaded) {
		return queue[id] = {
			action: 'play',
			id: id,
			channel: channelName,
			params: params
		};
	}

	var transitionFn;

	if (!params.hasOwnProperty('stopAll') || params.stopAll) {
		transitionFn = volumeTransitions[params.stopTransition || 'fadeTo'];
		for (var fadeId in channel) {
			if (fadeId !== id) {
				transitionFn(fadeId, 0, stopSound);
			}
		}
	}

	sound = sounds[id];
	transitionFn = volumeTransitions[params.transition || 'fadeTo'];

	if (!sound) {
		return onError('The sound ' + id + ' does not exist.', params.onfinish);
	}

	var volume = params.volume || settings[channelName].volume;

	sound.isStarting = true;
	transitionFn(id, volume, function () {
		sound.isStarting = false;
	});

	playSound(channelName, id, params);
};

exports.stopChannel = function (channelName, params) {
	var soundList = [];
	for (var id in channels[channelName]) {
		soundList.push(id);
	}
	exports.stop(soundList, params);
};

exports.stop = function (soundList, params) {
	params = params || {};

	if (typeof soundList === 'string') {
		soundList = [soundList];
	}

	var transition = params.transition || 'fadeTo';

	for (var i = 0, len = soundList.length; i < len; i += 1) {
		var soundId = soundList[i];
		var sound = sounds[soundId];
		if (sound && sound.channel) {
			volumeTransitions[transition](soundId, 0, stopSound);
		}
	}
};

/**
 * Mute audio on all channels.
 */
exports.muteAll = function () {
	soundManager.mute();
};

exports.mute = function (channelName, params) {
	params = params || {};

	var channel = channels[channelName];
	var transition = params.transition || 'fadeTo';

	for (var id in channel) {
		volumeTransitions[transition](id, 0);
	}
};

/**
 * Unmute audio on all channels
 */
exports.unmuteAll = function () {
	soundManager.unmute();
};

exports.unmute = function (channelName, params) {
	params = params || {};

	var channel = channels[channelName];
	var transition = params.transition || 'fadeTo';

	for (var id in channel) {
		volumeTransitions[transition](id, settings[channelName].volume);
	}
};

exports.setVolume = function (channelName, volume) {
	if (isNaN(volume)) {
		return;
	}

	volume = Math.min(volume, 100);
	volume = Math.max(volume, 0);

	settings[channelName].volume = volume;

	var channel = channels[channelName];
	for (var id in channel) {
		channel[id].setVolume(volume);
	}
};

exports.isMuted = function () {
	return soundManager.muted;
};

exports.toggleMuteAll = function () {
	if (soundManager.muted) {
		soundManager.unmuteAll();
	} else {
		soundManager.muteAll();
	}
};
