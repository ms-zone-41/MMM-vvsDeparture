// Tests for the node helper, which fetches the departures from VVS. Run them
// in the module directory with `npm install` and `npm test`.

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IDENTIFIER = "module_0_MMM-vvsDeparture";

// The answer of VVS for a known station
const DEPARTURES = { locations: [{ disassembledName: "Ditzingen" }], stopEvents: [] };

// Load the node helper with stand-ins for the modules of MagicMirror, for fetch
// and for the timers. respond(url) returns the response of fetch.
function createHelper(respond = () => ({ ok: true, status: 200, json: async () => DEPARTURES })) {
	const timers = new Set();
	const requests = [];
	const notifications = [];
	const logs = [];
	const context = {
		require: (name) => ({
			node_helper: { create: (definition) => definition },
			logger: { error: (...args) => logs.push(args.join(" ")), info() {}, log() {} }
		})[name],
		module: {},
		fetch: async (url, options) => {
			requests.push({ url, options });
			return respond(url);
		},
		setInterval: (callback, delay) => {
			const timer = { callback, delay };
			timers.add(timer);
			return timer;
		},
		clearInterval: (timer) => timers.delete(timer),
		AbortSignal
	};
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../node_helper.js"), "utf8"), context);
	const helper = Object.assign(Object.create(context.module.exports), {
		name: "MMM-vvsDeparture",
		// Like socket.io, send the payload as JSON
		sendSocketNotification: (notification, payload) => notifications.push({ notification, payload: JSON.parse(JSON.stringify(payload)) })
	});
	helper.start();
	return { helper, timers, requests, notifications, logs };
}

// What the module sends when it starts
function getDepartures(helper, identifier = IDENTIFIER, config = {}) {
	helper.socketNotificationReceived("GET_DEPARTURES", {
		identifier,
		config: { station_id: "de:08118:7000", reloadInterval: 60000, ...config }
	});
}

// Wait until the answers of fetch are handled
function settle() {
	return new Promise((resolve) => setImmediate(resolve));
}

test("sends the departures to the module instance that asked for them", async () => {
	const { helper, requests, notifications } = createHelper();
	getDepartures(helper);
	await settle();
	assert.match(requests[0].url, /^https:\/\/www3\.vvs\.de\/mngvvs\/XML_DM_REQUEST\?.*name_dm=de:08118:7000/);
	assert.deepEqual(notifications, [{ notification: `${IDENTIFIER}_NEW_DEPARTURES`, payload: DEPARTURES }]);
});

test("fetches the departures again after each update interval", () => {
	const { helper, timers, requests } = createHelper();
	getDepartures(helper, IDENTIFIER, { reloadInterval: 120000 });
	const [timer] = timers;
	assert.equal(timer.delay, 120000);
	timer.callback();
	assert.equal(requests.length, 2);
});

test("keeps one update timer per module instance when the page loads again", () => {
	const { helper, timers, requests } = createHelper();
	getDepartures(helper);
	getDepartures(helper);
	assert.equal(timers.size, 1);
	// Each load fetches the departures right away
	assert.equal(requests.length, 2);
});

test("updates each module instance with its own timer", () => {
	const { helper, timers } = createHelper();
	getDepartures(helper, "module_0_MMM-vvsDeparture");
	getDepartures(helper, "module_1_MMM-vvsDeparture");
	assert.equal(timers.size, 2);
});

test("stops the update timers when MagicMirror stops", () => {
	const { helper, timers } = createHelper();
	getDepartures(helper, "module_0_MMM-vvsDeparture");
	getDepartures(helper, "module_1_MMM-vvsDeparture");
	helper.stop();
	assert.equal(timers.size, 0);
});

test("logs and reports errors of VVS to the module instance", async () => {
	const { helper, notifications, logs } = createHelper(() => ({ ok: false, status: 503, json: async () => ({}) }));
	getDepartures(helper);
	await settle();
	assert.deepEqual(notifications, [{ notification: `${IDENTIFIER}_ERROR`, payload: { message: "HTTP 503" } }]);
	assert.deepEqual(logs, ["MMM-vvsDeparture: Could not load the departures of de:08118:7000 from VVS: HTTP 503"]);
});

test("reports a network error to the module instance", async () => {
	const { helper, notifications, logs } = createHelper(() => {
		throw new TypeError("fetch failed");
	});
	getDepartures(helper);
	await settle();
	assert.deepEqual(notifications, [{ notification: `${IDENTIFIER}_ERROR`, payload: { message: "fetch failed" } }]);
	assert.equal(logs.length, 1);
});

test("gives up a request after 30 seconds", () => {
	const { helper, requests } = createHelper();
	getDepartures(helper);
	assert.ok(requests[0].options.signal instanceof AbortSignal);
});
