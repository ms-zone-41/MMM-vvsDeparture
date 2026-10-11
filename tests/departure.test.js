// Tests for the departure table

// VVS gives the times in UTC. The module shows them in local time, here that of
// Stuttgart (UTC+2 in October).
process.env.TZ = "Europe/Berlin";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const translations = require("../translations/de.json");

// Load the module like MagicMirror² does
let definition;
new Function("Module", "Log", "document", fs.readFileSync(path.join(__dirname, "../MMM-vvsDeparture.js"), "utf8"))(
	{ register: (name, value) => (definition = value) },
	{ info() {} },
	new JSDOM().window.document
);

// A started module instance. sent holds the socket notifications it sends.
function createModule(config = {}, header = undefined) {
	const module = Object.assign(Object.create(definition), {
		identifier: "module_0_MMM-vvsDeparture",
		config: { ...definition.defaults, ...config },
		data: { header },
		sent: [],
		translate: (key, variables = {}) => (translations[key] ?? key).replace(/{(\w+)}/g, (placeholder, name) => variables[name] ?? placeholder),
		sendSocketNotification(notification, payload) {
			this.sent.push({ notification, payload });
		},
		// MagicMirror² shows a new DOM when the module asks for it
		updateDom() {
			this.shown = this.getDom();
		}
	});
	module.start();
	return module;
}

// The stop in the answer of VVS (shortened)
const DITZINGEN = { id: "de:08118:7000", type: "stop", name: "Ditzingen, Ditzingen", disassembledName: "Ditzingen" };

// The answer of VVS, passed on by the node helper
function receive(module, stopEvents, locations = [DITZINGEN]) {
	module.socketNotificationReceived(`${module.identifier}_NEW_DEPARTURES`, { locations, stopEvents });
}

function render(stopEvents, config) {
	const module = createModule(config);
	receive(module, stopEvents);
	return module.shown;
}

function lines(departures, config) {
	return rows(render(departures, config)).map((row) => row[2]);
}

// The cells of the table, row by row: time, status, line and destination
function cells(wrapper) {
	return Array.from(wrapper.querySelectorAll("tr"), (row) => Array.from(row.children));
}

// The text of the cells
function rows(wrapper) {
	return cells(wrapper).map((row) => row.map((cell) => cell.textContent));
}

// A departure at 21:54 as VVS lists it, without realtime data
function departure(overrides = {}) {
	return {
		departureTimePlanned: "2026-10-02T19:54:00Z",
		transportation: { number: "S6", destination: { name: "Schwabstraße" } },
		...overrides
	};
}

// Realtime data with the estimated departure, in UTC
function estimate(time) {
	return { isRealtimeControlled: true, departureTimeEstimated: `2026-10-02T${time}Z` };
}

test("shows the planned time, the status, the line and the destination of each departure", () => {
	const wrapper = render([
		departure({ departureTimePlanned: "2026-10-02T05:07:00Z", ...estimate("05:07:00"), transportation: { number: "S62", destination: { name: "Weil der Stadt" } } }),
		departure(estimate("19:56:00"))
	]);
	assert.deepEqual(rows(wrapper), [
		["07:07", "+0", "S62", "Weil der Stadt"],
		["21:54", "+2", "S6", "Schwabstraße"]
	]);
	// The classes that the CSS of MagicMirror² and of the module select
	assert.equal(wrapper.querySelectorAll("table.departure > tr.small.dimmed > td.time + td + td.number + td.direction").length, 2);
});

test("shows the delay in whole minutes and nothing without a valid realtime estimate", () => {
	const cases = [
		[{}, ""],
		[estimate("19:56:00"), "+2"],
		// After a delay: an estimate without the realtime flag shows nothing
		[{ departureTimeEstimated: "2026-10-02T19:56:00Z" }, ""],
		[estimate("19:52:00"), "-2"],
		[estimate("21:04:00"), "+70"],
		// Like VVS, cut off the seconds
		[estimate("19:54:36"), "+0"],
		[estimate("19:58:30"), "+4"],
		[estimate("19:53:42"), "+0"],
		[estimate("19:52:24"), "-1"],
		[{ isRealtimeControlled: true }, ""],
		[{ isRealtimeControlled: true, departureTimeEstimated: "invalid" }, ""]
	];
	const statuses = rows(render(cases.map(([realtime]) => departure(realtime)), { maximumEntries: cases.length })).map((row) => row[1]);
	assert.deepEqual(statuses, cases.map(([, status]) => status));
});

