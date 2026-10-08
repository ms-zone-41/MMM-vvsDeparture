# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
- Fetch the departures with the fetch API of Node.js instead of `axios`, which the module used but did not declare, so that a fresh install failed. The module has no dependencies to install anymore and requires MagicMirror² 2.25.0 or newer
- Show the delay of each departure instead of the delay of the departure before it, and leave the delay empty if there is no realtime data. The module no longer stays empty if the first departure has no realtime data
- Show departures as cancelled when VVS reports them as cancelled. A departure whose realtime estimate is missing or invalid is no longer shown as cancelled
- Show early departures (e.g. `-2`) and delays of an hour or more correctly

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
- Started [MagicMirror] Module for showing public transportation information from the VVS (Stuttgart) area  
