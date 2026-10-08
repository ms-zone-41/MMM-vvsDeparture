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
const moment = require("moment");
const translations = require("../translations/de.json");

// Load the module like MagicMirror does, with document and moment as globals.
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
	moment
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

function renderDepartures(departures, config = {}) {
	const module = Object.assign(Object.create(definition), {
		config: { ...definition.defaults, ...config },
		departure: departures,
		station_name: "Ditzingen",
		translate(key) {
			return translations[key] || key;
		}
	});
	return module.getDom();
}

// The text of each cell, row by row: time, delay, line and direction
function rows(wrapper) {
	return Array.from(wrapper.querySelectorAll("tr"), (row) => Array.from(row.children, (cell) => cell.textContent));
}

function delayCells(wrapper) {
	return Array.from(wrapper.querySelectorAll("tr"), (row) => row.children[1]);
}

function time(date) {
	return moment(date).format("HH:mm");
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
