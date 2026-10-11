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
		this.sendSocketNotification("GET_DEPARTURES", { identifier: this.identifier, config: this.config });
	},

	socketNotificationReceived(notification, payload) {
		if (notification === `${this.identifier}_NEW_DEPARTURES`) {
			this.departure = payload.stopEvents;
			this.station_name = this.config.station_name || payload.locations[0].disassembledName;
			this.updateDom();
		}
	},

	getDom() {
		const wrapper = document.createElement("div");
		wrapper.appendChild(this.getHeaderDom());
		const table = document.createElement("table");
		table.className = "departure";
		let added = 0;
		for (const departure of this.departure ?? []) {
			if (added >= this.config.maximumEntries) {
				break;
			}
			if (!this.showNumber(departure.transportation.number) || !this.showDirection(departure.transportation.destination.name)) {
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
			line.innerHTML = departure.transportation.number;

			const destination = document.createElement("td");
			destination.className = "direction";
			destination.innerHTML = departure.transportation.destination.name;

			row.append(time, status, line, destination);
			table.append(row);
			added++;
		}
		wrapper.append(table);
		return wrapper;
	},

	stringTemplateParser(expression, values) {
		return expression.replace(/{{\s?([^{}\s]*)\s?}}/g, (match, name) => values[name]);
	},

	getHeaderDom() {
		const header = document.createElement("header");
		const variables = { STATION: this.station_name, OFFSET: this.config.offset };
		header.innerHTML = this.config.offset && this.config.offset >= 0
			? this.stringTemplateParser(this.translate("DIRECTIONS_FROM_WITH_OFFSET"), variables)
			: this.stringTemplateParser(this.translate("DIRECTIONS_FROM"), variables);
		return header;
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

	showNumber(number) {
		return this.isValue(number, this.config.number);
	},

	showDirection(direction) {
		return this.isValue(direction, this.config.direction);
	},

	isValue(input, value) {
		if (!value || !input) {
			return true;
		} else if (value instanceof Array) {
			return value.includes(input);
		} else if (typeof value === "string" || value instanceof String) {
			return value === input;
		} else if (typeof value === "function" || value instanceof Function) {
			return value(input);
		}
		return false;
	}

});
