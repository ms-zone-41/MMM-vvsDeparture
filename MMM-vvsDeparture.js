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
		// The departures and the name of the stop from VVS, and why they are missing
		this.departures = null;
		this.stopName = null;
		this.error = null;
		this.reason = null;
		this.sendSocketNotification("GET_DEPARTURES", { identifier: this.identifier, config: this.config });
	},

	socketNotificationReceived(notification, payload) {
		if (notification === `${this.identifier}_NEW_DEPARTURES`) {
			// VVS answers an ID with its location, an unknown ID with none, and a
			// name with all the places that match it
			if (payload.locations?.length === 1) {
				this.departures = payload.stopEvents ?? [];
				this.stopName = payload.locations[0].disassembledName ?? payload.locations[0].name;
				this.error = null;
			} else {
				this.error = this.translate("STATION_NOT_FOUND", { STATION_ID: this.config.station_id });
			}
			this.reason = null;
			this.updateDom();
		} else if (notification === `${this.identifier}_ERROR`) {
			this.error = this.translate("LOAD_ERROR");
			this.reason = payload.reason;
			this.updateDom();
		}
	},

	getDom() {
		const wrapper = document.createElement("div");
		const departures = (this.departures ?? []).filter((departure) => this.matches(departure.transportation.number, this.config.number)
			&& this.matches(departure.transportation.destination.name, this.config.direction));
		const trains = this.groupCoupledTrains(departures).slice(0, this.config.maximumEntries);
		if (this.error || trains.length === 0) {
			// LOADING is a translation of MagicMirror²
			const message = document.createElement("div");
			message.className = "small dimmed";
			message.textContent = this.error ?? this.translate(this.departures ? "NO_DEPARTURES" : "LOADING");
			wrapper.append(message);
			if (this.reason) {
				// Why the departures could not be loaded, e.g. HTTP 503
				const reason = document.createElement("div");
				reason.className = "xsmall dimmed";
				reason.textContent = this.reason;
				wrapper.append(reason);
			}
			return wrapper;
		}
		const table = document.createElement("table");
		table.className = "departure";
		table.append(...trains.map((train) => this.getRow(train)));
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

	// A row: the planned time, the realtime status, the lines and the
	// destinations of a departure, or of the parts of a coupled train
	getRow(departures) {
		const row = document.createElement("tr");
		row.className = "small dimmed";

		const time = document.createElement("td");
		time.className = "time";
		time.textContent = this.formatTime(departures[0].departureTimePlanned);

		// The cancellation, the delay, or nothing without realtime data
		const status = document.createElement("td");
		const delay = this.getDelay(departures);
		if (this.isCancelled(departures[0])) {
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
		line.textContent = [...new Set(departures.map((departure) => departure.transportation.number))].join("/");

		const destination = document.createElement("td");
		destination.className = "direction";
		destination.textContent = [...new Set(departures.map((departure) => departure.transportation.destination.name))].join(", ");

		row.append(time, status, line, destination);
		return row;
	},

	// The local time of a timestamp as HH:mm
	formatTime(timestamp) {
		const date = new Date(timestamp);
		return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
	},

	// The delay in whole minutes, or null without a valid realtime estimate.
	// Like VVS, the module cuts off the seconds, so a departure 36 seconds late
	// is on time. Of the parts of a coupled train, the earliest counts.
	getDelay(departures) {
		const delays = departures
			.filter((departure) => departure.isRealtimeControlled === true)
			.map((departure) => Math.trunc((Date.parse(departure.departureTimeEstimated) - Date.parse(departure.departureTimePlanned)) / 60000))
			.filter(Number.isFinite);
		return delays.length > 0 ? Math.min(...delays) : null;
	},

	// VVS reports a cancelled departure with isCancelled or in realtimeStatus
	isCancelled(departure) {
		const status = departure.realtimeStatus ?? [];
		return departure.isCancelled === true || status.includes("TRIP_CANCELLED") || status.includes("DEPARTURE_CANCELLED");
	},

	// VVS lists a coupled train once for each of its lines, e.g. S6 and S60.
	// Trains that leave at the same planned time from the same platform are one
	// train if they have the same destination or come from the same origin; a
	// train that splits later on has several destinations. Returns the
	// departures in rows, the parts of a train sorted by line.
	groupCoupledTrains(departures) {
		const groups = [];
		for (const departure of departures) {
			const key = this.getCoupledTrainKey(departure);
			const group = key !== null && groups.find((candidate) => candidate.key === key
				&& candidate.departures.some((part) => this.isSameStop(part.transportation.destination, departure.transportation.destination)
					|| this.isSameStop(part.transportation.origin, departure.transportation.origin)));
			if (group) {
				group.departures.push(departure);
			} else {
				groups.push({ key, departures: [departure] });
			}
		}
		return groups.map((group) => group.departures.sort((a, b) => String(a.transportation.number).localeCompare(String(b.transportation.number), undefined, { numeric: true })
			|| String(a.transportation.destination.name).localeCompare(String(b.transportation.destination.name))));
	},

	// What the parts of a coupled train have in common, or null if the
	// departure is not a train or its platform is unknown. Only trains are
	// grouped (EFA product classes 0 train, 1 S-Bahn, 13 to 16 regional and
	// long-distance trains): buses, Stadtbahn trains and trams can leave
	// together to the same destination. Cancelled parts are not combined with
	// parts that run.
	getCoupledTrainKey(departure) {
		const productClass = departure.transportation.product?.class;
		const platform = this.getPlatform(departure);
		if (![0, 1, 13, 14, 15, 16].includes(productClass) || !platform) {
			return null;
		}
		return JSON.stringify([departure.departureTimePlanned, platform, productClass, this.isCancelled(departure)]);
	},

	// The platform as the stop and the number of the platform, or null if it
	// is unknown. If a train leaves from a different part of the station than
	// planned, VVS gives the stop as its location; then the number, e.g. "13",
	// is right, but the name, e.g. "Gleis 13", may still be the planned one.
	// Some extra trips only have a name, e.g. "13".
	getPlatform({ location }) {
		const stop = location?.parent?.id;
		const number = location?.properties?.platform || location?.properties?.platformName;
		return stop && number ? `${stop} ${String(number).replace(/^Gleis /, "")}` : null;
	},

	// Whether two stops are known and the same
	isSameStop(stop, other) {
		return Boolean(stop?.id) && stop.id === other?.id;
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
