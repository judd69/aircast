/**
 * Indian AQI, computed the official CPCB way.
 *
 * Method (CPCB, "National Air Quality Index" document): for each pollutant,
 * take the prescribed averaging period — trailing 24-hour mean for PM2.5,
 * PM10, NO2 and SO2, trailing 8-hour mean for O3 and CO — then linearly
 * interpolate within that pollutant's concentration breakpoints to get a
 * sub-index. The overall AQI is the maximum sub-index, capped at 500.
 *
 * Sub-index formula:  I = (I_hi − I_lo) / (C_hi − C_lo) × (C − C_lo) + I_lo
 * Worked example from the CPCB document: PM2.5 31 → 51, 45 → 75, 60 → 100.
 *
 * Honesty note: CPCB officially requires at least 3 pollutants with one
 * being PM. This app uses 5 (PM2.5, PM10, NO2, SO2, O3) plus CO, and the
 * result is labelled "Indian AQI (CPCB method, estimated from CAMS model
 * data)" — it is NOT an official CPCB station reading.
 */

export type PollutantKey = 'pm2_5' | 'pm10' | 'no2' | 'so2' | 'o3' | 'co';

export interface Band {
  /** Lower concentration bound of this band (inclusive). */
  cLo: number;
  /** Upper concentration bound of this band (inclusive). Above the last band → 500. */
  cHi: number;
  iLo: number;
  iHi: number;
}

/**
 * CPCB breakpoints. Concentrations are µg/m³, except CO which is mg/m³
 * (the API returns CO in µg/m³ — divide by 1000 before lookup).
 */
export const CPCB_BANDS: Record<PollutantKey, Band[]> = {
  pm2_5: [
    { cLo: 0, cHi: 30, iLo: 0, iHi: 50 },
    { cLo: 31, cHi: 60, iLo: 51, iHi: 100 },
    { cLo: 61, cHi: 90, iLo: 101, iHi: 200 },
    { cLo: 91, cHi: 120, iLo: 201, iHi: 300 },
    { cLo: 121, cHi: 250, iLo: 301, iHi: 400 },
  ],
  pm10: [
    { cLo: 0, cHi: 50, iLo: 0, iHi: 50 },
    { cLo: 51, cHi: 100, iLo: 51, iHi: 100 },
    { cLo: 101, cHi: 250, iLo: 101, iHi: 200 },
    { cLo: 251, cHi: 350, iLo: 201, iHi: 300 },
    { cLo: 351, cHi: 430, iLo: 301, iHi: 400 },
  ],
  no2: [
    { cLo: 0, cHi: 40, iLo: 0, iHi: 50 },
    { cLo: 41, cHi: 80, iLo: 51, iHi: 100 },
    { cLo: 81, cHi: 180, iLo: 101, iHi: 200 },
    { cLo: 181, cHi: 280, iLo: 201, iHi: 300 },
    { cLo: 281, cHi: 400, iLo: 301, iHi: 400 },
  ],
  so2: [
    { cLo: 0, cHi: 40, iLo: 0, iHi: 50 },
    { cLo: 41, cHi: 80, iLo: 51, iHi: 100 },
    { cLo: 81, cHi: 380, iLo: 101, iHi: 200 },
    { cLo: 381, cHi: 800, iLo: 201, iHi: 300 },
    { cLo: 801, cHi: 1600, iLo: 301, iHi: 400 },
  ],
  o3: [
    { cLo: 0, cHi: 50, iLo: 0, iHi: 50 },
    { cLo: 51, cHi: 100, iLo: 51, iHi: 100 },
    { cLo: 101, cHi: 168, iLo: 101, iHi: 200 },
    { cLo: 169, cHi: 208, iLo: 201, iHi: 300 },
    { cLo: 209, cHi: 748, iLo: 301, iHi: 400 },
  ],
  co: [
    { cLo: 0, cHi: 1.0, iLo: 0, iHi: 50 },
    { cLo: 1.1, cHi: 2.0, iLo: 51, iHi: 100 },
    { cLo: 2.1, cHi: 10, iLo: 101, iHi: 200 },
    { cLo: 10.1, cHi: 17, iLo: 201, iHi: 300 },
    { cLo: 17.1, cHi: 34, iLo: 301, iHi: 400 },
  ],
};

