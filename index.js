require('soundmanager2');

var soundManager = window.soundManager;
var sm2Loaded = false; // Indicates whether SM2 has been loaded or not.
var queue = []; // Queue where we stuff adds and plays before SM2 has been loaded.
var channels = {}; // Maps of the created channels where sounds are played
var settings = {}; // General settings for each channel (only volume at the moment)
var sounds = {}; // list of available sounds

var boombox;

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
	this.setVolume(0);
	delete this.channel[this.id];
	this.channel = false;
}

function loopSound() {
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
		queue.push({
			action: 'add',
			id: id,
			url: url
		});

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
	url: '/assets/swf/default/',
	onready: function () {
		sm2Loaded = true;

		for (var i = 0, l = queue.length; i < l; i++) {
			var queued = queue[i];

			if (queued.action === 'add') {
				add(queued.id, queued.url);
			} else if (queued.action === 'play') {
				boombox.play(queued.channel, queued.id, queued.params);
			}
		}
	}
});


function loadSettings() {
	var loadedSettings = localStorage.getItem('boomBox');

	if (!loadedSettings) {
		return;
	}

	try {
		settings = JSON.parse(loadedSettings);
	} catch (e) {
		console.error('could not load the settings');
	}
}

loadSettings();


function BoomBox() {

}

BoomBox.prototype.saveSettings = function () {
	try {
		localStorage.setItem('boomBox', JSON.stringify(settings));
	} catch (e) {
		console.error('could not save the settings');
	}
};

BoomBox.prototype.getChannelVolume = function (channelName) {
	if (!settings[channelName]) {
		return 0;
	}
	return settings[channelName].volume;
};

BoomBox.prototype.addChannel = function (name, volume) {
	if (!channels[name]) {
		channels[name] = {};
		settings[name] = settings[name] || { volume: volume };
	}
};

BoomBox.prototype.add = function (name, url) {
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

BoomBox.prototype.play = function (channelName, id, params) {
	params = params || {};
	var channel = channels[channelName];

	if (!channel) {
		console.error('unknown channel', channelName);
		return;
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
		if (!params.path) {
			return console.error('the sound', id, 'does not exist.');
		}

		add(id, params.path);
	}

	if (!sm2Loaded) {
		return queue.push({
			action: 'play',
			id: id,
			channel: channelName,
			params: params
		});
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
		return console.error('the sound', id, 'does not exist.');
	}

	var volume = params.volume || settings[channelName].volume;

	sound.isStarting = true;
	transitionFn(id, volume, function () {
		sound.isStarting = false;
	});

	playSound(channelName, id, params);
};

BoomBox.prototype.stopChannel = function (channelName, params) {
	var soundList = [];
	for (var id in channels[channelName]) {
		soundList.push(id);
	}
	this.stop(soundList, params);
};

BoomBox.prototype.stop = function (soundList, params) {
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
BoomBox.prototype.muteAll = function () {
	soundManager.mute();
};

BoomBox.prototype.mute = function (channelName, params) {
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
BoomBox.prototype.unmuteAll = function () {
	soundManager.unmute();
};

BoomBox.prototype.unmute = function (channelName, params) {
	params = params || {};

	var channel = channels[channelName];
	var transition = params.transition || 'fadeTo';

	for (var id in channel) {
		volumeTransitions[transition](id, settings[channelName].volume);
	}
};

BoomBox.prototype.setVolume = function (channelName, volume) {
	if (volume > 100 || volume < 0) {
		return console.error('Volume needs to be a number between 0 and 100');
	}

	settings[channelName].volume = volume;

	var channel = channels[channelName];
	for (var id in channel) {
		channel[id].setVolume(volume);
	}
};

BoomBox.prototype.isMuted = function () {
	return soundManager.muted;
};

BoomBox.prototype.toggleMuteAll = function () {
	if (soundManager.muted) {
		soundManager.unmuteAll();
	} else {
		soundManager.muteAll();
	}
};

module.exports = boombox = new BoomBox();
