import type { OpenMeteoForecast } from './scoring';

export async function fetchForecast(lat: number, lon: number, tz: string, days = 2): Promise<OpenMeteoForecast> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(tz)}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index,precipitation_probability,cloud_cover,visibility&daily=sunrise,sunset&forecast_days=${days}&temperature_unit=fahrenheit&wind_speed_unit=mph`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Open-Meteo API error: HTTP ${resp.status}`);
  return resp.json() as Promise<OpenMeteoForecast>;
}
