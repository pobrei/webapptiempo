# RideWeather Planner

RideWeather Planner is an interactive web application that lets you plan your rides and check detailed weather forecasts along your route.

## Features

- **Route Controls:** Set a start time, weather interval (km), and average speed before uploading your route.
- **GPX Upload:** Upload a GPX file to display your route on an interactive map.
- **Dynamic Forecast:** Weather forecast markers and arrows are displayed on the map based on your route and start time.
- **Responsive Charts:** Detailed charts (temperature, precipitation, wind speed, humidity, pressure, and elevation/temperature) for easy data visualization.
- **Forecast Saving:** Save the forecast data as a PDF.
- **Dark Mode:** Toggle between light and dark themes for a customized viewing experience.
- **Interactive Timeline:** Clickable timeline entries to center the map and show forecast details.

## Setup

1. Clone the repository.
2. In `js/config.js`, replace the placeholder API key with your OpenWeather API key.
3. Open `index.html` in your browser or publish the project on GitHub Pages.

## Dependencies

- [Leaflet](https://leafletjs.com/) for map rendering.
- [Chart.js](https://www.chartjs.org/) for charts.
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation.

## Project Structure

