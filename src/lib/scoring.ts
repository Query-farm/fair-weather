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
  cloud_cover?: number;
  visibility?: number;
}

export interface ScoredHour extends HourlyData {
  score: number;
  rating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
}

export type Mode = 'running' | 'walking' | 'cycling' | 'stargazing' | 'dog_walking';

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

const scoreTempCycling = (v: number) =>
  clamp(interpolate(v, [[15, 0], [25, 10], [35, 30], [45, 60], [55, 100], [75, 100], [85, 65], [90, 40], [100, 10], [110, 0]]));

const scoreWindCycling = (v: number) =>
  clamp(interpolate(v, [[0, 100], [5, 100], [8, 80], [12, 55], [15, 35], [18, 20], [22, 8], [30, 0]]));

const scorePrecip = (v: number) =>
  clamp(interpolate(v, [[0, 100], [5, 100], [15, 80], [30, 55], [50, 30], [70, 12], [100, 0]]));

const scorePrecipCycling = (v: number) =>
  clamp(interpolate(v, [[0, 100], [5, 100], [20, 70], [40, 35], [60, 15], [80, 5], [100, 0]]));

const scoreTempStargazing = (v: number) =>
  clamp(interpolate(v, [[0, 0], [15, 10], [25, 30], [35, 60], [45, 90], [55, 100], [65, 100], [75, 85], [85, 50], [95, 20], [105, 0]]));

const scoreWindStargazing = (v: number) =>
  clamp(interpolate(v, [[0, 100], [5, 100], [10, 85], [15, 60], [20, 35], [25, 15], [35, 0]]));

const scoreHumidityStargazing = (v: number) =>
  clamp(interpolate(v, [[0, 100], [30, 100], [50, 90], [60, 70], [70, 50], [80, 25], [90, 10], [100, 0]]));

const scoreCloudCover = (v: number) =>
  clamp(interpolate(v, [[0, 100], [10, 95], [20, 80], [30, 60], [50, 35], [70, 15], [85, 5], [100, 0]]));

const scoreVisibility = (v: number) =>
  clamp(interpolate(v, [[1000, 0], [5000, 30], [10000, 60], [20000, 85], [40000, 100], [100000, 100]]));

const WEATHER_CODE_SCORES: Record<number, number> = {
  0: 100, 1: 95, 2: 90, 3: 75, 45: 55, 48: 50, 51: 35, 53: 25, 55: 15, 56: 2, 57: 0,
  61: 15, 63: 8, 65: 2, 66: 0, 67: 0, 71: 15, 73: 5, 75: 2, 77: 8,
  80: 15, 81: 8, 82: 2, 85: 8, 86: 2, 95: 5, 96: 0, 99: 0,
};

const WEATHER_CODE_SCORES_CYCLING: Record<number, number> = {
  0: 100, 1: 95, 2: 90, 3: 75, 45: 15, 48: 10, 51: 35, 53: 25, 55: 15, 56: 2, 57: 0,
  61: 15, 63: 8, 65: 3, 66: 0, 67: 0, 71: 20, 73: 8, 75: 0, 77: 10,
  80: 15, 81: 8, 82: 3, 85: 10, 86: 2, 95: 3, 96: 0, 99: 0,
};

const WEATHER_CODE_SCORES_STARGAZING: Record<number, number> = {
  0: 100, 1: 90, 2: 60, 3: 20, 45: 5, 48: 5,
  51: 5, 53: 2, 55: 0, 56: 0, 57: 0,
  61: 2, 63: 0, 65: 0, 66: 0, 67: 0,
  71: 5, 73: 2, 75: 0, 77: 2,
  80: 5, 81: 2, 82: 0, 85: 2, 86: 0,
  95: 0, 96: 0, 99: 0,
};

const scoreTempDogWalking = (v: number) =>
  clamp(interpolate(v, [[10,5],[20,20],[30,45],[40,70],[50,100],[65,100],[75,70],[82,40],[90,10],[100,0]]));

const scoreUVDogWalking = (v: number) =>
  clamp(interpolate(v, [[0,100],[2,100],[4,75],[6,40],[8,10],[10,0]]));

