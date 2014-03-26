require('soundmanager2');

var soundManager = window.soundManager;
var sm2Loaded = false; // Indicates whether SM2 has been loaded or not.
var queue = []; // Queue where we stuff adds and plays before SM2 has been loaded.
var channels = {}; // Maps of the created channels where sounds are played
var settings = {}; // General settings for each channel (only volume at the moment)
var sounds = {}; // list of available sounds

var volumeTransitions = {
	'none': function (soundId, params, cb) {
		sounds[soundId].setVolume(params.volume);
		if (cb) {
			cb(soundId);
		}
	},
	'fadeTo': function (soundId, params, cb) {
		var volume = params.volume;
		var sound = sounds[soundId];
		var volumeStep = Math.round(50 * (volume - sound.volume) / params.time);

		sound.interval = setInterval(function () {
			var vol = sound.volume + volumeStep;
			if ((volume - vol) * (volume - sound.volume) < 0) {
				sound.setVolume(volume);
				clearInterval(sound.interval);
				if (cb) {
					cb(soundId);
				}
				return;
			}

			sound.setVolume(vol);
		}, 50);
	}
};

function loopSound() {
	this.play({
		onfinish: loopSound
	});
}

function deleteSound() {
	this.volume = 0;
	this.channel[this.id] = false;
}

function playSound(channelName, soundId, params) {
	var channel = channels[channelName];

	var onFinish;
	if (params.loop) {
		onFinish = loopSound;
	} else {
		onFinish = deleteSound;
	}

	var sound = sounds[soundId];
	sound.channel = channel;

	if (params.restart) {
		sound.setPosition(0);
	}

	channel[soundId] = sound.play({ onfinish: onFinish, onstop: deleteSound });
}

function stopSound(soundId) {
	var sound = sounds[soundId];
	if (sound) {
		sound.stop();
		sound.channel[soundId] = false;
	}
}

//Set up the sound manager.
soundManager.setup({
	url: '/assets/swf/default/',
	onready: function () {
		sm2Loaded = true;

		for (var i = 0, l = queue.length; i < l; i++) {
			var sound = queue[i];

			if (sound.action === 'add') {
				add(sound.name, sound.url);
			} else if (sound.action === 'play') {
				playSound(sound.channel, sound.name);
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

function add(name, url) {

	//Check if SM2 is loaded. If not, stuff it in a queue so we can set up the audio later.
	if (!sm2Loaded) {
		queue.push({
			action: 'add',
			name: name,
			url: url
		});

		return;
	}

	sounds[name] = soundManager.createSound({
		id: name,
		url: url,
		volume: 0,
		autoPlay: false,
		autoLoad: false
	});
	sounds[name].channel = false;
}


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
		return;
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

BoomBox.prototype.play = function (channelName, soundList, params) {
	params = params || {};
	var channel = channels[channelName];

	if (!channel) {
		console.error('unknown channel ' + channelName);
		return;
	}

	if (typeof soundList === 'string') {
		if (!sounds[soundList]) {
			if (!params.path) {
				console.error('the sound ' + soundList + ' does not exist.');
				return;
			}

			add(soundList, params.path);
		}
		soundList = [soundList];
	}

	if (!sm2Loaded) {
		queue.push({
			action: 'play',
			soundList: soundList,
			channel: channelName,
			params: params
		});
		return;
	}

	var transParams, transition;

	if (!params.hasOwnProperty('stopAll') || params.stopAll) {

		transition = params.stopTransition || 'fadeTo';
		transParams = {
			volume: 0,
			time: params.stopTime || 500
		};

		for (var id in channel) {
			if (soundList.indexOf(id) === -1) {
				clearInterval(channel[id].interval);
				volumeTransitions[transition](id, transParams, stopSound);
			}
		}
	}

	transition = params.transition || 'fadeTo';
	transParams = {
		volume: params.volume || settings[channelName].volume,
		time: params.startTime || 500
	};

	for (var i = 0, len = soundList.length; i < len; i += 1) {
		var soundId = soundList[i];
		var sound = sounds[soundId];

		if (!sound) {
			console.error('the sound ' + soundId + ' does not exist.');
			return;
		}

		clearInterval(sound.interval);
		volumeTransitions[transition](soundId, transParams);
		if (!channel[soundId]) {
			playSound(channelName, soundId, params);
		}
	}
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

	var transParams = {
		volume: 0,
		time: params.stopTime || 500
	};
	var transition = params.transition || 'fadeTo';

	for (var i = 0, len = soundList.length; i < len; i += 1) {
		var soundId = soundList[i];
		var sound = sounds[soundId];
		if (sound && sound.channel) {
			clearInterval(sound.interval);
			volumeTransitions[transition](soundList[i], transParams, stopSound);
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
	var transParams = {
		volume: 0,
		time: 500
	};

	for (var id in channel) {
		clearInterval(channel[id].interval);
		volumeTransitions[transition](id, transParams);
	}
};

/**
* Unmute audio on all channels
*/
BoomBox.prototype.unmuteAll = function () {
	BoomBox.unmute();
};

BoomBox.prototype.unmute = function (channelName, params) {
	params = params || {};
	var channel = channels[channelName];
	var transition = params.transition || 'fadeTo';
	var transParams = {
		volume: settings[channelName].volume,
		time: 500
	};

	for (var id in channel) {
		clearInterval(channel[id].interval);
		volumeTransitions[transition](id, transParams);
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

module.exports = new BoomBox();
