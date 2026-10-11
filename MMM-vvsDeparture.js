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

			const status = document.createElement("td");
			if ("isRealtimeControlled" in departure && departure.isRealtimeControlled == true) {
				var delay = this.calculateDelay(departure.departureTimePlanned, departure.departureTimeEstimated);
			}
			if (delay.getMinutes() != 0) {
				status.className = this.config.colorDelay ? "delay color" : "delay";
			} else {
				status.className = this.config.colorNoDelay ? "nodelay color" : "nodelay";
			}
			status.innerHTML = isNaN(delay.getMinutes()) ? this.translate("CANCELED") : `+${delay.getMinutes()}`;

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

	calculateDelay(departureTimePlanned, departureTimeEstimated) {
		return new Date(new Date(departureTimeEstimated).getTime() - new Date(departureTimePlanned).getTime());
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