/** Sub-index for one pollutant at a given (averaged) concentration. */
export function subIndex(key: PollutantKey, concentration: number): number {
  const bands = CPCB_BANDS[key];
  for (const band of bands) {
    if (concentration <= band.cHi) {
      const value =
        ((band.iHi - band.iLo) / (band.cHi - band.cLo)) *
          (concentration - band.cLo) +
        band.iLo;
      return Math.round(value);
    }
  }
  // Above the top band: CPCB assigns the maximum, 500.
  return 500;
}

export interface Category {
  name: string;
  color: string;
  /** CPCB health impact wording, paraphrased. */
  impact: string;
}

export const CATEGORIES: Category[] = [
  { name: 'Good', color: '#22C55E', impact: 'Minimal impact.' },
  {
    name: 'Satisfactory',
    color: '#84CC16',
    impact: 'Minor breathing discomfort to sensitive people.',
  },
  {
    name: 'Moderate',
    color: '#EAB308',
    impact: 'Breathing discomfort to people with lung or heart disease.',
  },
  {
    name: 'Poor',
    color: '#F97316',
    impact: 'Breathing discomfort to most people on prolonged exposure.',
  },
  {
    name: 'Very Poor',
    color: '#EF4444',
    impact: 'Respiratory illness on prolonged exposure.',
  },
  {
    name: 'Severe',
    color: '#7F1D1D',
    impact: 'Serious effects even on healthy people.',
  },
];

export function categoryFor(aqi: number): Category {
  if (aqi <= 50) return CATEGORIES[0];
  if (aqi <= 100) return CATEGORIES[1];
  if (aqi <= 200) return CATEGORIES[2];
  if (aqi <= 300) return CATEGORIES[3];
  if (aqi <= 400) return CATEGORIES[4];
  return CATEGORIES[5];
}

export interface HealthAdvice {
  exercise: string;
  mask: string;
  windows: string;
  sensitive: string;
}

const ADVICE: Record<string, HealthAdvice> = {
  Good: {
    exercise: 'Great day to exercise outdoors — go for it.',
    mask: 'No mask needed.',
    windows: 'Open the windows, the air is fine.',
    sensitive: 'Minimal impact — everyone can enjoy normal outdoor activity.',
  },
  Satisfactory: {
    exercise: 'Fine for most outdoor exercise.',
    mask: 'No mask needed for most people.',
    windows: 'Windows can stay open.',
    sensitive: 'Minor breathing discomfort possible for sensitive people.',
  },
  Moderate: {
    exercise: 'Keep outdoor exercise light and short.',
    mask: 'Consider a mask if you will be out for a while.',
    windows: 'Close windows during peak traffic hours.',
    sensitive:
      'Breathing discomfort likely for people with lung or heart disease.',
  },
  Poor: {
    exercise: 'Skip the run — exercise indoors today.',
    mask: 'Wear an N95 mask outdoors.',
    windows: 'Keep windows closed.',
    sensitive: 'Breathing discomfort for most people on prolonged exposure.',
  },
  'Very Poor': {
    exercise: 'Avoid outdoor exercise entirely.',
    mask: 'N95 mask essential outdoors.',
    windows: 'Keep windows shut; run an air purifier if you have one.',
    sensitive:
      'Respiratory illness possible on prolonged exposure — sensitive groups should stay indoors.',
  },
  Severe: {
    exercise: 'Stay indoors — no outdoor exercise.',
    mask: 'N95 mask essential even for short trips outside.',
    windows: 'Seal the windows; run a purifier.',
    sensitive: 'Serious health effects even in healthy people.',
  },
};

export function healthAdvice(aqi: number): HealthAdvice {
  return ADVICE[categoryFor(aqi).name];
}

