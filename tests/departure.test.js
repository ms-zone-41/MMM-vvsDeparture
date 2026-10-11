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

// A started module instance
function createModule(config = {}) {
	const module = Object.assign(Object.create(definition), {
		identifier: "module_0_MMM-vvsDeparture",
		config: { ...definition.defaults, ...config },
		translate: (key) => translations[key] ?? key,
		sendSocketNotification() {},
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
