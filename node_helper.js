/* Magic Mirror
 * Module: MMM-vvsDeparture
 *
 * By Fabian Hinder
 * forked from nilaskappler
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const Log = require("logger");

const DEPARTURE_MONITOR = "https://www3.vvs.de/mngvvs/XML_DM_REQUEST";

// VVS counts the departures of all lines and directions, so the module needs
// many more than it shows when the configuration filters them
const LIMIT = 100;

module.exports = NodeHelper.create({
	// fetch is built into Node.js 18, which MagicMirror² requires since 2.25.0
	requiresVersion: "2.25.0",

	start() {
		// The update timer of each module instance, by its identifier
		this.timers = {};
	},

	stop() {
		Object.values(this.timers).forEach(clearInterval);
	},

	// A module instance asks whenever a browser loads the mirror. Its timer is
	// replaced, so that it fetches once per interval however many browsers
	// show the mirror.
	socketNotificationReceived(notification, payload) {
		if (notification === "GET_DEPARTURES") {
			const { identifier, config } = payload;
			const update = () => this.fetchDepartures(identifier, config);
			clearInterval(this.timers[identifier]);
			update();
			// At most every 30 seconds, also if reloadInterval is in seconds or not
			// a number
			this.timers[identifier] = setInterval(update, Math.max(config.reloadInterval, 30 * 1000) || 30 * 1000);
		}
	},

	async fetchDepartures(identifier, { station_id: stationId, offset }) {
		const params = new URLSearchParams({ limit: LIMIT, mode: "direct", name_dm: stationId, outputFormat: "rapidJSON", type_dm: "any", useRealtime: 1 });
		if (offset > 0) {
			// Minutes from now by the clock of VVS, whatever the time zone of
			// the server
			params.set("timeOffset", offset);
		}
		try {
			// Give up a request that VVS does not answer, before the next one
			const response = await fetch(`${DEPARTURE_MONITOR}?${params}`, { signal: AbortSignal.timeout(30 * 1000) });
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			this.sendSocketNotification(`${identifier}_NEW_DEPARTURES`, withoutIncompleteMinute(await response.json()));
		} catch (error) {
			// fetch gives the reason of a network error, e.g. a failed DNS lookup,
			// as the cause, sometimes only as a code
			const reason = error.cause?.message || error.cause?.code || error.message;
			Log.error(`Could not load the departures of ${stationId} from VVS: ${reason}`);
			this.sendSocketNotification(`${identifier}_ERROR`, { reason });
		}
	}
});

// VVS sorts the departures by their planned time and cuts them off at the
// limit, even within a minute. If it sends as many as requested, the last
// minute may lack some, e.g. one part of a coupled train: leave it out,
// unless it is all there is.
function withoutIncompleteMinute(data) {
	const stopEvents = data.stopEvents ?? [];
	if (stopEvents.length < LIMIT) {
		return data;
	}
	const lastMinute = stopEvents.at(-1).departureTimePlanned;
	const complete = stopEvents.filter((stopEvent) => stopEvent.departureTimePlanned !== lastMinute);
	return complete.length > 0 ? { ...data, stopEvents: complete } : data;
}
