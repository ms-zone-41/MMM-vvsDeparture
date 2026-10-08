# MMM-vvsDeparture

A [MagicMirror²](https://magicmirror.builders) module that shows the next departures from a stop of the VVS, the public transport network of Stuttgart, Germany, with realtime delays and cancellations.

![Departures from Stuttgart Hauptbahnhof](example1.png)

## Features

- The next departures from a stop: the planned departure time, the realtime status, the line and the destination
- Delays and early departures in minutes, a clock for departures on time, and a ban sign for cancelled departures
- Coupled trains in one row, e.g. `S6/S60`
- Filters for lines and destinations, and an offset for the time it takes you to get to the stop
- English and German

## Installation

The module requires MagicMirror² 2.25.0 or newer. It has no dependencies, so there is nothing to install with npm. Clone it into the `modules` directory of MagicMirror²:

```shell
cd ~/MagicMirror/modules
git clone https://github.com/ms-zone-41/MMM-vvsDeparture
```

Then add it to your configuration, see below.

## Update

```shell
cd ~/MagicMirror/modules/MMM-vvsDeparture
git pull
```

## Configuration

Add the module to the `modules` array in `config/config.js`, with the ID of your stop:

```js
	{
		module: "MMM-vvsDeparture",
		position: "top_right",
		config: {
			station_id: "de:08118:7000" // Ditzingen, Bahnhof
		}
	},
```

### Options

| Option | Description | Default |
| --- | --- | --- |
| `station_id` | The ID of the stop, see [Finding the ID of a stop](#finding-the-id-of-a-stop). | `"de:08111:6112"` (Stuttgart Hauptbahnhof) |
| `station_name` | The name of the stop in the header. | The name that VVS uses |
| `maximumEntries` | The number of departures to show. A coupled train counts once. | `6` |
| `reloadInterval` | How often to load the departures, in milliseconds. | `60000` (one minute) |
| `colorDelay` | Show delays, early departures and cancellations in red. | `true` |
| `colorNoDelay` | Show the clock of departures on time in green. | `true` |
| `number` | Only show these lines: a line, e.g. `"S6"`, a list of lines, e.g. `["S6", "S60"]`, or a function that gets a line and returns `true` to show it. | All lines |
| `direction` | Only show departures to these destinations: a destination, e.g. `"Schwabstraße"`, a list of destinations, or a function that gets a destination and returns `true` to show it. | All destinations |
| `offset` | Only show departures at least this many minutes from now, e.g. the time it takes you to walk to the stop. The header then says so, e.g. "Departures from Ditzingen in 5 min.". | None |

Functions for `number` and `direction` work with every version of MagicMirror² except 2.35, which does not pass functions from the configuration to the modules.

The module loads the next 100 departures of the stop and then filters them. At a busy stop such as Stuttgart Hauptbahnhof, they cover only about half an hour, so with `number` or `direction` the table can show fewer departures than `maximumEntries`.

The header shows the stop. To show another header, set the `header` option of MagicMirror², e.g. `header: "To work"`, next to `module` and `config`. `header: ""` hides it.

### Example

The S-Bahn lines S6 and S60 from Ditzingen, except those to Weil der Stadt, that you can still catch if you walk to the station in five minutes:

```js
	{
		module: "MMM-vvsDeparture",
		position: "top_left",
		header: "To work",
		config: {
			station_id: "de:08118:7000", // Ditzingen, Bahnhof
			number: ["S6", "S60"],
			direction: (destination) => destination !== "Weil der Stadt",
			offset: 5
		}
	},
```

### Finding the ID of a stop

The ID of a stop looks like `de:08111:6112`. To find the ID of your stop, open this address in a browser, with the name of your stop at the end:

<https://www3.vvs.de/mngvvs/XML_STOPFINDER_REQUEST?outputFormat=rapidJSON&type_sf=any&name_sf=Ditzingen%20Bahnhof>

VVS answers with the stops that match the name. Use the `id` of the one with the `"type": "stop"` that you want, e.g. `de:08118:7000` for Ditzingen, Bahnhof. If the module shows "Station … not found", VVS does not know the ID.

## What the module shows

The time column shows the planned departure. The column next to it shows the realtime status of the departure:

- `+N` / `-N`: the departure is N minutes late / early. Like VVS, the module counts whole minutes, so a departure 36 seconds late is on time.
- a clock: the departure is on time
- a ban sign, with the departure time struck through: the departure is cancelled
- empty: VVS has no realtime data for the departure

Coupled trains, which VVS lists once for each line, are shown in one row, e.g. `S6/S60` between Stuttgart and Renningen. Departures are combined if they are trains of the same kind, i.e. S-Bahn, regional or long-distance trains, that leave at the same planned time from the same platform and have the same destination or come from the same origin. A train that splits later on shows all its destinations, e.g. `S6/S60 Weil der Stadt, Böblingen`. The row shows the earliest realtime estimate of its parts. If only some parts of a train are cancelled, they get rows of their own. Buses, Stadtbahn trains and trams are never combined, because several of them can leave a stop together to the same destination, e.g. U11 and U19 to NeckarPark (Stadion) on event days.

If the departures cannot be loaded, the module says so until the next update brings them, and the log of MagicMirror² tells why.

## Development

The tests use [node:test](https://nodejs.org/api/test.html) and the development dependencies of the module. Run them and [ESLint](https://eslint.org) in the module directory:

```shell
npm install
npm test
node --run lint
```

GitHub runs both for every push and pull request.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE).
