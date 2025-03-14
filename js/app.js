(() => {
  'use strict';

  ///////////////////////////////////////////////
  // STAGE 2, PART 2: WEATHER ALERT THRESHOLDS
  ///////////////////////////////////////////////
  const THRESHOLDS = {
    windSpeed: 10, // m/s
    tempHigh: 35,  // °C
    tempLow: 0,    // °C
    rain: 5        // mm in 3h
  };

  ///////////////////////////////////////////////
  // Utility: Convert Degrees to Compass Direction
  ///////////////////////////////////////////////
  const convertDegreesToCompass = (deg) => {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  ///////////////////////////////////////////////
  // Create Custom SVG Icon (for wind direction)
  ///////////////////////////////////////////////
  const createSvgIcon = (degree) => {
    const svg = `<svg width="20" height="30" viewBox="0 0 20 30" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#ff6600;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#ffcc00;stop-opacity:1" />
        </linearGradient>
        <filter id="dropshadow" height="130%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
          <feOffset dx="2" dy="2" result="offsetblur"/>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#dropshadow)" transform="rotate(${degree}, 10, 15)">
        <line x1="10" y1="2" x2="10" y2="14" stroke="black" stroke-width="2"/>
        <polygon points="5,14 10,2 15,14" fill="url(#grad)"/>
      </g>
    </svg>`;
    return L.divIcon({
      html: svg,
      className: '',
      iconSize: [20, 30],
      iconAnchor: [10, 15],
      popupAnchor: [0, -15]
    });
  };

  ///////////////////////////////////////////////
  // UI Helper Functions
  ///////////////////////////////////////////////
  const showLoading = () => {
    const loadingElem = document.getElementById('loading');
    loadingElem.classList.add('active');
    gsap.fromTo(loadingElem, { opacity: 0 }, { opacity: 1, duration: 0.5 });
  };
  const hideLoading = () => {
    const loadingElem = document.getElementById('loading');
    gsap.to(loadingElem, { opacity: 0, duration: 0.5, onComplete: () => loadingElem.classList.remove('active') });
  };

  const showError = (message, type = 'error') => {
    console.error(message);
    const alerts = document.getElementById('alerts');
    const alertItem = document.createElement('div');
    let icon = '';
    if (type === 'warning') {
      icon = '⚠️ ';
    } else if (type === 'error') {
      icon = '❗ ';
    }
    alertItem.className = `alert-item ${type}`;
    alertItem.innerHTML = `<span>${icon}${message}</span>`;
    alerts.appendChild(alertItem);
    gsap.fromTo(alertItem, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    setTimeout(() => {
      gsap.to(alertItem, { opacity: 0, duration: 0.5, onComplete: () => alertItem.remove() });
    }, 5000);
  };

  const showSuccess = (message) => {
    console.log(message);
    const alerts = document.getElementById('alerts');
    const alertItem = document.createElement('div');
    alertItem.className = `alert-item success`;
    alertItem.innerHTML = `<span>✅ ${message}</span>`;
    alerts.appendChild(alertItem);
    gsap.fromTo(alertItem, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    setTimeout(() => {
      gsap.to(alertItem, { opacity: 0, duration: 0.5, onComplete: () => alertItem.remove() });
    }, 5000);
  };

  ///////////////////////////////////////////////
  // Global Application State
  ///////////////////////////////////////////////
  let routeLayer = null;
  let weatherMarkers = [];
  let arrowMarkers = [];
  let weatherTasks = [];
  let elevationProfile = [];
  const weatherCache = new Map();

  // Chart instances
  let tempChart, precipChart, windChart, humidityChart, pressureChart, elevationChart;
  let timelineEntries = [];
  let currentRoutePoints = null;
  let currentRouteCoords = null;

  // Icon mapping for main weather types
  const WEATHER_ICONS = {
    Clear: '☀️', Clouds: '☁️', Rain: '🌧️', Drizzle: '🌦️',
    Thunderstorm: '⛈️', Snow: '❄️', Mist: '🌫️', Smoke: '💨',
    Haze: '🌫️', Dust: '🌪️', Fog: '🌁', Sand: '🏜️',
    Ash: '🌋', Squall: '🌬️', Tornado: '🌪️'
  };

  ///////////////////////////////////////////////
  // Initialize Map
  ///////////////////////////////////////////////
  const map = L.map('map').setView([41.3851, 2.1734], 13);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri &mdash; Esri, DeLorme, NAVTEQ',
  }).addTo(map);

  document.getElementById('centerMap').addEventListener('click', () => {
    if (routeLayer) {
      map.fitBounds(routeLayer.getBounds());
    } else {
      map.setView([41.3851, 2.1734], 13);
    }
  });

  ///////////////////////////////////////////////
  // Dark Chart Options
  ///////////////////////////////////////////////
  const commonChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    minHeight: 300,
    layout: {
      padding: 20
    },
    animation: {
      duration: 1200,
      easing: 'easeInOutQuad'
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#fff',
          font: { size: 14, weight: 'bold' }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 16 },
        bodyFont: { size: 14 },
        cornerRadius: 4
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#aaa',
          font: { size: 12 }
        },
        grid: {
          color: 'rgba(255,255,255,0.1)'
        },
        title: {
          display: true,
          text: 'Distance (km)',
          color: '#fff',
          font: { size: 14 }
        }
      },
      y: {
        ticks: {
          color: '#aaa',
          font: { size: 12 }
        },
        grid: {
          color: 'rgba(255,255,255,0.1)'
        },
        title: {
          display: true,
          text: 'Value',
          color: '#fff',
          font: { size: 14 }
        }
      }
    },
    elements: {
      line: {
        borderWidth: 3,
        tension: 0.3
      },
      point: {
        radius: 3,
        hoverRadius: 6
      }
    }
  };

  ///////////////////////////////////////////////
  // Stage 2, Part 2: Check Alerts
  ///////////////////////////////////////////////
  function checkAlerts(task) {
    const alerts = [];
    if (!task.weather) return alerts;
    const { windSpeed, temp, rain } = task.weather;
    if (windSpeed > THRESHOLDS.windSpeed) alerts.push("High Wind");
    if (temp > THRESHOLDS.tempHigh) alerts.push("Extreme Heat");
    if (temp < THRESHOLDS.tempLow) alerts.push("Freezing Temperatures");
    if (rain > THRESHOLDS.rain) alerts.push("Heavy Rainfall");
    return alerts;
  }

  ///////////////////////////////////////////////
  // Timeline (GSAP Animations + Alerts)
  ///////////////////////////////////////////////
  let timelineContainer;
  const updateTimeline = () => {
    timelineEntries = [];
    timelineContainer = document.getElementById('timeline');
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
        <div class="timeline-temp">
          ${task.weather ? `${Math.round(task.weather.temp)}°C` : 'N/A'}
        </div>
      `;
      if (task.alerts && task.alerts.length > 0) {
        const alertsDiv = document.createElement('div');
        alertsDiv.className = 'timeline-alerts';
        alertsDiv.style.color = 'red';
        alertsDiv.style.fontWeight = 'bold';
        alertsDiv.textContent = `Alerts: ${task.alerts.join(', ')}`;
        entry.appendChild(alertsDiv);
      }
      entry.addEventListener('mouseover', () => {
        gsap.to(entry, { scale: 1.05, duration: 0.2 });
      });
      entry.addEventListener('mouseout', () => {
        gsap.to(entry, { scale: 1, duration: 0.2 });
      });
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
    if (timelineEntries[index]) timelineEntries[index].classList.add('active');
  };
  const panMapToPoint = (index) => {
    const task = weatherTasks[index];
    if (task && task.position) {
      map.panTo(task.position, { animate: true });
    }
  };

  ///////////////////////////////////////////////
  // Utility Functions
  ///////////////////////////////////////////////
  const calculateDistance = (coord1, coord2) => {
    const R = 6371e3; // Earth radius in meters
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

  ///////////////////////////////////////////////
  // Stage 2, Part 1: Elevation Gain/Loss
  ///////////////////////////////////////////////
  function calculateElevationGainLoss(elevationProfile) {
    let totalGain = 0, totalLoss = 0;
    for (let i = 1; i < elevationProfile.length; i++) {
      const diff = elevationProfile[i].elevation - elevationProfile[i - 1].elevation;
      if (diff > 0) totalGain += diff;
      else totalLoss += Math.abs(diff);
    }
    return { totalGain: Math.round(totalGain), totalLoss: Math.round(totalLoss) };
  }
  function computeElevationProfile(points) {
    const distances = [0];
    let cumulative = 0;
    for (let i = 1; i < points.length; i++) {
      const d = calculateDistance([points[i - 1].lat, points[i - 1].lon], [points[i].lat, points[i].lon]);
      cumulative += d;
      distances.push(cumulative);
    }
    return points.map((pt, i) => ({
      distance: (distances[i] / 1000).toFixed(1),
      elevation: pt.ele,
      coord: [pt.lat, pt.lon]
    })).filter(pt => pt.elevation !== null);
  }

  ///////////////////////////////////////////////
  // Create Popup Content (Includes Alerts)
  ///////////////////////////////////////////////
  function createPopupContent(task) {
    const weather = task.weather;
    const iconCode = weather?.weather[0]?.main || 'Unknown';
    const icon = WEATHER_ICONS[iconCode] || '❓';
    let windDir = "N/A";
    if (weather && typeof weather.windDeg === 'number') {
      windDir = convertDegreesToCompass(weather.windDeg);
    }
    let alertsHTML = '';
    if (task.alerts && task.alerts.length > 0) {
      alertsHTML = `
        <div class="alerts" style="color:red; font-weight:bold;">
          Alerts: ${task.alerts.join(', ')}
        </div>
      `;
    }
    return `
      <div class="popup-content">
        <strong>${task.forecastTime.toLocaleTimeString()}</strong>
        <div class="weather-main">${icon} ${weather?.weather[0]?.description || 'No data'}</div>
        <div class="weather-details">
          <div>Temp: ${weather ? Math.round(weather.temp) : 'N/A'}°C</div>
          <div>Feels Like: ${weather ? Math.round(weather.feels_like) : 'N/A'}°C</div>
          <div>Wind: ${weather ? Math.round(weather.windSpeed) : 'N/A'} m/s (${windDir})</div>
          <div>Rain: ${weather ? weather.rain.toFixed(1) : '0.0'} mm</div>
          <div>Pressure: ${weather ? weather.pressure : 'N/A'} hPa</div>
        </div>
        ${alertsHTML}
      </div>
    `;
  }

  ///////////////////////////////////////////////
  // Clear Existing Forecast Data
  ///////////////////////////////////////////////
  const clearForecastData = () => {
    clearMarkers();
    arrowMarkers.forEach(marker => map.removeLayer(marker));
    arrowMarkers = [];
    weatherTasks = [];
    [tempChart, precipChart, windChart, humidityChart, pressureChart, elevationChart]
      .forEach(chart => { if (chart) chart.destroy(); });
    document.getElementById('timeline').innerHTML = '';
    const statsDiv = document.getElementById('elevationStats');
    if (statsDiv) statsDiv.textContent = '';
  };
  const clearMarkers = () => {
    weatherMarkers.forEach(marker => map.removeLayer(marker));
    weatherMarkers = [];
  };

  ///////////////////////////////////////////////
  // GPX File Parsing
  ///////////////////////////////////////////////
  function parseGPX(gpxData) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxData, "text/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length > 0)
      throw new Error("Invalid GPX file format");
    const points = xmlDoc.getElementsByTagName("trkpt");
    if (points.length === 0) throw new Error("No track points found in GPX file");
    return Array.from(points).map(pt => {
      const lat = parseFloat(pt.getAttribute("lat"));
      const lon = parseFloat(pt.getAttribute("lon"));
      let ele = null;
      const eleElem = pt.getElementsByTagName("ele")[0];
      if (eleElem) ele = parseFloat(eleElem.textContent);
      return { lat, lon, ele };
    });
  }

  ///////////////////////////////////////////////
  // Render Route on Map with Animated Drawing
  ///////////////////////////////////////////////
  function renderRoute(coords) {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    routeLayer = L.polyline(coords, { color: "#2196F3", weight: 4 }).addTo(map);
    map.fitBounds(routeLayer.getBounds());
    

  }

  ///////////////////////////////////////////////
  // Prepare Weather Tasks
  ///////////////////////////////////////////////
  async function prepareWeatherTasks(coords) {
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
    if (tasks.length === 0) {
      throw new Error("No forecast times available within the 5-day limit. Adjust your route or parameters.");
    }
    return tasks;
  }

  ///////////////////////////////////////////////
  // Weather API Functions
  ///////////////////////////////////////////////
  async function fetchWeatherData() {
    const requests = weatherTasks.map(task =>
      fetchWeatherWithRetry(task.position[0], task.position[1], task.forecastTime)
    );
    const results = await Promise.allSettled(requests);
    results.forEach((result, index) => {
      weatherTasks[index].weather = (result.status === 'fulfilled') ? result.value : null;
      if (!weatherTasks[index].weather) {
        showError(`Failed to get weather for point ${index + 1}`, 'warning');
      }
      weatherTasks[index].alerts = checkAlerts(weatherTasks[index]);
    });
  }
  async function fetchWeatherWithRetry(lat, lon, time, retries = 2) {
    try {
      return await cachedWeatherFetch(lat, lon, time);
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchWeatherWithRetry(lat, lon, time, retries - 1);
      }
      throw error;
    }
  }
  async function cachedWeatherFetch(lat, lon, time) {
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
  }
  async function fetchWeather(lat, lon, time) {
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
  }

  ///////////////////////////////////////////////
  // Chart Click Handlers (using nearest mode)
  ///////////////////////////////////////////////
  function chartClickHandler(evt, activeElements, chart) {
    const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
    if (points.length) {
      const index = points[0].index;
      const task = weatherTasks[index];
      if (task && task.position) {
        map.setView(task.position, 13, { animate: true });
      }
    }
  }
  function elevationChartClickHandler(evt, activeElements) {
    const points = elevationChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
    if (points.length && currentRouteCoords && currentRouteCoords.length) {
      const index = points[0].index;
      if (elevationProfile[index] && elevationProfile[index].coord) {
        map.setView(elevationProfile[index].coord, 13, { animate: true });
      } else if (currentRouteCoords[index]) {
        map.setView(currentRouteCoords[index], 13, { animate: true });
      }
    }
  }

  ///////////////////////////////////////////////
  // Helper: Create Gradient Fill for Charts
  ///////////////////////////////////////////////
  function createGradient(ctx, colorStart, colorEnd) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, colorStart);
    gradient.addColorStop(1, colorEnd);
    return gradient;
  }

  ///////////////////////////////////////////////
  // Charts Rendering
  ///////////////////////////////////////////////

  // 1) Temperature Chart (Temperature & Feels Like)
  function renderTemperatureChart() {
    if (!weatherTasks.length) return;
    const ctx = document.getElementById('tempChart').getContext('2d');
    const tempGradient = createGradient(ctx, 'rgba(255,140,0,0.5)', 'rgba(255,140,0,0)');
    const feelsGradient = createGradient(ctx, 'rgba(255,99,132,0.5)', 'rgba(255,99,132,0)');
    const distanceLabels = weatherTasks.map(t => `${(t.distance / 1000).toFixed(1)} km`);
    const tempData = weatherTasks.map(t => t.weather?.temp ?? null);
    const feelsData = weatherTasks.map(t => t.weather?.feels_like ?? null);
    tempChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: distanceLabels,
        datasets: [
          {
            label: "Temperature (°C)",
            data: tempData,
            backgroundColor: tempGradient,
            borderColor: '#ff8c00',
            fill: true,
            tension: 0.3
          },
          {
            label: "Feels Like (°C)",
            data: feelsData,
            backgroundColor: feelsGradient,
            borderColor: '#ff6384',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        ...commonChartOptions,
        onClick: (evt, activeElements) => chartClickHandler(evt, activeElements, tempChart),
        plugins: {
          ...commonChartOptions.plugins,
          tooltip: {
            ...commonChartOptions.plugins.tooltip,
            callbacks: {
              label: (context) => {
                const dsLabel = context.dataset.label || '';
                const val = context.parsed.y;
                if (val === null) return `${dsLabel}: No Data`;
                return `${dsLabel}: ${val.toFixed(1)}`;
              }
            }
          }
        },
        scales: {
          ...commonChartOptions.scales,
          y: {
            ...commonChartOptions.scales.y,
            title: {
              ...commonChartOptions.scales.y.title,
              text: 'Temperature (°C)'
            }
          }
        }
      }
    });
  }

  // 2) Precipitation Chart
  function renderPrecipitationChart() {
    const ctx = document.getElementById('precipChart').getContext('2d');
    const precipGradient = createGradient(ctx, 'rgba(54,162,235,0.5)', 'rgba(54,162,235,0)');
    precipChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: weatherTasks.map(t => t.forecastTime.toLocaleTimeString()),
        datasets: [{
          label: "Precipitation (mm)",
          data: weatherTasks.map(t => t.weather?.rain ?? 0),
          backgroundColor: precipGradient
        }]
      },
      options: {
        ...commonChartOptions,
        onClick: (evt, activeElements) => chartClickHandler(evt, activeElements, precipChart),
        scales: {
          ...commonChartOptions.scales,
          y: {
            ...commonChartOptions.scales.y,
            title: {
              ...commonChartOptions.scales.y.title,
              text: 'Rain (mm)'
            }
          }
        }
      }
    });
  }

  // 3) Wind Chart
  function renderWindChart() {
    const ctx = document.getElementById('windChart').getContext('2d');
    const windGradient = createGradient(ctx, 'rgba(54,162,235,0.5)', 'rgba(54,162,235,0)');
    windChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weatherTasks.map(t => t.forecastTime.toLocaleTimeString()),
        datasets: [{
          label: "Wind (m/s)",
          data: weatherTasks.map(t => t.weather?.windSpeed ?? null),
          borderColor: "#36a2eb",
          backgroundColor: windGradient,
          fill: true,
          tension: 0.3,
          pointStyle: weatherTasks.map(t => {
            const adjustedWindDeg = ((t.weather.windDeg ?? 0) + 180) % 360;
            const icon = createSvgIcon(adjustedWindDeg);
            return icon.options.html;
          })
        }]
      },
      options: {
        ...commonChartOptions,
        onClick: (evt, activeElements) => chartClickHandler(evt, activeElements, windChart),
        scales: {
          ...commonChartOptions.scales,
          y: {
            ...commonChartOptions.scales.y,
            title: {
              ...commonChartOptions.scales.y.title,
              text: 'Wind (m/s)'
            }
          }
        }
      }
    });
  }

  // 4) Humidity Chart
  function renderHumidityChart() {
    const ctx = document.getElementById('humidityChart').getContext('2d');
    const humidityGradient = createGradient(ctx, 'rgba(76,175,80,0.5)', 'rgba(76,175,80,0)');
    humidityChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weatherTasks.map(t => t.forecastTime.toLocaleTimeString()),
        datasets: [{
          label: "Humidity (%)",
          data: weatherTasks.map(t => t.weather?.humidity ?? null),
          borderColor: "#4CAF50",
          backgroundColor: humidityGradient,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        ...commonChartOptions,
        onClick: (evt, activeElements) => chartClickHandler(evt, activeElements, humidityChart),
        scales: {
          ...commonChartOptions.scales,
          y: {
            ...commonChartOptions.scales.y,
            beginAtZero: true,
            max: 100,
            title: {
              ...commonChartOptions.scales.y.title,
              text: 'Humidity (%)'
            }
          }
        }
      }
    });
  }

  // 5) Pressure Chart
  function renderPressureChart() {
    const ctx = document.getElementById('pressureChart').getContext('2d');
    const pressureGradient = createGradient(ctx, 'rgba(142,68,173,0.5)', 'rgba(142,68,173,0)');
    pressureChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weatherTasks.map(t => t.forecastTime.toLocaleTimeString()),
        datasets: [{
          label: "Pressure (hPa)",
          data: weatherTasks.map(t => t.weather?.pressure ?? null),
          borderColor: "#8e44ad",
          backgroundColor: pressureGradient,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        ...commonChartOptions,
        onClick: (evt, activeElements) => chartClickHandler(evt, activeElements, pressureChart),
        scales: {
          ...commonChartOptions.scales,
          y: {
            ...commonChartOptions.scales.y,
            title: {
              ...commonChartOptions.scales.y.title,
              text: 'Pressure (hPa)'
            }
          }
        }
      }
    });
  }

  // 6) Elevation Chart
  function renderElevationChart() {
    if (!elevationProfile.length) return;
    const ctx = document.getElementById('elevationChart').getContext('2d');
    const elevationGradient = createGradient(ctx, 'rgba(243,156,18,0.5)', 'rgba(243,156,18,0)');
    elevationChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: elevationProfile.map(pt => `${pt.distance} km`),
        datasets: [{
          label: "Elevation (m)",
          data: elevationProfile.map(pt => pt.elevation),
          borderColor: "#f39c12",
          backgroundColor: elevationGradient,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        ...commonChartOptions,
        onClick: elevationChartClickHandler,
        scales: {
          ...commonChartOptions.scales,
          y: {
            ...commonChartOptions.scales.y,
            title: {
              ...commonChartOptions.scales.y.title,
              text: 'Elevation (m)'
            }
          }
        }
      }
    });
  }

  ///////////////////////////////////////////////
  // Enhanced PDF Export
  ///////////////////////////////////////////////
  const saveForecast = async () => {
    if (!weatherTasks.length) {
      showError("No forecast data available to save.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    doc.setFontSize(18);
    doc.text("Forecast Report", 10, 15);
    let y = 25;
    const totalDistance = (calculateTotalDistance(currentRouteCoords) / 1000).toFixed(1);
    doc.setFontSize(12);
    doc.text(`Total Distance: ${totalDistance} km`, 10, y);
    y += 6;
    if (elevationProfile && elevationProfile.length > 1) {
      const { totalGain, totalLoss } = calculateElevationGainLoss(elevationProfile);
      doc.text(`Total Elevation Gain: ${totalGain} m`, 10, y);
      y += 6;
      doc.text(`Total Elevation Loss: ${totalLoss} m`, 10, y);
      y += 6;
    }
    doc.text(`Weather Forecast for ${weatherTasks.length} points:`, 10, y);
    y += 10;
    weatherTasks.forEach((task, i) => {
      const time = task.forecastTime.toLocaleTimeString();
      const pos = `(${task.position[0].toFixed(4)}, ${task.position[1].toFixed(4)})`;
      const temp = task.weather ? `${Math.round(task.weather.temp)}°C` : "N/A";
      const wind = task.weather ? `${Math.round(task.weather.windSpeed)} m/s` : "N/A";
      const rain = task.weather ? `${task.weather.rain.toFixed(1)} mm` : "0.0 mm";
      const pressure = task.weather ? `${task.weather.pressure} hPa` : "N/A";
      doc.text(`${i+1}) ${time} | Pos: ${pos} | Temp: ${temp} | Wind: ${wind} | Rain: ${rain} | Pressure: ${pressure}`, 10, y);
      y += 6;
      if (task.alerts && task.alerts.length > 0) {
        doc.setTextColor(255, 0, 0);
        doc.text(`Alerts: ${task.alerts.join(', ')}`, 10, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
      }
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });
    const mapCanvas = document.querySelector("#map canvas");
    if (mapCanvas) {
      const mapImg = mapCanvas.toDataURL("image/png");
      doc.addPage();
      doc.setFontSize(16);
      doc.text("Route Map", 10, 20);
      doc.addImage(mapImg, "PNG", 10, 30, 180, 100);
    }
    const chartIds = ["tempChart", "precipChart", "windChart", "humidityChart", "pressureChart", "elevationChart"];
    for (const id of chartIds) {
      const chartCanvas = document.getElementById(id);
      if (chartCanvas) {
        const imgData = chartCanvas.toDataURL("image/png");
        doc.addPage();
        doc.setFontSize(16);
        doc.text(id.replace("Chart", "") + " Chart", 10, 20);
        doc.addImage(imgData, "PNG", 10, 30, 180, 100);
      }
    }
    doc.save("forecast.pdf");
  };
  document.getElementById('saveForecast').addEventListener('click', saveForecast);

  ///////////////////////////////////////////////
  // Update Forecast on Start Time Change
  ///////////////////////////////////////////////
  document.getElementById('startTime').addEventListener('change', async () => {
    if (currentRouteCoords) {
      await updateForecast();
    }
  });

  ///////////////////////////////////////////////
  // Main Forecast Update Function
  ///////////////////////////////////////////////
  const updateForecast = async () => {
    clearForecastData();
    try {
      weatherTasks = await prepareWeatherTasks(currentRouteCoords);
      await fetchWeatherData();
      renderMapMarkers();
      updateTimeline();
      renderTemperatureChart();
      renderPrecipitationChart();
      renderWindChart();
      renderHumidityChart();
      renderPressureChart();
      if (currentRoutePoints && currentRoutePoints[0].ele !== undefined) {
        elevationProfile = computeElevationProfile(currentRoutePoints);
        const { totalGain, totalLoss } = calculateElevationGainLoss(elevationProfile);
        const statsDiv = document.getElementById('elevationStats');
        if (statsDiv) {
          statsDiv.textContent = `Total Elevation Gain: ${totalGain} m | Total Elevation Loss: ${totalLoss} m`;
        }
        renderElevationChart();
      }
    } catch (error) {
      showError(error.message);
    }
  };

  ///////////////////////////////////////////////
  // Collapsible Controls with GSAP Animation
  ///////////////////////////////////////////////
  const toggleControlsBtn = document.getElementById('toggleControls');
  if (toggleControlsBtn) {
    toggleControlsBtn.addEventListener('click', () => {
      const controlsContainer = document.getElementById('controlsContainer');
      if (controlsContainer) {
        if (controlsContainer.classList.contains('collapsed')) {
          controlsContainer.classList.remove('collapsed');
          gsap.to(controlsContainer, { height: "auto", opacity: 1, duration: 0.5 });
        } else {
          gsap.to(controlsContainer, { height: 0, opacity: 0, duration: 0.5, onComplete: () => controlsContainer.classList.add('collapsed') });
        }
      }
      toggleControlsBtn.classList.toggle('open');
    });
  }

  ///////////////////////////////////////////////
  // File Upload Handling
  ///////////////////////////////////////////////
  document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearExistingData();
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files.length) {
      showError("Please select a file to upload.");
      return;
    }
    const file = fileInput.files[0];
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      showError("Only GPX files are supported at the moment.");
      return;
    }
    showLoading();
    try {
      const text = await file.text();
      const routePoints = parseGPX(text);
      const coords = routePoints.map(pt => [pt.lat, pt.lon]);
      currentRoutePoints = routePoints;
      currentRouteCoords = coords;
      renderRoute(coords);
      weatherTasks = await prepareWeatherTasks(coords);
      await fetchWeatherData();
      renderMapMarkers();
      updateTimeline();
      renderTemperatureChart();
      renderPrecipitationChart();
      renderWindChart();
      renderHumidityChart();
      renderPressureChart();
      if (routePoints[0].ele !== undefined) {
        elevationProfile = computeElevationProfile(routePoints);
        const { totalGain, totalLoss } = calculateElevationGainLoss(elevationProfile);
        const statsDiv = document.getElementById('elevationStats');
        if (statsDiv) {
          statsDiv.textContent = `Total Elevation Gain: ${totalGain} m | Total Elevation Loss: ${totalLoss} m`;
        }
        renderElevationChart();
      }
      showSuccess("GPX file uploaded and processed successfully!");
    } catch (error) {
      showError(error.message);
    } finally {
      hideLoading();
    }
  });

  ///////////////////////////////////////////////
  // Clear Existing Data
  ///////////////////////////////////////////////
  const clearExistingData = () => {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    clearForecastData();
  };

  ///////////////////////////////////////////////
  // Map Marker Rendering
  ///////////////////////////////////////////////
  const renderMapMarkers = () => {
    weatherTasks.forEach((task, index) => {
      if (!task.weather) return;
      const marker = L.marker(task.position)
        .bindPopup(createPopupContent(task))
        .bindTooltip(`#${index + 1}: ${Math.round(task.weather.temp)}°C`)
        .addTo(map);
      marker.on("click", () => {
        map.setView(task.position, 13, { animate: true });
        marker.openPopup();
      });
      task.marker = marker;
      weatherMarkers.push(marker);
      const adjustedWindDeg = ((task.weather.windDeg ?? 0) + 180) % 360;
      const arrowIcon = createSvgIcon(adjustedWindDeg);
      const arrowMarker = L.marker(task.position, { icon: arrowIcon, zIndexOffset: 1000 }).addTo(map);
      arrowMarkers.push(arrowMarker);
    });
  };

  ///////////////////////////////////////////////
  // Dashboard: Toggling Charts
  ///////////////////////////////////////////////
  document.querySelectorAll('.chart-toggle').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const chartId = e.target.dataset.chart;
      toggleChartVisibility(chartId, e.target.checked);
      localStorage.setItem(`chartToggle_${chartId}`, e.target.checked);
    });
  });
  function toggleChartVisibility(chartId, isVisible) {
    const wrapper = document.getElementById(chartId)?.closest('.chart-card');
    if (!wrapper) return;
    wrapper.style.display = isVisible ? 'block' : 'none';
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.chart-toggle').forEach(checkbox => {
      const storedValue = localStorage.getItem(`chartToggle_${checkbox.dataset.chart}`);
      if (storedValue === 'false') {
        checkbox.checked = false;
        toggleChartVisibility(checkbox.dataset.chart, false);
      }
    });
  });
})();
