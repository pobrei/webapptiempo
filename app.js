// Initialize the map with initial view set to Barcelona
const map = L.map('map').setView([41.3851, 2.1734], 13);

// Add OpenStreetMap tiles:
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let routeLayer;
let weatherMarkers = [];
let timelineEntries = []; // store timeline entry elements for linking

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

/* Fetch detailed weather data from OpenWeatherMap forecast API */
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
      feels_like: closest.main.feels_like || closest.main.temp,
      humidity: closest.main.humidity,
      windSpeed: closest.wind.speed,
      windDeg: closest.wind.deg,
      condition: closest.weather[0].main,
      description: closest.weather[0].description,
      rain: closest.rain ? closest.rain["3h"] : 0
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
  return `<strong>${weatherData.temp}°C</strong> (Feels like: ${weatherData.feels_like}°C)<br>
Humidity: ${weatherData.humidity}%<br>
Wind: ${weatherData.windSpeed} m/s (${windDir})<br>
Rain: ${weatherData.rain} mm<br>
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
      forecastTime: forecastTime,
      distance: currentDistance
    });
  }
  return tasks;
}

/* Load all weather tasks and build timeline & markers */
async function loadAllWeatherTasks() {
  const timeline = document.getElementById("weatherTimeline");
  timeline.innerHTML = "";
  timelineEntries = [];
  let tempData = [];
  let precipData = [];
  for (let i = 0; i < weatherTasks.length; i++) {
    let task = weatherTasks[i];
    const weatherData = await fetchWeatherAtTime(task.lat, task.lon, task.forecastTime);
    const detailedStr = formatDetailedWeatherData(weatherData);
    // Create marker with popup
    const marker = L.marker([task.lat, task.lon]).addTo(map)
      .bindPopup(`${detailedStr}<br>${task.forecastTime.toLocaleString()}`);
    marker.on('click', function() {
      timelineEntries[i].classList.add('active');
      timelineEntries[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    weatherMarkers.push(marker);
    // Create timeline entry
    const entry = document.createElement("div");
    entry.classList.add("entry");
    entry.innerHTML = `${detailedStr}<br><small>${task.forecastTime.toLocaleTimeString()}</small>`;
    entry.addEventListener('click', function() {
      map.setView([task.lat, task.lon], 13);
      marker.openPopup();
    });
    timeline.appendChild(entry);
    timelineEntries.push(entry);
    // Collect chart data
    tempData.push({ distance: task.distance, temp: weatherData ? weatherData.temp : null });
    precipData.push({ time: task.forecastTime, rain: weatherData ? weatherData.rain : 0 });
  }
  // Render charts and route silhouette after tasks are loaded
  renderTempChart(tempData);
  renderPrecipChart(precipData);
  renderRouteSilhouette();
}

/* Prepare and load weather tasks for the route */
async function fetchWeatherForRoute(coordinates) {
  weatherMarkers.forEach(marker => map.removeLayer(marker));
  weatherMarkers = [];
  document.getElementById("weatherTimeline").innerHTML = "";
  clearError();
  const avgSpeed = parseFloat(document.getElementById("avgSpeed").value);
  const weatherInterval = parseFloat(document.getElementById("weatherInterval").value);
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
  weatherTasks = prepareWeatherTasks(coordinates, avgSpeed, weatherInterval, startTime);
  await loadAllWeatherTasks();
}

/* Render Temperature vs Distance Chart using Chart.js */
function renderTempChart(data) {
  const ctx = document.getElementById('tempChart').getContext('2d');
  const distances = data.map(d => d.distance.toFixed(1));
  const temps = data.map(d => d.temp);
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: distances,
      datasets: [{
        label: 'Temperature (°C)',
        data: temps,
        borderColor: 'rgba(255,99,132,1)',
        backgroundColor: 'rgba(255,99,132,0.2)',
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      onClick: (evt, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          map.setView([weatherTasks[index].lat, weatherTasks[index].lon], 13);
          weatherMarkers[index].openPopup();
        }
      },
      scales: {
        x: { title: { display: true, text: 'Distance (km)' } },
        y: { title: { display: true, text: 'Temperature (°C)' } }
      }
    }
  });
}

/* Render Precipitation vs Time Chart using Chart.js */
function renderPrecipChart(data) {
  const ctx = document.getElementById('precipChart').getContext('2d');
  const times = data.map(d => d.time.toLocaleTimeString());
  const rains = data.map(d => d.rain);
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: times,
      datasets: [{
        label: 'Rain Precipitation (mm)',
        data: rains,
        borderColor: 'rgba(54, 162, 235, 1)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      onClick: (evt, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          map.setView([weatherTasks[index].lat, weatherTasks[index].lon], 13);
          weatherMarkers[index].openPopup();
        }
      },
      scales: {
        x: { title: { display: true, text: 'Time' } },
        y: { title: { display: true, text: 'Rain (mm)' } }
      }
    }
  });
}

/* Render Route Silhouette with Wind Direction on a Canvas */
function renderRouteSilhouette() {
  if (!routeLayer) return;
  const canvas = document.getElementById('routeCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = 200;
  const coords = routeLayer.getLatLngs();
  if (coords.length === 0) return;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  coords.forEach(pt => {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  });
  const pad = 20;
  const drawableWidth = canvas.width - 2 * pad;
  const drawableHeight = canvas.height - 2 * pad;
  function mapToCanvas(lat, lng) {
    const x = ((lng - minLng) / (maxLng - minLng)) * drawableWidth + pad;
    const y = drawableHeight - ((lat - minLat) / (maxLat - minLat)) * drawableHeight + pad;
    return { x, y };
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  const start = mapToCanvas(coords[0].lat, coords[0].lng);
  ctx.moveTo(start.x, start.y);
  coords.forEach(pt => {
    const p = mapToCanvas(pt.lat, pt.lng);
    ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Draw wind arrows every 5 km (approximate using weatherTasks)
  weatherTasks.forEach((task, index) => {
    if (task.distance % 5 < 0.1) {
      const pos = mapToCanvas(task.lat, task.lon);
      // For demonstration, we use a dummy wind direction (0°). In practice, store/use the task’s windDeg.
      const windDeg = 0;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate((windDeg - 90) * Math.PI / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10, 0);
      ctx.lineTo(7, -3);
      ctx.moveTo(10, 0);
      ctx.lineTo(7, 3);
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  });
}

/* Button to center the route on the map */
document.getElementById("centerRouteBtn").addEventListener("click", function() {
  if (routeLayer) {
    map.fitBounds(routeLayer.getBounds());
  }
});

/* Button to save all graphics as one image */
document.getElementById("saveGraphicsBtn").addEventListener("click", function() {
  const chartsContainer = document.querySelector('.charts-container');
  html2canvas(chartsContainer, { backgroundColor: "#fff" }).then(canvas => {
    const link = document.createElement('a');
    link.download = 'graphics.png';
    link.href = canvas.toDataURL();
    link.click();
  });
});

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
