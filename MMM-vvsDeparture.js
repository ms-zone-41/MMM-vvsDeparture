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
		station_id: "de:08111:6112",
		station_name: "",
		maximumEntries: 6,
		reloadInterval: 60 * 1000,
		colorDelay: true,
		colorNoDelay: true,
		number: undefined,
		direction: undefined,
		offset: undefined
	},

	// For fetch in the node helper
	requiresVersion: "2.25.0",

	getStyles() {
		return ["MMM-vvsDeparture.css"];
	},

	getTranslations() {
		return {
			en: "translations/en.json",
			de: "translations/de.json"
		};
	},

	start() {
		Log.info(`Starting module: ${this.name}`);
		this.departure = [];
		this.stopName = null;
		this.sendSocketNotification("GET_DEPARTURES", { identifier: this.identifier, config: this.config });
	},

	socketNotificationReceived(notification, payload) {
		if (notification === `${this.identifier}_NEW_DEPARTURES`) {
			this.departure = payload.stopEvents;
			this.stopName = payload.locations[0].disassembledName ?? payload.locations[0].name;
			this.updateDom();
		}
	},

	getDom() {
		const wrapper = document.createElement("div");
		const table = document.createElement("table");
		table.className = "departure";
		let added = 0;
		for (const departure of this.departure ?? []) {
			if (added >= this.config.maximumEntries) {
				break;
			}
			if (!this.matches(departure.transportation.number, this.config.number) || !this.matches(departure.transportation.destination.name, this.config.direction)) {
				continue;
			}
			const row = document.createElement("tr");
			row.className = "small dimmed";

			const time = document.createElement("td");
			time.className = "time";
			time.textContent = this.formatTime(departure.departureTimePlanned);

			// The cancellation, the delay, or nothing without realtime data
			const status = document.createElement("td");
			const delay = this.getDelay(departure);
			if (this.isCancelled(departure)) {
				status.className = this.config.colorDelay ? "delay color" : "delay";
				status.textContent = this.translate("CANCELED");
			} else if (delay === 0) {
				status.className = this.config.colorNoDelay ? "nodelay color" : "nodelay";
				status.textContent = "+0";
			} else if (delay !== null) {
				status.className = this.config.colorDelay ? "delay color" : "delay";
				status.textContent = delay > 0 ? `+${delay}` : `${delay}`;
			}

			const line = document.createElement("td");
			line.className = "number";
			line.textContent = departure.transportation.number;

			const destination = document.createElement("td");
			destination.className = "direction";
			destination.textContent = departure.transportation.destination.name;

			row.append(time, status, line, destination);
			table.append(row);
			added++;
		}
		wrapper.append(table);
		return wrapper;
	},

	// The header names the stop, unless the configuration sets a header; an
	// empty one hides it
	getHeader() {
		if (typeof this.data.header === "string") {
			return this.data.header;
		}
		const stop = this.config.station_name || this.stopName;
		if (!stop) {
			return "";
		}
		return this.config.offset > 0
			? this.translate("DIRECTIONS_FROM_WITH_OFFSET", { STATION: stop, OFFSET: this.config.offset })
			: this.translate("DIRECTIONS_FROM", { STATION: stop });
	},

	// The local time of a timestamp as HH:mm
	formatTime(timestamp) {
		const date = new Date(timestamp);
		return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
	},

	// The delay in whole minutes, or null without a valid realtime estimate.
	// Like VVS, the module cuts off the seconds, so a departure 36 seconds late
	// is on time.
	getDelay(departure) {
		if (departure.isRealtimeControlled !== true) {
			return null;
		}
		const delay = Math.trunc((Date.parse(departure.departureTimeEstimated) - Date.parse(departure.departureTimePlanned)) / 60000);
		return Number.isFinite(delay) ? delay : null;
	},

	// VVS reports a cancelled departure with isCancelled or in realtimeStatus
	isCancelled(departure) {
		const status = departure.realtimeStatus ?? [];
		return departure.isCancelled === true || status.includes("TRIP_CANCELLED") || status.includes("DEPARTURE_CANCELLED");
	},

	// Whether a line or destination passes the number or direction option: a
	// value, a list of values or a function. Values compare as text, so that
	// number: 622 finds the bus "622".
	matches(value, filter) {
		if (!filter || !value) {
			return true;
		}
		if (typeof filter === "function") {
			return filter(value);
		}
		return [filter].flat().map(String).includes(String(value));
	}

});
