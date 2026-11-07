import { describe, expect, it } from 'vitest';
import {
  bucketDailyForecast,
  buildShareUrl,
  categoryFor,
  computeIndianAqi,
  currentHourIndex,
  healthAdvice,
  meanOf,
  parseShareUrl,
  subIndex,
  trailingMean,
  type HourlyData,
} from '../src/aqi';
import snapshot from '../examples/delhi-mumbai-aqi.json';

describe('CPCB sub-index — worked example from the official document', () => {
  it('PM2.5 31 → 51, 45 → 75, 60 → 100', () => {
    expect(subIndex('pm2_5', 31)).toBe(51);
    expect(subIndex('pm2_5', 45)).toBe(75);
    expect(subIndex('pm2_5', 60)).toBe(100);
  });
});

describe('CPCB sub-index — every band edge', () => {
  it('PM2.5 edges', () => {
    expect(subIndex('pm2_5', 0)).toBe(0);
    expect(subIndex('pm2_5', 30)).toBe(50);
    expect(subIndex('pm2_5', 61)).toBe(101);
    expect(subIndex('pm2_5', 90)).toBe(200);
    expect(subIndex('pm2_5', 91)).toBe(201);
    expect(subIndex('pm2_5', 120)).toBe(300);
    expect(subIndex('pm2_5', 121)).toBe(301);
    expect(subIndex('pm2_5', 250)).toBe(400);
  });

  it('PM10 edges', () => {
    expect(subIndex('pm10', 0)).toBe(0);
    expect(subIndex('pm10', 50)).toBe(50);
    expect(subIndex('pm10', 51)).toBe(51);
    expect(subIndex('pm10', 100)).toBe(100);
    expect(subIndex('pm10', 101)).toBe(101);
    expect(subIndex('pm10', 250)).toBe(200);
    expect(subIndex('pm10', 251)).toBe(201);
    expect(subIndex('pm10', 350)).toBe(300);
    expect(subIndex('pm10', 351)).toBe(301);
    expect(subIndex('pm10', 430)).toBe(400);
  });

  it('NO2 edges', () => {
    expect(subIndex('no2', 40)).toBe(50);
    expect(subIndex('no2', 41)).toBe(51);
    expect(subIndex('no2', 80)).toBe(100);
    expect(subIndex('no2', 81)).toBe(101);
    expect(subIndex('no2', 180)).toBe(200);
    expect(subIndex('no2', 181)).toBe(201);
    expect(subIndex('no2', 280)).toBe(300);
    expect(subIndex('no2', 281)).toBe(301);
    expect(subIndex('no2', 400)).toBe(400);
  });

  it('SO2 edges', () => {
    expect(subIndex('so2', 40)).toBe(50);
    expect(subIndex('so2', 41)).toBe(51);
    expect(subIndex('so2', 80)).toBe(100);
    expect(subIndex('so2', 81)).toBe(101);
    expect(subIndex('so2', 380)).toBe(200);
    expect(subIndex('so2', 381)).toBe(201);
    expect(subIndex('so2', 800)).toBe(300);
    expect(subIndex('so2', 801)).toBe(301);
    expect(subIndex('so2', 1600)).toBe(400);
  });

  it('O3 edges', () => {
    expect(subIndex('o3', 50)).toBe(50);
    expect(subIndex('o3', 51)).toBe(51);
    expect(subIndex('o3', 100)).toBe(100);
    expect(subIndex('o3', 101)).toBe(101);
    expect(subIndex('o3', 168)).toBe(200);
    expect(subIndex('o3', 169)).toBe(201);
    expect(subIndex('o3', 208)).toBe(300);
    expect(subIndex('o3', 209)).toBe(301);
    expect(subIndex('o3', 748)).toBe(400);
  });

  it('CO edges (mg/m³)', () => {
    expect(subIndex('co', 0)).toBe(0);
    expect(subIndex('co', 1.0)).toBe(50);
    expect(subIndex('co', 1.1)).toBe(51);
    expect(subIndex('co', 2.0)).toBe(100);
    expect(subIndex('co', 2.1)).toBe(101);
    expect(subIndex('co', 10)).toBe(200);
    expect(subIndex('co', 10.1)).toBe(201);
    expect(subIndex('co', 17)).toBe(300);
    expect(subIndex('co', 17.1)).toBe(301);
    expect(subIndex('co', 34)).toBe(400);
  });
});

