(() => {
  'use strict';

  // ----------------- Utility: Convert Degrees to Compass Direction -----------------
  const convertDegreesToCompass = (deg) => {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  // ----------------- Enhanced: Create Custom SVG Icon with Gradient & Drop Shadow -----------------
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

  // ----------------- UI Helper Functions -----------------
  const showLoading = () => document.getElementById('loading').classList.add('active');
  const hideLoading = () => document.getElementById('loading').classList.remove('active');
  const showError = (message, type = 'error') => {
    console.error(message);
    const alerts = document.getElementById('alerts');
    const alert = document.createElement('div');
    alert.className = `alert-item ${type}`;
    alert.innerHTML = `<span>${message}</span>`;
    alerts.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
  };

  // ----------------- Global Application State -----------------
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

  // ----------------- Initialize Map -----------------
  const map = L.map('map').setView([41.3851, 2.1734], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  setTimeout(() => map.invalidateSize(), 100);

  document.getElementById('centerMap').addEventListener('click', () => {
    if (routeLayer) {
      map.fitBounds(routeLayer.getBounds());
    } else {
      map.setView([41.3851, 2.1734], 13);
    }
  });

  // ----------------- Common Chart Options (Improved Readability) -----------------
  const commonChartOptions = {
    responsive: true,
    maintainAspectRatio: false, // let charts grow vertically
    layout: {
      padding: {
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
      },
    },
    animation: {
      duration: 1200,
      easing: 'easeInOutQuad'
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: {
            size: 16,
            weight: 'bold'
          },
          color: '#333'
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
          font: { size: 14 },
          color: '#333',
          maxTicksLimit: 8
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        },
        title: {
          display: true,
          text: 'Distance (km)',
          font: { size: 16 },
          color: '#333'
        }
      },
      y: {
        ticks: {
          font: { size: 14 },
          color: '#333'
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        },
        title: {
          display: true,
          text: 'Value',
          font: { size: 16 },
          color: '#333'
        }
      }
    },
    elements: {
      line: {
        borderWidth: 3,
        tension: 0.3,
        borderCapStyle: 'round',
        borderJoinStyle: 'round'
      },
      point: {
        radius: 5,
        hoverRadius: 7
      }
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

  // ----------------- Timeline Functions (with GSAP Animations) -----------------
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

      // GSAP hover animation
      entry.addEventListener('mouseover', () => {
        gsap.to(entry, { scale: 1.05, duration: 0.2 });
      });
      entry.addEventListener('mouseout', () => {
        gsap.to(entry, { scale: 1, duration: 0.2 });
      });

      // Center map & open popup on click
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

  const panMapToPoint = (index) => {
    const task = weatherTasks[index];
    if (task && task.position) {
      map.panTo(task.position, { animate: true });
    }
  };

  // ----------------- Utility Functions -----------------
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

    let windDir = "N/A";
    if (weather && typeof weather.windDeg === 'number') {
      windDir = convertDegreesToCompass(weather.windDeg);
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
      </div>
    `;
  };

  // ----------------- Clear Existing Forecast Data -----------------
  const clearForecastData = () => {
    clearMarkers();
    arrowMarkers.forEach(marker => map.removeLayer(marker));
    arrowMarkers = [];
    weatherTasks = [];

    // Destroy existing charts
    [tempChart, precipChart, windChart, humidityChart, pressureChart, elevationChart]
      .forEach(chart => { if (chart) chart.destroy(); });

    document.getElementById('timeline').innerHTML = '';
  };

  const clearMarkers = () => {
    weatherMarkers.forEach(marker => map.removeLayer(marker));
    weatherMarkers = [];
  };

  // ----------------- GPX File Parsing -----------------
  const parseGPX = (gpxData) => {
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
  };

  // ----------------- Render Route on Map -----------------
  const renderRoute = (coords) => {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    routeLayer = L.polyline(coords, { color: "#2196F3" }).addTo(map);
    map.fitBounds(routeLayer.getBounds());
  };

  // ----------------- Prepare Weather Tasks -----------------
  const prepareWeatherTasks = async (coords) => {
    const totalDistance = calculateTotalDistance(coords);
    const startTime = new Date(document.getElementById("startTime").value);

    if (isNaN(startTime.getTime())) throw new Error("Invalid start time");

    const intervalKm = parseInt(document.getElementById("weatherInterval").value) || 5;
    const interval = intervalKm * 1000;
    const speed = parseInt(document.getElementById("avgSpeed").value) || 20;

    if (totalDistance <= 0) throw new Error("Invalid route distance");

    // We only get up to 5 days of forecast
    const maxForecastTime = new Date(startTime.getTime() + 5 * 24 * 3600 * 1000);

    // Create tasks at each interval along the route
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
  };

  // ----------------- Weather API Functions -----------------
  const fetchWeatherData = async () => {
    const requests = weatherTasks.map(task =>
      fetchWeatherWithRetry(task.position[0], task.position[1], task.forecastTime)
    );
    const results = await Promise.allSettled(requests);

    results.forEach((result, index) => {
      weatherTasks[index].weather = (result.status === 'fulfilled') ? result.value : null;
      if (!weatherTasks[index].weather) {
        showError(`Failed to get weather for point ${index + 1}`, 'warning');
      }
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
      // Attempt to find the forecast entry closest to the specified time
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

  // ----------------- Charts Rendering -----------------

  // 1) Elevation/Temperature Chart
  const renderElevationChart = () => {
    if (!elevationProfile.length || !weatherTasks.length) return;
    const ctx = document.getElementById('elevationChart').getContext('2d');

    // Helper to interpolate temperature at a given distance
    const interpolateTemperature = (distanceMeters) => {
      let i = 0;
      for (; i < weatherTasks.length - 1; i++) {
        if (weatherTasks[i].distance <= distanceMeters && weatherTasks[i + 1].distance >= distanceMeters) {
          break;
        }
      }
      if (i === weatherTasks.length - 1) {
        return weatherTasks[i].weather ? weatherTasks[i].weather.temp : null;
      }
      const task1 = weatherTasks[i];
      const task2 = weatherTasks[i + 1];
      if (!task1.weather || !task2.weather) return null;

      const t1 = task1.weather.temp;
      const t2 = task2.weather.temp;
      const d1 = task1.distance;
      const d2 = task2.distance;
      const ratio = (distanceMeters - d1) / (d2 - d1);

      return t1 + (t2 - t1) * ratio;
    };

    // Build temperature dataset by interpolating each elevation point
    const temperatureDataset = elevationProfile.map(pt => {
      const distanceMeters = parseFloat(pt.distance) * 1000;
      return interpolateTemperature(distanceMeters);
    });

    elevationChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: elevationProfile.map(pt => `${pt.distance} km`),
        datasets: [
          {
            label: "Elevation (m)",
            data: elevationProfile.map(pt => pt.elevation),
            borderColor: "#e67e22",
            tension: 0.3,
            fill: false,
            yAxisID: 'y'
          },
          {
            label: "Temperature (°C)",
            data: temperatureDataset,
            borderColor: "#ff6384",
            tension: 0.3,
            fill: false,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        ...commonChartOptions,
        scales: {
          ...commonChartOptions.scales,
          x: {
            ...commonChartOptions.scales.x,
            title: {
              ...commonChartOptions.scales.x.title,
              text: 'Distance (km)'
            }
          },
          y: {
            type: 'linear',
            position: 'left',
            ...commonChartOptions.scales.y,
            title: {
              ...commonChartOptions.scales.y.title,
              text: 'Elevation (m)'
            }
          },
          y1: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              font: { size: 14 },
              color: '#333'
            },
            title: {
              display: true,
              text: 'Temperature (°C)',
              font: { size: 16 },
              color: '#333'
            }
          }
        }
      }
    });
  };

  // 2) Temperature Chart
  const renderTemperatureChart = () => {
    const ctx = document.getElementById('tempChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(255,99,132,0.5)');
    gradient.addColorStop(1, 'rgba(255,99,132,0)');

    tempChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weatherTasks.map(t => `${(t.distance / 1000).toFixed(1)} km`),
        datasets: [
          {
            label: "Temperature (°C)",
            data: weatherTasks.map(t => t.weather?.temp ?? null),
            backgroundColor: gradient,
            borderColor: '#ff6384',
            fill: true
          }
        ]
      },
      options: {
        ...commonChartOptions,
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
  };

  // 3) Precipitation Chart
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
      options: {
        ...commonChartOptions,
        scales: {
          ...commonChartOptions.scales,
          x: {
            ...commonChartOptions.scales.x,
            title: {
              ...commonChartOptions.scales.x.title,
              text: 'Time'
            }
          },
          y: {
            ...commonChartOptions.scales.y,
            title: {
              ...commonChartOptions.scales.y.title,
              text: 'Precipitation (mm)'
            }
          }
        }
      }
    });
  };

  // 4) Wind Chart
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
          tension: 0.3,
          fill: false,
          // Use our enhanced custom SVG marker for each point
          pointStyle: weatherTasks.map(t => {
            const adjustedWindDeg = ((t.weather.windDeg ?? 0) + 180) % 360;
            const icon = createSvgIcon(adjustedWindDeg);
            return icon.options.html;
          })
        }]
      },
      options: {
        ...commonChartOptions,
        scales: {
          ...commonChartOptions.scales,
          x: {
            ...commonChartOptions.scales.x,
            title: {
              ...commonChartOptions.scales.x.title,
              text: 'Time'
            }
          },
          y: {
            ...commonChartOptions.scales.y,
            title: {
              ...commonChartOptions.scales.y.title,
              text: 'Wind Speed (m/s)'
            },
            beginAtZero: true
          }
        }
      }
    });
  };

  // 5) Humidity Chart
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
          tension: 0.3,
          fill: false
        }]
      },
      options: {
        ...commonChartOptions,
        scales: {
          ...commonChartOptions.scales,
          x: {
            ...commonChartOptions.scales.x,
            title: {
              ...commonChartOptions.scales.x.title,
              text: 'Time'
            }
          },
          y: {
            ...commonChartOptions.scales.y,
            title: {
              ...commonChartOptions.scales.y.title,
              text: 'Humidity (%)'
            },
            beginAtZero: true,
            max: 100
          }
        }
      }
    });
  };

  // 6) Pressure Chart
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
          tension: 0.3,
          fill: false
        }]
      },
      options: {
        ...commonChartOptions,
        scales: {
          ...commonChartOptions.scales,
          x: {
            ...commonChartOptions.scales.x,
            title: {
              ...commonChartOptions.scales.x.title,
              text: 'Time'
            }
          },
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
  };

  // ----------------- Forecast Saving Function (PDF) -----------------
  const saveForecast = () => {
    if (!weatherTasks.length) {
      showError("No forecast data available to save.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Forecast Data", 10, 20);
    doc.setFontSize(12);

    let y = 30;
    weatherTasks.forEach((task, i) => {
      const time = task.forecastTime.toLocaleString();
      const pos = `(${task.position[0].toFixed(4)}, ${task.position[1].toFixed(4)})`;

      let windDir = "N/A";
      if (task.weather && typeof task.weather.windDeg === 'number') {
        windDir = convertDegreesToCompass(task.weather.windDeg);
      }

      const temp = task.weather ? `${Math.round(task.weather.temp)}°C` : "N/A";
      const feelsLike = task.weather ? `${Math.round(task.weather.feels_like)}°C` : "N/A";
      const windSpeed = task.weather ? `${Math.round(task.weather.windSpeed)} m/s` : "N/A";
      const rain = task.weather ? `${task.weather.rain.toFixed(1)} mm` : "N/A";
      const pressure = task.weather ? `${task.weather.pressure} hPa` : "N/A";

      const line = `Point ${i+1}:
Time: ${time}
Position: ${pos}
Temp: ${temp} (Feels: ${feelsLike})
Wind: ${windSpeed} (${windDir})
Rain: ${rain} | Pressure: ${pressure}
-----------------------------------`;

      const splitText = doc.splitTextToSize(line, 180);
      doc.text(splitText, 10, y);
      y += splitText.length * 7;

      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save("forecast.pdf");
  };

  document.getElementById('saveForecast').addEventListener('click', saveForecast);

  // ----------------- Update Forecast on Start Time Change -----------------
  document.getElementById('startTime').addEventListener('change', async () => {
    if (currentRouteCoords) {
      await updateForecast();
    }
  });

  // ----------------- Main Forecast Update Function -----------------
  const updateForecast = async () => {
    clearForecastData();
    try {
      weatherTasks = await prepareWeatherTasks(currentRouteCoords);
      await fetchWeatherData();
      renderMapMarkers();
      updateTimeline();

      // Render each chart
      renderTemperatureChart();
      renderPrecipitationChart();
      renderWindChart();
      renderHumidityChart();
      renderPressureChart();

      // Render elevation/temperature combo if we have elevation data
      if (currentRoutePoints && currentRoutePoints[0].ele !== undefined) {
        elevationProfile = computeElevationProfile(currentRoutePoints);
        renderElevationChart();
      }
    } catch (error) {
      showError(error.message);
    }
  };

  // ----------------- File Upload Handling -----------------
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

      // Render standard charts
      renderTemperatureChart();
      renderPrecipitationChart();
      renderWindChart();
      renderHumidityChart();
      renderPressureChart();

      // If the GPX had elevation data, build the combined elevation/temperature chart
      if (routePoints[0].ele !== undefined) {
        elevationProfile = computeElevationProfile(routePoints);
        renderElevationChart();
      }
    } catch (error) {
      showError(error.message);
    } finally {
      hideLoading();
    }
  });

  // ----------------- Clear Existing Data (Route and Forecast) -----------------
  const clearExistingData = () => {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    clearForecastData();
  };

  // ----------------- Map Marker Rendering (Using Enhanced SVG Icons) -----------------
  const renderMapMarkers = () => {
    weatherTasks.forEach((task, index) => {
      if (!task.weather) return;

      // Basic circle marker for the forecast point
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

      // Additional wind-direction arrow marker
      const adjustedWindDeg = ((task.weather.windDeg ?? 0) + 180) % 360;
      const arrowIcon = createSvgIcon(adjustedWindDeg);
      const arrowMarker = L.marker(task.position, { icon: arrowIcon, zIndexOffset: 1000 }).addTo(map);
      arrowMarkers.push(arrowMarker);
    });
  };

})();
