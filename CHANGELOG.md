# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-10-11

The first release of the fork [ms-zone-41/MMM-vvsDeparture](https://github.com/ms-zone-41/MMM-vvsDeparture), which continues [fhinder/MMM-vvsDeparture](https://github.com/fhinder/MMM-vvsDeparture). The options stay the same; to switch, see [Update](README.md#update).

### Added

- Coupled trains in one row, e.g. `S6/S60`
- Messages instead of the departures while they load, if there are none to show, if `station_id` is not the ID of a stop, and with the reason if they cannot be loaded

### Changed

- The times and the realtime status are bright instead of dimmed, and the lines and the destinations have the normal text color, as does a cancelled departure as a whole
- A clock marks departures on time instead of `+0`, and a ban sign and a struck-through time mark cancelled departures instead of `canc.` or `gestr.`
- `colorDelay` and `colorNoDelay` are `false` by default, like the color options of the default modules of MagicMirror²; set them to `true` for the red and green of 1.4.0
- The stop is shown in the header of MagicMirror², so that the `header` option replaces it instead of adding a second header
- The module loads the next 100 departures instead of 40, so that `number` and `direction` leave more of them to show
- `reloadInterval` is at least 30 seconds
- The module requires MagicMirror² 2.25.0 or newer and has no dependencies

### Fixed

- With MagicMirror² 2.33 and newer, the module showed no departures: "Cannot find module 'axios'"
- A departure without realtime data showed the delay of the departure before it, and the table was not updated while the first departure had none
- Departures without a valid realtime estimate were shown as cancelled, and cancelled departures were not
- Early departures and delays of an hour or more were shown wrongly, e.g. `+58` for two minutes early
- `offset` asked for the departures at the wrong time if MagicMirror² ran in a time zone other than Stuttgart's
- Lines given as numbers, e.g. `number: 622`, matched nothing
- The header showed "undefined" until the first update
- Each reload of the page and each browser that shows the mirror started one more update timer, so VVS got more and more requests

## [1.4.0] - 2020-01-09
- Introduce offset parameter to show only connections in a certain offset

## [1.3.0] - 2020-01-09
- Introduced semantic versioning
- Added support for showing multiple stations 

## [1.2.0] - 2018-12-27
- Change API source to the official vvs api
- Fixes realtime data

## [1.1.0] - 2018-12-27
- Fixes SSL certificate problems

## [1.0.0] - 2018-12-27
- Create LICENSE

## [0.0.1]
- Started MagicMirror² Module for showing public transportation information from the VVS (Stuttgart) area