describe('CPCB sub-index — cap at 500 above the top band', () => {
  it('caps every pollutant', () => {
    expect(subIndex('pm2_5', 251)).toBe(500);
    expect(subIndex('pm2_5', 1000)).toBe(500);
    expect(subIndex('pm10', 431)).toBe(500);
    expect(subIndex('no2', 401)).toBe(500);
    expect(subIndex('so2', 1601)).toBe(500);
    expect(subIndex('o3', 749)).toBe(500);
    expect(subIndex('co', 34.1)).toBe(500);
  });
});

describe('categories', () => {
  it('boundaries 50/51, 100/101, 200/201, 300/301, 400/401', () => {
    expect(categoryFor(0).name).toBe('Good');
    expect(categoryFor(50).name).toBe('Good');
    expect(categoryFor(51).name).toBe('Satisfactory');
    expect(categoryFor(100).name).toBe('Satisfactory');
    expect(categoryFor(101).name).toBe('Moderate');
    expect(categoryFor(200).name).toBe('Moderate');
    expect(categoryFor(201).name).toBe('Poor');
    expect(categoryFor(300).name).toBe('Poor');
    expect(categoryFor(301).name).toBe('Very Poor');
    expect(categoryFor(400).name).toBe('Very Poor');
    expect(categoryFor(401).name).toBe('Severe');
    expect(categoryFor(500).name).toBe('Severe');
  });
});

describe('health advice', () => {
  it('maps each band to distinct, non-empty guidance', () => {
    const bands = [25, 75, 150, 250, 350, 450];
    const seen = new Set<string>();
    for (const aqi of bands) {
      const advice = healthAdvice(aqi);
      expect(advice.exercise.length).toBeGreaterThan(0);
      expect(advice.mask.length).toBeGreaterThan(0);
      expect(advice.windows.length).toBeGreaterThan(0);
      expect(advice.sensitive.length).toBeGreaterThan(0);
      seen.add(advice.exercise);
    }
    expect(seen.size).toBe(bands.length);
  });

  it('severe advice tells people to stay indoors', () => {
    expect(healthAdvice(450).exercise).toMatch(/stay indoors/i);
    expect(healthAdvice(450).mask).toMatch(/N95/);
  });

  it('good advice needs no mask', () => {
    expect(healthAdvice(25).mask).toMatch(/no mask/i);
  });
});

describe('trailing means', () => {
  it('meanOf skips nulls and returns null when empty', () => {
    expect(meanOf([1, 2, 3])).toBe(2);
    expect(meanOf([null, 5])).toBe(5);
    expect(meanOf([null, null])).toBeNull();
    expect(meanOf([])).toBeNull();
  });

  it('trailingMean takes the last N values ending at the index', () => {
    expect(trailingMean([10, 20, 30, 40], 3, 2)).toBe(35);
    expect(trailingMean([10, 20, 30, 40], 3, 4)).toBe(25);
    expect(trailingMean([10, null, 30, 40], 3, 2)).toBe(35);
    expect(trailingMean([10, 20, 30, 40], 1, 4)).toBe(15);
  });
});

function syntheticHourly(
  days: { date: string; pm25: number; usAqi: number }[],
): HourlyData {
  const time: string[] = [];
  const pm2_5: (number | null)[] = [];
  const pm10: (number | null)[] = [];
  const us_aqi: (number | null)[] = [];
  const nitrogen_dioxide: (number | null)[] = [];
  const sulphur_dioxide: (number | null)[] = [];
  const ozone: (number | null)[] = [];
  const carbon_monoxide: (number | null)[] = [];
  for (const d of days) {
    for (let h = 0; h < 24; h++) {
      time.push(`${d.date}T${String(h).padStart(2, '0')}:00`);
      pm2_5.push(d.pm25);
      pm10.push(100);
      us_aqi.push(d.usAqi);
      nitrogen_dioxide.push(40);
      sulphur_dioxide.push(40);
      ozone.push(50);
      carbon_monoxide.push(1000);
    }
  }
  return { time, pm2_5, pm10, us_aqi, nitrogen_dioxide, sulphur_dioxide, ozone, carbon_monoxide };
}

