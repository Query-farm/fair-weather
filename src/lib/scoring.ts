// Scoring logic extracted from index.html

export interface HourlyData {
  time: string;
  temperature: number;
  humidity: number;
  feels_like: number;
  weather_code: number;
  wind_speed: number;
  uv_index: number;
  precipitation_probability: number;
  is_daylight: boolean;
  daylight_factor: number;
}

export interface ScoredHour extends HourlyData {
  score: number;
  rating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
}

export type Mode = 'running' | 'walking';

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function interpolate(value: number, bp: [number, number][]): number {
  if (value <= bp[0][0]) return bp[0][1];
  if (value >= bp[bp.length - 1][0]) return bp[bp.length - 1][1];
  for (let i = 0; i < bp.length - 1; i++) {
    const [x0, y0] = bp[i], [x1, y1] = bp[i + 1];
    if (x0 <= value && value <= x1) {
      const t = x1 !== x0 ? (value - x0) / (x1 - x0) : 0;
      return y0 + t * (y1 - y0);
    }
  }
  return bp[bp.length - 1][1];
}

const scoreTempRunning = (v: number) =>
  clamp(interpolate(v, [[10, 0], [20, 15], [30, 45], [40, 75], [50, 100], [60, 100], [70, 75], [80, 45], [90, 15], [100, 0]]));

const scoreTempWalking = (v: number) =>
  clamp(interpolate(v, [[15, 0], [25, 10], [35, 30], [45, 60], [55, 100], [70, 100], [80, 70], [85, 45], [95, 15], [105, 0]]));

const scoreHumidity = (v: number) =>
  clamp(interpolate(v, [[0, 70], [30, 100], [50, 100], [65, 75], [80, 45], [85, 15], [100, 0]]));

const scoreUV = (v: number) =>
  clamp(interpolate(v, [[0, 100], [2, 100], [5, 75], [7, 45], [8, 15], [11, 0]]));

const scoreWindRunning = (v: number) =>
  clamp(interpolate(v, [[0, 100], [8, 100], [15, 75], [25, 45], [35, 15], [50, 0]]));

const scoreWindWalking = (v: number) =>
  clamp(interpolate(v, [[0, 100], [6, 100], [12, 75], [20, 45], [30, 15], [45, 0]]));

const scorePrecip = (v: number) =>
  clamp(interpolate(v, [[0, 100], [10, 100], [30, 75], [60, 45], [80, 15], [100, 0]]));

const WEATHER_CODE_SCORES: Record<number, number> = {
  0: 100, 1: 95, 2: 90, 3: 75, 45: 55, 48: 50, 51: 50, 53: 40, 55: 30, 56: 25, 57: 15,
  61: 30, 63: 15, 65: 5, 66: 10, 67: 5, 71: 25, 73: 10, 75: 5, 77: 15,
  80: 30, 81: 15, 82: 5, 85: 15, 86: 5, 95: 5, 96: 2, 99: 0,
};

const scoreWeatherCode = (c: number) => WEATHER_CODE_SCORES[c] ?? 50;

const WEIGHTS: Record<string, number> = {
  temperature: 0.25,
  feels_like: 0.20,
  humidity: 0.15,
  uv_index: 0.10,
  wind_speed: 0.10,
  precipitation_probability: 0.10,
  weather_code: 0.10,
};

export function computeScore(h: HourlyData, mode: Mode): ScoredHour {
  const scoreTemp = mode === 'running' ? scoreTempRunning : scoreTempWalking;
  const scoreWind = mode === 'running' ? scoreWindRunning : scoreWindWalking;
  const sub: Record<string, number> = {
    temperature: scoreTemp(h.temperature),
    feels_like: scoreTemp(h.feels_like),
    humidity: scoreHumidity(h.humidity),
    uv_index: scoreUV(h.uv_index),
    wind_speed: scoreWind(h.wind_speed),
    precipitation_probability: scorePrecip(h.precipitation_probability),
    weather_code: scoreWeatherCode(h.weather_code),
  };
  let composite = 0;
  for (const k of Object.keys(WEIGHTS)) composite += sub[k] * WEIGHTS[k];
  composite *= h.daylight_factor;
  composite = Math.round(composite * 10) / 10;
  const rating = composite >= 80 ? 'Excellent' : composite >= 65 ? 'Good' : composite >= 45 ? 'Fair' : 'Poor';
  return { ...h, score: composite, rating };
}

