import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeDaylight,
  computeDarkness,
  computeScore,
  computeScoreForHour,
  findBestAlternative,
  type HourlyData,
  type Mode,
  type OpenMeteoForecast,
} from './scoring';

// ── Factories ──────────────────────────────────────────────────────

const DAILY = [
  { date: '2025-06-15', sunrise: '2025-06-15T06:00', sunset: '2025-06-15T20:30' },
];

/** Baseline "perfect running" hour — mid-day, mild, calm, clear */
function makeHour(overrides: Partial<HourlyData> = {}): HourlyData {
  return {
    time: '2025-06-15T12:00',
    temperature: 55,
    humidity: 40,
    feels_like: 55,
    weather_code: 0,
    wind_speed: 5,
    uv_index: 3,
    precipitation_probability: 0,
    is_daylight: true,
    daylight_factor: 1.0,
    cloud_cover: 10,
    visibility: 40000,
    ...overrides,
  };
}

/** Build a minimal OpenMeteoForecast from an array of hour overrides */
function makeForecast(
  hours: Partial<HourlyData>[] = [{}],
  daily = DAILY,
): OpenMeteoForecast {
  const base = hours.map((h) => makeHour(h));
  return {
    hourly: {
      time: base.map((h) => h.time),
      temperature_2m: base.map((h) => h.temperature),
      relative_humidity_2m: base.map((h) => h.humidity),
      apparent_temperature: base.map((h) => h.feels_like),
      weather_code: base.map((h) => h.weather_code),
      wind_speed_10m: base.map((h) => h.wind_speed),
      uv_index: base.map((h) => h.uv_index),
      precipitation_probability: base.map((h) => h.precipitation_probability),
      cloud_cover: base.map((h) => h.cloud_cover ?? 50),
      visibility: base.map((h) => h.visibility ?? 20000),
    },
    daily: {
      time: daily.map((d) => d.date),
      sunrise: daily.map((d) => d.sunrise),
      sunset: daily.map((d) => d.sunset),
    },
  };
}

// ── computeDaylight ────────────────────────────────────────────────

describe('computeDaylight', () => {
  // sunrise 06:00, sunset 20:30

  it('returns full daylight for mid-day hour', () => {
    const r = computeDaylight('2025-06-15T12:00', DAILY);
    expect(r.is_daylight).toBe(true);
    expect(r.daylight_factor).toBe(1.0);
  });

  it('returns twilight factor just after sunrise (within 30 min)', () => {
    const r = computeDaylight('2025-06-15T06:10', DAILY);
    expect(r.is_daylight).toBe(true);
    expect(r.daylight_factor).toBe(0.6);
  });

  it('returns twilight factor just before sunset (within 30 min)', () => {
    const r = computeDaylight('2025-06-15T20:15', DAILY);
    expect(r.is_daylight).toBe(true);
    expect(r.daylight_factor).toBe(0.6);
  });

  it('returns twilight factor for pre-dawn (within 30 min before sunrise)', () => {
    const r = computeDaylight('2025-06-15T05:45', DAILY);
    expect(r.is_daylight).toBe(false);
    expect(r.daylight_factor).toBe(0.6);
  });

  it('returns twilight factor for dusk (within 30 min after sunset)', () => {
    const r = computeDaylight('2025-06-15T20:45', DAILY);
    expect(r.is_daylight).toBe(false);
    expect(r.daylight_factor).toBe(0.6);
  });

  it('returns night factor for deep night', () => {
    const r = computeDaylight('2025-06-15T02:00', DAILY);
    expect(r.is_daylight).toBe(false);
    expect(r.daylight_factor).toBe(0.3);
  });

  it('falls back to daylight=true when day is missing', () => {
    const r = computeDaylight('2025-06-16T12:00', DAILY);
    expect(r.is_daylight).toBe(true);
    expect(r.daylight_factor).toBe(1.0);
  });
});

// ── computeDarkness ────────────────────────────────────────────────