test("marks departures that VVS reports as cancelled", () => {
	const wrapper = render([
		// How VVS reports cancelled trips, e.g. a regional train whose
		// realtimeStatus does not mention the cancellation
		departure({ isCancelled: true, realtimeStatus: ["TRIP_CANCELLED"] }),
		departure({ isCancelled: true, realtimeStatus: ["EXTRA_STOPS"] }),
		departure({ ...estimate("19:54:00"), isCancelled: true }),
		departure({ isRealtimeControlled: true, realtimeStatus: ["MONITORED", "TRIP_CANCELLED"] }),
		departure({ isRealtimeControlled: true, realtimeStatus: ["MONITORED", "DEPARTURE_CANCELLED"] }),
		departure({ ...estimate("19:54:00"), realtimeStatus: ["MONITORED"] })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row[1]), ["gestr.", "gestr.", "gestr.", "gestr.", "gestr.", "+0"]);
});

test("colors the status unless colorDelay or colorNoDelay is false", () => {
	const departures = [departure(estimate("19:56:00")), departure(estimate("19:54:00")), departure({ isCancelled: true }), departure()];
	const classes = (config) => cells(render(departures, config)).map((row) => row[1].className);
	assert.deepEqual(classes(), ["delay color", "nodelay color", "delay color", ""]);
	assert.deepEqual(classes({ colorDelay: false }), ["delay", "nodelay color", "delay", ""]);
	assert.deepEqual(classes({ colorNoDelay: false }), ["delay color", "nodelay", "delay color", ""]);
});

test("shows lines and destinations as text, not as HTML", () => {
	const wrapper = render([departure({ transportation: { number: "<b>S6</b>", destination: { name: "Weil der Stadt & <i>Calw</i>" } } })]);
	assert.deepEqual(rows(wrapper)[0].slice(2), ["<b>S6</b>", "Weil der Stadt & <i>Calw</i>"]);
});

test("only shows the configured lines and directions", () => {
	const departures = [["S6", "Schwabstraße"], ["S60", "Böblingen"], ["622", "Ditzingen Bf"]].map(([number, name]) => departure({ transportation: { number, destination: { name } } }));
	assert.deepEqual(lines(departures, { number: "S6" }), ["S6"]);
	assert.deepEqual(lines(departures, { number: ["S60", "622"] }), ["S60", "622"]);
	// Lines given as numbers
	assert.deepEqual(lines(departures, { number: 622 }), ["622"]);
	assert.deepEqual(lines(departures, { number: [622, "S6"] }), ["S6", "622"]);
	assert.deepEqual(lines(departures, { direction: (name) => name !== "Böblingen" }), ["S6", "622"]);
});

test("names the stop in the header", () => {
	const module = createModule();
	assert.equal(module.getHeader(), "");
	receive(module, []);
	assert.equal(module.getHeader(), "Abfahrten von Ditzingen");
	// The ID of a town gives its main stop, but the location has only a name
	const town = createModule();
	receive(town, [], [{ id: "5007000", type: "suburb", name: "Ditzingen" }]);
	assert.equal(town.getHeader(), "Abfahrten von Ditzingen");
	// A configured name, also before the first answer
	const named = createModule({ station_name: "Zuhause", offset: 10 });
	assert.equal(named.getHeader(), "Abfahrten von Zuhause frühestens in 10 min");
	receive(named, []);
	assert.equal(named.getHeader(), "Abfahrten von Zuhause frühestens in 10 min");
	assert.equal(createModule({ station_name: "Zuhause", offset: 0 }).getHeader(), "Abfahrten von Zuhause");
});

test("shows a configured header instead, and none if it is empty", () => {
	for (const header of ["Zur Arbeit", ""]) {
		const module = createModule({}, header);
		receive(module, []);
		assert.equal(module.getHeader(), header);
		// Not a second header in the content
		assert.equal(module.shown.querySelector("header"), null);
	}
});

test("asks for the departures and shows that they are loading", () => {
	const module = createModule();
	const [{ notification, payload }] = module.sent;
	assert.equal(notification, "GET_DEPARTURES");
	assert.equal(payload.identifier, module.identifier);
	assert.equal(payload.config, module.config);
	assert.equal(module.getDom().textContent, "LOADING");
	// The departures and errors of another instance, e.g. for another stop
	module.socketNotificationReceived("module_1_MMM-vvsDeparture_NEW_DEPARTURES", { locations: [DITZINGEN], stopEvents: [departure()] });
	module.socketNotificationReceived("module_1_MMM-vvsDeparture_ERROR", { reason: "HTTP 503" });
	assert.equal(module.getDom().textContent, "LOADING");
	receive(module, [departure()]);
	assert.equal(rows(module.shown).length, 1);
});

test("shows a message if there are no departures to show", () => {
	const message = (stopEvents, config) => {
		const wrapper = render(stopEvents, config);
		return wrapper.querySelector("table") ? "table" : wrapper.querySelector("div.small.dimmed").textContent;
	};
	// VVS may also leave out stopEvents
	assert.equal(message([]), "Keine Abfahrten");
	assert.equal(message(undefined), "Keine Abfahrten");
	assert.equal(message([departure()], { direction: "Schwabstrasse" }), "Keine Abfahrten");
	assert.equal(message([departure()], { maximumEntries: 0 }), "Keine Abfahrten");
});

