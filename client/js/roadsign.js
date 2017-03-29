'use strict';

//*****************************************************************************
//--------------------------------- CONSTANTS ---------------------------------
//*****************************************************************************

var EARTH_RADIUS = 6371000;   // In meters
var DEGREE_TO_RADIAN = Math.PI / 180;
var RADIAN_TO_DEGREE = 180 / Math.PI;
var MILE_TO_METER = 1609.34;
var MAX_STATIONS_TO_RETURN = 15;
var SQUARE = function(n) { return Math.pow(n, 2); }

//*****************************************************************************
//------------------------------ INITIALIZATIONS ------------------------------
//*****************************************************************************

/**
 * A LOT of document.querySelector in here. Kinda gross.
 * Sets up the various action listeners
 */
$(document).ready(function() {

    if ("geolocation" in navigator) {
        roadsignGlobals.geolocationEnabled = true;
    } else {
        roadsignGlobals.geolocationEnabled = false;
        document.querySelector('#doCloseSearch').style.display = "none";
    }

    var introPage = document.querySelector('#introWrapper');
    var btnRouteSearch = document.querySelector('#doRouteSearch');
    var btnCloseSearch = document.querySelector('#doCloseSearch');

    btnRouteSearch.addEventListener('click', function(e) {
        introPage.style.display = "none";
        var routeForm = document.querySelector('#FindRouteFormWrapper');
        routeForm.style.display = "block";
        document.querySelector('#origin').focus();
    }, false);

    btnCloseSearch.addEventListener('click', function(e) {
        document.querySelector('#introWrapper').style.display = "none";
        var closeForm = document.querySelector('#FindCloseStationFormWrapper');
        closeForm.style.display = "block";
        document.querySelector('#closeDistance').focus();
    }, false);

    $("#FindRouteForm").submit(function(e) {
        
        var action = $("#FindRouteForm").attr("action");

        // Call aynchronously, so form submit doesn't break
        setTimeout(sendRouteRequest.bind(null, action), 0);
        
        document.querySelector('#FindRouteFormWrapper').style.display = "none";
        document.querySelector('#FindRouteStationFormWrapper').style.display = "block";
        document.querySelector('#routeInterval').focus();

        e.preventDefault();
        return false;
    });
    
    $("#FindCloseStationForm").submit(function(e) {
        var action = $("#FindCloseStationForm").attr("action");

        navigator.geolocation.getCurrentPosition(function(position) {
            // Give the user a bit more feedback by centering the map *before* processing request
            roadsignGlobals.map.setCenter(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
            roadsignGlobals.map.setZoom(4);
            sendCloseStationRequest(action, position.coords.latitude, position.coords.longitude);
        });
        
        document.querySelector('#FindCloseStationFormWrapper').style.display = "none";
        // document.querySelector('#mapDiv').style.visibility = "visible";


        e.preventDefault();
        return false;
    });

    $("#FindRouteStationForm").submit(function(e) {
        var action = $("#FindRouteStationForm").attr("action");

        var interval = $('#routeInterval').val();
        // Call aynchronously, so form submit doesn't break
        setTimeout(sendRouteStationRequest.bind(null, action, interval), 0);
        
        document.querySelector('#FindRouteStationFormWrapper').style.display = "none";
        // document.querySelector('#mapDiv').style.visibility = "visible";

        e.preventDefault();
        return false;
    });
    
    // Start animation
    introPage.style.display = "block";
});

//*****************************************************************************
//--------------------------- GOOGLE MAPS FUNCTIONS ---------------------------
//*****************************************************************************

/**
 * initMap initializes the Google Map object in the display.
 */
function initMap() {
    roadsignGlobals.directionsDisplay = new google.maps.DirectionsRenderer();
    var mapOptions = {
        center: {lat:39.828127, lng:-98.579404},
        zoom:3
    }

    roadsignGlobals.map = new google.maps.Map(document.getElementById('mapDiv'), mapOptions);
    roadsignGlobals.directionsDisplay.setMap(roadsignGlobals.map);
}

/**
 * displayStationList takes a marker keyed to a particular search node and
 *  displays all nodes returned by our search from that node.
 * @params marker - Marker whose position represents a search node
 */
function displayStationList(marker) {
    var pos = marker.position;
    roadsignGlobals.map.setCenter(pos);

    var newKey = pos.lat().toFixed(10).toString() + pos.lng().toFixed(10).toString();
    displayStations(roadsignGlobals.stationMarkers[newKey]);
}

/**
 * addStationListMarker associates a list of stations with a given geolocation
 * @params geolocation - Object with lat and lng where station search began
 * @params stations - Array of station objects
 */
function addStationListMarker(geolocation, stations) {
    var position = { lat: parseFloat(geolocation.lat), lng: parseFloat(geolocation.lng) };
    var marker = new google.maps.Marker({ position: position, map: roadsignGlobals.map });

    var stationKey = position.lat.toFixed(10).toString() + position.lng.toFixed(10).toString();
    roadsignGlobals.stationMarkers[stationKey] = stations;

    google.maps.event.addListener(marker, 'click', function(e) {
        displayStationList(marker);
    });

    // Should give it a different icon, too - really
}

/**
 * centerOnStation centers the map on the passed geolocation
 * @params geolocation - The position on/around which to center the camera
 */
function centerOnStation(geolocation) {
    var position = new google.maps.LatLng(geolocation.lat, geolocation.lng);
    roadsignGlobals.map.setCenter(position);
    roadsignGlobals.map.setZoom(14);

    roadsignGlobals.selectedStationPos = position;

    if(roadsignGlobals.confirmWindow) {
      roadsignGlobals.confirmWindow.close();
    }

    roadsignGlobals.confirmWindow = new google.maps.InfoWindow({
        map: roadsignGlobals.map,
        position: position,
        content: "<button onclick='addWaypointAndReroute()'>Confirm</button>"
    });
 }

//*****************************************************************************
//------------------------ MyGasFeed REQUEST FUNCTIONS ------------------------
//*****************************************************************************

/**
 * calcGeoDist calculates the distance in meters between geoloc A & geoloc B
 * @params latA - Latitude of point a
 * @params lonA - Longitude of point a
 * @params latB - Latitude of point B
 * @params lonB - Longitude of point B
 * @return The distance, in meters, between points A and B
 */
function calcGeoDist(latA, lonA, latB, lonB) {
    var from = new google.maps.LatLng(latA, lonA);
    var to   = new google.maps.LatLng(latB, lonB);
    return google.maps.geometry.spherical.computeDistanceBetween(from, to);
}

/**
 * findNearestGeolocation finds the approximate geolocation that is the given
 *  distance from a given geolocation to another geolocation
 * @params geolocA - Geolocation to find *from* (i.e. "find loc x distance away
 *  from geolocA")
 * @params geolocB - Geolocation to find *to* (i.e. "find loc x distance to
 *  geolocB")
 * @params distInterval - The distance from geolocA at which to find the point
 *
 * With significant help from:
 *  http://stackoverflow.com/questions/33481258/calculate-geolocation-on-line-between-two-geolocations
 *  formula from: http://williams.best.vwh.net/avform.htm#Intermediate
 *
 * NOTE: Use of Haversine formula will generate distance along *straight* line
 *  - while the "steps" returned on a Google Maps Directions route are fairly
 *  atomic (i.e. hopefully straight), "straightness" cannot be assumed, so
 *  there WILL be some error, especially on particularly long steps.
 */
function findNearestGeolocation(geolocA, geolocB, distInterval) {
    var distAlongRoute = calcGeoDist(geolocA.lat, geolocA.lng, geolocB.lat, geolocB.lng);
    
    var darSin = Math.sin(distAlongRoute / EARTH_RADIUS);
    var a = Math.sin((distAlongRoute - distInterval) / EARTH_RADIUS) / darSin;
    var b = Math.sin(distInterval / EARTH_RADIUS) / darSin;

    var aLatCos = Math.cos(geolocA.lat * DEGREE_TO_RADIAN);
    var aLonCos = Math.cos(geolocA.lng * DEGREE_TO_RADIAN);
    var bLatCos = Math.cos(geolocB.lat * DEGREE_TO_RADIAN);
    var bLonCos = Math.cos(geolocB.lng * DEGREE_TO_RADIAN);

    var aLatSin = Math.sin(geolocA.lat * DEGREE_TO_RADIAN);
    var aLonSin = Math.sin(geolocA.lng * DEGREE_TO_RADIAN);
    var bLatSin = Math.sin(geolocB.lat * DEGREE_TO_RADIAN);
    var bLonSin = Math.sin(geolocB.lng * DEGREE_TO_RADIAN);

    var x = a * aLatCos * aLonCos + b * bLatCos * bLonCos;
    var y = a * aLatCos * aLonSin + b * bLatCos * bLonSin;
    var z = a * aLatSin + b * bLatSin;

    var newLat = Math.atan2(z, Math.sqrt(SQUARE(x) + SQUARE(y))) * RADIAN_TO_DEGREE;
    var newLon = Math.atan2(y, x) * RADIAN_TO_DEGREE;

    return {
        lat: newLat,
        lng: newLon
    };
}

/**
 * getGeolocationsOnRoute computes and returns every geolocation from which
 *  we will be performing a search for a given route
 * @params distInterval - The interval, in miles, at which we want to search
 *  for gas stations
 * @return Array of geolocations (containing LatLng) on route
 */
function getGeolocationsOnRoute(distInterval) {
    var geolocationsOnRoute = [ ];
    distInterval = Math.floor(distInterval * MILE_TO_METER);    // Don't bother with fractional meters

    var currDistTraveled = 0;
    while (currDistTraveled < roadsignGlobals.routeDistance) {
        var retLoc;
        if (roadsignGlobals.routePoints[currDistTraveled] !== undefined) {
            retLoc = roadsignGlobals.routePoints[currDistTraveled];
        } else {
            // Should be noted that dists *is* in order
            var dists = Object.keys(roadsignGlobals.routePoints);
            var maxLessThan = 0;
            var minGreaterThan = parseInt(dists[dists.length - 1]);
            for (var i = 0; i < dists.length; i++) {
                var currDist = parseInt(dists[i]);
                if (currDist > maxLessThan && currDist < currDistTraveled) {
                    maxLessThan = currDist;
                }
                if (currDist < minGreaterThan && currDist > currDistTraveled) {
                    minGreaterThan = currDist;
                }
            }

            var currMinusMax = currDistTraveled - maxLessThan;
            var minMinusCurr = minGreaterThan - currDistTraveled;

            if (currMinusMax < minMinusCurr) {
                // roadsignGlobals.routePoints[maxLessThan] is closer and will result in less curve error
                retLoc = findNearestGeolocation(roadsignGlobals.routePoints[maxLessThan], roadsignGlobals.routePoints[minGreaterThan], currMinusMax);
            } else {
                // roadsignGlobals.routePoints[minGreaterThan] is closer and will result in less curve error
                retLoc = findNearestGeolocation(roadsignGlobals.routePoints[minGreaterThan], roadsignGlobals.routePoints[maxLessThan], minMinusCurr);
            }
        }
        geolocationsOnRoute.push(retLoc);
        currDistTraveled += distInterval;
    }

    return geolocationsOnRoute;
}

/**
 * sendCloseStationRequest is the callback for navigator.getCurrentPosition in
 *  in FindCloseStationForm's submit action listener. It takes in the given
 *  latitude & longitude and grabs & validates other information from the UI.
 *  If the other information validates, everything is passed to
 *  sendStationRequest so the actual API call can be made.
 * @params latitude - The latitude of the user's current position
 * @params longitude - The longitude of the user's current position
 */
function sendCloseStationRequest(action, latitude, longitude) {

    var distance = $("#closeDistance").val();

    // If distance null default to 2 - could really break these out into error cases
    if (!distance || distance === '' || distance < 0) {
        distance = 2;
    }

    var fuelType = 'reg';
    var sortBy = $("#closeSortBy").val();

    sendStationRequest(action,
                        latitude,
                        longitude,
                        distance,
                        fuelType,
                        sortBy,
                        function(result, status, xhr) {
                            parseStationAddMarker(result, status, xhr);
                            displayStations(roadsignGlobals.stationMarkers[Object.keys(roadsignGlobals.stationMarkers)[0]]);
                            var centerLoc = new google.maps.LatLng(latitude, longitude);
                            roadsignGlobals.map.setCenter(centerLoc);
                            roadsignGlobals.map.setZoom(13);
                        });
}

/**
 * sendRouteStationRequest executes the (several) request(s) for station data
 * @params action - The action field specified on the form
 * @params distInterval - The interval at which the user would like to check
 *  for stations
 */
function sendRouteStationRequest(action, distInterval) {
    if (!distInterval || distInterval === '' || distInterval < 0) {
        distInterval = 20;   // Should really probably display error instead
    }
    
    var geolocsOnRoute = getGeolocationsOnRoute(distInterval);

    var distance = $("#routeDistance").val();
    // If distance null default to 2 - could really break these out into error cases
    if (!distance || distance === '' || distance < 0) {
        distance = 2;
    }

    var fuelType = 'reg';
    var sortBy = $("#routeSortBy").val();

    for (var i = 0; i < geolocsOnRoute.length; i++) {
        // Probably gonna want to specify an error callback, too
        sendStationRequest(action,
                            geolocsOnRoute[i].lat,
                            geolocsOnRoute[i].lng,
                            distance,
                            fuelType,
                            sortBy,
                            function(result, status, xhr) {
                                parseStationAddMarker(result, status, xhr);
                                displayStations(roadsignGlobals.stationMarkers[Object.keys(roadsignGlobals.stationMarkers)[0]]);
                            });
    }

    document.querySelector('#LoadingScreen').style.display = "block";
}

/**
 * sendStationRequest sends the final request to the server for station data
 * @params latitude - The latitude of the point from which we're searching
 * @params longitude - The longitude of the point from which we're searching
 * @params distance - How large a search radius we would like to search for
 *  stations with
 * @params fuelType - The fuelType we're searching for. Should only be 'reg'
 * @params sortBy - Whether we're sorting my price or distance.
 * @params successCallback - Optional. The function to call if the ajax request
 *  succeeds
 * @params errorCallback - Optional/ The function to call if the ajax request
 *  succeeds
 */
function sendStationRequest(action, latitude, longitude, distance, fuelType, sortBy, successCallback, errorCallback) {
    var latitude = encodeURIComponent(latitude);
    var longitude = encodeURIComponent(longitude);
    var distance = encodeURIComponent(distance);
    var fuelType = encodeURIComponent(fuelType);
    var sortBy = encodeURIComponent(sortBy);

    // Pass as query string - server will handle putting it in proper request format
    var data = "latitude=" + latitude
                 + "&longitude=" + longitude
                 + "&distance=" + distance
                 + "&fuelType=" + fuelType
                 + "&sortBy=" + sortBy;

    $.ajax({
      cache: false,
      type: "get",
      url: action,
      data: data,
      dataType: "json",
      success: successCallback,
      error: function (error, status, xhr) {
        var resultText = JSON.stringify(error);
        $("#result").text(resultText);
      }
    });

    document.querySelector('#LoadingScreen').style.display = "block";
}

/**
 * addWaypointAndReroute adds the marker at the given position and calls
 *  sendRouteRequest to calculate new directions passing through the marker
 */
function addWaypointAndReroute() {
    roadsignGlobals.routeWaypoints.push(roadsignGlobals.selectedStationPos);
    sendRouteRequest($("#FindRouteForm").attr("action"));
}

/**
 * sendRouteRequest sends the request for directions to the server
 * @params action - The action of the form field
 */
function sendRouteRequest(action) {

    // Reset things if any leftover data
    if (roadsignGlobals.displayPolyline) {
        roadsignGlobals.displayPolyline.setMap(null);
    }

    roadsignGlobals.routePoints = { };

    var origin = encodeURIComponent($('#origin').val());
    var destination = encodeURIComponent($('#destination').val());

    var data = "origin=" + origin + "&destination=" + destination;

    if (roadsignGlobals.routeWaypoints.length > 0) {
        data += "&waypoints=" + encodeURIComponent(JSON.stringify(roadsignGlobals.routeWaypoints));
    }

    $.ajax({
      cache: false,
      type: "get",
      url: action,
      data: data,
      dataType: "json",
      success: parseRouteData,
      error: function (error, status, xhr) {
        var resultText = JSON.stringify(error);
        $("#result").text(resultText);
      }
    });
}

//*****************************************************************************
//------------------------------ DISPLAY/PARSING ------------------------------
//*****************************************************************************

/**
 * displayDirections takes the results of a Google Maps Directions API query,
 *  parses it, turns it into a polyline, and displays that polyline on the map,
 *  showing the route to the user.
 * @params routeStatus - 
 * @params waypointsArray - 
 * @params routes - 
 * NOTE: While I did make *significant* changes, took heavy inspiration from
 *  the example linked here:
 *   http://stackoverflow.com/questions/16505731/display-a-route-without-directionsrenderer-in-google-map-v3
 */
function displayDirections(routeStatus, waypointsArray, routes) {
    // if (routeStatus === OK) {
    roadsignGlobals.displayPolyline = new google.maps.Polyline({
        path: [],
        strokeColor: "#0000FF",
        strokeOpacity: 1.0,
        strokeWeight: 3
    });

    var bounds = new google.maps.LatLngBounds();
    var route = routes[0];
    var legs = route.legs;

    // Construct the overall path to display
    var routePath = roadsignGlobals.displayPolyline.getPath();
    roadsignGlobals.routePoints[0] = legs[0].steps[0].start_location;
    for (var i = 0; i < legs.length; ++i) {
        var steps = legs[i].steps;

        // If we travel 0 distance, we're at start_location of first step
        for (var j = 0; j < steps.length; ++j) {
            // Map distance (specified in meters) to LatLng of step end
            roadsignGlobals.routePoints[steps[j].distance.value + roadsignGlobals.routeDistance] = steps[j].end_location;
            roadsignGlobals.routeDistance += steps[j].distance.value;

            // Get the step's encoded polyline string, decode it into a LatLng
            // array, and add it to the current path
            var polyline = steps[j].polyline.points;
            var pathFromPolyline = google.maps.geometry.encoding.decodePath(polyline);
            for (var k = 0; k < pathFromPolyline.length; ++k) {
                routePath.push(pathFromPolyline[k]);
                // Make sure to extend the map view
                bounds.extend(pathFromPolyline[k]);
            }
        }
    }

    roadsignGlobals.displayPolyline.setMap(roadsignGlobals.map);
    roadsignGlobals.map.fitBounds(bounds);
}

/**
 * parseRouteData receives responses from the Google Maps Directions API and
 *  passes it to displayDirections to show on the map
 * @params result - The request result
 * @params status - The request status
 * @params xhr - The xhr object used to make the request
 */
function parseRouteData(result, status, xhr) {
    if (xhr.status === 200) {
        var routeStatus = result.status;
        var waypointsArray = result.geocoded_waypoints;
        var routes = result.routes;
        
        if (routeStatus === 'OK') {
            displayDirections(routeStatus, waypointsArray, routes);
        }
    }
}

/**
 * displayStations takes an array of Station objects and dynamically adds them
 *  to the DOM
 * @params stations - Array of station objects to put onto the DOM
 */
function displayStations(stations) {
    // Clear out any old results
    var list = document.querySelector('#stationList');
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }

    for (var i = 0; i < stations.length; i++) {
        var stationWrapper = document.createElement('div');
        stationWrapper.className = 'station';

        if (stations[i].station) {
            var stationBrand = document.createElement('strong');
            stationBrand.innerHTML = stations[i].station;
            stationWrapper.appendChild(stationBrand);
            stationWrapper.appendChild(document.createElement('br'));
        }

        if (stations[i].price) {
            var stationPrice = document.createElement('em');
            stationPrice.innerHTML = "$" + stations[i].price;
            stationWrapper.appendChild(stationPrice);
        }

        if (stations[i].address) {
            var stationAddress = document.createElement('p');
            var distString = stations[i].distance;
            stationAddress.innerHTML = "~" + distString.substring(0, distString.length - 1) + " detour<br />\n" + stations[i].address;
            stationWrapper.appendChild(stationAddress);
        }

        var position = { lat: stations[i].latitude, lng: stations[i].longitude };
        stationWrapper.addEventListener('click', centerOnStation.bind(null, position), false);

        list.appendChild(stationWrapper);
    }
}

