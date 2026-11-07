import './style.css';
import {
  bucketDailyForecast,
  buildShareUrl,
  categoryFor,
  computeIndianAqi,
  healthAdvice,
  parseShareUrl,
  type CityRef,
  type IndianAqiResult,
  type PollutantKey,
} from './aqi';
import { fetchAirQuality, searchCities, type AirQualityData, type GeoCity } from './api';

const PRESETS: CityRef[] = [
  { name: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.209 },
  { name: 'Mumbai', country: 'India', latitude: 19.076, longitude: 72.8777 },
  { name: 'Bengaluru', country: 'India', latitude: 12.9716, longitude: 77.5946 },
  { name: 'Kolkata', country: 'India', latitude: 22.5726, longitude: 88.3639 },
  { name: 'Chennai', country: 'India', latitude: 13.0827, longitude: 80.2707 },
  { name: 'Pune', country: 'India', latitude: 18.5204, longitude: 73.8567 },
];

const LAST_CITY_KEY = 'aircast:last-city';
const COMPARE_KEY = 'aircast:compare';
const REFRESH_MS = 30 * 60 * 1000; // auto-refresh every 30 minutes

interface CompareEntry {
  city: CityRef;
  aqi: number | null;
  loading: boolean;
}

interface State {
  city: CityRef | null;
  data: AirQualityData | null;
  result: IndianAqiResult | null;
  compare: CompareEntry[];
}

const state: State = {
  city: null,
  data: null,
  result: null,
  compare: loadCompare(),
};

const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(decimals);
}

function loadCompare(): CompareEntry[] {
  try {
    const raw = localStorage.getItem(COMPARE_KEY);
    if (!raw) return [];
    const cities = JSON.parse(raw) as CityRef[];
    return cities.slice(0, 3).map((city) => ({ city, aqi: null, loading: true }));
  } catch {
    return [];
  }
}

function persistCompare(): void {
  try {
    localStorage.setItem(
      COMPARE_KEY,
      JSON.stringify(state.compare.map((c) => c.city)),
    );
  } catch {
    /* storage blocked — compare just won't persist */
  }
}

function showBanner(message: string): void {
  const banner = $('#banner');
  banner.textContent = message;
  banner.hidden = false;
}

function hideBanner(): void {
  $('#banner').hidden = true;
}

/* ---------- chips ---------- */

function renderChips(): void {
  $('#chips').innerHTML = PRESETS.map(
    (c) =>
      `<button class="chip${state.city?.name === c.name ? ' active' : ''}" data-city="${esc(c.name)}" type="button">${esc(c.name)}</button>`,
  ).join('');
  document.querySelectorAll('#chips .chip').forEach((el) => {
    el.addEventListener('click', () => {
      const preset = PRESETS.find((c) => c.name === el.getAttribute('data-city'));
      if (preset) void loadCity(preset);
    });
  });
}

/* ---------- city loading ---------- */

async function loadCity(city: CityRef): Promise<void> {
  state.city = city;
  renderChips();
  $('#dashboard').hidden = true;
  $('#empty-state').hidden = true;
  hideBanner();
  $('#city-name').textContent = city.name;
  $('#dashboard').hidden = false;
  try {
    localStorage.setItem(LAST_CITY_KEY, JSON.stringify(city));
  } catch {
    /* ignore */
  }
  history.replaceState(null, '', buildShareUrl(city));

  let data: AirQualityData;
  try {
    data = await fetchAirQuality(city.latitude, city.longitude);
  } catch (err) {
    showBanner(
      `Couldn't reach Open-Meteo for ${city.name} — ${
        err instanceof Error ? err.message : 'network error'
      }. Check your connection and try Refresh. No data is shown because no real reading is available.`,
    );
    return;
  }
  state.data = data;
  const result = computeIndianAqi(data.hourly, data.current.time);
  if (!result) {
    showBanner(
      `Open-Meteo answered for ${city.name}, but the response had no usable pollutant data — nothing to show, and no sample values will be invented.`,
    );
    return;
  }
  state.result = result;
  renderDashboard(city, data, result);
  void refreshCompare();
}

