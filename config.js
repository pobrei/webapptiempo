/* config.js */
// In production, move API keys and OAuth secrets to a secure backend.
const OPENWEATHER_API_KEY = 'c8dbb11f02b05e11db446c2a69992c0d';

// OAuth configuration placeholders (replace with your actual credentials)
const OAUTH_CONFIG = {
  strava: {
    clientId: 'YOUR_STRAVA_CLIENT_ID',
    authUrl: 'https://www.strava.com/oauth/authorize',
    redirectUri: 'YOUR_REDIRECT_URI_FOR_STRAVA',
    scope: 'read,activity:read'
  },
  komoot: {
    clientId: 'YOUR_KOMOOT_CLIENT_ID',
    authUrl: 'https://auth.komoot.de/authorize',
    redirectUri: 'YOUR_REDIRECT_URI_FOR_KOMOOT',
    scope: 'user'
  },
  ridewithgps: {
    clientId: 'YOUR_RIDEWITHGPS_CLIENT_ID',
    authUrl: 'https://www.ridewithgps.com/oauth/authorize',
    redirectUri: 'YOUR_REDIRECT_URI_FOR_RIDEWITHGPS',
    scope: 'read'
  }
};
