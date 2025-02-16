(function() {
    "use strict";
  
    // --- Configuration ---
    // In a production environment, the API key should be secured on a backend.
    const CONFIG = {
      API_KEY: "c8dbb11f02b05e11db446c2a69992c0d" // Replace or secure as needed
    };
  
    // --- Initialize Map ---
    const map = L.map('map').setView([41.3851, 2.1734], 13); // Centered on Barcelona
  
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  
    let routeLayer;
    let weatherMarkers = [];
    let timelineEntries = []; // store timeline entry elements for linking
    let weatherTasks = [];
  
    // Simple in-memory cache for weather data
    const weatherCache = new Map();
  
    // --- Utility Functions ---
    function toRad(deg) {
      return deg * Math.PI / 180;
    }
  
    function getDistance(coord1, coord2) {
      const R = 6371; // km
      const [lat1, lon1] = coord1;
      const [lat2, lon2] = coord2;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }
  
    function degToCardinal(deg) {
      const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const index = Math.round(deg / 45) % 8;
      return directions[index];
    }
  
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
        showToast("Error parsing GPX file.", "error");
        return [];
      }
    }
  
    // --- Toast Notification ---
    function showToast(message, type = "info") {
      const container = document.getElementById("toastContainer");
      const toast = document.createElement("div");
      toast.className = `toast ${type}`;
      toast.innerText = message;
      container.appendChild(toast);
      setTimeout(() => {
        toast.classList.add("hide");
        setTimeout(() => container.removeChild(toast), 500);
      }, 3000);
    }
  
    // --- Weather API Fetch with Caching ---
    async function fetchWeatherAtTime(lat, lon, forecastTime) {
      const cacheKey = `${lat},${lon},${forecastTime.getTime()}`;
      if (weatherCache.has(cacheKey)) {
        return weatherCache.get(cacheKey);
      }
      const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${CONFIG.API_KEY}&units=metric`;
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
        const weatherData = {
          temp: closest.main.temp,
          feels_like: closest.main.feels_like || closest.main.temp,
          humidity: closest.main.humidity,
          windSpeed: closest.wind.speed,
          windDeg: closest.wind.deg,
          condition: closest.weather[0].main,
          description: closest.weather[0].description,
          rain: closest.rain ? closest.rain["3h"] : 0
        };
        weatherCache.set(cacheKey, weatherData);
        return weatherData;
      } catch (e) {
        console.error(e);
        showToast("Failed to fetch weather data.", "error");
        return null;
      }
    }
  
    function formatDetailedWeatherData(weatherData) {
      if (!weatherData) return "N/A";
      const windDir = degToCardinal(weatherData.windDeg);
      return `<strong>${weatherData.temp}°C</strong> (Feels like: ${weatherData.feels_like}°C)<br>
  Humidity: ${weatherData.humidity}%<br>
  Wind: ${weatherData.windSpeed} m/s (${windDir})<br>
  Rain: ${weatherData.rain} mm<br>
  ${weatherData.condition} (${weatherData.description})`;
    }
  
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
  
    async function loadAllWeatherTasks() {
      const timeline = document.getElementById("weatherTimeline");
      timeline.innerHTML = "";
      timelineEntries = [];
      let tempData = [];
      let precipData = [];
      for (let i = 0; i < weatherTasks.length; i++) {
        const task = weatherTasks[i];
        const weatherData = await fetchWeatherAtTime(task.lat, task.lon, task.forecastTime);
        const detailedStr = formatDetailedWeatherData(weatherData);
        // Create marker with popup
        const marker = L.marker([task.lat, task.lon]).addTo(map)
          .bindPopup(`${detailedStr}<br>${task.forecastTime.toLocaleString()}`);
        marker.on("click", function() {
          timelineEntries[i].classList.add("active");
          timelineEntries[i].scrollIntoView({ behavior: "smooth", block: "center" });
        });
        weatherMarkers.push(marker);
        // Create timeline entry
        const entry = document.createElement("div");
        entry.classList.add("entry");
        entry.innerHTML = `${detailedStr}<br><small>${task.forecastTime.toLocaleTimeString()}</small>`;
        entry.addEventListener("click", function() {
          map.setView([task.lat, task.lon], 13);
          marker.openPopup();
        });
        timeline.appendChild(entry);
        timelineEntries.push(entry);
        // Collect chart data
        tempData.push({ distance: task.distance, temp: weatherData ? weatherData.temp : null });
        precipData.push({ time: task.forecastTime, rain: weatherData ? weatherData.rain : 0 });
      }
      renderTempChart(tempData);
      renderPrecipChart(precipData);
      renderRouteSilhouette();
    }
  
    async function fetchWeatherForRoute(coordinates) {
      weatherMarkers.forEach(marker => map.removeLayer(marker));
      weatherMarkers = [];
      document.getElementById("weatherTimeline").innerHTML = "";
      const avgSpeed = parseFloat(document.getElementById("avgSpeed").value);
      const weatherInterval = parseFloat(document.getElementById("weatherInterval").value);
      const startTimeInput = document.getElementById("startTime").value;
      if (!startTimeInput) {
        showToast("Please enter a valid start time.", "error");
        return;
      }
      const startTime = new Date(startTimeInput);
      if (isNaN(startTime.getTime())) {
        showToast("Invalid start time.", "error");
        return;
      }
      weatherTasks = prepareWeatherTasks(coordinates, avgSpeed, weatherInterval, startTime);
      await loadAllWeatherTasks();
    }
  
    // --- Chart Rendering ---
    function renderTempChart(data) {
      const ctx = document.getElementById("tempChart").getContext("2d");
      const distances = data.map(d => d.distance.toFixed(1));
      const temps = data.map(d => d.temp);
      new Chart(ctx, {
        type: "line",
        data: {
          labels: distances,
          datasets: [{
            label: "Temperature (°C)",
            data: temps,
            borderColor: "rgba(255,99,132,1)",
            backgroundColor: "rgba(255,99,132,0.2)",
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
            x: { title: { display: true, text: "Distance (km)" } },
            y: { title: { display: true, text: "Temperature (°C)" } }
          }
        }
      });
    }
  
    function renderPrecipChart(data) {
      const ctx = document.getElementById("precipChart").getContext("2d");
      const times = data.map(d => d.time.toLocaleTimeString());
      const rains = data.map(d => d.rain);
      new Chart(ctx, {
        type: "line",
        data: {
          labels: times,
          datasets: [{
            label: "Rain Precipitation (mm)",
            data: rains,
            borderColor: "rgba(54, 162, 235, 1)",
            backgroundColor: "rgba(54, 162, 235, 0.2)",
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
            x: { title: { display: true, text: "Time" } },
            y: { title: { display: true, text: "Rain (mm)" } }
          }
        }
      });
    }
  
    function renderRouteSilhouette() {
      if (!routeLayer) return;
      const canvas = document.getElementById("routeCanvas");
      const ctx = canvas.getContext("2d");
      canvas.width = canvas.offsetWidth;
      canvas.height = 200;
      const coords = routeLayer.getLatLngs();
      if (!coords.length) return;
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
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Draw wind arrows every 5 km
      weatherTasks.forEach(task => {
        if (task.distance % 5 < 0.1) {
          const pos = mapToCanvas(task.lat, task.lon);
          const windDeg = 0; // Replace with actual windDeg if available
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.rotate((windDeg - 90) * Math.PI / 180);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(10, 0);
          ctx.lineTo(7, -3);
          ctx.moveTo(10, 0);
          ctx.lineTo(7, 3);
          ctx.strokeStyle = "red";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      });
    }
  
    // --- Event Listeners ---
    document.getElementById("centerRouteBtn").addEventListener("click", function() {
      if (routeLayer) {
        map.fitBounds(routeLayer.getBounds());
      }
    });
  
    document.getElementById("saveGraphicsBtn").addEventListener("click", function() {
      const chartsContainer = document.querySelector('.charts-container');
      html2canvas(chartsContainer, { backgroundColor: "#fff" }).then(canvas => {
        const link = document.createElement("a");
        link.download = "graphics.png";
        link.href = canvas.toDataURL();
        link.click();
      });
    });
  
    document.getElementById("gpxUpload").addEventListener("change", function(e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async function(event) {
          document.getElementById("loading").style.display = "block";
          const gpxData = event.target.result;
          const coordinates = extractCoordinatesFromGPX(gpxData);
          if (!coordinates.length) {
            showToast("No valid coordinates found in GPX file.", "error");
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
  })();
  