function renderDashboard(
  city: CityRef,
  data: AirQualityData,
  result: IndianAqiResult,
): void {
  document.title = `${result.aqi} · ${city.name} — AirCast`;
  $('#city-name').textContent = city.name;
  $('#city-meta').textContent = [
    city.admin1 ?? city.country ?? '',
    `${data.latitude.toFixed(2)}°, ${data.longitude.toFixed(2)}°`,
    data.timezone,
  ]
    .filter(Boolean)
    .join(' · ');

  const num = $('#aqi-number');
  num.textContent = String(result.aqi);
  const chip = $('#aqi-category');
  chip.textContent = result.category.name;
  chip.style.background = result.category.color;
  $('#dominant').textContent = result.dominant;

  // Gauge marker glides with a short spring (tiny overshoot) via CSS.
  const marker = $('#gauge-marker');
  marker.style.left = '0%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      marker.style.left = `${(result.aqi / 500) * 100}%`;
    });
  });

  $('#us-aqi').textContent =
    data.current.us_aqi === null ? '—' : String(data.current.us_aqi);
  $('#eu-aqi').textContent =
    data.current.european_aqi === null ? '—' : String(data.current.european_aqi);
  const updated = new Date(data.current.time);
  $('#updated-at').textContent = Number.isNaN(updated.getTime())
    ? data.current.time
    : updated.toLocaleString([], {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });

  const advice = healthAdvice(result.aqi);
  $('#advice-impact').textContent =
    `Indian AQI ${result.aqi} is ${result.category.name}. ${result.category.impact}`;
  $('#advice-exercise').textContent = advice.exercise;
  $('#advice-mask').textContent = advice.mask;
  $('#advice-windows').textContent = advice.windows;
  $('#advice-sensitive').textContent = advice.sensitive;

  renderPollutants(data, result);
  renderChart(data, result);
  renderForecast(data);
}

const CURRENT_VALUE: Record<PollutantKey, (d: AirQualityData) => number | null> = {
  pm2_5: (d) => d.current.pm2_5,
  pm10: (d) => d.current.pm10,
  no2: (d) => d.current.nitrogen_dioxide,
  so2: (d) => d.current.sulphur_dioxide,
  o3: (d) => d.current.ozone,
  co: (d) => (d.current.carbon_monoxide === null ? null : d.current.carbon_monoxide / 1000),
};

function renderPollutants(data: AirQualityData, result: IndianAqiResult): void {
  const grid = $('#pollutant-grid');
  grid.innerHTML = result.subIndices
    .map((entry) => {
      const current = CURRENT_VALUE[entry.key](data);
      const cat = categoryFor(entry.subIndex);
      const window = entry.key === 'o3' || entry.key === 'co' ? '8h mean' : '24h mean';
      return `<article class="pollutant-card" style="border-top-color: ${cat.color}">
        <div class="p-label">${esc(entry.label)}</div>
        <div class="p-value">${fmt(current, entry.key === 'co' ? 2 : 1)} <span class="p-unit">${esc(entry.unit)}</span></div>
        <div class="p-sub"><strong>${entry.subIndex}</strong> sub-index · ${window} ${fmt(entry.concentration, entry.key === 'co' ? 2 : 1)} ${esc(entry.unit)} · ${cat.name}</div>
      </article>`;
    })
    .join('');
}

