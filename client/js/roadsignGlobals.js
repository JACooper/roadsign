var roadsignGlobals = (function() {
	
	var directionsDisplay;
	var map;
	var confirmWindow;
	var displayPolyline;
	var selectedStationPos;
	var geolocationEnabled;
	var routePoints = { };      // Dictionary mapping distance to LatLng
	var routeDistance = 0;
	var routeWaypoints = [ ];
	var stationMarkers = { };   // Dictionary mapping markers to station lists

	return {
		directionsDisplay: directionsDisplay,
		map: map,
		confirmWindow: confirmWindow,
		displayPolyline: displayPolyline,
		selectedStationPos: selectedStationPos,
		geolocationEnabled:geolocationEnabled,
		routePoints: routePoints,
		routeDistance: routeDistance,
		routeWaypoints: routeWaypoints,
		stationMarkers: stationMarkers
	}
})();