const scorePavement = (v: number) =>
  clamp(interpolate(v, [[30,60],[40,80],[50,100],[77,100],[100,65],[115,35],[125,10],[135,0]]));

function estimatePavementTemp(airTempF: number, uvIndex: number, cloudCover: number | undefined): number {
  const maxBoost = 50;
  const boost = (uvIndex / 11) * (1 - (cloudCover ?? 50) / 100) * maxBoost;
  return airTempF + boost;
}

const WEATHER_CODE_SCORES_DOG_WALKING: Record<number, number> = {
  0:100,1:95,2:90,3:75,45:55,48:50,
  51:35,53:25,55:15,56:0,57:0,
  61:15,63:8,65:2,66:0,67:0,
  71:5,73:0,75:0,77:2,
  80:15,81:8,82:2,85:2,86:0,
  95:5,96:0,99:0
};

const scoreWeatherCode = (c: number) => WEATHER_CODE_SCORES[c] ?? 50;
const scoreWeatherCodeCycling = (c: number) => WEATHER_CODE_SCORES_CYCLING[c] ?? 50;
const scoreWeatherCodeStargazing = (c: number) => WEATHER_CODE_SCORES_STARGAZING[c] ?? 50;
const scoreWeatherCodeDogWalking = (c: number) => WEATHER_CODE_SCORES_DOG_WALKING[c] ?? 50;

const WEIGHTS: Record<string, number> = {
  temperature: 0.25,
  feels_like: 0.20,
  humidity: 0.15,
  uv_index: 0.10,
  wind_speed: 0.10,
  precipitation_probability: 0.10,
  weather_code: 0.10,
};

const WEIGHTS_DOG_WALKING: Record<string, number> = {
  temperature: 0.15,
  feels_like: 0.10,
  pavement_temperature: 0.20,
  humidity: 0.10,
  uv_index: 0.15,
  wind_speed: 0.05,
  precipitation_probability: 0.10,
  weather_code: 0.15,
};

const WEIGHTS_STARGAZING: Record<string, number> = {
  cloud_cover: 0.35,
  weather_code: 0.15,
  temperature: 0.15,
  wind_speed: 0.10,
  humidity: 0.10,
  precipitation_probability: 0.10,
  visibility: 0.05,
};

export function computeDarkness(hourISO: string, dailyList: { date: string; sunrise: string; sunset: string }[]): { is_daylight: boolean; daylight_factor: number } {
  const hdt = new Date(hourISO);
  const dateStr = hourISO.slice(0, 10);
  const day = dailyList.find(d => d.date === dateStr);
  if (!day) return { is_daylight: false, daylight_factor: 0.05 };

  const sr = new Date(day.sunrise).getTime();
  const ss = new Date(day.sunset).getTime();
  const ht = hdt.getTime();
  const twilight = 30 * 60 * 1000;

  // Deep night: >30 min past sunset or >30 min before sunrise
  if (ht > ss + twilight || ht < sr - twilight) return { is_daylight: false, daylight_factor: 1.0 };
  // Twilight: within 30 min of sunrise/sunset
  if ((ht >= ss && ht <= ss + twilight) || (ht >= sr - twilight && ht <= sr)) return { is_daylight: false, daylight_factor: 0.3 };
  if ((ht >= sr && ht <= sr + twilight) || (ht >= ss - twilight && ht <= ss)) return { is_daylight: true, daylight_factor: 0.3 };
  // Daylight
  return { is_daylight: true, daylight_factor: 0.05 };
}

