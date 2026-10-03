/* global Module */

/* Magic Mirror
 * Module: MMM-vvsDeparture
 *
 * By Fabian Hinder
 * forked from nilaskappler
 * MIT Licensed.
 * 
 */
Module.register("MMM-vvsDeparture", {

	defaults: {
		station_id: 'de:08111:6112',
		station_name: "",
		maximumEntries: 6,
		reloadInterval: 1 * 60 * 1000, // every minute
		colorDelay: true,
		colorNoDelay: true,
		number: undefined,
		direction: undefined,
		offset: undefined
	},

	requiresVersion: "2.1.0", // Required version of MagicMirror

	// Define required scripts.
	getStyles: function () {
		return ["MMM-vvsDeparture.css"];
	},

	// Define required scripts.
	getScripts: function () {
		return ["moment.js"];
	},

	// Load translations files
	getTranslations: function() {
		return {
			en: "translations/en.json",
			de: "translations/de.json"
		};
	},

	// Overrides start function.
	start: function () {
		var self = this;
		Log.log("Starting module: " + self.name + "as" + self.identifier);

		self.departure = [];
		self.sendSocketNotification("GET_DEPARTURES",
			{
				"config": self.config,
				"identifier": this.identifier,
			});
	},

	// socketNotificationReceived from helper
	socketNotificationReceived: function (notification, payload) {
		var self = this;
		if (notification === this.identifier + "_NEW_DEPARTURES") {
			self.departure = payload.stopEvents;
			self.station_name = self.config.station_name ? self.config.station_name : payload.locations[0].disassembledName;
			self.updateDom();
		} else if (notification === this.identifier + "_ERROR") {

		}
	},

	// Override dom generator.
	getDom: function () {
		var self = this;

		var wrapper = document.createElement("div");

		wrapper.appendChild(self.getHeaderDom());

		var tableWrapper = document.createElement("table");
		tableWrapper.className = "departure";

		var added = 0;
		for (var i in self.departure) {
			// If the maximum number of entries is reached
			// stop adding and attach table
			if (added >= self.config.maximumEntries) {
				wrapper.appendChild(tableWrapper);
				return wrapper;
			}

			var currentValue = self.departure[i];

			// Skip if the configuration should hide this
			if(!self.showNumber(currentValue.transportation.number) || !self.showDirection(currentValue.transportation.destination.name)) {
				continue;
			}

			// Row
			var trWrapper = document.createElement("tr");

			// Clock
			var clockWrapper = document.createElement("td");
			clockWrapper.className = "time";

			clockWrapper.innerHTML = moment(currentValue.departureTimePlanned).format("HH:mm");
			trWrapper.appendChild(clockWrapper);

			// Delay, calculated for each departure on its own
			var delayWrapper = document.createElement("td");
			var delay = currentValue.isRealtimeControlled === true
				? self.calculateDelay(currentValue.departureTimePlanned, currentValue.departureTimeEstimated)
				: null;
			if (self.isCancelled(currentValue)) {
				delayWrapper.className = self.config.colorDelay ? "delay color" : "delay";
				delayWrapper.textContent = self.translate("CANCELED");
			} else if (delay === null) {
				// No realtime data: the planned time alone does not confirm punctuality
				delayWrapper.className = "unknown";
				delayWrapper.textContent = "?";
				delayWrapper.title = self.translate("REALTIME_UNKNOWN");
			} else if (delay === 0) {
				delayWrapper.className = self.config.colorNoDelay ? "nodelay color" : "nodelay";
				delayWrapper.textContent = "0";
				delayWrapper.title = self.translate("ON_TIME");
			} else {
				delayWrapper.className = self.config.colorDelay ? "delay color" : "delay";
				delayWrapper.textContent = delay > 0 ? "+" + delay : String(delay);
			}
			trWrapper.appendChild(delayWrapper);

			// Lane
			var laneWrapper = document.createElement("td");
			laneWrapper.className = "number";
			laneWrapper.innerHTML = currentValue.transportation.number;
			trWrapper.appendChild(laneWrapper);

			// Direction
			var directionWrapper = document.createElement("td");
			directionWrapper.className = "direction";
			directionWrapper.innerHTML = currentValue.transportation.destination.name;
			trWrapper.appendChild(directionWrapper);

			trWrapper.className = "small dimmed";
			tableWrapper.appendChild(trWrapper);
			added++;
		}

		wrapper.appendChild(tableWrapper);
		return wrapper;
	},

	stringTemplateParser: function (expression, valueObj) {
		const templateMatcher = /{{\s?([^{}\s]*)\s?}}/g;
		let text = expression.replace(templateMatcher, (substring, value, index) => {
			value = valueObj[value];
			return value;
		});
		return text
	},

	getHeaderDom: function () {
		var self = this;

		var headerWrappper = document.createElement("header");
		if(self.config.offset && self.config.offset >= 0){
			headerWrappper.innerHTML = self.stringTemplateParser(
				self.translate("DIRECTIONS_FROM_WITH_OFFSET"),
				{
					STATION: self.station_name,
					OFFSET: self.config.offset,
				});
		}else {
			headerWrappper.innerHTML = self.stringTemplateParser(
				self.translate("DIRECTIONS_FROM"),
				{STATION: self.station_name});
		}
		return headerWrappper;
	},


	// Returns the delay in minutes, or null if there is no valid estimate
	calculateDelay(departureTimePlanned, departureTimeEstimated){
		var timePlanned = Date.parse(departureTimePlanned);
		var timeEstimated = Date.parse(departureTimeEstimated);
		if (!Number.isFinite(timePlanned) || !Number.isFinite(timeEstimated)) {
			return null;
		}
		return Math.round((timeEstimated - timePlanned) / 60000);
	},

	isCancelled : function(departure) {
		var status = departure.realtimeStatus || [];
		return departure.isCancelled === true
			|| status.indexOf("TRIP_CANCELLED") >= 0
			|| status.indexOf("DEPARTURE_CANCELLED") >= 0;
	},

	showNumber : function(number) {
		var self = this;
		return self.isValue(number, self.config.number);
	},

	showDirection : function(direction) {
		var self = this;
		return self.isValue(direction, self.config.direction);
	},

	isValue : function(input, value) {
		if(!value || !input) {
			return true;
		} else if(value instanceof Array) {
			return value.indexOf(input) >= 0;
		} else if (typeof value === "string" || value instanceof String) {
			return value === input;
		} else if(typeof value === "function" || value instanceof Function) {
			return value(input);
		}
		return false;
	}

});