/**
 * parseStationData receives responses from the MyGasFeed API, creates station
 *  objects from the results with just the information needed, and returns an
 *  array of all station object created
 * @params result - The request result
 * @params status - The request status
 * @params xhr - The xhr object used to make the request
 * @return Array of parsed Station objects
 */
function parseStationData(result, status, xhr) {
    document.querySelector('#LoadingScreen').style.display = "none";
    document.querySelector('#mapDiv').style.visibility = "visible";

    if (xhr.status === 200) {
        var stationStatus = result.status;
        var stations = result.stations;

        if (stationStatus.code === 200) {
            // Just do the parsing into object here, leave it to more specific callbacks to handle the data result
            var stationObjects = [ ];
            for (var i = 0; i < stations.length && i < MAX_STATIONS_TO_RETURN; i++) {
                // Parse just the fields we want
                var StationObject = {
                    id: stations[i].id,
                    price: stations[i].reg_price,
                    address: stations[i].address,
                    station: stations[i].station,
                    latitude: stations[i].lat,
                    longitude: stations[i].lng,
                    distance: stations[i].distance
                }

                stationObjects.push(StationObject);
            }

            return stationObjects;
        }
    }
}

/**
 * parseStationAddMarker calls parseStationData to get an array of station
 *  objects from the returned request results, and forwards them to
 *  addStationListMarker to map each station to the location from which it was
 *  searched for
 * @params result - The request result
 * @params status - The request status
 * @params xhr - The xhr object used to make the request
 */
function parseStationAddMarker(result, status, xhr) {
    var stations = parseStationData(result, status, xhr);

    if (stations) {
        // If stations came back without error, result.geolocation will be good
        addStationListMarker(result.geoLocation, stations);
    }
}