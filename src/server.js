'use strict';

//*****************************************************************************
//---------------------------------- IMPORTS ----------------------------------
//*****************************************************************************

var http = require('http');
var url = require('url');
var query = require('querystring');
var fs = require('fs');

// For MyGasFeed
var requestHandler = require('request');

var index = fs.readFileSync(__dirname + "/../client/index.html");
var mainscript = fs.readFileSync(__dirname + "/../client/js/roadsign.js");
var supportscript = fs.readFileSync(__dirname + "/../client/js/roadsignGlobals.js");
var mainstyle = fs.readFileSync(__dirname + "/../client/css/roadsign.css");
var logo = fs.readFileSync(__dirname + "/../client/images/roadsign.png");

var port = process.env.PORT || 3000;


//*****************************************************************************
//------------------------------- LIBRARY SETUP -------------------------------
//*****************************************************************************

// Dev key & request URLs are unused in production
var GOOGLE_MAPS_DIR_KEY = "AIzaSyDT39nYSK20_ZioAZ_tX1VwalK2TfnjXr8";
var GOOGLE_MAPS_KEY = "AIzaSyCLEG1_negubxBoabHYh-tv8ZnG3URpCpU";
var MY_GAS_FEED_DEV_KEY = "rfej9napna";
var MY_GAS_FEED_KEY = "9cxnih3t1c";

var BASE_GOOGLE_MAPS_REQUEST = "https://maps.googleapis.com/maps/api/directions/json";
var BASE_MYGASFEED_DEV_REQUEST = "http://devapi.mygasfeed.com/stations/radius/";
var BASE_MYGASFEED_REQUEST = "http://api.mygasfeed.com/stations/radius/";

var googleMapsClient = require('@google/maps').createClient({
    key: GOOGLE_MAPS_DIR_KEY
});

//*****************************************************************************
//-------------------------- HEADER SETUP (for CORS) --------------------------
//*****************************************************************************

var responseHeaders = {  
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type, accept",
    "access-control-max-age": 10,
    "Content-Type": "application/json"
};

//*****************************************************************************
//---------------------------------- GLOBALS ----------------------------------
//*****************************************************************************

// Hoping these aren't too flagrant a violation. . .? Seemed excessive to make
//  a whole module just for these in a one file Node Server
var routeStart, routeEnd, locationsFound;

//*****************************************************************************
//--------------------------------- FUNCTIONS ---------------------------------
//*****************************************************************************

/**
 * onRequest handles requests from the client
 * @params req - The client's request
 * @params res - The response to send back to the client
 */
function onRequest(req, res) {
    var parsedUrl = url.parse(req.url);
    var params = query.parse(parsedUrl.query);

    if (parsedUrl.pathname === '/routeSearch') {
        routeStart = null;
        routeEnd = null;
        locationsFound = 0;
        convertLocs(params, res);
    } else if (parsedUrl.pathname === '/stationSearch') {
        stationSearch(res, params);
    } else if (parsedUrl.pathname === '/js/roadsign.js') {
        res.writeHead(200, { "Content-Type" : "text/javascript"});
        res.write(mainscript);
        res.end();
    } else if (parsedUrl.pathname === '/js/roadsignGlobals.js') {
        res.writeHead(200, { "Content-Type" : "text/javascript"});
        res.write(supportscript);
        res.end();
    } else if (parsedUrl.pathname === '/css/roadsign.css') {
        res.writeHead(200, { "Content-Type" : "text/css"});
        res.write(mainstyle);
        res.end();
    } else if (parsedUrl.pathname === '/images/roadsign.png') {
        res.writeHead(200, { "Content-Type" : "image/png"});
        res.write(logo);
        res.end();
    } else {
        res.writeHead(200, { "Content-Type" : "text/html"} );
        res.write(index);
        res.end();
    }
}

//*****************************************************************************
//-------------------------------- Google Maps --------------------------------
//*****************************************************************************

/**
 * convertLocs converts origin and destination addresses (passed in params) to
 *  to latitude/longitude pairs of coordinates
 * @params params - Client request parameters. Contains origin and destination
 * @params res - The response to send to the client. Forwarded to callback
 */
function convertLocs(params, res) {
    //console.log("Calling getGeocode");
    getGeocode(params.origin, true, res, params);
    getGeocode(params.destination, false, res, params);
}

/**
 * startSearch is the callback for geocodeRequest().finally(). Calls
 *  routeSearch once both routeStart and routeEnd have been found
 * @params res - The response to send to the client. Forward to routeSearch
 * @params params - Clien request parameters. Forwarded to routeSearch
 */
function startSearch(res, params) {
    //console.log("Entered startSearch, locationsFound = " + locationsFound);
    if (locationsFound === 1) {
        routeSearch(res, params);
    } else {
        locationsFound++;
    }
}

/**
 * parseGeocodeResult is the callback for geocodeRequest. Assigns locations to
 *  either routeStart or routeEnd
 * @params err - Error returned from the geocode request, if any
 * @params response - Response returned from the geocode request
 * @params start - Boolean. True if requesting geocode for origin, else false
 * @params res - Response to send back to the client. Forwarded to startSearch
 * @params params - Client request parameters. Forward to startSearch
 */
