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
		return ["font-awesome.css", "MMM-vvsDeparture.css"];
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
		self.loaded = false;
		self.error = null;
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
			// VVS answers a station_id that it does not know without locations
			if (!payload.locations || payload.locations.length === 0) {
				self.error = self.translate("STATION_NOT_FOUND", { STATION_ID: self.config.station_id });
			} else {
				self.error = null;
				self.loaded = true;
				self.departure = payload.stopEvents;
				self.station_name = self.config.station_name ? self.config.station_name : payload.locations[0].disassembledName;
			}
			self.updateDom();
		} else if (notification === this.identifier + "_ERROR") {
			// The node helper logs the details
			self.error = self.translate("LOAD_ERROR");
			self.updateDom();
		}
	},

	// Override dom generator.
	getDom: function () {
		var self = this;

		var wrapper = document.createElement("div");

		// If the departures could not be loaded, show why instead, until the
		// next update brings them
		if (self.error) {
			wrapper.appendChild(self.getMessageDom(self.error));
			return wrapper;
		}

		// Until the first departures arrive. LOADING is a translation of
		// MagicMirror.
		if (!self.loaded) {
			wrapper.appendChild(self.getMessageDom(self.translate("LOADING")));
			return wrapper;
		}

		var tableWrapper = document.createElement("table");
		tableWrapper.className = "departure";

		// Skip the departures the configuration should hide, then group the
		// parts of coupled trains to show each train in one row
		var departures = (self.departure || []).filter(function (departure) {
			return self.showNumber(departure.transportation.number)
				&& self.showDirection(departure.transportation.destination.name);
		});
		var groups = self.groupCoupledTrains(departures);

		var added = 0;
		for (var i in groups) {
			// If the maximum number of entries is reached
			// stop adding and attach table
			if (added >= self.config.maximumEntries) {
				wrapper.appendChild(tableWrapper);
				return wrapper;
			}

			// The departures of one row: a single departure, or the parts of a
			// coupled train, which have the same time and cancellation state
			var group = groups[i];
			var currentValue = group[0];
			var cancelled = self.isCancelled(currentValue);

			// Row
			var trWrapper = document.createElement("tr");

			// Time, with the planned departure, which is struck through if the
			// departure is cancelled
			var clockWrapper = document.createElement("td");
			clockWrapper.className = cancelled ? "time cancelled" : "time";
			clockWrapper.textContent = self.formatTime(currentValue.departureTimePlanned);
			trWrapper.appendChild(clockWrapper);

			// Delay. A cancelled departure gets a ban sign. Otherwise the cell
			// shows the delay, or a clock if the departure is on time, if the
			// departure has realtime data with a valid estimate, and stays empty
			// if not.
			var delayWrapper = document.createElement("td");
			var delay = self.getDelay(group);
			if (cancelled) {
				delayWrapper.className = self.config.colorDelay ? "delay color" : "delay";
				delayWrapper.appendChild(self.getBanDom());
			} else if (delay === 0) {
				delayWrapper.className = self.config.colorNoDelay ? "nodelay color" : "nodelay";
				delayWrapper.appendChild(self.getIconDom("fa-regular fa-clock"));
			} else if (delay !== null) {
				delayWrapper.className = self.config.colorDelay ? "delay color" : "delay";
				delayWrapper.textContent = delay > 0 ? "+" + delay : String(delay);
			}
			trWrapper.appendChild(delayWrapper);

			// Lane
			var laneWrapper = document.createElement("td");
			laneWrapper.className = "number";
			laneWrapper.textContent = self.getNumbers(group).join("/");
			trWrapper.appendChild(laneWrapper);

			// Direction
			var directionWrapper = document.createElement("td");
			directionWrapper.className = "direction";
			directionWrapper.textContent = self.getDestinations(group).join(", ");
			trWrapper.appendChild(directionWrapper);

			trWrapper.className = "small dimmed";
			tableWrapper.appendChild(trWrapper);
			added++;
		}

		wrapper.appendChild(tableWrapper);
		return wrapper;
	},

	// MagicMirror shows the header above the module. It names the station,
	// unless a header is configured; an empty one hides the header. Unless
	// station_name is configured, the station is only known after the first
	// update.
	getHeader: function () {
		var self = this;
		if (typeof self.data.header === "string") {
			return self.data.header;
		}
		if (!self.station_name) {
			return "";
		}
		if (self.config.offset && self.config.offset >= 0) {
			return self.translate("DIRECTIONS_FROM_WITH_OFFSET", { STATION: self.station_name, OFFSET: self.config.offset });
		}
		return self.translate("DIRECTIONS_FROM", { STATION: self.station_name });
	},

	// Returns a message to show instead of the departures
	getMessageDom: function (message) {
		var messageWrapper = document.createElement("div");
		messageWrapper.className = "small dimmed";
		messageWrapper.textContent = message;
		return messageWrapper;
	},

	// Returns a Font Awesome icon, e.g. for "fa-regular fa-clock"
	getIconDom: function (icon) {
		var iconWrapper = document.createElement("span");
		iconWrapper.className = icon + " fa-fw";
		return iconWrapper;
	},

	// Returns a ban sign. Font Awesome Free has it only in the solid style,
	// whose strokes are a third thicker than those of the regular clock, so
	// the module draws it with the strokes of the regular style: a ring and a
	// slash, 48 of 512 units wide. MMM-vvsDeparture.css gives it the size of
	// an icon with fa-fw, in em, so that it scales with the font size like
	// the clock. It has the colour of the text.
	getBanDom: function () {
		var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("class", "ban");
		svg.setAttribute("viewBox", "0 0 512 512");
		svg.setAttribute("aria-hidden", "true");
		// The ring runs through the middle of the ring of the clock, from 208
		// to 256 units from the centre. The slash goes from the top left to the
		// bottom right and ends in the ring. Both are one path, so that they do
		// not darken each other where they overlap if the colour is translucent.
		var shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
		shape.setAttribute("d", "M256 24a232 232 0 1 1 0 464 232 232 0 1 1 0-464zM92 92 420 420");
		shape.setAttribute("fill", "none");
		shape.setAttribute("stroke", "currentColor");
		shape.setAttribute("stroke-width", "48");
		svg.appendChild(shape);
		return svg;
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

	// VVS lists a coupled train once for each of its lines, e.g. S6 and S60
	// between Stuttgart and Renningen. Departures of trains at the same planned
	// time from the same platform are parts of one train if they have the same
	// destination or come from the same origin: the parts of a train that
	// splits later on go to different destinations. The parts of a train are
	// grouped, sorted by line, to be shown in one row. Buses, Stadtbahn trains
	// and trams are never grouped: several of them can leave a stop together to
	// the same destination, e.g. the loop lines 622 and 626 at Ditzingen Bf, or
	// U11 and U19 to NeckarPark (Stadion) at Cannstatter Wasen on event days.
	// If only some parts of a train are cancelled, the parts are not grouped
	// either.
	groupCoupledTrains : function(departures) {
		var self = this;
		var groups = [];
		departures.forEach(function (departure) {
			var key = self.getCoupledTrainKey(departure);
			var group = key === null ? undefined : groups.find(function (candidate) {
				return candidate.key === key && candidate.departures.some(function (part) {
					return self.isSameStop(part.transportation.destination, departure.transportation.destination)
						|| self.isSameStop(part.transportation.origin, departure.transportation.origin);
				});
			});
			if (group) {
				group.departures.push(departure);
			} else {
				groups.push({ key: key, departures: [departure] });
			}
		});
		return groups.map(function (group) {
			return group.departures.sort(function (a, b) {
				return String(a.transportation.number).localeCompare(String(b.transportation.number), undefined, { numeric: true })
					|| String(a.transportation.destination.name).localeCompare(String(b.transportation.destination.name));
			});
		});
	},

	// Returns the key that the parts of a coupled train have in common, or null
	// if the departure is not one of a train or its platform is unknown
	getCoupledTrainKey : function(departure) {
		// EFA product classes of trains: train, S-Bahn, and regional and
		// long-distance trains. U-Bahn, Stadtbahn and tram (2 to 4) are left out.
		var trainClasses = [0, 1, 13, 14, 15, 16];
		var product = departure.transportation.product;
		var platform = this.getPlatform(departure);
		if (!product || trainClasses.indexOf(product.class) < 0 || !platform) {
			return null;
		}
		return JSON.stringify([departure.departureTimePlanned, platform, product.class, this.isCancelled(departure)]);
	},

	// Returns the platform that a departure leaves from, as the stop and the
	// number of the platform, or null if it is unknown. VVS gives the platform
	// as the location of a departure, but the stop if the departure leaves from
	// a platform in another part of the station than planned, or if VVS cannot
	// assign the platform, as for some extra trips. The number of the platform,
	// e.g. "13", is usually right in both cases, while its name, e.g.
	// "Gleis 13", can still be the planned one. Rarely, the number does not
	// match the name, e.g. "6" for "Gleis 1" at Grunbach; then the departure is
	// not combined with a part of its train at the platform of that name. Some
	// extra trips only have a name, which VVS also writes as "13".
	getPlatform : function(departure) {
		var location = departure.location;
		if (!location || !location.id) {
			return null;
		}
		var stop = location.parent && location.parent.id;
		var properties = location.properties || {};
		var number = properties.platform || properties.platformName;
		if (stop && number) {
			return stop + " " + String(number).replace(/^Gleis /, "");
		}
		// Without a number, only the id of a platform tells the platform
		return location.id !== stop ? location.id : null;
	},

	// Returns true if both stops are known and the same
	isSameStop : function(stop, other) {
		if (!stop || !other) {
			return false;
		}
		if (stop.id && other.id) {
			return stop.id === other.id;
		}
		return Boolean(stop.name) && stop.name === other.name;
	},

	// Returns the delay of the departures of a train in whole minutes, or null if
	// none of them has realtime data. The parts of a coupled train usually have
	// the same estimate. If not, the earliest one is used, so that the train is
	// not missed.
	getDelay : function(departures) {
		var self = this;
		var delays = departures.map(function (departure) {
			return departure.isRealtimeControlled === true
				? self.calculateDelay(departure.departureTimePlanned, departure.departureTimeEstimated)
				: null;
		}).filter(function (delay) {
			return delay !== null;
		});
		return delays.length > 0 ? Math.min.apply(null, delays) : null;
	},

	// Returns the line numbers of the departures of a row, each once
	getNumbers : function(departures) {
		return this.unique(departures.map(function (departure) {
			return departure.transportation.number;
		}));
	},

	// Returns the destinations of the departures of a row, each once
	getDestinations : function(departures) {
		return this.unique(departures.map(function (departure) {
			return departure.transportation.destination.name;
		}));
	},

	unique : function(values) {
		return values.filter(function (value, index) {
			return values.indexOf(value) === index;
		});
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