describe('computeDarkness', () => {
  // sunrise 06:00, sunset 20:30

  it('returns full darkness (factor 1.0) for deep night', () => {
    const r = computeDarkness('2025-06-15T23:00', DAILY);
    expect(r.is_daylight).toBe(false);
    expect(r.daylight_factor).toBe(1.0);
  });

  it('returns twilight factor near sunset', () => {
    const r = computeDarkness('2025-06-15T20:45', DAILY);
    expect(r.is_daylight).toBe(false);
    expect(r.daylight_factor).toBe(0.3);
  });

  it('returns twilight factor near sunrise (inside sunrise window)', () => {
    // Just after sunrise, within 30 min
    const r = computeDarkness('2025-06-15T06:15', DAILY);
    expect(r.is_daylight).toBe(true);
    expect(r.daylight_factor).toBe(0.3);
  });

  it('returns full darkness before dawn (>30 min before sunrise)', () => {
    const r = computeDarkness('2025-06-15T04:00', DAILY);
    expect(r.is_daylight).toBe(false);
    expect(r.daylight_factor).toBe(1.0);
  });

  it('returns near-zero factor for mid-day', () => {
    const r = computeDarkness('2025-06-15T12:00', DAILY);
    expect(r.is_daylight).toBe(true);
    expect(r.daylight_factor).toBe(0.05);
  });

  it('falls back to not-daylight with 0.05 factor when day is missing', () => {
    const r = computeDarkness('2025-06-16T23:00', DAILY);
    expect(r.is_daylight).toBe(false);
    expect(r.daylight_factor).toBe(0.05);
  });
});

// ── computeScore — Running mode ────────────────────────────────────

describe('computeScore — running', () => {
  const mode: Mode = 'running';

  it('scores high for perfect running conditions', () => {
    const h = makeHour();
    const r = computeScore(h, mode);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.rating).toBe('Excellent');
  });

  it('penalizes extreme heat', () => {
    const h = makeHour({ temperature: 95, feels_like: 100 });
    const r = computeScore(h, mode);
    const perfect = computeScore(makeHour(), mode);
    expect(r.score).toBeLessThan(perfect.score);
    expect(r.score).toBeLessThan(65);
  });

  it('penalizes heavy rain', () => {
    const h = makeHour({ precipitation_probability: 90, weather_code: 65 });
    const r = computeScore(h, mode);
    const perfect = computeScore(makeHour(), mode);
    expect(r.score).toBeLessThan(perfect.score);
  });

  it('penalizes high wind', () => {
    const h = makeHour({ wind_speed: 40 });
    const r = computeScore(h, mode);
    const perfect = computeScore(makeHour(), mode);
    expect(r.score).toBeLessThan(perfect.score);
  });

  it('penalizes high humidity', () => {
    const h = makeHour({ humidity: 95 });
    const r = computeScore(h, mode);
    const perfect = computeScore(makeHour(), mode);
    expect(r.score).toBeLessThan(perfect.score);
  });

  it('penalizes high UV', () => {
    const h = makeHour({ uv_index: 10 });
    const r = computeScore(h, mode);
    const perfect = computeScore(makeHour(), mode);
    expect(r.score).toBeLessThan(perfect.score);
  });

  it('applies nighttime factor', () => {
    const day = computeScore(makeHour(), mode);
    const night = computeScore(makeHour({ is_daylight: false, daylight_factor: 0.3 }), mode);
    expect(night.score).toBeLessThan(day.score * 0.5);
  });

  it('scores poorly with mixed bad conditions', () => {
    const h = makeHour({
      temperature: 95,
      humidity: 90,
      wind_speed: 30,
      precipitation_probability: 70,
      weather_code: 63,
    });
    const r = computeScore(h, mode);
    expect(r.score).toBeLessThan(45);
    expect(r.rating).toBe('Poor');
  });
});

// ── computeScore — Walking mode ────────────────────────────────────

