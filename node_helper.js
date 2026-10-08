/* MagicMirror²
 * Module: MMM-vvsDeparture
 *
 * By Fabian Hinder
 * forked from niklaskappler
 * MIT Licensed.
 */

var NodeHelper = require("node_helper");
const Log = require("logger");

const BASE_URL = "https://www3.vvs.de";

// The number of departures to fetch. VVS counts the departures of all lines
// and directions, so the module needs many more than it shows when the
// configuration filters them.
const LIMIT = 100;

module.exports = NodeHelper.create({
	// fetch is built into Node.js 18, which MagicMirror² requires since 2.25.0
	requiresVersion: "2.25.0",

	start: function () {
		// The update timer of each module instance, by its identifier
		this.timers = {};
	},

	stop: function () {
		var self = this;
		Object.keys(self.timers).forEach(function (identifier) {
			clearInterval(self.timers[identifier]);
		});
		self.timers = {};
	},

	/* socketNotificationReceived(notification, payload)
	 * This method is called when a socket notification arrives.
	 *
	 * argument notification string - The identifier of the noitication.
	 * argument payload mixed - The payload of the notification.
	 */
	socketNotificationReceived: function (notification, payload) {
		var self = this;

		if (notification === "GET_DEPARTURES") {
			// A module instance asks again whenever the page is loaded again,
			// and every browser that shows the mirror asks as well. Replace the
			// timer of the instance instead of starting one more.
			clearInterval(self.timers[payload.identifier]);
			self.retrieveStationData(
				payload.config.station_id,
				payload.config.offset,
				payload.identifier);
			self.timers[payload.identifier] = setInterval(function () {
				self.retrieveStationData(
					payload.config.station_id,
					payload.config.offset,
					payload.identifier);
			}, payload.config.reloadInterval);
		}
	},

	retrieveStationData: function (stationId, offset, moduleIdentifier) {
		var self = this;

		var path = "/mngvvs/XML_DM_REQUEST?"
			+ `limit=${LIMIT}&`
			+ `mode=direct&`
			+ `name_dm=${stationId}&`
			+ `outputFormat=rapidJSON&` // `outputFormat=JSON&`
			+ `type_dm=any&`
			+ `useRealtime=1`;

		if (offset != undefined) {
			var d = new Date();
			d.setMinutes(d.getMinutes() + offset);
			path += `&itdDateYear=` + d.getFullYear().toString();
			path += `&itdDateMonth=` + (d.getMonth() + 1).toString();
			path += `&itdDateDay=` + d.getDate().toString();
			path += `&itdTimeHour=` + d.getHours().toString();
			path += `&itdTimeMinute=` + d.getMinutes().toString();
		}
		var url = BASE_URL + path;

		// Give up a request that VVS does not answer, before the next one
		fetch(encodeURI(url), { signal: AbortSignal.timeout(30 * 1000) })
			.then(function (response) {
				if (!response.ok) {
					throw new Error("HTTP " + response.status);
				}
				return response.json();
			})
			.then(function (data) {
				self.sendSocketNotification(moduleIdentifier + "_NEW_DEPARTURES", self.withoutIncompleteMinute(data));
			})
			.catch(function (error) {
				Log.error(self.name + ": Could not load the departures of " + stationId + " from VVS: " + error.message);
				self.sendSocketNotification(moduleIdentifier + "_ERROR", { message: error.message });
			});
	},

	// VVS sorts the departures by their planned time and cuts them off at the
	// limit, even within a minute. If it sends as many departures as requested,
	// those of the last minute may be incomplete, e.g. only one part of a
	// coupled train. Leave them out, unless they are all there is. VVS answers a
	// station that it does not know without departures.
	withoutIncompleteMinute: function (data) {
		var stopEvents = data && data.stopEvents;
		if (!Array.isArray(stopEvents) || stopEvents.length < LIMIT) {
			return data;
		}
		var lastMinute = stopEvents[stopEvents.length - 1].departureTimePlanned;
		var complete = stopEvents.filter(function (stopEvent) {
			return stopEvent.departureTimePlanned !== lastMinute;
		});
		if (complete.length === 0) {
			return data;
		}
		return Object.assign({}, data, { stopEvents: complete });
	}
});
