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

	requiresVersion: "2.25.0", // Required version of MagicMirror, for fetch in the node helper

	// Define required scripts.
	getStyles: function () {
		return ["MMM-vvsDeparture.css"];
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
		self.station_name = self.config.station_name;
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

		// Unless it is configured, the station name is only known after the
		// first update
		if (self.station_name) {
			wrapper.appendChild(self.getHeaderDom());
		}

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

			// Clock, with the planned departure
			var clockWrapper = document.createElement("td");
			clockWrapper.className = "time";
			clockWrapper.innerHTML = self.formatTime(currentValue.departureTimePlanned);
			trWrapper.appendChild(clockWrapper);

			// Delay. A cancelled departure is marked as such. Otherwise the cell
			// shows the delay if the departure has realtime data with a valid
			// estimate, and stays empty if not.
			var delayWrapper = document.createElement("td");
			var delay = currentValue.isRealtimeControlled === true
				? self.calculateDelay(currentValue.departureTimePlanned, currentValue.departureTimeEstimated)
				: null;
			if (self.isCancelled(currentValue)) {
				delayWrapper.className = self.config.colorDelay ? "delay color" : "delay";
				delayWrapper.innerHTML = self.translate("CANCELED");
			} else if (delay === 0) {
				delayWrapper.className = self.config.colorNoDelay ? "nodelay color" : "nodelay";
				delayWrapper.innerHTML = "+0";
			} else if (delay !== null) {
				delayWrapper.className = self.config.colorDelay ? "delay color" : "delay";
				delayWrapper.innerHTML = delay > 0 ? "+" + delay : String(delay);
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


	// Returns the local time of a timestamp as HH:mm
	formatTime: function (timestamp) {
		var date = new Date(timestamp);
		return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
	},

	// Returns the delay in whole minutes, or null if there is no valid estimate.
	// Like the delay that VVS reports itself, the fraction of a minute is cut
	// off, so a departure 36 seconds late is on time. For a departure a few
	// seconds early, Math.trunc returns -0, which equals 0.
	calculateDelay(departureTimePlanned, departureTimeEstimated){
		var timePlanned = Date.parse(departureTimePlanned);
		var timeEstimated = Date.parse(departureTimeEstimated);
		if (!Number.isFinite(timePlanned) || !Number.isFinite(timeEstimated)) {
			return null;
		}
		return Math.trunc((timeEstimated - timePlanned) / 60000);
	},

	// VVS reports a cancelled departure with isCancelled, or with TRIP_CANCELLED
	// or DEPARTURE_CANCELLED in realtimeStatus. Such departures usually have no
	// realtime flag and no estimate.
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
