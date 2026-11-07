# AirCast — the Indian AQI, live

Most air-quality dashboards show the **US AQI**. Indians checking the news see
the **Indian AQI** — and the two scales disagree wildly. On 4 November 2026
Delhi's AQI hit 605 and GRAP Stage III was invoked on 6 November, while
Mumbai sat at 169–175. AirCast shows the Indian number, computed the official
CPCB way, for any city — live, alongside the US and European AQI.

## What it does

- **City search** via the Open-Meteo geocoding API, with suggestions and
  quick chips for Delhi, Mumbai, Bengaluru, Kolkata, Chennai and Pune — plus
  opt-in geolocation ("use my location").
- **Indian AQI (CPCB method)** as the headline number: trailing 24-hour
  means of PM2.5, PM10, NO₂ and SO₂ and trailing 8-hour means of O₃ and CO,
  linear interpolation inside the official CPCB breakpoints, overall AQI =
  max sub-index, capped at 500. Shown with its category and colour,
  alongside the US AQI and European AQI the API returns.
- **Pollutant cards** for PM2.5, PM10, NO₂, SO₂, O₃ and CO — current value
  plus the trailing-mean sub-index each contributes.
- **24-hour PM2.5 chart** (inline SVG, draws itself on load) and **5-day
  forecast** cards: daily-mean Indian AQI and the worst hour's US AQI.
- **Plain-English health advice** per band — outdoor exercise, N95 mask,
  windows, sensitive groups — based on CPCB health impacts.
- **Compare up to 3 cities** side by side, saved cities in localStorage,
  shareable `?city=` URLs, auto-refresh every 30 minutes.

## Honest labelling

All data is CAMS model data served by Open-Meteo — **not** an official CPCB
station reading. The app says so on every screen. If the API is unreachable,
the page says so plainly instead of showing invented numbers. There are no
sample or fake readings anywhere in the app.

CPCB officially requires at least 3 pollutants with one being PM for a valid
AQI; this app uses 5 plus CO and labels the result "Indian AQI (CPCB method,
estimated from CAMS model data)".

## Example output

Computed from the real saved snapshot in
`examples/delhi-mumbai-aqi.json` (Open-Meteo Air Quality API, 7 Nov 2026,
07:30 IST) with the app's own math (`npm test` verifies both):

```
Delhi — 7 Nov 2026, 07:30 IST
  Indian AQI (CPCB): 249 — Poor, driven by PM2.5
  US AQI: 187 · European AQI: 82
  Current: PM2.5 94.3 µg/m³ · PM10 171.8 µg/m³
  Trailing means: PM2.5 105.0 · PM10 206.5 · NO₂ 28.6 · SO₂ 23.8 µg/m³ (24h)
                  O₃ 57.9 µg/m³ · CO 0.66 mg/m³ (8h)
  Sub-indices: PM2.5 249 · PM10 171 · NO₂ 36 · SO₂ 30 · O₃ 58 · CO 33

Mumbai — 7 Nov 2026, 07:30 IST
  Indian AQI (CPCB): 84 — Satisfactory, driven by PM2.5
  US AQI: 138 · European AQI: 55
  Current: PM2.5 41.6 µg/m³ · PM10 47.8 µg/m³
  Trailing means: PM2.5 50.8 · PM10 56.7 · NO₂ 29.8 · SO₂ 20.2 µg/m³ (24h)
                  O₃ 71.5 µg/m³ · CO 0.34 mg/m³ (8h)
  Sub-indices: PM2.5 84 · PM10 57 · NO₂ 37 · SO₂ 25 · O₃ 72 · CO 17
```

## How to run

```bash
npm install
npm run dev     # local dev server
npm test        # Vitest — CPCB band edges, worked example, snapshot values
npm run build   # typecheck + production build into docs/ (GitHub Pages)
```

## Stack

TypeScript + Vite + Vitest. No backend, no API key, no dependencies at
runtime — the app calls Open-Meteo directly from the browser. The production
build in `docs/` is a single self-contained page (no external assets), served
by GitHub Pages at <https://judd69.github.io/aircast/>.

## Data sources

- Air quality: [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
  (CAMS model, free, keyless)
- Geocoding: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
- AQI method: CPCB, "National Air Quality Index" (breakpoints and the
  worked example PM2.5 31 → 51, 45 → 75, 60 → 100)

## License

MIT — see [LICENSE](LICENSE).