test("shows a message if station_id is not the ID of a stop", () => {
	const answers = [
		// The answer of VVS for an ID that it does not know
		["de:08111:999999", { version: "10.6.21.17", systemMessages: [], locations: [] }],
		// The answer for a name (shortened): the places that match it
		["Ditzingen", { locations: [{ id: "suburbID:8118011:1:Ditzingen", type: "suburb", name: "Ditzingen" }, DITZINGEN] }]
	];
	for (const [stationId, answer] of answers) {
		const module = createModule({ station_id: stationId });
		module.socketNotificationReceived(`${module.identifier}_NEW_DEPARTURES`, answer);
		assert.equal(module.shown.textContent, `Keine Haltestelle mit der ID „${stationId}“`);
	}
});

test("shows why the departures could not be loaded, until the next update", () => {
	const module = createModule();
	receive(module, [departure()]);
	module.socketNotificationReceived(`${module.identifier}_ERROR`, { reason: "HTTP 503" });
	assert.deepEqual(Array.from(module.shown.children, (line) => line.textContent), ["Abfahrten konnten nicht vom VVS geladen werden", "HTTP 503"]);
	receive(module, [departure()]);
	assert.equal(rows(module.shown).length, 1);
	// The reason goes with the error
	module.socketNotificationReceived(`${module.identifier}_ERROR`, { reason: "HTTP 503" });
	receive(module, []);
	assert.equal(module.shown.textContent, "Keine Abfahrten");
});

test("has the same texts in English and German", () => {
	const placeholders = (texts) => Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, text.match(/{\w+}/g)?.sort()]));
	assert.deepEqual(placeholders(require("../translations/en.json")), placeholders(translations));
});

// Coupled trains, from real departures

// The location of a departure: its platform, in its stop
function platform(stop, area, number) {
	return { id: `${stop}:${area}:${number}`, type: "platform", properties: { platform: number, platformName: `Gleis ${number}` }, parent: { id: stop, type: "stop" } };
}

// The location that VVS gives if a train leaves from a different part of the
// station than planned, or VVS cannot assign the platform: the stop, with
// what is known of the platform
function stopLocation(id, platformName, number) {
	return { id, type: "platform", properties: { platformName, platform: number }, parent: { id, type: "stop" } };
}

// A train from platform 3 at Ditzingen, e.g. one part of a coupled train
function train(number, overrides = {}) {
	return departure({
		location: platform("de:08118:7000", 1, "3"),
		...overrides,
		transportation: {
			number,
			product: { class: 1, name: "S-Bahn" },
			destination: { id: "5006052", name: "Schwabstraße" },
			...overrides.transportation
		}
	});
}

const ZUG = { class: 0, name: "Zug" };
const HBF = { id: "5006115", name: "Stuttgart Hauptbahnhof" };

test("shows coupled trains in one row", () => {
	const wrapper = render([train("S60"), train("S6"), train("S60", { departureTimePlanned: "2026-10-02T20:24:00Z" })]);
	assert.deepEqual(rows(wrapper), [
		["21:54", "", "S6/S60", "Schwabstraße"],
		["22:24", "", "S60", "Schwabstraße"]
	]);
});

test("shows the earliest realtime estimate of the parts of a coupled train", () => {
	const later = { departureTimePlanned: "2026-10-02T20:24:00Z" };
	const wrapper = render([
		train("S6"),
		train("S60", estimate("19:57:00")),
		train("S6", { ...later, ...estimate("20:27:00") }),
		train("S60", { ...later, ...estimate("20:26:00") })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row[1]), ["+3", "+2"]);
});

test("shows a train that splits later on in one row with all its destinations", () => {
	// S6 and S60 run coupled from Stuttgart to Renningen
	const schwabstrasse = { id: "5006052", name: "Schwabstraße" };
	const wrapper = render([
		train("S60", { transportation: { origin: schwabstrasse, destination: { id: "5007100", name: "Böblingen" } } }),
		train("S6", { transportation: { origin: schwabstrasse, destination: { id: "5001303", name: "Weil der Stadt" } } })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row.slice(2)), [["S6/S60", "Weil der Stadt, Böblingen"]]);
});

test("only combines trains with the same time, platform and product class", () => {
	assert.deepEqual(lines([
		train("S6"),
		train("S60", { departureTimePlanned: "2026-10-02T19:55:00Z" }),
		train("S62", { location: platform("de:08118:7000", 1, "2") }),
		train("RB63", { transportation: { product: { class: 13, name: "Regionalzug" } } })
	]), ["S6", "S60", "S62", "RB63"]);
});