export function computeScore(h: HourlyData, mode: Mode): ScoredHour {
  if (mode === 'stargazing') {
    const sub: Record<string, number> = {
      cloud_cover: scoreCloudCover(h.cloud_cover ?? 50),
      weather_code: scoreWeatherCodeStargazing(h.weather_code),
      temperature: scoreTempStargazing(h.temperature),
      wind_speed: scoreWindStargazing(h.wind_speed),
      humidity: scoreHumidityStargazing(h.humidity),
      precipitation_probability: scorePrecip(h.precipitation_probability),
      visibility: scoreVisibility(h.visibility ?? 20000),
    };
    let composite = 0;
    for (const k of Object.keys(WEIGHTS_STARGAZING)) composite += sub[k] * WEIGHTS_STARGAZING[k];
    composite *= h.daylight_factor;
    composite = Math.round(composite * 10) / 10;
    const rating = composite >= 80 ? 'Excellent' : composite >= 65 ? 'Good' : composite >= 45 ? 'Fair' : 'Poor';
    return { ...h, score: composite, rating };
  }

  if (mode === 'dog_walking') {
    const pavementTemp = estimatePavementTemp(h.temperature, h.uv_index, h.cloud_cover);
    const sub: Record<string, number> = {
      temperature: scoreTempDogWalking(h.temperature),
      feels_like: scoreTempDogWalking(h.feels_like),
      pavement_temperature: scorePavement(pavementTemp),
      humidity: scoreHumidity(h.humidity),
      uv_index: scoreUVDogWalking(h.uv_index),
      wind_speed: scoreWindWalking(h.wind_speed),
      precipitation_probability: scorePrecip(h.precipitation_probability),
      weather_code: scoreWeatherCodeDogWalking(h.weather_code),
    };
    let composite = 0;
    for (const k of Object.keys(WEIGHTS_DOG_WALKING)) composite += sub[k] * WEIGHTS_DOG_WALKING[k];
    composite *= h.daylight_factor;
    composite = Math.round(composite * 10) / 10;
    const rating = composite >= 80 ? 'Excellent' : composite >= 65 ? 'Good' : composite >= 45 ? 'Fair' : 'Poor';
    return { ...h, score: composite, rating };
  }

  const scoreTemp = mode === 'cycling' ? scoreTempCycling : mode === 'running' ? scoreTempRunning : scoreTempWalking;
  const scoreWind = mode === 'cycling' ? scoreWindCycling : mode === 'running' ? scoreWindRunning : scoreWindWalking;
  const precipFn = mode === 'cycling' ? scorePrecipCycling : scorePrecip;
  const weatherCodeFn = mode === 'cycling' ? scoreWeatherCodeCycling : scoreWeatherCode;
  const sub: Record<string, number> = {
    temperature: scoreTemp(h.temperature),
    feels_like: scoreTemp(h.feels_like),
    humidity: scoreHumidity(h.humidity),
    uv_index: scoreUV(h.uv_index),
    wind_speed: scoreWind(h.wind_speed),
    precipitation_probability: precipFn(h.precipitation_probability),
    weather_code: weatherCodeFn(h.weather_code),
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
    cloud_cover: number[];
    visibility: number[];
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
  const dl = mode === 'stargazing'
    ? computeDarkness(h.time[idx], dailyList)
    : computeDaylight(h.time[idx], dailyList);
  const hourData: HourlyData = {
    time: h.time[idx],
    temperature: h.temperature_2m[idx],
    humidity: h.relative_humidity_2m[idx],
    feels_like: h.apparent_temperature[idx],
    weather_code: h.weather_code[idx],
    wind_speed: h.wind_speed_10m[idx],
    uv_index: h.uv_index[idx],
    precipitation_probability: h.precipitation_probability[idx],
    cloud_cover: h.cloud_cover?.[idx] ?? 50,
    visibility: h.visibility?.[idx] ?? 20000,
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
    const dl = mode === 'stargazing'
      ? computeDarkness(t, dailyList)
      : computeDaylight(t, dailyList);
    if (mode !== 'stargazing' && !dl.is_daylight) continue;
    if (mode === 'stargazing' && dl.is_daylight) continue;

    const hourData: HourlyData = {
      time: t,
      temperature: h.temperature_2m[i],
      humidity: h.relative_humidity_2m[i],
      feels_like: h.apparent_temperature[i],
      weather_code: h.weather_code[i],
      wind_speed: h.wind_speed_10m[i],
      uv_index: h.uv_index[i],
      precipitation_probability: h.precipitation_probability[i],
      cloud_cover: h.cloud_cover?.[i] ?? 50,
      visibility: h.visibility?.[i] ?? 20000,
      ...dl,
    };

    const scored = computeScore(hourData, mode);
    if (!best || scored.score > best.score) {
      best = { time: t, score: scored.score };
    }
  }

  return best;
}
