# RideWeather Planner

RideWeather Planner is an interactive web application that lets you plan your rides while checking detailed weather forecasts along your route.

## Features
- **Route Controls:** Set a start time, weather interval (km), and average speed before uploading your route.
- **GPX Upload:** Upload a GPX file to display your route.
- **Dynamic Forecast:** Based on your route and start time, weather forecast markers and arrows are displayed on the map.
- **Responsive Charts:** View detailed charts (temperature, precipitation, wind speed, humidity, pressure, and elevation/temperature) that adjust for mobile devices.
- **Forecast Saving:** Save the forecast data as a nicely formatted PDF.
- **Update on Parameter Change:** Changing the start time (or re-uploading a new GPX file) clears the previous data and updates the forecast.

## Setup
1. Clone the repository.
2. In `config.js`, replace the placeholder API key with your OpenWeather API key.
3. Open `index.html` in your browser to run the application.

## Dependencies
- [Leaflet](https://leafletjs.com/) for map rendering.
- [Chart.js](https://www.chartjs.org/) for charts.
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation.
