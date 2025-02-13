// Initialize the map
const map = L.map('map').setView([51.505, -0.09], 13);

// Add OpenStreetMap tiles:
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let routeLayer;
let weatherMarkers = [];

/* Global array for weather tasks */
let weatherTasks = [];

/* Helper: Calculate distance between two coordinates using the Haversine formula (in km) */
function getDistance(coord1, coord2) {
  const R = 6371; // Earth's radius in km
  const lat1 = coord1[0], lon1 = coord1[1];
  const lat2 = coord2[0], lon2 = coord2[1];
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

/* Convert degrees to a cardinal direction */
function degToCardinal(deg) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}

/* Interpolate a coordinate along the route given a fraction (0 to 1) */
function interpolateCoordinates(coordinates, fraction) {
  const totalPoints = coordinates.length;
  if (fraction <= 0) return coordinates[0];
  if (fraction >= 1) return coordinates[totalPoints - 1];
  const index = (totalPoints - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const ratio = index - lower;
  const lat = coordinates[lower][0] + (coordinates[upper][0] - coordinates[lower][0]) * ratio;
  const lon = coordinates[lower][1] + (coordinates[upper][1] - coordinates[lower][1]) * ratio;
  return [lat, lon];
}

/* Parse the GPX file using DOMParser */
function extractCoordinatesFromGPX(gpxData) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxData, "application/xml");
    const trkpts = xmlDoc.getElementsByTagName("trkpt");
    const coords = [];
    for (let i = 0; i < trkpts.length; i++) {
      const lat = parseFloat(trkpts[i].getAttribute("lat"));
      const lon = parseFloat(trkpts[i].getAttribute("lon"));
      coords.push([lat, lon]);
    }
    return coords;
  } catch (e) {
    displayError("Error parsing GPX file.");
    return [];
  }
}

/* Display an error message */
function displayError(message) {
  document.getElementById("errorContainer").innerText = message;
}

/* Clear error messages */
function clearError() {
  document.getElementById("errorContainer").innerText = "";
}

/* Fetch detailed weather data from OpenWeatherMap forecast API for given lat, lon, and forecast time */
async function fetchWeatherAtTime(lat, lon, forecastTime) {
  const apiKey = "c8dbb11f02b05e11db446c2a69992c0d"; // <-- Replace with your actual API key
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Weather API error");
    const data = await response.json();
    const forecastList = data.list;
    let closest = forecastList[0];
    let minDiff = Math.abs(new Date(closest.dt_txt).getTime() - forecastTime.getTime());
    for (let forecast of forecastList) {
      const forecastTimeItem = new Date(forecast.dt_txt);
      const diff = Math.abs(forecastTimeItem.getTime() - forecastTime.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closest = forecast;
      }
    }
    return {
      temp: closest.main.temp,
      humidity: closest.main.humidity,
      windSpeed: closest.wind.speed,
      windDeg: closest.wind.deg,
      condition: closest.weather[0].main,
      description: closest.weather[0].description
    };
  } catch (e) {
    console.error(e);
    return null;
  }
}

/* Format detailed weather data for markers and timeline */
function formatDetailedWeatherData(weatherData) {
  if (!weatherData) return "N/A";
  const windDir = degToCardinal(weatherData.windDeg);
  return `<strong>${weatherData.temp}°C</strong><br>
Humidity: ${weatherData.humidity}%<br>
Wind: ${weatherData.windSpeed} m/s (${windDir})<br>
${weatherData.condition} (${weatherData.description})`;
}

/* Prepare weather tasks based on the route */
function prepareWeatherTasks(coordinates, avgSpeed, weatherInterval, startTime) {
  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    totalDistance += getDistance(coordinates[i - 1], coordinates[i]);
  }
  const intervals = Math.floor(totalDistance / weatherInterval);
  const tasks = [];
  for (let i = 0; i <= intervals; i++) {
    const currentDistance = i * weatherInterval;
    const timeOffsetHours = currentDistance / avgSpeed;
    const forecastTime = new Date(startTime.getTime() + timeOffsetHours * 3600 * 1000);
    const fraction = currentDistance / totalDistance;
    const latlng = interpolateCoordinates(coordinates, fraction);
    tasks.push({
      lat: latlng[0],
      lon: latlng[1],
      forecastTime: forecastTime
    });
  }
  return tasks;
}

/* Load all weather tasks at once and show detailed data including wind direction */
async function loadAllWeatherTasks() {
  const timeline = document.getElementById("weatherTimeline");
  timeline.innerHTML = "";
  for (let task of weatherTasks) {
    const weatherData = await fetchWeatherAtTime(task.lat, task.lon, task.forecastTime);
    const detailedStr = formatDetailedWeatherData(weatherData);
    
    // Add marker with popup showing detailed weather info
    const marker = L.marker([task.lat, task.lon]).addTo(map)
      .bindPopup(`${detailedStr}<br>${task.forecastTime.toLocaleString()}`);
    weatherMarkers.push(marker);
    
    // Add entry to timeline showing detailed weather info
    const entry = document.createElement("div");
    entry.classList.add("entry");
    entry.innerHTML = `${detailedStr}<br><small>${task.forecastTime.toLocaleTimeString()}</small>`;
    timeline.appendChild(entry);
  }
}

/* Prepare and load weather tasks for the route */
async function fetchWeatherForRoute(coordinates) {
  // Clear existing markers and timeline entries
  weatherMarkers.forEach(marker => map.removeLayer(marker));
  weatherMarkers = [];
  document.getElementById("weatherTimeline").innerHTML = "";
  clearError();

  const avgSpeed = parseFloat(document.getElementById("avgSpeed").value); // km/h
  const weatherInterval = parseFloat(document.getElementById("weatherInterval").value); // km
  const startTimeInput = document.getElementById("startTime").value;
  if (!startTimeInput) {
    displayError("Please enter a valid start time.");
    return;
  }
  const startTime = new Date(startTimeInput);
  if (isNaN(startTime.getTime())) {
    displayError("Invalid start time.");
    return;
  }

  // Prepare tasks for each interval along the route
  weatherTasks = prepareWeatherTasks(coordinates, avgSpeed, weatherInterval, startTime);
  // Load all tasks at once
  await loadAllWeatherTasks();
}

/* Handle GPX file upload */
document.getElementById("gpxUpload").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = async function(event) {
      document.getElementById("loading").style.display = "block";
      clearError();
      
      const gpxData = event.target.result;
      const coordinates = extractCoordinatesFromGPX(gpxData);
      if (coordinates.length === 0) {
        displayError("No valid coordinates found in GPX file.");
        document.getElementById("loading").style.display = "none";
        return;
      }
      if (routeLayer) map.removeLayer(routeLayer);
      routeLayer = L.polyline(coordinates, { color: "blue" }).addTo(map);
      map.fitBounds(routeLayer.getBounds());

      await fetchWeatherForRoute(coordinates);
      document.getElementById("loading").style.display = "none";
    };
    reader.readAsText(file);
  }
});
