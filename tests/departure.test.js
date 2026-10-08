// Tests for the departure table. Run them in the module directory with
// `npm install` and `npm test`.

// The module shows local times. Pin the time zone, so that the results do not
// depend on the machine that runs the tests.
process.env.TZ = "Europe/Berlin";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const translations = require("../translations/de.json");

// Load the module like MagicMirror does, with document as a global.
// It runs in its own context, where arrays created in this file are not
// `instanceof Array`, so array values for config.number/direction are created
// inside the context with vm.runInContext().
const document = new JSDOM("<!doctype html><html><body></body></html>").window.document;
let definition;
const context = vm.createContext({
	Module: {
		register(name, value) {
			definition = value;
		}
	},
	document,
	Log: { log() {} }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../MMM-vvsDeparture.js"), "utf8"), context);

// A stop event as the VVS API returns it, without realtime data
function createDeparture(overrides = {}) {
	return {
		departureTimePlanned: "2026-10-02T19:54:00Z",
		transportation: {
			number: "S6",
			destination: { name: "Schwabstraße" }
		},
		...overrides
	};
}

// The location that VVS gives for a departure: the platform, with its number
// and name, and the stop that it belongs to
function platformLocation(stop, area, platform) {
	return {
		id: `${stop}:${area}:${platform}`,
		type: "platform",
		properties: { platform, platformName: `Gleis ${platform}` },
		parent: { id: stop, type: "stop" }
	};
}

// A departure of an S-Bahn from platform 3 of Ditzingen, like the parts of a
// coupled train that VVS lists once for each line
function createTrain(number, overrides = {}) {
	return createDeparture({
		location: platformLocation("de:08118:7000", 1, "3"),
		...overrides,
		transportation: {
			number,
			product: { class: 1, name: "S-Bahn" },
			destination: { id: "5006052", name: "Schwabstraße" },
			...overrides.transportation
		}
	});
}

// The location that VVS gives for a departure from a platform in another part
// of the station than planned, or from a platform that VVS cannot assign: the
// stop, with the name and the number of the platform if they are known
function stopLocation(id, platformName, platform) {
	const properties = {};
	if (platformName !== undefined) {
		properties.platformName = platformName;
	}
	if (platform !== undefined) {
		properties.platform = platform;
	}
	return { id, type: "platform", properties, parent: { id, type: "stop" } };
}

function createModule(config = {}) {
	return Object.assign(Object.create(definition), {
		identifier: "module_0_MMM-vvsDeparture",
		config: { ...definition.defaults, ...config },
		translate(key) {
			return translations[key] || key;
		},
		sendSocketNotification() {},
		updateDom() {}
	});
}

function renderDepartures(departures, config = {}) {
	const module = createModule(config);
	module.departure = departures;
	module.station_name = "Ditzingen";
	return module.getDom();
}

// The text of each cell, row by row: time, delay, line and direction
function rows(wrapper) {
	return Array.from(wrapper.querySelectorAll("tr"), (row) => Array.from(row.children, (cell) => cell.textContent));
}

function delayCells(wrapper) {
	return Array.from(wrapper.querySelectorAll("tr"), (row) => row.children[1]);
}

// The local time as HH:mm
function time(date) {
	return new Date(date).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

test("shows the time, delay, line and direction of each departure", () => {
	const wrapper = renderDepartures([
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:56:00Z" }),
		createDeparture({
			departureTimePlanned: "2026-10-02T20:01:00Z",
			isRealtimeControlled: true,
			departureTimeEstimated: "2026-10-02T20:01:00Z",
			transportation: { number: "S62", destination: { name: "Weil der Stadt" } }
		})
	]);
	assert.deepEqual(rows(wrapper), [
		[time("2026-10-02T19:54:00Z"), "+2", "S6", "Schwabstraße"],
		[time("2026-10-02T20:01:00Z"), "+0", "S62", "Weil der Stadt"]
	]);
});

test("shows at most maximumEntries departures", () => {
	const departures = ["19:54", "20:09", "20:24"].map((planned) => createDeparture({
		departureTimePlanned: `2026-10-02T${planned}:00Z`,
		isRealtimeControlled: true,
		departureTimeEstimated: `2026-10-02T${planned}:00Z`
	}));
	assert.equal(rows(renderDepartures(departures, { maximumEntries: 2 })).length, 2);
});

test("only shows the configured lines and directions", () => {
	const departures = [
		["S6", "Schwabstraße"],
		["S60", "Böblingen"],
		["622", "Ditzingen Bf"]
	].map(([number, destination]) => createDeparture({
		isRealtimeControlled: true,
		departureTimeEstimated: "2026-10-02T19:54:00Z",
		transportation: { number, destination: { name: destination } }
	}));
	const lines = (config) => rows(renderDepartures(departures, config)).map((row) => row[2]);
	assert.deepEqual(lines({ number: "S6" }), ["S6"]);
	assert.deepEqual(lines({ number: vm.runInContext("[\"S60\", \"622\"]", context) }), ["S60", "622"]);
	assert.deepEqual(lines({ direction: (name) => name !== "Böblingen" }), ["S6", "622"]);
});

test("shows the station in the header", () => {
	assert.equal(renderDepartures([]).querySelector("header").textContent, "Abfahrten von Ditzingen");
	assert.equal(renderDepartures([], { offset: 10 }).querySelector("header").textContent, "Abfahrten von Ditzingen in 10 min.");
});

test("does not reuse the delay of the previous departure", () => {
	const [first, second] = delayCells(renderDepartures([
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:56:00Z" }),
		createDeparture({ departureTimePlanned: "2026-10-02T20:24:00Z" })
	]));
	assert.equal(first.textContent, "+2");
	assert.equal(second.textContent, "");
	assert.equal(second.className, "");
});

test("leaves the delay empty for a first departure without realtime data", () => {
	const [cell] = delayCells(renderDepartures([createDeparture()]));
	assert.equal(cell.textContent, "");
	assert.equal(cell.className, "");
});

test("ignores estimates of departures that are not realtime controlled", () => {
	const cells = delayCells(renderDepartures([
		createDeparture({ isRealtimeControlled: false, departureTimeEstimated: "2026-10-02T19:56:00Z" }),
		createDeparture({ departureTimeEstimated: "2026-10-02T19:56:00Z" })
	]));
	assert.deepEqual(cells.map((cell) => cell.textContent), ["", ""]);
});

test("shows early departures and delays of an hour or more", () => {
	const cells = delayCells(renderDepartures([
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:52:00Z" }),
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T21:04:00Z" })
	]));
	assert.deepEqual(cells.map((cell) => cell.textContent), ["-2", "+70"]);
	assert.deepEqual(cells.map((cell) => cell.className), ["delay color", "delay color"]);
});

test("shows +0 for a departure on time", () => {
	const departures = [createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:54:00Z" })];
	const [coloured] = delayCells(renderDepartures(departures));
	const [plain] = delayCells(renderDepartures(departures, { colorNoDelay: false }));
	assert.equal(coloured.textContent, "+0");
	assert.equal(coloured.className, "nodelay color");
	assert.equal(plain.className, "nodelay");
});

test("cuts the delay to whole minutes like VVS does", () => {
	const cells = delayCells(renderDepartures([
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:54:36Z" }),
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:58:30Z" }),
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:53:42Z" }),
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:52:24Z" })
	]));
	assert.deepEqual(cells.map((cell) => cell.textContent), ["+0", "+4", "+0", "-1"]);
	assert.equal(cells[2].className, "nodelay color");
});

test("colours the delay only if colorDelay is set", () => {
	const [cell] = delayCells(renderDepartures([
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:56:00Z" })
	], { colorDelay: false }));
	assert.equal(cell.textContent, "+2");
	assert.equal(cell.className, "delay");
});

test("calculates the delay independently of the time zone", () => {
	// India is 5:30 hours ahead of UTC, so a delay read from a Date showed +32
	const timeZone = process.env.TZ;
	process.env.TZ = "Asia/Kolkata";
	try {
		const [cell] = delayCells(renderDepartures([
			createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:56:00Z" })
		]));
		assert.equal(cell.textContent, "+2");
	} finally {
		process.env.TZ = timeZone;
	}
});

test("marks departures that VVS reports as cancelled", () => {
	const cells = delayCells(renderDepartures([
		// This is how VVS reports cancelled trips (no realtime flag, no estimate):
		// a Stadtbahn trip, and a regional train whose realtimeStatus does not
		// mention the cancellation (observed: [] and ["EXTRA_STOPS"])
		createDeparture({ isCancelled: true, realtimeStatus: ["TRIP_CANCELLED"] }),
		createDeparture({ isCancelled: true, realtimeStatus: ["EXTRA_STOPS"] }),
		createDeparture({ isRealtimeControlled: true, isCancelled: true, departureTimeEstimated: "2026-10-02T19:54:00Z" }),
		createDeparture({ isRealtimeControlled: true, realtimeStatus: ["MONITORED", "TRIP_CANCELLED"] }),
		createDeparture({ isRealtimeControlled: true, realtimeStatus: ["MONITORED", "DEPARTURE_CANCELLED"] }),
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:54:00Z", realtimeStatus: ["MONITORED"] })
	]));
	assert.deepEqual(cells.map((cell) => cell.textContent), [
		translations.CANCELED, translations.CANCELED, translations.CANCELED, translations.CANCELED, translations.CANCELED, "+0"
	]);
	assert.equal(cells[0].className, "delay color");
});

test("colours cancelled departures only if colorDelay is set", () => {
	const [cell] = delayCells(renderDepartures([
		createDeparture({ isCancelled: true, realtimeStatus: ["TRIP_CANCELLED"] })
	], { colorDelay: false }));
	assert.equal(cell.textContent, translations.CANCELED);
	assert.equal(cell.className, "delay");
});

test("leaves the delay empty for a realtime departure without a valid estimate", () => {
	const cells = delayCells(renderDepartures([
		createDeparture({ isRealtimeControlled: true }),
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: null }),
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "invalid" })
	]));
	assert.deepEqual(cells.map((cell) => cell.textContent), ["", "", ""]);
	assert.deepEqual(cells.map((cell) => cell.className), ["", "", ""]);
});