function renderChart(data: AirQualityData, result: IndianAqiResult): void {
  const wrap = $('#chart-wrap');
  const idx = result.currentIndex;
  const values: number[] = [];
  const times: string[] = [];
  for (let i = Math.max(0, idx - 23); i <= idx; i++) {
    const v = data.hourly.pm2_5[i];
    if (typeof v === 'number') {
      values.push(v);
      times.push(data.hourly.time[i]);
    }
  }
  if (values.length < 2) {
    wrap.innerHTML = '<p class="muted">Not enough hourly data to draw the last 24 hours.</p>';
    return;
  }
  const W = 640;
  const H = 200;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 26;
  const max = Math.max(...values, 10);
  const x = (i: number) => padL + (i / (values.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)},${(H - padB).toFixed(1)} L${x(0).toFixed(1)},${(H - padB).toFixed(1)} Z`;
  const gridLines = [0, 0.5, 1]
    .map(
      (f) =>
        `<line class="chart-grid" x1="${padL}" x2="${W - padR}" y1="${(padT + (1 - f) * (H - padT - padB)).toFixed(1)}" y2="${(padT + (1 - f) * (H - padT - padB)).toFixed(1)}" />` +
        `<text class="chart-label" x="4" y="${(padT + (1 - f) * (H - padT - padB) + 4).toFixed(1)}">${Math.round(max * f)}</text>`,
    )
    .join('');
  const labels = values
    .map((_, i) => {
      if (i % 6 !== 0 && i !== values.length - 1) return '';
      const t = times[i]?.slice(11, 16) ?? '';
      return `<text class="chart-label" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(t)}</text>`;
    })
    .join('');
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="PM2.5 over the last 24 hours, ranging ${fmt(Math.min(...values), 0)} to ${fmt(max, 0)} µg/m³">
    ${gridLines}
    <path class="chart-area" d="${area}" />
    <path class="chart-line" pathLength="1" d="${line}" />
    ${labels}
  </svg>
  <p class="muted" style="margin: 10px 0 0; font-size: 13px;">PM2.5 µg/m³, last 24 hours up to ${esc(times[times.length - 1]?.slice(0, 16).replace('T', ' ') ?? '')}. Peak ${fmt(max, 0)} µg/m³.</p>`;
  // Draw-on-load animation: the line draws itself once the class lands.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => wrap.classList.add('drawn'));
  });
}

function renderForecast(data: AirQualityData): void {
  const today = data.current.time.slice(0, 10);
  const days = bucketDailyForecast(data.hourly, today, 5);
  const grid = $('#forecast-grid');
  if (days.length === 0) {
    grid.innerHTML = '<p class="muted">No forecast days available.</p>';
    return;
  }
  grid.innerHTML = days
    .map(
      (d) => `<article class="forecast-card" style="border-top-color: ${d.category.color}">
        <div class="f-date">${esc(d.label)}</div>
        <div class="f-aqi">${d.aqi}</div>
        <div class="f-cat" style="color: ${d.category.color}">${esc(d.category.name)}</div>
        <div class="f-detail">Daily-mean Indian AQI ${d.aqi} · worst-hour US AQI ${d.worstUsAqi ?? '—'}${d.pm25Mean !== null ? ` · mean PM2.5 ${fmt(d.pm25Mean, 0)} µg/m³` : ''}</div>
      </article>`,
    )
    .join('');
}

/* ---------- compare ---------- */

function renderCompare(): void {
  const section = $('#compare-section');
  const strip = $('#compare-strip');
  if (state.compare.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  strip.innerHTML = state.compare
    .map((entry, i) => {
      if (entry.loading || entry.aqi === null) {
        return `<div class="compare-card">
          <div class="compare-bar" style="height: 6px; background: #e8e6e0"></div>
          <div class="compare-value">…</div>
          <div class="compare-name">${esc(entry.city.name)}</div>
          <button class="compare-remove" data-remove="${i}" type="button">Remove</button>
        </div>`;
      }
      const cat = categoryFor(entry.aqi);
      return `<div class="compare-card">
        <div class="compare-bar" style="height: ${Math.max(6, (entry.aqi / 500) * 140)}px; background: ${cat.color}"></div>
        <div class="compare-value">${entry.aqi}</div>
        <div class="compare-name">${esc(entry.city.name)} · ${cat.name}</div>
        <button class="compare-remove" data-remove="${i}" type="button">Remove</button>
      </div>`;
    })
    .join('');
  strip.querySelectorAll('[data-remove]').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-remove'));
      state.compare.splice(idx, 1);
      persistCompare();
      renderCompare();
    });
  });
}

