# Fair Weather

Find your perfect window for outdoor running and walking based on real-time weather scoring.

**https://fair-weather.query-farm.services**

## How it works

Fair Weather fetches hourly forecast data for your location and scores each hour on conditions that matter for outdoor activity — temperature, humidity, wind, UV, precipitation probability, and daylight. Scores are tuned separately for running and walking.

## Stack

- **Frontend** — Single-page app served as static assets
- **Backend** — Cloudflare Workers + Durable Objects
- **Weather data** — Open-Meteo API
- **Scheduling** — ICS calendar export and optional email reminders via Resend

## Development

```sh
npm install
npm run dev
```

Requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/) for local development and deployment.

## Deployment

```sh
npm run deploy
```