export function computeDaylight(hourISO: string, dailyList: { date: string; sunrise: string; sunset: string }[]): { is_daylight: boolean; daylight_factor: number } {
  const hdt = new Date(hourISO);
  const dateStr = hourISO.slice(0, 10);
  const day = dailyList.find(d => d.date === dateStr);
  if (!day) return { is_daylight: true, daylight_factor: 1.0 };

  const sr = new Date(day.sunrise).getTime();
  const ss = new Date(day.sunset).getTime();
  const ht = hdt.getTime();
  const twilight = 30 * 60 * 1000;

  if (ht >= sr && ht <= ss) {
    if ((ht - sr) < twilight || (ss - ht) < twilight) return { is_daylight: true, daylight_factor: 0.6 };
    return { is_daylight: true, daylight_factor: 1.0 };
  }
  if (ht < sr && (sr - ht) <= twilight) return { is_daylight: false, daylight_factor: 0.6 };
  if (ht > ss && (ht - ss) <= twilight) return { is_daylight: false, daylight_factor: 0.6 };
  return { is_daylight: false, daylight_factor: 0.3 };
}

export interface OpenMeteoForecast {
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    apparent_temperature: number[];
    weather_code: number[];
    wind_speed_10m: number[];
    uv_index: number[];
    precipitation_probability: number[];
  };
  daily: {
    time: string[];
    sunrise: string[];
    sunset: string[];
  };
}

export function computeScoreForHour(forecast: OpenMeteoForecast, targetTime: string, mode: Mode): number {
  const targetDate = new Date(targetTime);
  const targetHour = targetDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH

  const dailyList = forecast.daily.time.map((d, i) => ({
    date: d,
    sunrise: forecast.daily.sunrise[i],
    sunset: forecast.daily.sunset[i],
  }));

  // Find the matching hourly slot
  let idx = -1;
  for (let i = 0; i < forecast.hourly.time.length; i++) {
    if (forecast.hourly.time[i].slice(0, 13) === targetHour) {
      idx = i;
      break;
    }
  }

  // Fall back to closest hour
  if (idx === -1) {
    let minDiff = Infinity;
    for (let i = 0; i < forecast.hourly.time.length; i++) {
      const diff = Math.abs(new Date(forecast.hourly.time[i]).getTime() - targetDate.getTime());
      if (diff < minDiff) { minDiff = diff; idx = i; }
    }
  }

  if (idx === -1) return 50; // no data, neutral score

  const h = forecast.hourly;
  const dl = computeDaylight(h.time[idx], dailyList);
  const hourData: HourlyData = {
    time: h.time[idx],
    temperature: h.temperature_2m[idx],
    humidity: h.relative_humidity_2m[idx],
    feels_like: h.apparent_temperature[idx],
    weather_code: h.weather_code[idx],
    wind_speed: h.wind_speed_10m[idx],
    uv_index: h.uv_index[idx],
    precipitation_probability: h.precipitation_probability[idx],
    ...dl,
  };

  return computeScore(hourData, mode).score;
}

/** Find best alternative time: same day, +/- 4 hours from target, must be in future & daylight */
export function findBestAlternative(
  forecast: OpenMeteoForecast,
  targetTime: string,
  mode: Mode,
): { time: string; score: number } | null {
  const targetDate = new Date(targetTime);
  const now = Date.now();
  const windowMs = 4 * 60 * 60 * 1000;
  const dayStr = targetTime.slice(0, 10);

  const dailyList = forecast.daily.time.map((d, i) => ({
    date: d,
    sunrise: forecast.daily.sunrise[i],
    sunset: forecast.daily.sunset[i],
  }));

  let best: { time: string; score: number } | null = null;

  for (let i = 0; i < forecast.hourly.time.length; i++) {
    const t = forecast.hourly.time[i];
    if (t.slice(0, 10) !== dayStr) continue;
    const tMs = new Date(t).getTime();
    if (tMs <= now) continue; // must be in future
    if (Math.abs(tMs - targetDate.getTime()) > windowMs) continue;
    if (tMs === targetDate.getTime()) continue; // skip same slot

    const h = forecast.hourly;
    const dl = computeDaylight(t, dailyList);
    if (!dl.is_daylight) continue;

    const hourData: HourlyData = {
      time: t,
      temperature: h.temperature_2m[i],
      humidity: h.relative_humidity_2m[i],
      feels_like: h.apparent_temperature[i],
      weather_code: h.weather_code[i],
      wind_speed: h.wind_speed_10m[i],
      uv_index: h.uv_index[i],
      precipitation_probability: h.precipitation_probability[i],
      ...dl,
    };

    const scored = computeScore(hourData, mode);
    if (!best || scored.score > best.score) {
      best = { time: t, score: scored.score };
    }
  }

  return best;
}
