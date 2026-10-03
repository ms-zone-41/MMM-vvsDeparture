// Run from the MagicMirror root (needs its jsdom and moment):
// node --test modules/MMM-vvsDeparture/tests/departure.test.js
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const moment = require("moment");
const translations = require("../translations/de.json");

const document = new JSDOM("<!doctype html><html><body></body></html>").window.document;
let definition;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../MMM-vvsDeparture.js"), "utf8"), {
	Module: {
		register(name, value) {
			definition = value;
		}
	},
	document,
	moment
});

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
	const instance = Object.assign(Object.create(definition), {
		config: { ...definition.defaults, ...config },
		departure: departures,
		station_name: "Ditzingen",
		translate(key) {
			return translations[key] || key;
		}
	});
	return instance.getDom();
}

function delayCells(wrapper) {
	return Array.from(wrapper.querySelectorAll("tr"), (row) => row.children[1]);
}

test("does not reuse the delay of the previous departure", () => {
	const [first, second] = delayCells(renderDepartures([
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:56:00Z" }),
		createDeparture({ departureTimePlanned: "2026-10-02T20:24:00Z" })
	]));
	assert.equal(first.textContent, "+2");
	assert.equal(second.textContent, "?");
	assert.equal(second.className, "unknown");
	assert.equal(second.title, "Keine Echtzeitdaten");
});

test("renders a first departure without realtime data without crashing", () => {
	const [cell] = delayCells(renderDepartures([createDeparture()]));
	assert.equal(cell.textContent, "?");
});

test("shows 0 for a departure that is confirmed on time", () => {
	const [cell] = delayCells(renderDepartures([
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:54:00Z" })
	], { colorNoDelay: false }));
	assert.equal(cell.textContent, "0");
	assert.equal(cell.className, "nodelay");
	assert.equal(cell.title, "Pünktlich");
});

test("keeps missing, invalid and non-realtime estimates unknown", () => {
	for (const overrides of [
		{ isRealtimeControlled: true },
		{ isRealtimeControlled: true, departureTimeEstimated: null },
		{ isRealtimeControlled: true, departureTimeEstimated: "invalid" },
		{ isRealtimeControlled: false, departureTimeEstimated: "2026-10-02T19:54:00Z" },
		{ departureTimeEstimated: "2026-10-02T19:56:00Z" }
	]) {
		const [cell] = delayCells(renderDepartures([createDeparture(overrides)]));
		assert.equal(cell.textContent, "?");
		assert.equal(cell.className, "unknown");
	}
});

test("shows early departures and delays of more than one hour", () => {
	const cells = delayCells(renderDepartures([
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:52:00Z" }),
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T21:04:00Z" })
	]));
	assert.deepEqual(cells.map((cell) => cell.textContent), ["-2", "+70"]);
});

test("marks cancelled departures", () => {
	const cells = delayCells(renderDepartures([
		createDeparture({ isRealtimeControlled: true, isCancelled: true }),
		createDeparture({ isRealtimeControlled: true, realtimeStatus: ["MONITORED", "TRIP_CANCELLED"] }),
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:54:00Z", realtimeStatus: ["MONITORED"] })
	]));
	assert.deepEqual(cells.map((cell) => cell.textContent), [translations.CANCELED, translations.CANCELED, "0"]);
});

test("shows the planned departure time", () => {
	const wrapper = renderDepartures([
		createDeparture({ isRealtimeControlled: true, departureTimeEstimated: "2026-10-02T19:56:00Z" })
	]);
	assert.equal(wrapper.querySelector("tr").children[0].textContent, moment("2026-10-02T19:54:00Z").format("HH:mm"));
});
