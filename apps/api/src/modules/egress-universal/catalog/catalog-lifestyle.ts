// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/catalog/catalog-lifestyle.ts
// ============================================================================
// Maps, weather, travel, health, IoT, energy, education, real estate, and
// everyday-utility destinations.
import { DestinationDefinition, D } from './destination-types';

export const LIFESTYLE: DestinationDefinition[] = [
  // Maps & location.
  D('google-maps', 'Google Maps', 'location', 'https://maps.googleapis.com', 'api-key-header', ['apiKey'], '/maps/api/geocode/json', 'key'),
  D('mapbox', 'Mapbox', 'location', 'https://api.mapbox.com', 'bearer', ['accessToken'], '/v10/health', undefined, ['apiKey']),
  D('here', 'HERE', 'location', 'https://router.hereapi.com', 'api-key-header', ['apiKey'], '/v8/health', 'Authorization'),
  D('tomtom', 'TomTom', 'location', 'https://api.tomtom.com', 'api-key-header', ['apiKey'], '/search/2/search/pizza.json', 'key'),
  D('maptiler', 'MapTiler', 'location', 'https://api.maptiler.com', 'api-key-header', ['apiKey'], '/maps/health', 'key'),
  D('esri', 'Esri ArcGIS', 'location', 'https://www.arcgis.com', 'bearer', ['accessToken'], '/sharing/rest/portals/self', undefined, ['apiKey', 'refreshToken']),
  D('graphhopper', 'GraphHopper', 'location', 'https://graphhopper.com', 'api-key-header', ['apiKey'], '/health', 'key'),
  D('openrouteservice', 'OpenRouteService', 'location', 'https://api.openrouteservice.org', 'api-key-header', ['apiKey'], '/health', 'Authorization'),
  D('geocodio', 'Geocodio', 'location', 'https://api.geocod.io', 'api-key-header', ['apiKey'], '/v1.6/health', 'api_key'),
  D('radar', 'Radar', 'location', 'https://api.radar.io', 'api-key-header', ['secretKey'], '/v1/health', 'X-Sub-Secret-Key', ['apiKey']),
  D('what3words', 'what3words', 'location', 'https://api.what3words.com', 'api-key-header', ['apiKey'], '/v3/health', 'X-Api-Key'),
  D('opencage', 'OpenCage', 'location', 'https://api.opencagedata.com', 'api-key-header', ['apiKey'], '/geo/v1/json', 'key'),
  D('bing-maps', 'Bing Maps', 'location', 'https://dev.virtualearth.net', 'api-key-header', ['apiKey'], '/REST/v1/Locations', 'Authorization'),
  D('geocoding-here', 'Geocode.xyz', 'location', 'https://geocode.xyz', 'api-key-header', ['apiKey'], '/health', 'auth'),

  // Weather.
  D('openweather', 'OpenWeather', 'weather', 'https://api.openweathermap.org', 'api-key-header', ['apiKey'], '/data/2.5/weather', 'appid'),
  D('weatherapi', 'WeatherAPI', 'weather', 'https://api.weatherapi.com', 'api-key-header', ['apiKey'], '/v1/current.json', 'key'),
  D('tomorrow-io', 'Tomorrow.io', 'weather', 'https://api.tomorrow.io', 'api-key-header', ['apiKey'], '/v4/timelines', 'apikey'),
  D('accuweather', 'AccuWeather', 'weather', 'https://dataservice.accuweather.com', 'api-key-header', ['apiKey'], '/locations/v1/cities/search', 'Authorization'),
  D('visual-crossing', 'Visual Crossing', 'weather', 'https://weather.visualcrossing.com', 'api-key-header', ['apiKey'], '/weather-data/health', 'key'),
  D('open-meteo', 'Open-Meteo', 'weather', 'https://api.open-meteo.com', 'api-key-header', ['apiKey'], '/v1/forecast', 'Authorization'),
  D('weatherbit', 'Weatherbit', 'weather', 'https://api.weatherbit.io', 'api-key-header', ['apiKey'], '/v2.0/current', 'key'),
  D('stormglass', 'Stormglass', 'weather', 'https://api.stormglass.io', 'bearer', ['apiKey'], '/v2/weather/point', undefined, ['appId']),
  D('pirate-weather', 'Pirate Weather', 'weather', 'https://api.pirateweather.net', 'api-key-header', ['apiKey'], '/forecast/health', 'Authorization'),
  D('weather-gov', 'Weather.gov', 'weather', 'https://api.weather.gov', 'api-key-header', ['apiKey'], '/zones', 'User-Agent'),

  // Aviation & travel.
  D('aviationstack', 'Aviationstack', 'travel', 'https://api.aviationstack.com', 'api-key-header', ['apiKey'], '/v1/flights', 'access_key'),
  D('flightaware', 'FlightAware (AeroAPI)', 'travel', 'https://aeroapi.flightaware.com', 'api-key-header', ['apiKey'], '/v1/flights', 'x-apikey'),
  D('opensky', 'OpenSky Network', 'travel', 'https://opensky-network.org', 'basic', ['username', 'password'], '/api/states/all'),
  D('amadeus', 'Amadeus', 'travel', 'https://test.api.amadeus.com', 'bearer', ['apiKey', 'secretKey'], '/v1/airport/search', undefined, ['accessToken']),
  D('sabre', 'Sabre', 'travel', 'https://api.sabre.com', 'oauth-code', ['clientId', 'clientSecret'], '/v1/health'),
  D('travelpayouts', 'Travelpayouts', 'travel', 'https://api.travelpayouts.com', 'bearer', ['accessToken'], '/v1/health'),
  D('duffel', 'Duffel', 'travel', 'https://api.duffel.com', 'bearer', ['apiKey'], '/air/offer_requests'),
  D('booking-com', 'Booking.com', 'travel', 'https://connect.booking.com', 'oauth-code', ['accessToken', 'refreshToken'], '/v1/hotels'),
  D('expedia-rapid', 'Expedia Rapid', 'travel', 'https://api.expediapartnersolutions.com', 'api-key-header', ['apiKey', 'secretKey'], '/v1/hotels', 'Authorization'),
  D('skyscanner', 'Skyscanner', 'travel', 'https://partners.api.skyscanner.net', 'api-key-header', ['apiKey'], '/apiservices/health', 'x-api-key'),
  D('airtable-travel', 'Hostelworld', 'travel', 'https://api.hostelworld.com', 'api-key-header', ['apiKey'], '/v2/health', 'Authorization'),
  D('rome2rio', 'Rome2Rio', 'travel', 'https://rome2rio.com', 'api-key-header', ['apiKey'], '/api/1.2/health', 'Authorization'),

  // Health & fitness.
  D('fitbit', 'Fitbit', 'health', 'https://api.fitbit.com', 'bearer', ['accessToken'], '/1/user/-/profile.json', undefined, ['refreshToken', 'clientId']),
  D('garmin', 'Garmin Connect', 'health', 'https://health-api.garmin.com', 'oauth-code', ['consumerKey', 'consumerSecret'], '/health-api/health'),
  D('withings', 'Withings', 'health', 'https://wbs-api.withings.net', 'oauth-code', ['clientId', 'clientSecret'], '/v2/health', undefined, ['accessToken', 'refreshToken']),
  D('oura', 'Oura', 'health', 'https://api.ouraring.com', 'bearer', ['accessToken'], '/v2/usercollection/daily_activity', undefined, ['refreshToken']),
  D('strava', 'Strava', 'health', 'https://www.strava.com', 'bearer', ['accessToken'], '/api/v3/athlete', undefined, ['refreshToken', 'clientToken']),
  D('whoop', 'WHOOP', 'health', 'https://api.prod.whoop.com', 'bearer', ['accessToken'], '/developer/v1/health', undefined, ['refreshToken']),
  D('google-fit', 'Google Fit', 'health', 'https://www.googleapis.com', 'bearer', ['accessToken'], '/fitness/v1/users/me/dataSources', undefined, ['refreshToken']),
  D('cronometer', 'Cronometer', 'health', 'https://cronometer.com', 'api-key-header', ['apiKey'], '/api/v1/health', 'Authorization'),
  D('nutritionix', 'Nutritionix', 'health', 'https://trackapi.nutritionix.com', 'api-key-header', ['apiKey'], '/v2/health', 'x-app-id', ['appId']),

  // Food.
  D('spoonacular', 'Spoonacular', 'health', 'https://api.spoonacular.com', 'api-key-header', ['apiKey'], '/food/ingredients/search', 'x-api-key'),
  D('edamam', 'Edamam', 'health', 'https://api.edamam.com', 'api-key-header', ['apiKey'], '/api/recipes/v2', 'app_id', ['appId']),
  D('themealdb', 'TheMealDB', 'health', 'https://www.themealdb.com', 'api-key-header', ['apiKey'], '/api/json/v1/1/search.php', 'Authorization'),

  // IoT.
  D('particle', 'Particle IoT', 'iot', 'https://api.particle.io', 'bearer', ['accessToken'], '/v1/devices', undefined, ['refreshToken']),
  D('blynk', 'Blynk IoT', 'iot', 'https://blynk.cloud', 'bearer', ['accessToken'], '/external/api/health', undefined, ['region']),
  D('adafruit-io', 'Adafruit IO', 'iot', 'https://io.adafruit.com', 'api-key-header', ['apiKey'], '/api/v2/user/feeds', 'X-AIO-Key'),
  D('thingspeak', 'ThingSpeak', 'iot', 'https://api.thingspeak.com', 'api-key-header', ['apiKey'], '/channels/public/feed.json', 'api_key'),
  D('arduino-iot', 'Arduino IoT Cloud', 'iot', 'https://api2.arduino.cc', 'oauth-code', ['clientId', 'clientSecret'], '/iot/v2/health'),
  D('tuya', 'Tuya IoT', 'iot', 'https://openapi.tuyaus.com', 'api-key-header', ['apiKey', 'secretKey'], '/v1.0/iot/health', 'client_id'),
  D('smartthings', 'SmartThings', 'iot', 'https://api.smartthings.com', 'bearer', ['accessToken'], '/v1/devices', undefined, ['refreshToken']),
  D('aws-iot', 'AWS IoT Core', 'iot', 'https://iot.us-east-1.amazonaws.com', 'api-key-header', ['apiKey'], '/health', 'Authorization'),

  // Energy.
  D('enode', 'Enode', 'energy', 'https://enode-api.production.enode.io', 'oauth-code', ['clientId', 'clientSecret'], '/health'),
  D('octopus-energy', 'Octopus Energy', 'energy', 'https://api.octopus.energy', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),
  D('tibber', 'Tibber', 'energy', 'https://api.tibber.com', 'bearer', ['accessToken'], '/v1-beta/query', undefined, ['refreshToken']),
  D('tesla', 'Tesla Fleet', 'energy', 'https://fleet-api.prd.na.v2.tesla.com', 'bearer', ['accessToken'], '/api/1/vehicles', undefined, ['refreshToken']),
  D('opower', 'Opower', 'energy', 'https://api.opower.com', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),

  // Education.
  D('canvas-lms', 'Canvas LMS', 'education', 'https://canvas.instructure.com', 'bearer', ['accessToken'], '/api/v1/courses', undefined, ['refreshToken']),
  D('blackboard', 'Blackboard Learn', 'education', 'https://blackboard.com', 'bearer', ['apiKey'], '/learn/api/public/v1/courses', undefined, ['accessToken']),
  D('powerschool', 'PowerSchool', 'education', 'https://powerschool.com', 'api-key-header', ['apiKey'], '/ws/v1/health', 'Authorization'),
  D('teachable', 'Teachable', 'education', 'https://developers.teachable.com', 'bearer', ['apiKey'], '/v1/health'),
  D('thinkific', 'Thinkific', 'education', 'https://api.thinkific.com', 'api-key-header', ['apiKey'], '/api/public/v1/health', 'X-Auth-API-Key', ['domain']),
  D('kajabi', 'Kajabi', 'education', 'https://app.kajabi.com', 'api-key-header', ['apiKey'], '/api/v1/health', 'X-Kajabi-Api-Key'),
  D('quizlet', 'Quizlet', 'education', 'https://api.quizlet.com', 'oauth-code', ['clientId', 'clientSecret'], '/2.0/users/me'),
  D('duolingo', 'Duolingo', 'education', 'https://www.duolingo.com', 'api-key-header', ['apiKey'], '/2017-06-30/health', 'Authorization'),

  // Government & civic.
  D('nager-date', 'Nager.Date', 'government', 'https://date.nager.at', 'api-key-header', ['apiKey'], '/api/v3/PublicHolidays/2024/US', 'Authorization'),
  D('holidayapi', 'Holiday API', 'government', 'https://holidayapi.com', 'api-key-header', ['apiKey'], '/v1/holidays', 'key'),
  D('worldtimeapi', 'WorldTimeAPI', 'government', 'https://worldtimeapi.org', 'api-key-header', ['apiKey'], '/api/timezone/Etc/UTC', 'Authorization'),
  D('nhtsa', 'NHTSA', 'government', 'https://vpic.nhtsa.dot.gov', 'api-key-header', ['apiKey'], '/api/vehicles/DecodeVin/5UXWX7C5*BA', 'Authorization'),
  D('usps', 'USPS', 'government', 'https://api.usps.com', 'oauth-code', ['clientId', 'clientSecret'], '/v3/health'),
  D('data-gov', 'Data.gov', 'government', 'https://api.data.gov', 'api-key-header', ['apiKey'], '/health', 'X-Api-Key'),
  D('aladhan', 'AlAdhan Prayer Times', 'government', 'https://api.aladhan.com', 'api-key-header', ['apiKey'], '/v1/timingsByCity', 'Authorization'),

  // Real estate.
  D('mlsgrid', 'MLS Grid', 'realestate', 'https://api.mlsgrid.com', 'bearer', ['accessToken'], '/v2/health', undefined, ['refreshToken']),
  D('appfolio', 'AppFolio', 'realestate', 'https://appfolio.com', 'api-key-header', ['apiKey'], '/api/v1/health', 'Authorization'),
  D('buildium', 'Buildium', 'realestate', 'https://api.buildium.com', 'api-key-header', ['clientId', 'secretKey'], '/v1/health', 'x-buildium-client-id'),
  D('rentmanager', 'Rent Manager', 'realestate', 'https://api.rentmanager.com', 'bearer', ['accessToken'], '/v1/health'),
  D('yardi', 'Yardi', 'realestate', 'https://www.yardi.com', 'api-key-header', ['apiKey'], '/health', 'Authorization'),
  D('zillow', 'Zillow', 'realestate', 'https://api.bridgedataoutput.com', 'api-key-header', ['apiKey'], '/health', 'Authorization'),
  D('realtor', 'Realtor (RapidAPI)', 'realestate', 'https://realty-mole-property.p.rapidapi.com', 'api-key-header', ['apiKey'], '/health', 'x-rapidapi-key'),
  D('airbnb', 'Airbnb', 'realestate', 'https://api.airbnb.com', 'api-key-header', ['apiKey'], '/v2/health', 'Authorization'),

  // Everyday utilities.
  D('ip-api', 'IP-API', 'search', 'https://ip-api.com', 'api-key-header', ['apiKey'], '/health', 'Authorization'),
  D('abstract-api', 'Abstract API', 'search', 'https://www.abstractapi.com', 'api-key-header', ['apiKey'], '/v1/health', 'api_key'),
  D('micro-verify', 'IPQualityScore', 'security', 'https://ipqualityscore.com', 'api-key-header', ['apiKey'], '/health', 'Authorization'),
  D('public-holidays', 'Calendarific', 'government', 'https://calendarific.com', 'api-key-header', ['apiKey'], '/api/v2/holidays', 'api_key'),
];