/** Mean of the non-null values in `values`, or null when there are none. */
export function meanOf(values: (number | null | undefined)[]): number | null {
  const present = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/**
 * Trailing mean of the `hours` hourly values ending at `endIndex`
 * (inclusive). Skips nulls — e.g. the trailing 24h mean for PM2.5, or the
 * trailing 8h mean for O3 and CO.
 */
export function trailingMean(
  values: (number | null | undefined)[],
  endIndex: number,
  hours: number,
): number | null {
  const start = Math.max(0, endIndex - hours + 1);
  return meanOf(values.slice(start, endIndex + 1));
}

export interface HourlyData {
  time: string[];
  pm2_5: (number | null)[];
  pm10: (number | null)[];
  us_aqi: (number | null)[];
  nitrogen_dioxide: (number | null)[];
  sulphur_dioxide: (number | null)[];
  ozone: (number | null)[];
  carbon_monoxide: (number | null)[];
}

export interface CurrentData {
  time: string;
  pm2_5: number | null;
  pm10: number | null;
  us_aqi: number | null;
  european_aqi: number | null;
  nitrogen_dioxide: number | null;
  sulphur_dioxide: number | null;
  ozone: number | null;
  carbon_monoxide: number | null;
}

export interface SubIndexEntry {
  key: PollutantKey;
  label: string;
  /** Averaged concentration used for the sub-index. */
  concentration: number;
  unit: string;
  subIndex: number;
}

export interface IndianAqiResult {
  aqi: number;
  category: Category;
  /** Pollutant driving the overall AQI (highest sub-index). */
  dominant: string;
  subIndices: SubIndexEntry[];
  /** Trailing means used, for display. */
  means: Record<string, number>;
  currentIndex: number;
}

export const POLLUTANT_LABELS: Record<PollutantKey, string> = {
  pm2_5: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO₂',
  so2: 'SO₂',
  o3: 'O₃',
  co: 'CO',
};

/** Averaging window (hours) per pollutant, per the CPCB method. */
const AVERAGING_HOURS: Record<PollutantKey, number> = {
  pm2_5: 24,
  pm10: 24,
  no2: 24,
  so2: 24,
  o3: 8,
  co: 8,
};

/** Hourly-data key per pollutant. CO is converted µg/m³ → mg/m³. */
export type NumericHourlyKey = Exclude<keyof HourlyData, 'time' | 'us_aqi'>;
const HOURLY_KEY: Record<PollutantKey, NumericHourlyKey> = {
  pm2_5: 'pm2_5',
  pm10: 'pm10',
  no2: 'nitrogen_dioxide',
  so2: 'sulphur_dioxide',
  o3: 'ozone',
  co: 'carbon_monoxide',
};

/**
 * Index of the hourly row for the current observation. Matches the hour of
 * `currentTime` (e.g. current "2026-11-07T07:30" → hourly "2026-11-07T07:00").
 * Falls back to the latest hourly row at or before that hour.
 */
export function currentHourIndex(hourly: HourlyData, currentTime: string): number {
  const hour = currentTime.slice(0, 13);
  const exact = hourly.time.findIndex((t) => t.slice(0, 13) === hour);
  if (exact >= 0) return exact;
  let best = -1;
  for (let i = 0; i < hourly.time.length; i++) {
    if (hourly.time[i].slice(0, 13) <= hour) best = i;
    else break;
  }
  return best;
}

/**
 * Compute the Indian AQI (CPCB method) from hourly model data, anchored at
 * the current hour. Returns null when no pollutant has usable data.
 */
export function computeIndianAqi(
  hourly: HourlyData,
  currentTime: string,
): IndianAqiResult | null {
  const idx = currentHourIndex(hourly, currentTime);
  if (idx < 0) return null;

  const subIndices: SubIndexEntry[] = [];
  const means: Record<string, number> = {};

  (Object.keys(AVERAGING_HOURS) as PollutantKey[]).forEach((key) => {
    const raw = trailingMean(
      hourly[HOURLY_KEY[key]],
      idx,
      AVERAGING_HOURS[key],
    );
    if (raw === null) return;
    const concentration = key === 'co' ? raw / 1000 : raw;
    const entry: SubIndexEntry = {
      key,
      label: POLLUTANT_LABELS[key],
      concentration,
      unit: key === 'co' ? 'mg/m³' : 'µg/m³',
      subIndex: subIndex(key, concentration),
    };
    subIndices.push(entry);
    means[key] = concentration;
  });

  if (subIndices.length === 0) return null;

  const dominant = subIndices.reduce((a, b) =>
    b.subIndex > a.subIndex ? b : a,
  );
  const aqi = Math.min(500, dominant.subIndex);
  return {
    aqi,
    category: categoryFor(aqi),
    dominant: dominant.label,
    subIndices,
    means,
    currentIndex: idx,
  };
}

export interface DayForecast {
  /** ISO date, e.g. "2026-11-08". */
  date: string;
  /** Short label, e.g. "Sat 8 Nov". */
  label: string;
  /** Indian AQI computed from that day's mean concentrations (estimated). */
  aqi: number;
  category: Category;
  /** Highest hourly US AQI that day. */
  worstUsAqi: number | null;
  /** Daily mean PM2.5, for display. */
  pm25Mean: number | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Bucket hourly data into per-day forecasts, starting from `fromDate`
 * (inclusive, ISO "YYYY-MM-DD") for up to `days` days. The daily Indian AQI
 * is computed from each day's mean concentrations — an estimate, labelled
 * as such in the UI — and the worst hour's US AQI is reported alongside.
 */
export function bucketDailyForecast(
  hourly: HourlyData,
  fromDate: string,
  days = 5,
): DayForecast[] {
  const byDate = new Map<string, number[]>();
  hourly.time.forEach((t, i) => {
    const date = t.slice(0, 10);
    if (date < fromDate) return;
    const list = byDate.get(date) ?? [];
    list.push(i);
    byDate.set(date, list);
  });

  const out: DayForecast[] = [];
  for (const date of [...byDate.keys()].sort().slice(0, days)) {
    const idxs = byDate.get(date) as number[];
    const dailyMeans: Partial<Record<PollutantKey, number>> = {};
    (Object.keys(HOURLY_KEY) as PollutantKey[]).forEach((key) => {
      const mean = meanOf(idxs.map((i) => hourly[HOURLY_KEY[key]][i]));
      if (mean !== null) {
        dailyMeans[key] = key === 'co' ? mean / 1000 : mean;
      }
    });
    const subs = (Object.keys(dailyMeans) as PollutantKey[]).map((key) =>
      subIndex(key, dailyMeans[key] as number),
    );
    if (subs.length === 0) continue;
    const aqi = Math.min(500, Math.max(...subs));
    const usValues = idxs
      .map((i) => hourly.us_aqi[i])
      .filter((v): v is number => typeof v === 'number');
    const d = new Date(`${date}T12:00:00`);
    out.push({
      date,
      label: `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`,
      aqi,
      category: categoryFor(aqi),
      worstUsAqi: usValues.length > 0 ? Math.max(...usValues) : null,
      pm25Mean: dailyMeans.pm2_5 ?? null,
    });
  }
  return out;
}

export interface CityRef {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

/** Shareable URL for a city: `?city=Delhi&lat=28.6139&lon=77.209`. */
export function buildShareUrl(city: CityRef, base = ''): string {
  const params = new URLSearchParams({
    city: city.name,
    lat: String(city.latitude),
    lon: String(city.longitude),
  });
  return `${base}?${params.toString()}`;
}

/** Parse a `?city=…&lat=…&lon=…` query string back into a city. */
export function parseShareUrl(search: string): CityRef | null {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  const name = params.get('city');
  const latRaw = params.get('lat');
  const lonRaw = params.get('lon');
  if (!name || latRaw === null || lonRaw === null) return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { name, latitude: lat, longitude: lon };
}
