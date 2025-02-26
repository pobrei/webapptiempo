# RideWeather Planner

RideWeather Planner is an interactive web application that lets you plan your rides while checking detailed weather forecasts along your route. This version supports:
- **Route Upload:** Upload GPX or FIT files.
- **Third‑Party Integrations:** Log in with your Strava, Komoot, or RideWithGPS account to import saved routes.
- **Weather Forecasts:** View forecasts including temperature, precipitation, wind, humidity, and pressure.
- **Interactive Visualizations:** Explore your route via an interactive map, charts, and a timeline.
- **Forecast Saving:** Save your forecast data as a nicely formatted PDF.

## Features
- **File Upload:** Drag & drop or select a GPX/FIT file to display your route.
- **Third‑Party Login:** Use OAuth to log in with Strava, Komoot, or RideWithGPS and import your saved routes.
- **Route Planning:** Detailed weather data is fetched via the OpenWeather API.
- **Visualization:** Interactive maps (Leaflet) and charts (Chart.js) display your route and weather timeline.
- **Marker Popups:** Clicking a point on any chart centers the map on that forecast point and opens its popup with weather details (including wind direction).
- **Save Forecast:** Download your forecast data as a nicely formatted PDF.

## Setup
1. Clone the repository.
2. In `config.js`, replace the placeholder API keys and OAuth configuration with your actual credentials.
3. Open `index.html` in your browser to run the application.

## Dependencies
- [Leaflet](https://leafletjs.com/) for map rendering.
- [Chart.js](https://www.chartjs.org/) for charts.
- [jsPDF](https://github.com/parallax/jsPDF) for generating the PDF (loaded via CDN).

## Security Notice
For production, move API keys and OAuth secrets to a secure backend.

## License
This project is open-source. See the LICENSE file for details.
