(() => {
  'use strict';

  // ----------------- Cache for Rotated Arrow Images -----------------
  const arrowCache = new Map();
  const createRotatedArrow = (degree) => {
    const roundedDegree = Math.round(degree);
    if (arrowCache.has(roundedDegree)) return arrowCache.get(roundedDegree);
    const width = 20, height = 30;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.translate(width / 2, height / 2);
    ctx.rotate(degree * Math.PI / 180);
    ctx.fillStyle = "#000000";
    const stickWidth = 2, stickHeight = 12;
    ctx.fillRect(-stickWidth / 2, -height / 2 + 2, stickWidth, stickHeight);
    ctx.beginPath();
    ctx.moveTo(0, -height / 2);
    ctx.lineTo(-width / 5, -height / 2 + 10);
    ctx.lineTo(width / 5, -height / 2 + 10);
    ctx.closePath();
    ctx.fill();
    arrowCache.set(roundedDegree, canvas);
    return canvas;
  };

  // ----------------- UI Helper Functions -----------------
  const showLoading = () => document.getElementById('loading').classList.add('active');
  const hideLoading = () => document.getElementById('loading').classList.remove('active');
  const showError = (message, type = 'error') => {
    const alerts = document.getElementById('alerts');
    const alert = document.createElement('div');
    alert.className = `alert-item ${type}`;
    alert.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${message}</span>`;
    alerts.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
  };

  // ----------------- Application State -----------------
  let routeLayer = null;
  let weatherMarkers = [];
  let weatherTasks = [];
  let elevationProfile = []; // For elevation chart
  const weatherCache = new Map();
  let tempChart, precipChart, windChart, humidityChart, pressureChart, elevationChart;
  let timelineEntries = []; // Timeline list entries
  const WEATHER_ICONS = {
    Clear: '☀️', Clouds: '☁️', Rain: '🌧️', Drizzle: '🌦️',
    Thunderstorm: '⛈️', Snow: '❄️', Mist: '🌫️', Smoke: '🌫️',
    Haze: '🌫️', Dust: '🌫️', Fog: '🌫️', Sand: '🌫️',
    Ash: '🌫️', Squall: '💨', Tornado: '🌪️'
  };

  // ----------------- Initialize Map -----------------
  const map = L.map('map').setView([41.3851, 2.1734], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  setTimeout(() => map.invalidateSize(), 100);

  // ----------------- Chart Options -----------------
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    plugins: {
      legend: { position: 'top' },
      tooltip: { mode: 'index', intersect: false }
    },
    hover: {
      mode: 'nearest',
      intersect: true,
      onHover: (event, chartElements) => {
        if (chartElements.length) {
          const index = chartElements[0].index;
          highlightTimelineEntry(index);
          panMapToPoint(index);
        } else {
          removeTimelineHighlights();
        }
      }
    },
    onClick: (e, activeElements) => {
      if (activeElements.length) {
        const index = activeElements[0].index;
        if (weatherTasks[index]?.position) {
          map.setView(weatherTasks[index].position, 13, { animate: true });
          if (weatherTasks[index].marker) weatherTasks[index].marker.openPopup();
        }
      }
    }
  };

  // ----------------- Utility Functions -----------------
  const calculateDistance = (coord1, coord2) => {
    const R = 6371e3;
    const φ1 = coord1[0] * Math.PI / 180;
    const φ2 = coord2[0] * Math.PI / 180;
    const Δφ = (coord2[0] - coord1[0]) * Math.PI / 180;
    const Δλ = (coord2[1] - coord1[1]) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const calculateTotalDistance = (coords) =>
    coords.slice(1).reduce((total, curr, i) => total + calculateDistance(coords[i], curr), 0);

  const interpolateCoordinate = (coords, fraction) => {
    const exactIndex = fraction * (coords.length - 1);
    const lower = Math.floor(exactIndex);
    const upper = Math.ceil(exactIndex);
    const ratio = exactIndex - lower;
    return [
      coords[lower][0] + (coords[upper][0] - coords[lower][0]) * ratio,
      coords[lower][1] + (coords[upper][1] - coords[lower][1]) * ratio
    ];
  };

  // Compute elevation profile from GPX points (if elevation exists)
  const computeElevationProfile = (points) => {
    const distances = [0];
    let cumulative = 0;
    for (let i = 1; i < points.length; i++) {
      const d = calculateDistance([points[i - 1].lat, points[i - 1].lon], [points[i].lat, points[i].lon]);
      cumulative += d;
      distances.push(cumulative);
    }
    return points.map((pt, i) => ({
      distance: (distances[i] / 1000).toFixed(1),
      elevation: pt.ele
    })).filter(pt => pt.elevation !== null);
  };

  const createPopupContent = (task) => {
    const weather = task.weather;
    const iconCode = weather?.weather[0]?.main || 'Unknown';
    const icon = WEATHER_ICONS[iconCode] || '❓';
    return `
      <div class="popup-content">
        <strong>${task.forecastTime.toLocaleTimeString()}</strong>
        <div class="weather-main">${icon} ${weather?.weather[0]?.description || 'No data'}</div>
        <div class="weather-details">
          <div>🌡️ Temp: ${weather ? Math.round(weather.temp) : 'N/A'}°C</div>
          <div>🤗 Feels Like: ${weather ? Math.round(weather.feels_like) : 'N/A'}°C</div>
          <div>💨 Wind: ${weather ? Math.round(weather.windSpeed) : 'N/A'} m/s</div>
          <div>🌧️ Rain: ${weather ? weather.rain.toFixed(1) : '0.0'} mm</div>
          <div>🔽 Pressure: ${weather ? weather.pressure : 'N/A'} hPa</div>
        </div>
      </div>
    `;
  };

  // ----------------- Clear Existing Data -----------------
  const clearExistingData = () => {
    if (routeLayer) map.removeLayer(routeLayer);
    clearMarkers();
    [tempChart, precipChart, windChart, humidityChart, pressureChart, elevationChart].forEach(chart => {
      if (chart) chart.destroy();
    });
    document.getElementById('alerts').innerHTML = '';
  };

  const clearMarkers = () => {
    weatherMarkers.forEach(marker => map.removeLayer(marker));
    weatherMarkers = [];
  };

  // ----------------- GPX and Route Functions -----------------
  const parseGPX = (gpxData) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxData, "text/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length > 0)
      throw new Error("Invalid GPX file format");
    const points = xmlDoc.getElementsByTagName("trkpt");
    if (points.length === 0) throw new Error("No track points found");
    return Array.from(points).map(pt => {
      const lat = parseFloat(pt.getAttribute("lat"));
      const lon = parseFloat(pt.getAttribute("lon"));
      let ele = null;
      const eleElem = pt.getElementsByTagName("ele")[0];
      if (eleElem) ele = parseFloat(eleElem.textContent);
      return { lat, lon, ele };
    });
  };

  const renderRoute = (coords) => {
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.polyline(coords, { color: "#2196F3" }).addTo(map);
    map.fitBounds(routeLayer.getBounds());
  };

  const prepareWeatherTasks = async (coords) => {
    const totalDistance = calculateTotalDistance(coords);
    const startTime = new Date(document.getElementById("startTime").value);
    if (isNaN(startTime.getTime())) throw new Error("Invalid start time");
    const intervalKm = parseInt(document.getElementById("weatherInterval").value) || 5;
    const interval = intervalKm * 1000;
    const speed = parseInt(document.getElementById("avgSpeed").value) || 20;
    if (totalDistance <= 0) throw new Error("Invalid route distance");
    const maxForecastTime = new Date(startTime.getTime() + 5 * 24 * 3600 * 1000);
    const tasks = Array.from({ length: Math.ceil(totalDistance / interval) }, (_, i) => {
      const distance = i * interval;
      const fraction = Math.min(distance / totalDistance, 1);
      const timeOffset = (distance / 1000 / speed) * 3600000;
      const forecastTime = new Date(startTime.getTime() + timeOffset);
      return { position: interpolateCoordinate(coords, fraction), distance, forecastTime };
    }).filter(task => task.forecastTime <= maxForecastTime);
    if (tasks.length === 0)
      throw new Error("No forecast times available within the 5-day limit. Adjust your route or parameters.");
    return tasks;
  };

  // ----------------- Weather API Functions -----------------
  const fetchWeatherData = async () => {
    const requests = weatherTasks.map(task =>
      fetchWeatherWithRetry(task.position[0], task.position[1], task.forecastTime)
    );
    const results = await Promise.allSettled(requests);
    results.forEach((result, index) => {
      weatherTasks[index].weather = result.status === 'fulfilled' ? result.value : null;
      if (!weatherTasks[index].weather)
        showError(`Failed to get weather for point ${index + 1}`, 'warning');
    });
  };

  const fetchWeatherWithRetry = async (lat, lon, time, retries = 2) => {
    try {
      return await cachedWeatherFetch(lat, lon, time);
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchWeatherWithRetry(lat, lon, time, retries - 1);
      }
      throw error;
    }
  };

  const cachedWeatherFetch = async (lat, lon, time) => {
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)},${time.getHours()}h`;
    if (weatherCache.has(cacheKey)) return weatherCache.get(cacheKey);
    try {
      const data = await fetchWeather(lat, lon, time);
      weatherCache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error("Weather fetch error:", error);
      return null;
    }
  };

  const fetchWeather = async (lat, lon, time) => {
    const now = new Date();
    if (time > new Date(now.getTime() + 5 * 24 * 3600 * 1000))
      throw new Error("Forecast time exceeds 5-day limit");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error ${response.status}: ${errorData.message}`);
      }
      const data = await response.json();
      const forecastStr = time.toISOString().replace("T", " ").substring(0, 19);
      let forecast = data.list.find(item => item.dt_txt === forecastStr);
      if (!forecast) {
        forecast = data.list.reduce((prev, curr) =>
          Math.abs(new Date(curr.dt * 1000) - time) < Math.abs(new Date(prev.dt * 1000) - time)
            ? curr : prev
        );
      }
      return {
        temp: forecast.main.temp,
        feels_like: forecast.main.feels_like,
        humidity: forecast.main.humidity,
        pressure: forecast.main.pressure,
        windSpeed: forecast.wind.speed,
        windDeg: forecast.wind.deg,
        weather: forecast.weather,
        rain: (forecast.rain && forecast.rain["3h"]) || 0
      };
    } catch (error) {
      console.error("Fetch error:", error);
      throw error;
    }
  };

  // ----------------- Visualization Functions -----------------
  const renderTemperatureChart = () => {
    const ctx = document.getElementById('tempChart').getContext('2d');
    tempChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weatherTasks.map(t => `${(t.distance / 1000).toFixed(1)} km`),
        datasets: [
          {
            label: "Temperature (°C)",
            data: weatherTasks.map(t => t.weather?.temp ?? null),
            borderColor: "#ff6384",
            tension: 0.4,
            fill: false
          },
          {
            label: "Feels Like (°C)",
            data: weatherTasks.map(t => t.weather?.feels_like ?? null),
            borderColor: "#ffa500",
            tension: 0.4,
            fill: false
          }
        ]
      },
      options: { ...chartOptions, scales: { y: { beginAtZero: false } } }
    });
  };

  const renderPrecipitationChart = () => {
    const ctx = document.getElementById('precipChart').getContext('2d');
    precipChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: weatherTasks.map(t => t.forecastTime.toLocaleTimeString()),
        datasets: [{
          label: "Precipitation (mm)",
          data: weatherTasks.map(t => t.weather?.rain ?? 0),
          backgroundColor: "#36a2eb"
        }]
      },
      options: chartOptions
    });
  };

  const renderWindChart = () => {
    const ctx = document.getElementById('windChart').getContext('2d');
    windChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weatherTasks.map(t => t.forecastTime.toLocaleTimeString()),
        datasets: [{
          label: "Wind Speed (m/s)",
          data: weatherTasks.map(t => t.weather?.windSpeed ?? null),
          borderColor: "#FF6600",
          tension: 0.4,
          fill: false,
          pointStyle: weatherTasks.map(t => {
            const canvas = createRotatedArrow(t.weather?.windDeg ?? 0);
            return canvas.toDataURL();
          })
        }]
      },
      options: { ...chartOptions, scales: { y: { beginAtZero: true } } }
    });
  };

  const renderHumidityChart = () => {
    const ctx = document.getElementById('humidityChart').getContext('2d');
    humidityChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weatherTasks.map(t => t.forecastTime.toLocaleTimeString()),
        datasets: [{
          label: "Humidity (%)",
          data: weatherTasks.map(t => t.weather?.humidity ?? null),
          borderColor: "#4CAF50",
          tension: 0.4,
          fill: false
        }]
      },
      options: { 
        ...chartOptions, 
        scales: { y: { beginAtZero: true, max: 100 } } 
      }
    });
  };

  const renderPressureChart = () => {
    const ctx = document.getElementById('pressureChart').getContext('2d');
    pressureChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weatherTasks.map(t => t.forecastTime.toLocaleTimeString()),
        datasets: [{
          label: "Pressure (hPa)",
          data: weatherTasks.map(t => t.weather?.pressure ?? null),
          borderColor: "#8e44ad",
          tension: 0.4,
          fill: false
        }]
      },
      options: { ...chartOptions, scales: { y: { beginAtZero: false } } }
    });
  };

  // Elevation chart with temperature overlay: two y-axes.
  const renderElevationChart = () => {
    if (!elevationProfile.length) return;
    const ctx = document.getElementById('elevationChart').getContext('2d');
    elevationChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: elevationProfile.map(pt => `${pt.distance} km`),
        datasets: [
          {
            label: "Elevation (m)",
            data: elevationProfile.map(pt => pt.elevation),
            borderColor: "#e67e22",
            tension: 0.4,
            fill: false,
            yAxisID: 'y'
          },
          {
            label: "Temperature (°C)",
            data: elevationProfile.map(pt => {
              const distanceMeters = parseFloat(pt.distance) * 1000;
              let closestTask = weatherTasks.reduce((prev, curr) =>
                Math.abs(curr.distance - distanceMeters) < Math.abs(prev.distance - distanceMeters)
                  ? curr : prev
              );
              return closestTask?.weather?.temp ?? null;
            }),
            borderColor: "#ff6384",
            tension: 0.4,
            fill: false,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: {
          legend: { position: 'top' },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: {
            title: { display: true, text: 'Distance (km)' }
          },
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Elevation (m)' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Temperature (°C)' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  };

  // ----------------- Timeline Functions -----------------
  const updateTimeline = () => {
    timelineEntries = [];
    const timelineContainer = document.getElementById('timeline');
    timelineContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    weatherTasks.forEach((task, index) => {
      const entry = document.createElement('div');
      entry.className = 'timeline-entry';
      entry.innerHTML = `
        <div class="timeline-time">${task.forecastTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="timeline-weather">
          ${WEATHER_ICONS[task.weather?.weather[0]?.main || 'Unknown'] || '❓'}
          <span>${task.weather?.weather[0]?.description || 'No data'}</span>
        </div>
        <div class="timeline-temp">${task.weather ? `${Math.round(task.weather.temp)}°C` : 'N/A'}</div>
      `;
      entry.addEventListener('click', () => {
        if (weatherTasks[index]?.position) {
          map.setView(weatherTasks[index].position, 13, { animate: true });
          if (weatherTasks[index].marker) weatherTasks[index].marker.openPopup();
        }
      });
      fragment.appendChild(entry);
      timelineEntries.push(entry);
    });
    timelineContainer.appendChild(fragment);
  };

  const removeTimelineHighlights = () => {
    timelineEntries.forEach(entry => entry.classList.remove('active'));
  };

  const highlightTimelineEntry = (index) => {
    removeTimelineHighlights();
    if (timelineEntries[index]) {
      timelineEntries[index].classList.add('active');
    }
  };

  // ----------------- Map Marker Rendering & Linking -----------------
  const renderMapMarkers = () => {
    weatherTasks.forEach((task, index) => {
      if (!task.weather) return;
      const marker = L.marker(task.position)
        .bindPopup(createPopupContent(task))
        .bindTooltip(`#${index + 1}: ${Math.round(task.weather.temp)}°C`)
        .addTo(map);
      marker.on("click", () => {
        map.setView(task.position, 13, { animate: true });
        if (timelineEntries[index]) {
          timelineEntries[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      task.marker = marker;
      weatherMarkers.push(marker);
      // Use L.icon for wind arrow markers so they align properly.
      const arrowCanvas = createRotatedArrow(task.weather.windDeg ?? 0);
      const arrowIcon = L.icon({
        iconUrl: arrowCanvas.toDataURL(),
        iconSize: [20, 30],
        iconAnchor: [10, 15],
        popupAnchor: [0, -15]
      });
      L.marker(task.position, { icon: arrowIcon, zIndexOffset: 1000 }).addTo(map);
    });
  };

  const panMapToPoint = (index) => {
    const task = weatherTasks[index];
    if (task && task.position) {
      map.panTo(task.position, { animate: true });
    }
  };

  const highlightMapMarker = (index) => {
    const task = weatherTasks[index];
    if (task && task.marker) {
      task.marker.openPopup();
    }
  };

  const resetMapMarker = (index) => {
    const task = weatherTasks[index];
    if (task && task.marker) {
      task.marker.closePopup();
    }
  };

  // ----------------- Center Map Button -----------------
  const centerMapOnRoute = () => {
    if (routeLayer) {
      map.fitBounds(routeLayer.getBounds(), { animate: true });
    }
  };

  // ----------------- Main Process Function -----------------
  const processGPX = async (gpxData) => {
    try {
      showLoading();
      clearExistingData();
      const points = parseGPX(gpxData);
      if (points.length < 2) throw new Error('GPX file needs at least 2 points');
      const coords = points.map(pt => [pt.lat, pt.lon]);
      elevationProfile = computeElevationProfile(points);
      renderRoute(coords);
      weatherTasks = await prepareWeatherTasks(coords);
      await fetchWeatherData();
      updateVisualizations();
    } catch (error) {
      console.error('Processing error:', error);
      showError(error.message, 'error');
    } finally {
      hideLoading();
    }
  };

  const updateVisualizations = () => {
    clearMarkers();
    renderMapMarkers();
    [tempChart, precipChart, windChart, humidityChart, pressureChart, elevationChart].forEach(chart => {
      if (chart) chart.destroy();
    });
    renderTemperatureChart();
    renderPrecipitationChart();
    renderWindChart();
    renderHumidityChart();
    renderPressureChart();
    renderElevationChart();
    updateTimeline();
  };

  // ----------------- Event Listeners -----------------
  document.getElementById('gpxUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => processGPX(e.target.result);
    reader.readAsText(file);
  });

  document.getElementById('centerRouteBtn').addEventListener('click', centerMapOnRoute);

  document.getElementById('saveGraphicsBtn').addEventListener('click', () => {
    html2canvas(document.querySelector("main")).then(canvas => {
      const link = document.createElement('a');
      link.download = 'weather-report.png';
      link.href = canvas.toDataURL();
      link.click();
    }).catch(err => {
      console.error("Error saving report:", err);
      showError("Failed to save report", 'error');
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('startTime').value = new Date().toISOString().slice(0, 16);
  });
})();