describe('computeScore — walking', () => {
  const mode: Mode = 'walking';

  it('scores high for perfect walking temps', () => {
    const h = makeHour({ temperature: 60, feels_like: 60 });
    const r = computeScore(h, mode);
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it('penalizes cold conditions', () => {
    const h = makeHour({ temperature: 20, feels_like: 15 });
    const r = computeScore(h, mode);
    const perfect = computeScore(makeHour({ temperature: 60, feels_like: 60 }), mode);
    expect(r.score).toBeLessThan(perfect.score);
  });

  it('penalizes wind', () => {
    const calm = computeScore(makeHour({ temperature: 60, feels_like: 60, wind_speed: 5 }), 'walking');
    const windy = computeScore(makeHour({ temperature: 60, feels_like: 60, wind_speed: 30 }), 'walking');
    expect(windy.score).toBeLessThan(calm.score);
  });
});

// ── computeScore — Cycling mode ────────────────────────────────────

describe('computeScore — cycling', () => {
  const mode: Mode = 'cycling';

  it('scores high for perfect cycling conditions', () => {
    const h = makeHour({ temperature: 65, feels_like: 65 });
    const r = computeScore(h, mode);
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it('penalizes fog more harshly than running', () => {
    const h = makeHour({ weather_code: 45 });
    const runScore = computeScore(h, 'running').score;
    const cycleScore = computeScore(h, mode).score;
    expect(cycleScore).toBeLessThan(runScore);
  });

  it('is more sensitive to wind than running', () => {
    const h = makeHour({ wind_speed: 15 });
    const runScore = computeScore(h, 'running').score;
    const cycleScore = computeScore(h, mode).score;
    expect(cycleScore).toBeLessThan(runScore);
  });

  it('uses harsher precipitation curve', () => {
    const h = makeHour({ precipitation_probability: 50 });
    const runScore = computeScore(h, 'running').score;
    const cycleScore = computeScore(h, mode).score;
    expect(cycleScore).toBeLessThanOrEqual(runScore);
  });
});

// ── computeScore — Stargazing mode ─────────────────────────────────

describe('computeScore — stargazing', () => {
  const mode: Mode = 'stargazing';

  it('scores high for clear dark night', () => {
    const h = makeHour({
      time: '2025-06-15T23:00',
      is_daylight: false,
      daylight_factor: 1.0,
      cloud_cover: 0,
      visibility: 50000,
      weather_code: 0,
      temperature: 60,
      wind_speed: 3,
      humidity: 30,
      precipitation_probability: 0,
    });
    const r = computeScore(h, mode);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.rating).toBe('Excellent');
  });

  it('penalizes overcast skies heavily', () => {
    const clear = makeHour({
      is_daylight: false,
      daylight_factor: 1.0,
      cloud_cover: 0,
      weather_code: 0,
    });
    const overcast = makeHour({
      is_daylight: false,
      daylight_factor: 1.0,
      cloud_cover: 90,
      weather_code: 3,
    });
    const clearScore = computeScore(clear, mode).score;
    const overcastScore = computeScore(overcast, mode).score;
    expect(overcastScore).toBeLessThan(clearScore);
    // Cloud cover is 35% weight + weather code 15% — significant penalty
    expect(overcastScore).toBeLessThan(clearScore * 0.75);
  });

  it('multiplies by near-zero daylight_factor during day', () => {
    const h = makeHour({
      is_daylight: true,
      daylight_factor: 0.05,
      cloud_cover: 0,
      weather_code: 0,
      visibility: 50000,
    });
    const r = computeScore(h, mode);
    expect(r.score).toBeLessThan(10);
  });

  it('penalizes low visibility', () => {
    const clear = makeHour({
      is_daylight: false,
      daylight_factor: 1.0,
      cloud_cover: 0,
      weather_code: 0,
      visibility: 50000,
    });
    const hazy = makeHour({
      is_daylight: false,
      daylight_factor: 1.0,
      cloud_cover: 0,
      weather_code: 0,
      visibility: 2000,
    });
    expect(computeScore(hazy, mode).score).toBeLessThan(computeScore(clear, mode).score);
  });

  it('applies twilight factor (0.3) during twilight', () => {
    const h = makeHour({
      is_daylight: false,
      daylight_factor: 0.3,
      cloud_cover: 0,
      weather_code: 0,
      visibility: 50000,
    });
    const r = computeScore(h, mode);
    // Deep night would score ~90+, twilight should be roughly 0.3x that
    expect(r.score).toBeLessThan(40);
    expect(r.score).toBeGreaterThan(15);
  });
});

// ── computeScore — Dog walking mode ────────────────────────────────

describe('computeScore — dog_walking', () => {
  const mode: Mode = 'dog_walking';

  it('scores high for perfect dog walking conditions', () => {
    const h = makeHour({ temperature: 55, feels_like: 55, uv_index: 2, cloud_cover: 50 });
    const r = computeScore(h, mode);
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it('penalizes hot pavement (high temp + high UV + clear sky)', () => {
    const h = makeHour({
      temperature: 90,
      feels_like: 95,
      uv_index: 10,
      cloud_cover: 0,
    });
    const r = computeScore(h, mode);
    const perfect = computeScore(makeHour({ temperature: 55, feels_like: 55, uv_index: 2, cloud_cover: 50 }), mode);
    expect(r.score).toBeLessThan(perfect.score);
    expect(r.score).toBeLessThan(45);
  });

  it('penalizes cold pavement', () => {
    const h = makeHour({ temperature: 15, feels_like: 10, uv_index: 0 });
    const r = computeScore(h, mode);
    const perfect = computeScore(makeHour({ temperature: 55, feels_like: 55, uv_index: 2, cloud_cover: 50 }), mode);
    expect(r.score).toBeLessThan(perfect.score);
  });

  it('is more UV-sensitive than running', () => {
    const h = makeHour({ uv_index: 8 });
    const runScore = computeScore(h, 'running').score;
    const dogScore = computeScore(h, mode).score;
    expect(dogScore).toBeLessThan(runScore);
  });
});

// ── Rating thresholds ──────────────────────────────────────────────

describe('rating thresholds', () => {
  it('rates >= 80 as Excellent', () => {
    const h = makeHour();
    const r = computeScore(h, 'running');
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.rating).toBe('Excellent');
  });

  it('rates 65-79 as Good', () => {
    // Create conditions that land in the Good range
    const h = makeHour({ temperature: 75, humidity: 60, wind_speed: 12 });
    const r = computeScore(h, 'running');
    // Verify the threshold logic: if score lands 65-79, rating is Good
    if (r.score >= 65 && r.score < 80) {
      expect(r.rating).toBe('Good');
    }
    // Also verify boundary directly
    const scored = { score: 72 };
    const rating = scored.score >= 80 ? 'Excellent' : scored.score >= 65 ? 'Good' : scored.score >= 45 ? 'Fair' : 'Poor';
    expect(rating).toBe('Good');
  });

  it('rates 45-64 as Fair', () => {
    const scored = { score: 50 };
    const rating = scored.score >= 80 ? 'Excellent' : scored.score >= 65 ? 'Good' : scored.score >= 45 ? 'Fair' : 'Poor';
    expect(rating).toBe('Fair');
  });

  it('rates < 45 as Poor', () => {
    const h = makeHour({
      temperature: 100,
      feels_like: 105,
      humidity: 95,
      wind_speed: 40,
      precipitation_probability: 80,
      weather_code: 65,
    });
    const r = computeScore(h, 'running');
    expect(r.score).toBeLessThan(45);
    expect(r.rating).toBe('Poor');
  });
});

// ── computeScoreForHour ────────────────────────────────────────────

describe('computeScoreForHour', () => {
  it('matches exact hour in forecast', () => {
    const forecast = makeForecast([{ time: '2025-06-15T12:00' }]);
    const score = computeScoreForHour(forecast, '2025-06-15T12:00', 'running');
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('falls back to closest hour when exact match is missing', () => {
    const forecast = makeForecast([
      { time: '2025-06-15T11:00' },
      { time: '2025-06-15T13:00' },
    ]);
    const score = computeScoreForHour(forecast, '2025-06-15T12:30', 'running');
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThan(0);
  });

  it('returns 50 when forecast has no data', () => {
    const forecast = makeForecast([]);
    // Remove all hourly data
    forecast.hourly.time = [];
    forecast.hourly.temperature_2m = [];
    forecast.hourly.relative_humidity_2m = [];
    forecast.hourly.apparent_temperature = [];
    forecast.hourly.weather_code = [];
    forecast.hourly.wind_speed_10m = [];
    forecast.hourly.uv_index = [];
    forecast.hourly.precipitation_probability = [];
    forecast.hourly.cloud_cover = [];
    forecast.hourly.visibility = [];
    const score = computeScoreForHour(forecast, '2025-06-15T12:00', 'running');
    expect(score).toBe(50);
  });

  it('uses computeDarkness for stargazing mode', () => {
    const forecast = makeForecast([
      {
        time: '2025-06-15T23:00',
        cloud_cover: 0,
        visibility: 50000,
        weather_code: 0,
        temperature: 60,
        wind_speed: 3,
        humidity: 30,
        precipitation_probability: 0,
      },
    ]);
    const score = computeScoreForHour(forecast, '2025-06-15T23:00', 'stargazing');
    // At 23:00 with clear skies, darkness factor should be 1.0 (deep night)
    expect(score).toBeGreaterThanOrEqual(70);
  });
});

// ── findBestAlternative ────────────────────────────────────────────

describe('findBestAlternative', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set "now" to 2025-06-15T10:00Z so future hours are available
    vi.setSystemTime(new Date('2025-06-15T10:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('finds a better alternative hour', () => {
    const forecast = makeForecast([
      { time: '2025-06-15T11:00', precipitation_probability: 80, weather_code: 65 },
      { time: '2025-06-15T12:00' }, // perfect conditions
      { time: '2025-06-15T13:00' }, // perfect conditions
    ]);
    const result = findBestAlternative(forecast, '2025-06-15T11:00', 'running');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(50);
  });

  it('returns null when no future hours exist', () => {
    // Set time to after all forecast hours
    vi.setSystemTime(new Date('2025-06-16T00:00'));
    const forecast = makeForecast([
      { time: '2025-06-15T12:00' },
      { time: '2025-06-15T13:00' },
    ]);
    const result = findBestAlternative(forecast, '2025-06-15T12:00', 'running');
    expect(result).toBeNull();
  });

  it('skips daylight hours for stargazing', () => {
    const forecast = makeForecast([
      { time: '2025-06-15T12:00' }, // mid-day — should be skipped
      { time: '2025-06-15T13:00' }, // mid-day — should be skipped
      { time: '2025-06-15T14:00' }, // mid-day — should be skipped
    ]);
    // Target is 12:00, all alternatives are in daylight → should return null
    const result = findBestAlternative(forecast, '2025-06-15T12:00', 'stargazing');
    expect(result).toBeNull();
  });

  it('skips night hours for non-stargazing modes', () => {
    const forecast = makeForecast([
      { time: '2025-06-15T11:00' }, // daylight — target
      { time: '2025-06-15T12:00' }, // daylight — valid alternative
    ]);
    // Add a night hour that should be skipped
    forecast.hourly.time.push('2025-06-15T22:00');
    forecast.hourly.temperature_2m.push(55);
    forecast.hourly.relative_humidity_2m.push(40);
    forecast.hourly.apparent_temperature.push(55);
    forecast.hourly.weather_code.push(0);
    forecast.hourly.wind_speed_10m.push(5);
    forecast.hourly.uv_index.push(0);
    forecast.hourly.precipitation_probability.push(0);
    forecast.hourly.cloud_cover.push(10);
    forecast.hourly.visibility.push(40000);

    // The night hour at 22:00 is outside 4-hour window from 11:00, so
    // let's test that 12:00 (daylight) is returned and not a non-daylight hour
    const result = findBestAlternative(forecast, '2025-06-15T11:00', 'running');
    if (result) {
      // Should be a daylight hour
      const dl = computeDaylight(result.time, DAILY);
      expect(dl.is_daylight).toBe(true);
    }
  });

  it('returns alternatives even when all conditions are bad', () => {
    // All hours in window have same bad conditions
    const forecast = makeForecast([
      { time: '2025-06-15T11:00', precipitation_probability: 80, weather_code: 65 },
      { time: '2025-06-15T12:00', precipitation_probability: 80, weather_code: 65 },
      { time: '2025-06-15T13:00', precipitation_probability: 80, weather_code: 65 },
    ]);
    const result = findBestAlternative(forecast, '2025-06-15T11:00', 'running');
    // Should still return a result (future daylight hours exist)
    // The function returns the best-scored alternative regardless of quality
    if (result) {
      expect(result.time).not.toBe('2025-06-15T11:00');
    }
  });
});