async function refreshCompare(): Promise<void> {
  renderCompare();
  await Promise.all(
    state.compare.map(async (entry) => {
      try {
        const data = await fetchAirQuality(entry.city.latitude, entry.city.longitude);
        const result = computeIndianAqi(data.hourly, data.current.time);
        entry.aqi = result ? result.aqi : null;
      } catch {
        entry.aqi = null;
      }
      entry.loading = false;
    }),
  );
  renderCompare();
}

function addToCompare(): void {
  if (!state.city) return;
  const exists = state.compare.some(
    (c) =>
      c.city.name === state.city?.name &&
      Math.abs(c.city.latitude - (state.city?.latitude ?? 0)) < 0.01,
  );
  if (exists || state.compare.length >= 3) return;
  state.compare.push({ city: state.city, aqi: null, loading: true });
  persistCompare();
  void refreshCompare();
}

/* ---------- search ---------- */

let searchTimer: number | undefined;

function setupSearch(): void {
  const input = $('#search-input') as HTMLInputElement;
  const box = $('#suggestions');
  input.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    searchTimer = window.setTimeout(() => {
      void (async () => {
        let results: GeoCity[] = [];
        try {
          results = await searchCities(q);
        } catch {
          box.innerHTML = '<button type="button" disabled>Search failed — Open-Meteo unreachable.</button>';
          box.hidden = false;
          return;
        }
        if (results.length === 0) {
          box.innerHTML = '<button type="button" disabled>No cities found.</button>';
        } else {
          box.innerHTML = results
            .map(
              (r, i) =>
                `<button type="button" data-i="${i}">${esc(r.name)}<small>${esc([r.admin1, r.country].filter(Boolean).join(', '))}</small></button>`,
            )
            .join('');
          box.querySelectorAll('button[data-i]').forEach((el) => {
            el.addEventListener('click', () => {
              const r = results[Number(el.getAttribute('data-i'))];
              input.value = r.name;
              box.hidden = true;
              void loadCity({
                name: r.name,
                country: r.country,
                admin1: r.admin1,
                latitude: r.latitude,
                longitude: r.longitude,
              });
            });
          });
        }
        box.hidden = false;
      })();
    }, 250);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      box.hidden = true;
      input.blur();
    }
  });
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.search-box')) box.hidden = true;
  });
}

/* ---------- geolocation / share / refresh ---------- */

function setupButtons(): void {
  $('#geo-btn').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showBanner('Geolocation is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void loadCity({
          name: 'Your location',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => showBanner('Location permission was denied — pick a city instead.'),
      { timeout: 10000 },
    );
  });
  $('#compare-add').addEventListener('click', addToCompare);
  $('#share-btn').addEventListener('click', () => {
    if (!state.city) return;
    const url = `${location.origin}${location.pathname}${buildShareUrl(state.city)}`;
    const done = () => {
      const btn = $('#share-btn');
      btn.textContent = 'Copied!';
      window.setTimeout(() => {
        btn.textContent = 'Copy share link';
      }, 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => showBanner(`Share link: ${url}`));
    } else {
      showBanner(`Share link: ${url}`);
    }
  });
  $('#refresh-btn').addEventListener('click', () => {
    if (state.city) void loadCity(state.city);
  });
}

/* ---------- init ---------- */

function initialCity(): CityRef {
  const fromUrl = parseShareUrl(location.search);
  if (fromUrl) return fromUrl;
  try {
    const raw = localStorage.getItem(LAST_CITY_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as CityRef;
      if (saved.name && Number.isFinite(saved.latitude)) return saved;
    }
  } catch {
    /* fall through to default */
  }
  return PRESETS[0];
}

renderChips();
renderCompare();
setupSearch();
setupButtons();
void loadCity(initialCity());
void refreshCompare();
window.setInterval(() => {
  if (state.city) void loadCity(state.city);
}, REFRESH_MS);
