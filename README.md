# Route Weather Analyst

Route Weather Analyst is a web-based application that allows users to upload a GPX file of their route (e.g., for cycling or hiking) and analyze the weather forecast along the route. The app integrates interactive maps and dynamic charts to display various weather parameters—such as temperature, wind, precipitation, humidity, pressure, and even elevation with a temperature overlay—providing an in-depth look at the conditions you can expect along your journey.

## Features

- **GPX Route Upload:**  
  Upload your GPX file to render your route on an interactive map.
  
- **Interactive Map:**  
  Visualize your route using [Leaflet.js](https://leafletjs.com/). The map displays markers for each forecast point along the route, including wind direction arrows that are correctly aligned.

- **Dynamic Weather Charts:**  
  View a series of interactive charts (powered by [Chart.js](https://www.chartjs.org/)) showing:
  - Temperature and "Feels Like" Temperature
  - Precipitation
  - Wind Speed (with wind direction icons)
  - Humidity
  - Pressure
  - Elevation with a temperature overlay (using dual y-axes)

- **Weather Timeline:**  
  See a full vertical list of weather forecast points along your route. Click on any timeline entry to pan the map to that location.

- **Responsive & Mobile-Friendly:**  
  The application layout adjusts for mobile and desktop viewing:
  - On mobile, charts and controls stack vertically.
  - On desktop, charts are displayed in a grid without overlapping.

- **Save Report:**  
  Capture and download a screenshot of the entire analysis (map, charts, and timeline) for later review.

## Technologies Used

- **HTML5 & CSS3**  
- **JavaScript (ES6+)**
- **Leaflet.js** - For interactive map functionality.
- **Chart.js** - For rendering dynamic charts.
- **html2canvas** - For capturing a screenshot of the report.
- **OpenWeather API** - For weather forecast data.

## Installation & Setup

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/yourusername/route-weather-analyst.git
   cd route-weather-analyst