describe('daily forecast bucketing', () => {
  it('groups by date, uses daily means, reports the worst hour US AQI', () => {
    const hourly = syntheticHourly([
      { date: '2026-11-07', pm25: 60, usAqi: 120 },
      { date: '2026-11-08', pm25: 120, usAqi: 250 },
    ]);
    const days = bucketDailyForecast(hourly, '2026-11-07', 5);
    expect(days).toHaveLength(2);
    expect(days[0].date).toBe('2026-11-07');
    expect(days[0].label).toBe('Sat 7 Nov');
    // Daily-mean PM2.5 60 → sub-index 100; PM10 100 → 100; others ≤ 50.
    expect(days[0].aqi).toBe(100);
    expect(days[0].category.name).toBe('Satisfactory');
    expect(days[0].worstUsAqi).toBe(120);
    expect(days[0].pm25Mean).toBe(60);
    // Day 2: PM2.5 120 → sub-index 300.
    expect(days[1].aqi).toBe(300);
    expect(days[1].category.name).toBe('Poor');
    expect(days[1].worstUsAqi).toBe(250);
  });

  it('skips days before the start date and caps at the requested count', () => {
    const hourly = syntheticHourly([
      { date: '2026-11-06', pm25: 60, usAqi: 100 },
      { date: '2026-11-07', pm25: 60, usAqi: 100 },
      { date: '2026-11-08', pm25: 60, usAqi: 100 },
    ]);
    const days = bucketDailyForecast(hourly, '2026-11-07', 1);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-11-07');
  });
});

describe('share URL', () => {
  it('round-trips a city', () => {
    const city = { name: 'Delhi', latitude: 28.6139, longitude: 77.209 };
    const url = buildShareUrl(city);
    expect(url).toBe('?city=Delhi&lat=28.6139&lon=77.209');
    expect(parseShareUrl(url)).toEqual(city);
  });

  it('rejects incomplete queries', () => {
    expect(parseShareUrl('')).toBeNull();
    expect(parseShareUrl('?city=Delhi')).toBeNull();
    expect(parseShareUrl('?lat=28.6&lon=77.2')).toBeNull();
  });
});

describe('saved snapshot — real Open-Meteo data, 2026-11-07 07:30 IST', () => {
  it('anchors the current hour correctly', () => {
    const delhi = snapshot[0] as unknown as {
      hourly: HourlyData;
      current: { time: string };
    };
    expect(currentHourIndex(delhi.hourly, delhi.current.time)).toBe(31);
  });

  it('Delhi Indian AQI is 249 (Poor), driven by PM2.5', () => {
    const delhi = snapshot[0] as unknown as {
      hourly: HourlyData;
      current: { time: string };
    };
    const result = computeIndianAqi(delhi.hourly, delhi.current.time);
    expect(result).not.toBeNull();
    expect(result?.aqi).toBe(249);
    expect(result?.category.name).toBe('Poor');
    expect(result?.dominant).toBe('PM2.5');
    const subs = Object.fromEntries(
      (result?.subIndices ?? []).map((s) => [s.key, s.subIndex]),
    );
    expect(subs).toEqual({
      pm2_5: 249,
      pm10: 171,
      no2: 36,
      so2: 30,
      o3: 58,
      co: 33,
    });
  });

  it('Mumbai Indian AQI is 84 (Satisfactory), driven by PM2.5', () => {
    const mumbai = snapshot[1] as unknown as {
      hourly: HourlyData;
      current: { time: string };
    };
    const result = computeIndianAqi(mumbai.hourly, mumbai.current.time);
    expect(result).not.toBeNull();
    expect(result?.aqi).toBe(84);
    expect(result?.category.name).toBe('Satisfactory');
    expect(result?.dominant).toBe('PM2.5');
    const subs = Object.fromEntries(
      (result?.subIndices ?? []).map((s) => [s.key, s.subIndex]),
    );
    expect(subs).toEqual({
      pm2_5: 84,
      pm10: 57,
      no2: 37,
      so2: 25,
      o3: 72,
      co: 17,
    });
  });

  it('Delhi 5-day forecast buckets from 7 Nov with the right worst US AQI', () => {
    const delhi = snapshot[0] as unknown as { hourly: HourlyData };
    const days = bucketDailyForecast(delhi.hourly, '2026-11-07', 5);
    expect(days).toHaveLength(5);
    expect(days[0].date).toBe('2026-11-07');
    expect(days[0].worstUsAqi).toBe(199);
    expect(days[4].date).toBe('2026-11-11');
    for (const d of days) {
      expect(d.aqi).toBeGreaterThan(100);
      expect(d.aqi).toBeLessThanOrEqual(500);
    }
  });
});