test("shows the time with two digits for the hour", () => {
	const wrapper = renderDepartures([createDeparture({ departureTimePlanned: "2026-10-03T05:07:00Z" })]);
	assert.equal(rows(wrapper)[0][0], "07:07");
});

test("shows the planned departure time, not the estimated one", () => {
	const wrapper = renderDepartures([
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T20:05:00Z" }),
		createDeparture({ departureTimePlanned: "2026-10-03T07:05:00Z" })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row[0]), [time("2026-10-02T19:54:00Z"), time("2026-10-03T07:05:00Z")]);
});

test("shows the configured station name before the first update", () => {
	const module = createModule({ station_name: "Ditzingen" });
	module.start();
	assert.equal(module.getDom().querySelector("header").textContent, "Abfahrten von Ditzingen");
});

test("shows the station name from VVS once the first departures arrive", () => {
	const module = createModule();
	module.start();
	assert.equal(module.getDom().querySelector("header"), null);
	module.socketNotificationReceived(`${module.identifier}_NEW_DEPARTURES`, {
		locations: [{ disassembledName: "Ditzingen" }],
		stopEvents: []
	});
	assert.equal(module.getDom().querySelector("header").textContent, "Abfahrten von Ditzingen");
});

test("shows coupled trains in one row", () => {
	const wrapper = renderDepartures([
		createTrain("S60"),
		createTrain("S6"),
		createTrain("S60", { departureTimePlanned: "2026-10-02T20:24:00Z" })
	]);
	assert.deepEqual(rows(wrapper), [
		[time("2026-10-02T19:54:00Z"), "", "S6/S60", "Schwabstraße"],
		[time("2026-10-02T20:24:00Z"), "", "S60", "Schwabstraße"]
	]);
});

