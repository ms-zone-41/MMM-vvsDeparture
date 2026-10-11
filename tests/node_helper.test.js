// Tests for the node helper, which fetches the departures from VVS

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const IDENTIFIER = "module_0_MMM-vvsDeparture";
const URL = "https://www3.vvs.de/mngvvs/XML_DM_REQUEST?limit=100&mode=direct&name_dm=de%3A08118%3A7000&outputFormat=rapidJSON&type_dm=any&useRealtime=1";

// The answer of VVS for a stop (shortened)
const ANSWER = { locations: [{ id: "de:08118:7000", type: "stop", disassembledName: "Ditzingen" }], stopEvents: [] };

// Load the node helper with stand-ins for MagicMirror², fetch and the timers.
// fetch returns respond(), by default a response with ANSWER.
function createHelper(respond = respondWith(ANSWER)) {
	const timers = new Set();
	const requests = [];
	const notifications = [];
	const logs = [];
	const stubs = {
		require: (name) => ({
			node_helper: { create: (definition) => definition },
			logger: { error: (message) => logs.push(message) }
		})[name],
		module: {},
		fetch: async (url, options) => {
			requests.push({ url, signal: options.signal });
			return respond();
		},
		setInterval: (callback, delay) => {
			const timer = { callback, delay };
			timers.add(timer);
			return timer;
		},
		clearInterval: (timer) => timers.delete(timer),
		AbortSignal: { timeout: (delay) => ({ timeout: delay }) }
	};
	new Function(...Object.keys(stubs), fs.readFileSync(path.join(__dirname, "../node_helper.js"), "utf8"))(...Object.values(stubs));
	const helper = Object.assign(Object.create(stubs.module.exports), {
		// Like socket.io, send the payload as JSON
		sendSocketNotification: (notification, payload) => notifications.push({ notification, payload: JSON.parse(JSON.stringify(payload)) })
	});
	helper.start();
	return { helper, timers, requests, notifications, logs };
}

function respondWith(answer) {
	return () => ({ ok: true, json: async () => answer });
}

// What a module instance sends when it starts
function getDepartures(helper, identifier = IDENTIFIER, config = {}) {
	helper.socketNotificationReceived("GET_DEPARTURES", { identifier, config: { station_id: "de:08118:7000", reloadInterval: 60000, ...config } });
}

// Wait until the answer of fetch is handled
function settle() {
	return new Promise((resolve) => setImmediate(resolve));
}

// count departures, perMinute of them a minute, sorted like VVS sorts them
function createStopEvents(count, perMinute = 1) {
	return Array.from({ length: count }, (_, index) => ({
		id: index,
		departureTimePlanned: new Date(Date.UTC(2026, 9, 9, 17, Math.floor(index / perMinute))).toISOString()
	}));
}

test("fetches the departures from VVS for the module instance that asks for them", async () => {
	const { helper, requests, notifications } = createHelper();
	getDepartures(helper);
	await settle();
	// Gives up after 30 seconds
	assert.deepEqual(requests, [{ url: URL, signal: { timeout: 30000 } }]);
	assert.deepEqual(notifications, [{ notification: `${IDENTIFIER}_NEW_DEPARTURES`, payload: ANSWER }]);
});

test("asks for the departures offset minutes from now", () => {
	const { helper, requests } = createHelper();
	for (const offset of [10, "10", 0, -5]) {
		getDepartures(helper, IDENTIFIER, { offset });
	}
	assert.deepEqual(requests.map((request) => request.url), [`${URL}&timeOffset=10`, `${URL}&timeOffset=10`, URL, URL]);
});

test("leaves out the last minute if VVS sends as many departures as requested", async () => {
	// VVS may have cut off a part of a coupled train
	const stopEvents = createStopEvents(100, 2);
	const { helper, notifications } = createHelper(respondWith({ ...ANSWER, stopEvents }));
	getDepartures(helper);
	await settle();
	assert.deepEqual(notifications[0].payload, { ...ANSWER, stopEvents: stopEvents.slice(0, 98) });
});

test("passes on complete answers of VVS unchanged", async () => {
	const answers = [
		{ ...ANSWER, stopEvents: createStopEvents(99) },
		// All departures in the same minute
		{ ...ANSWER, stopEvents: createStopEvents(100, 100) },
		// The answer for an ID that VVS does not know
		{ version: "10.6.21.17", systemMessages: [], locations: [] }
	];
	for (const answer of answers) {
		const { helper, notifications } = createHelper(respondWith(answer));
		getDepartures(helper);
		await settle();
		assert.deepEqual(notifications[0].payload, answer);
	}
});

test("fetches the departures again after each update interval, at most every 30 seconds", () => {
	const { helper, timers, requests } = createHelper();
	getDepartures(helper, IDENTIFIER, { reloadInterval: 120000 });
	const [timer] = timers;
	assert.equal(timer.delay, 120000);
	timer.callback();
	assert.equal(requests.length, 2);
	// E.g. reloadInterval in seconds by mistake, or not a number
	for (const reloadInterval of [60, "60s"]) {
		getDepartures(helper, IDENTIFIER, { reloadInterval });
		assert.equal([...timers][0].delay, 30000);
	}
});

test("keeps one update timer per module instance and stops them with MagicMirror²", () => {
	const { helper, timers, requests } = createHelper();
	getDepartures(helper, "module_0_MMM-vvsDeparture");
	getDepartures(helper, "module_1_MMM-vvsDeparture");
	// Each browser that loads the page asks again, and gets the departures
	getDepartures(helper, "module_0_MMM-vvsDeparture");
	assert.equal(timers.size, 2);
	assert.equal(requests.length, 3);
	helper.stop();
	assert.equal(timers.size, 0);
});

test("logs why the departures could not be loaded and tells the module instance", async () => {
	const errors = [
		[() => ({ ok: false, status: 503 }), "HTTP 503"],
		// fetch gives the reason of a network error as the cause
		[() => {
			throw new TypeError("fetch failed", { cause: new Error("getaddrinfo EAI_AGAIN www3.vvs.de") });
		}, "getaddrinfo EAI_AGAIN www3.vvs.de"],
		[() => {
			throw new TypeError("fetch failed", { cause: Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }) });
		}, "ECONNREFUSED"]
	];
	for (const [respond, reason] of errors) {
		const { helper, notifications, logs } = createHelper(respond);
		getDepartures(helper);
		await settle();
		assert.deepEqual(logs, [`Could not load the departures of de:08118:7000 from VVS: ${reason}`]);
		assert.deepEqual(notifications, [{ notification: `${IDENTIFIER}_ERROR`, payload: { reason } }]);
	}
});
