/* global Module */

/* Magic Mirror
 * Module: MMM-vvsDeparture
 *
 * By Fabian Hinder
 * forked from nilaskappler
 * MIT Licensed.
 */
 
var NodeHelper = require("node_helper");
var Axios = require('axios');
const Log = require('logger');

const BASE_URL = "https://www3.vvs.de";

module.exports = NodeHelper.create({
	/* socketNotificationReceived(notification, payload)
	 * This method is called when a socket notification arrives.
	 *
	 * argument notification string - The identifier of the noitication.
	 * argument payload mixed - The payload of the notification.
	 */
	socketNotificationReceived: function (notification, payload) {
		var self = this;

		if (notification === "GET_DEPARTURES") {
			self.retrieveStationData(
				payload.config.station_id,
				payload.config.offset,
				payload.identifier);
			setInterval(function () {
				self.retrieveStationData(
					payload.config.station_id,
					payload.config.offset,
					payload.identifier);
			}, payload.config.reloadInterval);
		}
	},

	retrieveStationData: function (stationId, offset, moduleIdentifier) {
		var self = this;
		
		var path = '/mngvvs/XML_DM_REQUEST?' +
			`limit=40&`+
			`mode=direct&`+
			`name_dm=${stationId}&`+
			`outputFormat=rapidJSON&`+ //`outputFormat=JSON&`
			`type_dm=any&`+
			`useRealtime=1`;
		
		if (offset != undefined) {
			var d = new Date();
			d.setMinutes(d.getMinutes() + offset);
			path += `&itdDateYear=` + d.getFullYear().toString();
			path += `&itdDateMonth=` + (d.getMonth() + 1).toString();
			path += `&itdDateDay=` + d.getDate().toString();
			path += `&itdTimeHour=` + d.getHours().toString();
			path += `&itdTimeMinute=` + d.getMinutes().toString();
		}
		var url = BASE_URL + path;
		
		var config = {
			method: 'get',
			url: encodeURI(url),
			headers: {}
		};

		Axios(config)
		.then(function (response) {
			self.sendSocketNotification(moduleIdentifier+"_NEW_DEPARTURES", (response.data));
		})
		.catch(function (error) {
			self.sendSocketNotification(moduleIdentifier + "_ERROR", error);
			//Log.error(error);
		});
	}
});