test("does not combine trains with different origins and destinations", () => {
	assert.deepEqual(lines([
		train("S1", { transportation: { origin: { id: "1", name: "Kirchheim (Teck)" }, destination: { id: "2", name: "Herrenberg" } } }),
		train("S2", { transportation: { origin: { id: "3", name: "Schorndorf" }, destination: { id: "4", name: "Filderstadt" } } })
	]), ["S1", "S2"]);
});

test("tells platforms apart when VVS gives the stop as their location", () => {
	// MEX13 to Aalen and MEX17 to Pforzheim at Stuttgart Hbf
	assert.deepEqual(lines([
		train("MEX13", { location: stopLocation("de:08111:6115", "Gleis 13"), transportation: { product: ZUG, origin: HBF, destination: { id: "5033006", name: "Aalen Hauptbahnhof" } } }),
		train("MEX17", { location: stopLocation("de:08111:6115", "Gleis 11"), transportation: { product: ZUG, origin: HBF, destination: { id: "5031013", name: "Pforzheim Hauptbahnhof" } } })
	]), ["MEX13", "MEX17"]);
});

test("combines the parts of a coupled train when VVS gives the stop as their location", () => {
	// VVS writes the name of a platform with or without "Gleis"
	assert.deepEqual(lines([
		train("S6", { location: stopLocation("de:08111:6157", "Gleis 1a") }),
		train("S60", { location: stopLocation("de:08111:6157", "1a") })
	]), ["S6/S60"]);
});

test("combines the parts of a coupled train when VVS gives the stop as the location of one part", () => {
	// RE14 to Rottweil and to Hochdorf at Stuttgart Hbf, planned on different platforms
	const wrapper = render([
		train("RE14", { location: platform("de:08111:6115", 2, "3"), transportation: { product: ZUG, origin: HBF, destination: { id: "5030014", name: "Rottweil" } } }),
		train("RE14", { location: stopLocation("de:08111:6115", "Gleis 3", "3"), transportation: { product: ZUG, origin: HBF, destination: { id: "5031001", name: "Hochdorf (bei Horb)" } } })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row.slice(2)), [["RE14", "Hochdorf (bei Horb), Rottweil"]]);
});

test("tells the platform by its number when VVS gives the stop as the location", () => {
	// RE90 and an extra trip at Backnang: the number of the platform is right,
	// the name of RE90's is still the planned one
	assert.deepEqual(lines([
		train("RE90", { location: stopLocation("de:08119:7600", "Gleis 3", "4"), transportation: { product: ZUG, destination: HBF } }),
		train("MEX19", { location: stopLocation("de:08119:7600", "4"), transportation: { product: ZUG, destination: HBF } })
	]), ["MEX19/RE90"]);
});

test("does not combine trains from an unknown platform", () => {
	assert.deepEqual(lines([
		train("S6", { location: stopLocation("de:08111:6157") }),
		train("S60", { location: stopLocation("de:08111:6157") })
	]), ["S6", "S60"]);
});

test("does not combine Stadtbahn trains, trams, U-Bahn trains or buses that leave together", () => {
	// U11 and U19 at Cannstatter Wasen on event days
	const neckarPark = { id: "5006330", name: "NeckarPark (Stadion)" };
	for (const productClass of [2, 3, 4]) {
		const stadtbahn = (number, origin) => train(number, { transportation: { product: { class: productClass }, origin, destination: neckarPark } });
		assert.deepEqual(lines([stadtbahn("U11", { id: "5006112" }), stadtbahn("U19", { id: "5002484" })]), ["U11", "U19"]);
	}
	// The loop lines 622 and 626 at Ditzingen Bf
	const bus = (number) => train(number, { transportation: { product: { class: 5 }, destination: { id: "5007000", name: "Ditzingen Bf" } } });
	assert.deepEqual(lines([bus("622"), bus("626")]), ["622", "626"]);
});

test("shows a cancelled part of a coupled train on its own", () => {
	const later = { departureTimePlanned: "2026-10-02T20:24:00Z", isCancelled: true };
	const wrapper = render([
		train("S6", { isCancelled: true }),
		train("S60", estimate("19:56:00")),
		train("S6", later),
		train("S60", later)
	]);
	assert.deepEqual(rows(wrapper).map((row) => row.slice(1, 3)), [["gestr.", "S6"], ["+2", "S60"], ["gestr.", "S6/S60"]]);
});

test("filters lines before combining and counts a coupled train as one entry", () => {
	const later = { departureTimePlanned: "2026-10-02T20:24:00Z" };
	const departures = [train("S6"), train("S60"), train("S6", later), train("S60", later)];
	assert.deepEqual(lines(departures, { number: "S60" }), ["S60", "S60"]);
	assert.deepEqual(lines(departures, { maximumEntries: 1 }), ["S6/S60"]);
});