test("shows the earliest realtime estimate of the parts of a coupled train", () => {
	const cells = delayCells(renderDepartures([
		createTrain("S6"),
		createTrain("S60", { isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:57:00Z" }),
		createTrain("S6", { departureTimePlanned: "2026-10-02T20:24:00Z", isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T20:27:00Z" }),
		createTrain("S60", { departureTimePlanned: "2026-10-02T20:24:00Z", isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T20:26:00Z" })
	]));
	assert.deepEqual(cells.map((cell) => cell.textContent), ["+3", "+2"]);
});

test("shows a train that splits later on in one row with all its destinations", () => {
	// S6 and S60 run coupled from Stuttgart to Renningen, where they split
	const schwabstrasse = { id: "5006052", name: "Schwabstraße" };
	const wrapper = renderDepartures([
		createTrain("S60", { transportation: { origin: schwabstrasse, destination: { id: "5007100", name: "Böblingen" } } }),
		createTrain("S6", { transportation: { origin: schwabstrasse, destination: { id: "5001303", name: "Weil der Stadt" } } })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row.slice(2)), [["S6/S60", "Weil der Stadt, Böblingen"]]);
});

test("only combines trains with the same time, platform and product class", () => {
	// Each of the last three differs from the first in one of them
	const wrapper = renderDepartures([
		createTrain("S6"),
		createTrain("S60", { departureTimePlanned: "2026-10-02T19:55:00Z" }),
		createTrain("S62", { location: platformLocation("de:08118:7000", 1, "2") }),
		createTrain("RB63", { transportation: { product: { class: 13, name: "Regionalzug" } } })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row[2]), ["S6", "S60", "S62", "RB63"]);
});

test("tells platforms apart when VVS gives the stop as their location", () => {
	// Like MEX13 to Aalen and MEX17 to Pforzheim, which both start at Stuttgart
	// Hbf at the same time, if both leave from a platform in another part of the
	// station than planned
	const train = { class: 0, name: "Zug" };
	const hbf = { id: "5006115", name: "Stuttgart Hauptbahnhof" };
	const wrapper = renderDepartures([
		createTrain("MEX13", { location: stopLocation("de:08111:6115", "Gleis 13"), transportation: { product: train, origin: hbf, destination: { id: "5033006", name: "Aalen Hauptbahnhof" } } }),
		createTrain("MEX17", { location: stopLocation("de:08111:6115", "Gleis 11"), transportation: { product: train, origin: hbf, destination: { id: "5031013", name: "Pforzheim Hauptbahnhof" } } })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row.slice(2)), [["MEX13", "Aalen Hauptbahnhof"], ["MEX17", "Pforzheim Hauptbahnhof"]]);
});

test("combines the parts of a coupled train when VVS gives the stop as their location", () => {
	// VVS writes the name of a platform with or without "Gleis"
	const wrapper = renderDepartures([
		createTrain("S6", { location: stopLocation("de:08111:6157", "Gleis 1a") }),
		createTrain("S60", { location: stopLocation("de:08111:6157", "1a") })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row[2]), ["S6/S60"]);
});

test("combines the parts of a coupled train when VVS gives the stop as the location of one part", () => {
	// Like the parts of RE14 to Rottweil and Hochdorf, which start together at
	// Stuttgart Hbf from platform 3, although VVS plans them on different ones
	const train = { class: 0, name: "Zug" };
	const hbf = { id: "5006115", name: "Stuttgart Hauptbahnhof" };
	const wrapper = renderDepartures([
		createTrain("RE14", { location: platformLocation("de:08111:6115", 2, "3"), transportation: { product: train, origin: hbf, destination: { id: "5030014", name: "Rottweil" } } }),
		createTrain("RE14", { location: stopLocation("de:08111:6115", "Gleis 3", "3"), transportation: { product: train, origin: hbf, destination: { id: "5031001", name: "Hochdorf (bei Horb)" } } })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row.slice(2)), [["RE14", "Hochdorf (bei Horb), Rottweil"]]);
});

test("tells the platform by its number when VVS gives the stop as the location", () => {
	// Like RE90 and an extra trip that VVS lists for it at Backnang: VVS gives
	// the number of the platform that RE90 leaves from, 4, but still the name of
	// the planned one, and only the name for the extra trip
	const train = { class: 0, name: "Zug" };
	const hbf = { id: "5006115", name: "Stuttgart Hauptbahnhof" };
	const wrapper = renderDepartures([
		createTrain("RE90", { location: stopLocation("de:08119:7600", "Gleis 3", "4"), transportation: { product: train, destination: hbf } }),
		createTrain("MEX19", { location: stopLocation("de:08119:7600", "4"), transportation: { product: train, destination: hbf } })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row[2]), ["MEX19/RE90"]);
});

test("does not combine trains from an unknown platform", () => {
	const wrapper = renderDepartures([
		createTrain("S6", { location: stopLocation("de:08111:6157") }),
		createTrain("S60", { location: stopLocation("de:08111:6157") })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row[2]), ["S6", "S60"]);
});

test("does not combine trains with different origins and destinations", () => {
	// Two trains that leave from the same platform at the same time, but come
	// from and go to different places, are two trains
	const wrapper = renderDepartures([
		createTrain("S1", { transportation: { origin: { id: "1", name: "Kirchheim (Teck)" }, destination: { id: "2", name: "Herrenberg" } } }),
		createTrain("S2", { transportation: { origin: { id: "3", name: "Schorndorf" }, destination: { id: "4", name: "Filderstadt" } } })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row.slice(2)), [["S1", "Herrenberg"], ["S2", "Filderstadt"]]);
});

test("does not combine Stadtbahn trains, trams or U-Bahn trains that leave together", () => {
	// On event days, U11 from the Hauptbahnhof and U19 from Neugereut leave
	// Cannstatter Wasen at the same time from the same platform to NeckarPark
	// (Stadion), but they are two trains
	const location = { id: "de:08111:2343:0:2", type: "platform", properties: { platform: "2" }, parent: { id: "de:08111:2343", type: "stop" } };
	const neckarPark = { id: "5006330", name: "NeckarPark (Stadion)" };
	for (const productClass of [2, 3, 4]) {
		const train = (number, origin) => createTrain(number, {
			location,
			transportation: { product: { class: productClass, name: "Stadtbahn" }, origin, destination: neckarPark }
		});
		const wrapper = renderDepartures([
			train("U11", { id: "5006112", name: "Hauptbahnhof (A.-Klett-Platz)" }),
			train("U19", { id: "5002484", name: "Neugereut" })
		]);
		assert.deepEqual(rows(wrapper).map((row) => row[2]), ["U11", "U19"], `product class ${productClass}`);
	}
});

test("does not combine buses that leave together", () => {
	// The loop lines 622 and 626 leave from the same bay of Ditzingen Bf at the
	// same time, but they are two buses on different routes
	const bus = (number) => createDeparture({
		location: { id: "de:08118:7000:2:3" },
		departureTimePlanned: "2026-10-08T15:13:00Z",
		transportation: { number, product: { class: 5, name: "Bus" }, destination: { id: "5007000", name: "Ditzingen Bf" } }
	});
	assert.deepEqual(rows(renderDepartures([bus("622"), bus("626")])).map((row) => row[2]), ["622", "626"]);
});

test("shows a cancelled part of a coupled train on its own", () => {
	const wrapper = renderDepartures([
		createTrain("S6", { isCancelled: true, realtimeStatus: ["TRIP_CANCELLED"] }),
		createTrain("S60", { isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:56:00Z" }),
		createTrain("S6", { departureTimePlanned: "2026-10-02T20:24:00Z", isCancelled: true }),
		createTrain("S60", { departureTimePlanned: "2026-10-02T20:24:00Z", isCancelled: true })
	]);
	assert.deepEqual(rows(wrapper).map((row) => row.slice(1, 3)), [
		[translations.CANCELED, "S6"],
		["+2", "S60"],
		[translations.CANCELED, "S6/S60"]
	]);
});

test("filters lines before combining and counts a combined row once", () => {
	const departures = [
		createTrain("S6"),
		createTrain("S60"),
		createTrain("S6", { departureTimePlanned: "2026-10-02T20:24:00Z" }),
		createTrain("S60", { departureTimePlanned: "2026-10-02T20:24:00Z" })
	];
	const lines = (config) => rows(renderDepartures(departures, config)).map((row) => row[2]);
	assert.deepEqual(lines({ number: "S60" }), ["S60", "S60"]);
	assert.deepEqual(lines({ maximumEntries: 1 }), ["S6/S60"]);
});

test("shows a line once if a coupled train has it twice", () => {
	// Like two RE14 trains that run coupled between Herrenberg and Stuttgart
	assert.deepEqual(rows(renderDepartures([createTrain("RE14"), createTrain("RE14")])).map((row) => row[2]), ["RE14"]);
});

test("renders an empty table if VVS sends no departures", () => {
	assert.equal(rows(renderDepartures(undefined)).length, 0);
});
