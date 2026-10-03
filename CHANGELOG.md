# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
- Fix the delay column: each departure now shows its own realtime delay instead of the delay of a previous departure
- Show `0` for departures that are confirmed on time and `?` for departures without realtime data
- Show early departures (e.g. `-1`) and delays of more than one hour correctly
- Only mark departures as cancelled when VVS reports them as cancelled

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
