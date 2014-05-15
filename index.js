require('soundmanager2');

var soundManager = window.soundManager;
var sm2Loaded = false; // Indicates whether SM2 has been loaded or not.
var queue = []; // Queue where we stuff adds and plays before SM2 has been loaded.
var channels = {}; // Maps of the created channels where sounds are played
var settings = {}; // General settings for each channel (only volume at the moment)
var sounds = {}; // list of available sounds

var boombox;

var volumeTransitions = {
	none: function (soundId, params, cb) {
		sounds[soundId].setVolume(params.volume);
		if (cb) {
			cb(soundId);
		}
	},
	fadeTo: function (soundId, volume, cb) {
		var time = 500;
		var step = 50;

		var sound = sounds[soundId];

		var diff = volume - sound.volume;
		var volumeStep = Math.ceil(step * diff / time);

		var min = Math.max(volume, 0);
		var max = Math.min(volume, 100);

		clearInterval(sound.interval);
		sound.interval = setInterval(function () {
			var newVolume = sound.volume + volumeStep;
			newVolume = volumeStep > 0 ? Math.min(newVolume, volume) : Math.max(newVolume, volume);

			sound.setVolume(newVolume);

			if (newVolume === volume) {
				clearInterval(sound.interval);
				if (cb) {
					cb(soundId);
				}
			}
		}, step);
	}
};

function loopSound() {
	this.play({
		onfinish: loopSound
	});
}

function deleteSound() {
	this.volume = 0;
	delete this.channel[this.id];
}

function playSound(channelName, soundId, params) {
	params = params || {};

	var channel = channels[channelName];

	var onFinish = params.loop ? loopSound : deleteSound;

	var sound = sounds[soundId];
	sound.channel = channel;

	if (params.restart) {
		sound.setPosition(0);
	}

	var options = { onfinish: onFinish, onstop: deleteSound };

	options.onload = function () {
		if (sound.playState !== 1) {
			sound.play();
		}
	};

	channel[soundId] = sound.play(options);
}

function stopSound(id) {
	var sound = sounds[id];

	if (sound) {
		sound.stop();
		sound.channel = false;
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

BoomBox.prototype.play = function (channelName, id, params) {
	params = params || {};
	var channel = channels[channelName];

	if (!channel) {
		console.error('unknown channel', channelName);
		return;
	}

	if (channel[id]) {
		return;
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

	var transition;

	if (!params.hasOwnProperty('stopAll') || params.stopAll) {
		transition = params.stopTransition || 'fadeTo';
		for (var fadeId in channel) {
			if (fadeId !== id) {
				volumeTransitions[transition](fadeId, 0, stopSound);
			}
		}
	}

	transition = params.transition || 'fadeTo';

	var sound = sounds[id];

	if (!sound) {
		return console.error('the sound', id, 'does not exist.');
	}

	var volume = params.volume || settings[channelName].volume;
	volumeTransitions[transition](id, volume);

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