function parseGeocodeResult(err, response, start, res, params) {
    // If !err
    locVar = response.json.results[0].geometry.location;
    if (start) {
        routeStart = locVar;
    } else {
        routeEnd = locVar;
    }
    startSearch(res, params);
}

/**
 * getGeocode sends a string address and requests the Google Maps Geocoding API
 *  convert it to a latitude/longitude coordinate. Uses parseGeocodeResult as
 *  request callback
 * @params stringLoc - The address to convert (e.g. "Rochester, NY")
 * @params start - Boolean. True if requesting geocode for origin, false
 *  otherwise. Forwarded to callback
 * @params res - The response to send back to the client. Forwarded to callback
 * @params params - Client request parameters. Forwarded to callback
 */
function getGeocode(stringLoc, start, res, params) {
    var geocodeQueryOptions = { };

    geocodeQueryOptions.address = stringLoc;
    var geocodeRequest = googleMapsClient.geocode(geocodeQueryOptions, function(err, response) { parseGeocodeResult(err, response, start, res, params); });
}

/**
 * routeCallback handles response from the Google Maps Directions API and sends
 *  results back to client
 * @params err - Error returned from Google Maps, if any
 * @params response - Response returned from Google Maps
 * @params clientResponse - Response to send back to the client
 */
function routeCallback(err, response, clientResponse) {
    // If !err
    // console.log("err");
    // console.dir(err);
    // console.log("response");
    // console.dir(response);
    try {
        clientResponse.writeHead(200, { "Content-Type" : "application/json"} );
        clientResponse.write(JSON.stringify(response.json));
        clientResponse.end();
    } catch(exception) {
        console.dir(exception);
        clientResponse.writeHead(500, { "Content-Type" : "application/json"});

        var responseMessage = {
            message: "Error parsing/sending back route data."
        };

        clientResponse.write(JSON.stringify(responseMessage));
        clientResponse.end();
    }
}

/**
 * routeSearch creates and sends a request to the Google Maps Directions API
 *  for directions from routeStart to routeEnd (both set by above functions).
 *  Uses routeCallback as request callback
 * @params clientResponse - Response to send to client. Forwarded to callback
 * @params params - Client request parameters
 */
function routeSearch(clientResponse, params) {
    var routeQueryOptions = {
        origin: routeStart,
        destination: routeEnd
    };

    if (params.waypoints) {
        routeQueryOptions.waypoints = JSON.parse(params.waypoints);
        routeQueryOptions.optimize = true;
    }

    console.dir(routeQueryOptions);

    var search = googleMapsClient.directions(routeQueryOptions, function(err, response) {
                    routeCallback(err, response, clientResponse);
                });
}

//*****************************************************************************
//--------------------------------- MyGasFeed ---------------------------------
//*****************************************************************************

/**
 * stationCallback handles response from the MyGasFeed API and sends results
 *  back to client
 * @params error - The error returned from the request, if any
 * @params response - The response from the request
 * @params body - The raw result of the HTTP request
 * @params clientResponse - The response to send back to the client
 */
function stationCallback(error, response, body, clientResponse) {
    if (error) {
        // Error handling more or less on client side, but should be doing more here
    }

    // Sometimes, depending on how MyGasFeed handles its requests internally,
    //  errors will be generated on their end. Warnings are wrapped in <pre>
    //  tags, so finding the last one and taking everything after leaves us
    //  with just the JSON response
    if (body.includes('</pre>')) {
        var endHTMLIndex = body.lastIndexOf('</pre>');
        body = body.substring(endHTMLIndex + 6);    // Skip the entire "</pre>" tag
        body = JSON.parse(body);                    // Turn it into an object so no leftover HTML "stuff" gets left in
        body = JSON.stringify(body);                // Turn it back into a string, since that's what response.write() wants. Just. . .don't ask
    }

    try {
        clientResponse.writeHead(200, { "Content-Type" : "application/json"});
        clientResponse.write(body);
        clientResponse.end();
    } catch(exception) {
        clientResponse.writeHead(500, { "Content-Type" : "application/json"});

        var responseMessage = {
            message: "Error parsing/sending back gas station data."
        };

        clientResponse.write(JSON.stringify(responseMessage));
        clientResponse.end();
    }
}

/**
 * stationSearch creates and sends a request to the MyGasFeed API. Uses
 *  stationCallback as request callback
 * @params clientResponse - The response to send back to the client.
 *  Forwarded to callback
 * @params params - Client request parameters
 */
function stationSearch(clientResponse, params) {
    try {
        var requestUrl = "/" + params.latitude
                         + "/" + params.longitude
                         + "/" + params.distance 
                         + "/" + params.fuelType 
                         + "/" + params.sortBy 
                         + "/" + MY_GAS_FEED_KEY + ".json";

        requestHandler(BASE_MYGASFEED_REQUEST + requestUrl,
            function(error, response, body) {
                stationCallback(error, clientResponse, body, clientResponse);
            });
    } catch(exception) {
        // This may be a superfluous catch
        console.dir(exception);
        clientResponse.writeHead(500, responseHeaders);

        var responseMessage = {
            message: "Error connecting to server."
        };

        clientResponse.write(JSON.stringify(responseMessage));
        clientResponse.end();
    }
}


http.createServer(onRequest).listen(port);
//console.log("listening on port " + port);