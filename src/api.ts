/**
 * Open-Meteo API access — geocoding for city search, air quality for the
 * data. Both are free and keyless. The air-quality API sometimes returns a
 * single object and sometimes an array (when several locations were asked
 * for in one call); both shapes are handled here.
 */
import type { CurrentData, HourlyData } from './aqi';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export interface GeoCity {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

export async function searchCities(query: string): Promise<GeoCity[]> {
  const url =
    `${GEOCODING_URL}?name=${encodeURIComponent(query)}` +
    '&count=6&language=en&format=json';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Geocoding request failed (HTTP ${res.status})`);
  }
  const data: unknown = await res.json();
  if (!data || typeof data !== 'object' || !Array.isArray((data as { results?: unknown }).results)) {
    return [];
  }
  const results = (data as { results: unknown[] }).results;
  return results
    .filter(
      (r): r is Record<string, unknown> =>
        !!r && typeof r === 'object',
    )
    .map((r) => ({
      name: String(r.name ?? ''),
      country: typeof r.country === 'string' ? r.country : undefined,
      admin1: typeof r.admin1 === 'string' ? r.admin1 : undefined,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
    }))
    .filter((c) => c.name && Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
}

export interface AirQualityData {
  latitude: number;
  longitude: number;
  timezone: string;
  current: CurrentData;
  hourly: HourlyData;
}

const CURRENT_FIELDS =
  'pm2_5,pm10,us_aqi,european_aqi,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide';
const HOURLY_FIELDS =
  'pm2_5,pm10,us_aqi,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide';

/** Accept a raw API payload — single object or array — and normalise it. */
export function normalizeAirQuality(data: unknown): AirQualityData {
  const obj = Array.isArray(data) ? data[0] : data;
  if (!obj || typeof obj !== 'object') {
    throw new Error('Unexpected air-quality response from Open-Meteo');
  }
  const o = obj as Record<string, unknown>;
  const current = o.current as Record<string, unknown> | undefined;
  const hourly = o.hourly as Record<string, unknown> | undefined;
  if (!current || !hourly || !Array.isArray(hourly.time)) {
    throw new Error('Air-quality response is missing current/hourly data');
  }
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const arr = (v: unknown): (number | null)[] =>
    Array.isArray(v) ? v.map((x) => num(x)) : [];
  return {
    latitude: Number(o.latitude),
    longitude: Number(o.longitude),
    timezone: typeof o.timezone === 'string' ? o.timezone : 'auto',
    current: {
      time: String(current.time ?? ''),
      pm2_5: num(current.pm2_5),
      pm10: num(current.pm10),
      us_aqi: num(current.us_aqi),
      european_aqi: num(current.european_aqi),
      nitrogen_dioxide: num(current.nitrogen_dioxide),
      sulphur_dioxide: num(current.sulphur_dioxide),
      ozone: num(current.ozone),
      carbon_monoxide: num(current.carbon_monoxide),
    },
    hourly: {
      time: (hourly.time as unknown[]).map((t) => String(t)),
      pm2_5: arr(hourly.pm2_5),
      pm10: arr(hourly.pm10),
      us_aqi: arr(hourly.us_aqi),
      nitrogen_dioxide: arr(hourly.nitrogen_dioxide),
      sulphur_dioxide: arr(hourly.sulphur_dioxide),
      ozone: arr(hourly.ozone),
      carbon_monoxide: arr(hourly.carbon_monoxide),
    },
  };
}

export async function fetchAirQuality(
  latitude: number,
  longitude: number,
): Promise<AirQualityData> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: CURRENT_FIELDS,
    hourly: HOURLY_FIELDS,
    past_days: '1',
    forecast_days: '5',
    timezone: 'auto',
  });
  const res = await fetch(`${AIR_QUALITY_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(
      `Air-quality request failed (HTTP ${res.status}) — Open-Meteo may be unreachable`,
    );
  }
  return normalizeAirQuality(await res.json());
}
