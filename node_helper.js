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

module.exports = NodeHelper.create({
	// fetch is built into Node.js 18, which MagicMirror² requires since 2.25.0
	requiresVersion: "2.25.0",

	socketNotificationReceived(notification, payload) {
		if (notification === "GET_DEPARTURES") {
			const { identifier, config } = payload;
			const update = () => this.fetchDepartures(identifier, config);
			update();
			setInterval(update, config.reloadInterval);
		}
	},

	async fetchDepartures(identifier, { station_id: stationId, offset }) {
		const params = new URLSearchParams({ limit: 40, mode: "direct", name_dm: stationId, outputFormat: "rapidJSON", type_dm: "any", useRealtime: 1 });
		if (offset != undefined) {
			const date = new Date();
			date.setMinutes(date.getMinutes() + offset);
			params.set("itdDateYear", date.getFullYear());
			params.set("itdDateMonth", date.getMonth() + 1);
			params.set("itdDateDay", date.getDate());
			params.set("itdTimeHour", date.getHours());
			params.set("itdTimeMinute", date.getMinutes());
		}
		try {
			// Give up a request that VVS does not answer, before the next one
			const response = await fetch(`${DEPARTURE_MONITOR}?${params}`, { signal: AbortSignal.timeout(30 * 1000) });
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			this.sendSocketNotification(`${identifier}_NEW_DEPARTURES`, await response.json());
		} catch (error) {
			// fetch gives the reason of a network error, e.g. a failed DNS lookup,
			// as the cause, sometimes only as a code
			const reason = error.cause?.message || error.cause?.code || error.message;
			Log.error(`Could not load the departures of ${stationId} from VVS: ${reason}`);
			this.sendSocketNotification(`${identifier}_ERROR`, { reason });
		}
	}
});
