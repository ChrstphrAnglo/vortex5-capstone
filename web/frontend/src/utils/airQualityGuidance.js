// Air-quality guidance, sourced from the backend.
//
// This file used to hardcode its own EPA/WHO/ASHRAE bands, which disagreed
// with the backend alert limits, with the admin threshold rows and with the
// mobile app. It now reads the canonical table from
// GET /api/air-quality/bands — the same table the alerting code uses — so the
// colour on a tile and the alert in the feed can no longer contradict.
//
// The exported functions stay SYNCHRONOUS on purpose: they are called during
// render by a dozen components. `initAirQualityBands()` hydrates a module-level
// cache once at startup (see src/main.jsx); until then, and whenever the fetch
// fails, the bundled fallback below answers. The fallback is generated —
// `node scripts/generateClientBands.js` in web/backend — so it cannot drift
// from the server table.

import FALLBACK_BANDS from './airQualityBands.fallback.json'

let BANDS = FALLBACK_BANDS

/** Category name -> hex. Mutated in place on hydration so imported references stay live. */
export const CATEGORY_COLORS = {}

/** Field key -> served definition. Rebuilt on hydration. */
let FIELD_MAP = {}

function applyBands(next) {
  BANDS = next

  for (const key of Object.keys(CATEGORY_COLORS)) delete CATEGORY_COLORS[key]
  for (const c of BANDS.categories) CATEGORY_COLORS[c.name] = c.color

  FIELD_MAP = Object.fromEntries(BANDS.fields.map((f) => [f.key, f]))
}

applyBands(FALLBACK_BANDS)

/**
 * Fetch the canonical bands and replace the cache. Call once at startup.
 * Never throws — a failure leaves the bundled fallback in place, which is a
 * degraded but correct table rather than a blank screen.
 */
export async function initAirQualityBands() {
  try {
    const res = await fetch('/api/air-quality/bands')
    if (!res.ok) throw new Error(`bands request failed (${res.status})`)
    const json = await res.json()
    if (!json?.categories?.length || !json?.fields?.length) throw new Error('bands payload malformed')
    applyBands(json)
    return json
  } catch (err) {
    console.warn('[air-quality] using bundled band table:', err.message)
    return null
  }
}

/** The limits currently in force (admin override merged over canonical). */
export function airQualityLimits() {
  return BANDS.limits
}

/** Where those limits came from: 'active' | 'newest' | 'canonical'. */
export function airQualityLimitsSource() {
  return BANDS.limitsSource
}

/** Attribution line for the standards behind the numbers. */
export function airQualitySource() {
  return BANDS.source
}

/** The served field definitions, in display order. */
export function airQualityFields() {
  return BANDS.fields
}

/**
 * The editable limit keys, flattened the way the thresholds collection stores
 * them: a scalar per one-sided field, Min/Max for the two-sided ones.
 * Returns [{ key, field, label, unit, alerting, bound }].
 */
export function airQualityLimitKeys() {
  const keys = []
  for (const f of BANDS.fields) {
    if (f.twoSided) {
      keys.push({ key: `${f.key}Min`, field: f.key, label: `${f.label} min`, unit: f.unit, alerting: f.alerting, bound: 'min' })
      keys.push({ key: `${f.key}Max`, field: f.key, label: `${f.label} max`, unit: f.unit, alerting: f.alerting, bound: 'max' })
    } else {
      keys.push({ key: f.key, field: f.key, label: f.label, unit: f.unit, alerting: f.alerting, bound: 'max' })
    }
  }
  return keys
}

// ---------------------------------------------------------------------------
// AQI
// ---------------------------------------------------------------------------

export function aqiCategory(aqi) {
  if (aqi == null) return null
  const cats = BANDS.categories
  for (const c of cats) {
    if (aqi <= c.max) return c.name
  }
  return cats[cats.length - 1].name
}

export function aqiAdvisory(aqi) {
  if (aqi == null) return null
  const cats = BANDS.categories
  const cat = cats.find((c) => aqi <= c.max) || cats[cats.length - 1]
  return {
    category: cat.name,
    color: cat.color,
    actions: cat.actions || [],
  }
}

// ---------------------------------------------------------------------------
// Per-component insights
// ---------------------------------------------------------------------------

// The UI addresses components by short lowercase keys; the canonical table uses
// the sensor field names, which are fixed by the MQTT contract.
const KEY_TO_FIELD = {
  pm1: 'PM1',
  pm25: 'PM25',
  pm10: 'PM10',
  co2: 'CO2',
  tvoc: 'TVOC',
  hcho: 'Formaldehyde',
  temp: 'Temperature',
  humidity: 'Humidity',
}

/** True when the value sits inside the field's acceptable range. */
function isOk(field, v) {
  if (field.twoSided) {
    if (field.alertLow != null && v < field.alertLow) return false
    if (field.alertHigh != null && v > field.alertHigh) return false
    return true
  }
  return field.alertHigh == null || v <= field.alertHigh
}

/**
 * Per-component qualitative reading + concrete action.
 * Returns { label, unit, level, color, advice, derived, ok } or null.
 *
 * `derived` marks CO2 and formaldehyde: the FS00905B simulates both from its
 * VOC element rather than measuring them, and the UI must say so.
 */
export function componentInsight(key, v) {
  if (v == null) return null

  const fieldKey = KEY_TO_FIELD[key]
  const field = fieldKey ? FIELD_MAP[fieldKey] : null
  if (!field) return null

  const band =
    field.bands.find((b) => b.max == null || v <= b.max) ||
    field.bands[field.bands.length - 1]

  return {
    label: field.label,
    unit: field.unit,
    level: band.level,
    color: band.color,
    advice: band.advice,
    derived: field.derived,
    ok: isOk(field, v),
  }
}

/** Build a list of component insights that need attention (not OK), from a reading. */
export function flaggedComponents(reading) {
  if (!reading) return []
  const map = [
    ['pm25', reading.PM25],
    ['pm10', reading.PM10],
    ['co2', reading.CO2],
    ['tvoc', reading.TVOC],
    ['hcho', reading.Formaldehyde],
    ['temp', reading.Temperature],
    ['humidity', reading.Humidity],
  ]
  return map
    .map(([k, v]) => componentInsight(k, v))
    .filter((c) => c && !c.ok)
}
