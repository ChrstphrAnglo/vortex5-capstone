// ============================================================================
// CANONICAL AIR-QUALITY BAND TABLE — the single source of truth for
// "what counts as bad air" across BewAir.
//
// Every number here carries its citation. Nothing in this repo may define a
// competing band, breakpoint or alert limit: the backend reads this module
// directly, and both clients read it over GET /api/air-quality/bands.
//
// Values are chosen for a naturally ventilated Philippine public-school
// classroom, not a temperate air-conditioned office. Where a widely-copied
// international number would mark a normal PH classroom permanently
// unacceptable, the comment says so and names what we use instead.
// ============================================================================

// Shared palette. Six steps, matching the DENR AQI category count.
const COLORS = {
  good:      '#16A34A',
  fair:      '#F59E0B',
  usg:       '#EA580C',
  very:      '#DC2626',
  acute:     '#9333EA',
  emergency: '#7F1D1D',
}

// ---------------------------------------------------------------------------
// AQI index categories
//
// Source: DENR-EMB Air Quality Index, as published alongside DENR
// Administrative Order 2020-14. Six categories, NOT the US EPA's six — the
// names differ ("Fair" not "Moderate", "Acutely Unhealthy" not "Very
// Unhealthy", "Emergency" not "Hazardous") and category strings are compared
// by value in both clients, so they must not be casually renamed.
// ---------------------------------------------------------------------------
const AQI_CATEGORIES = [
  {
    name: 'Good',
    min: 0,
    max: 50,
    color: COLORS.good,
    actions: [
      'Air quality is healthy — normal classroom activities are fine.',
      'Keep windows and doors open for cross-ventilation.',
    ],
  },
  {
    name: 'Fair',
    min: 51,
    max: 100,
    color: COLORS.fair,
    actions: [
      'Air quality is acceptable.',
      'Unusually sensitive people should watch for symptoms during long or heavy activity.',
    ],
  },
  {
    name: 'Unhealthy for Sensitive Groups',
    min: 101,
    max: 150,
    color: COLORS.usg,
    actions: [
      'Sensitive pupils (asthma, allergies, heart conditions) should limit prolonged or heavy exertion.',
      'Move PE and strenuous activities indoors and increase ventilation.',
    ],
  },
  {
    name: 'Very Unhealthy',
    min: 151,
    max: 200,
    color: COLORS.very,
    actions: [
      'Everyone should limit prolonged outdoor exertion.',
      'Close windows facing the source, run a fan-filter or HEPA unit if available.',
      'Sensitive pupils should stay indoors.',
    ],
  },
  {
    name: 'Acutely Unhealthy',
    min: 201,
    max: 300,
    color: COLORS.acute,
    actions: [
      'Everyone should avoid outdoor exertion and stay indoors.',
      'Seal the room as far as practical and filter the air; wear a well-fitted mask outdoors.',
      'Avoid adding indoor pollution — no sweeping, frying or burning.',
    ],
  },
  {
    name: 'Emergency',
    min: 301,
    max: 500,
    color: COLORS.emergency,
    actions: [
      'Health emergency — keep everyone indoors with windows shut and air filtered.',
      'Consider suspending classes and relocating to a clean-air area.',
      'Seek medical help for any breathing difficulty.',
    ],
  },
]

// ---------------------------------------------------------------------------
// PM concentration <-> AQI index breakpoints
//
// Source: DENR Administrative Order 2020-14 (supersedes DAO 2013-13),
// "Revised Guidelines for Air Quality Index", 24-hour averaging, µg/Nm³.
// This is the Philippine national standard and replaces the US EPA table that
// used to live in utils/aqiCalculator.js.
//
// [concLow, concHigh, indexLow, indexHigh]
// ---------------------------------------------------------------------------
const PM25_BREAKS = [
  [0,    25,   0,   50],   // Good
  [25.1, 35,   51,  100],  // Fair
  [35.1, 45,   101, 150],  // Unhealthy for Sensitive Groups
  [45.1, 55,   151, 200],  // Very Unhealthy
  [55.1, 90,   201, 300],  // Acutely Unhealthy
  [91,   200,  301, 500],  // Emergency (DAO 2020-14 opens this band at 91 with
                           // no published ceiling; 200 caps the linear segment)
]

const PM10_BREAKS = [
  [0,   54,  0,   50],   // Good
  [55,  154, 51,  100],  // Fair
  [155, 254, 101, 150],  // Unhealthy for Sensitive Groups
  [255, 354, 151, 200],  // Very Unhealthy
  [355, 424, 201, 300],  // Acutely Unhealthy
  [425, 504, 301, 500],  // Emergency
]

// ---------------------------------------------------------------------------
// Per-field bands.
//
//   alerting   — does this field raise an alert at all
//   twoSided   — is being too LOW a problem as well as too high
//   derived    — value is simulated by the sensor, not measured (see below)
//   bands      — ordered display bands; matched with `value <= max`
//   alertHigh  — alert above this. Normally the top of the acceptable band;
//                where it deliberately differs, the comment says why.
//   alertLow   — alert below this (two-sided fields only)
//
// DERIVED VALUES: the FS00905B does not measure CO2 or formaldehyde. Both are
// simulated by the module's firmware from the VOC element's resistance (see
// firmware/CLAUDE.md). They are graded here because they are still useful as
// trend/ventilation indicators, but every UI that shows them must carry a
// "derived value" note. Do not present them as instrument measurements.
// ---------------------------------------------------------------------------
const FIELDS = {
  Aqi: {
    label: 'AQI',
    unit: '',
    group: 'particulates',
    citation: 'DENR AO 2020-14',
    alerting: true,
    twoSided: false,
    derived: false,
    // Top of Fair. Above this the DENR table starts naming sensitive groups.
    alertHigh: 100,
    note: 'max(PM2.5 sub-index, PM10 sub-index), DENR DAO 2020-14.',
    bands: AQI_CATEGORIES.map((c) => ({
      min: c.min,
      max: c.max,
      level: c.name,
      color: c.color,
      advice: c.actions[0],
    })),
  },

  // PM1 has NO published standard anywhere — no DENR, WHO, EPA or ASHRAE
  // number exists for it. These bands mirror PM2.5 as an explicit proxy:
  // PM1 is a strict subset of PM2.5, so PM1 above the PM2.5 limit guarantees
  // PM2.5 is above it too. That is why alertHigh is 35 (the PM2.5 AQI-100
  // boundary) and not 25 — at 25 PM1 could alert before the AQI does, which
  // would be a louder claim than the data supports.
  PM1: {
    group: 'particulates',
    citation: 'DENR AO 2020-14, as proxy',
    label: 'PM 1.0',
    unit: 'µg/m³',
    alerting: true,
    twoSided: false,
    derived: false,
    alertHigh: 35,
    note: 'No published PM1 standard exists; graded against the PM2.5 table as a proxy.',
    bands: [
      { min: 0,    max: 25,       level: 'Good',                           color: COLORS.good,      advice: 'Ultrafine-particle levels are low.' },
      { min: 25.1, max: 35,       level: 'Fair',                           color: COLORS.fair,      advice: 'Acceptable. Ventilate if there is visible smoke or dust.' },
      { min: 35.1, max: 45,       level: 'Unhealthy for Sensitive Groups', color: COLORS.usg,       advice: 'Improve ventilation and remove indoor sources (cooking smoke, candles, traffic).' },
      { min: 45.1, max: 55,       level: 'Very Unhealthy',                 color: COLORS.very,      advice: 'Filter the air and stop indoor combustion.' },
      { min: 55.1, max: 90,       level: 'Acutely Unhealthy',              color: COLORS.acute,     advice: 'Limit exposure and filter the air now.' },
      { min: 91,   max: Infinity, level: 'Emergency',                      color: COLORS.emergency, advice: 'Very heavy ultrafine pollution. Move pupils out of the room.' },
    ],
  },

  // Source: DENR Administrative Order 2020-14, 24-hour averaging, µg/Nm³.
  PM25: {
    group: 'particulates',
    citation: 'DENR AO 2020-14',
    label: 'PM 2.5',
    unit: 'µg/m³',
    // No separate alert: PM2.5 already drives the AQI, and alerting on both
    // produced two notifications for one dusty moment. The AQI alert names the
    // responsible pollutant in its `driver` field instead.
    alerting: false,
    twoSided: false,
    derived: false,
    alertHigh: 35,
    note: 'Feeds the AQI; the AQI alert names it as `driver` rather than alerting separately.',
    bands: [
      { min: 0,    max: 25,       level: 'Good',                           color: COLORS.good,      advice: 'Fine-particle levels are healthy.' },
      { min: 25.1, max: 35,       level: 'Fair',                           color: COLORS.fair,      advice: 'Acceptable. Sensitive pupils should watch for symptoms during long exposure.' },
      { min: 35.1, max: 45,       level: 'Unhealthy for Sensitive Groups', color: COLORS.usg,       advice: 'Increase ventilation or run a fan-filter unit; remove indoor sources (smoke, cooking).' },
      { min: 45.1, max: 55,       level: 'Very Unhealthy',                 color: COLORS.very,      advice: 'Close windows facing the source, filter the air, and stop indoor combustion.' },
      { min: 55.1, max: 90,       level: 'Acutely Unhealthy',              color: COLORS.acute,     advice: 'Heavy fine-particle pollution. Limit exposure and filter the air.' },
      { min: 91,   max: Infinity, level: 'Emergency',                      color: COLORS.emergency, advice: 'Hazardous fine-particle levels. Move pupils out of the room.' },
    ],
  },

  // Source: DENR Administrative Order 2020-14, 24-hour averaging, µg/Nm³.
  PM10: {
    group: 'particulates',
    citation: 'DENR AO 2020-14',
    label: 'PM 10',
    unit: 'µg/m³',
    alerting: false, // see PM25 — folded into the AQI alert
    twoSided: false,
    derived: false,
    alertHigh: 154,
    note: 'Feeds the AQI; the AQI alert names it as `driver` rather than alerting separately.',
    bands: [
      { min: 0,   max: 54,       level: 'Good',                           color: COLORS.good,      advice: 'Coarse-particle (dust) levels are healthy.' },
      { min: 55,  max: 154,      level: 'Fair',                           color: COLORS.fair,      advice: 'Acceptable dust. Damp-mop instead of dry sweeping.' },
      { min: 155, max: 254,      level: 'Unhealthy for Sensitive Groups', color: COLORS.usg,       advice: 'Elevated dust. Increase ventilation and avoid dry sweeping during class hours.' },
      { min: 255, max: 354,      level: 'Very Unhealthy',                 color: COLORS.very,      advice: 'High dust. Close windows facing the source and damp-mop the room.' },
      { min: 355, max: 424,      level: 'Acutely Unhealthy',              color: COLORS.acute,     advice: 'Very high dust. Limit exposure and filter the air now.' },
      { min: 425, max: Infinity, level: 'Emergency',                      color: COLORS.emergency, advice: 'Hazardous dust levels. Move pupils out of the room.' },
    ],
  },

  // Source: Seifert (1990), German Federal Environment Agency (UBA) TVOC
  // guideline; interpretation per Mølhave, "Total Volatile Organic Compounds
  // (TVOC) in Indoor Air Quality Investigations", Indoor Air 7(4), 1997.
  //
  // HYGIENIC GUIDANCE ONLY. No regulator — DENR, WHO, EPA or ASHRAE — sets a
  // binding TVOC limit, and TVOC is not a health endpoint: it is a sum of
  // chemically unrelated compounds. The previous 500 µg/m³ backend default and
  // the 300 µg/m³ frontend "Good" cutoff were two different inventions of the
  // same non-existent standard; both are gone.
  TVOC: {
    group: 'gases',
    citation: 'Seifert 1990 / Mølhave 1997',
    label: 'TVOC',
    unit: 'µg/m³',
    alerting: true,
    twoSided: false,
    derived: false,
    // Seifert's "comfort range" ends at 300; Mølhave's "multifactorial
    // exposure range", where complaints become likely, starts at 1000. We
    // colour at 300 but only alert at 1000 — below that there is nothing an
    // alert could usefully ask anyone to do.
    alertHigh: 1000,
    note: 'Hygienic guidance only — no regulator sets a binding TVOC limit.',
    bands: [
      { min: 0,     max: 300,      level: 'Good',      color: COLORS.good,      advice: 'Low levels of volatile organic compounds.' },
      { min: 300,   max: 1000,     level: 'Fair',      color: COLORS.fair,      advice: 'Acceptable. Ventilate if you notice odours.' },
      { min: 1000,  max: 3000,     level: 'Elevated',  color: COLORS.usg,       advice: 'Increase fresh air and check sources (cleaners, paint, solvents, new furniture).' },
      { min: 3000,  max: 10000,    level: 'High',      color: COLORS.very,      advice: 'Ventilate well and remove the source; irritation and headaches are likely.' },
      { min: 10000, max: 25000,    level: 'Very High', color: COLORS.acute,     advice: 'Ventilate the room now and identify the emitting source.' },
      { min: 25000, max: Infinity, level: 'Severe',    color: COLORS.emergency, advice: 'Evacuate the room and ventilate before anyone returns.' },
    ],
  },

  // Source: ASHRAE Position Document on Indoor Carbon Dioxide (2022).
  //
  // 1000 ppm IS A VENTILATION INDICATOR, NOT A HEALTH OR SAFETY LIMIT.
  // ASHRAE 62.1 sets no indoor CO2 limit at all. CO2 at these concentrations
  // is not itself harmful; it is a proxy for how much of the air in the room
  // has already been breathed, which is why it is reported as ventilation.
  // Every piece of UI copy must say ventilation, never "safe"/"unsafe".
  //
  // DERIVED VALUE — simulated by the FS00905B from its VOC element, not
  // measured with an NDIR cell. Treat as a trend indicator only.
  CO2: {
    group: 'gases',
    citation: 'ASHRAE indoor CO₂ position document',
    label: 'CO₂',
    unit: 'ppm',
    alerting: true,
    twoSided: false,
    derived: true,
    // 1000 is the "ventilation is getting thin" line; 1500 is where ASHRAE's
    // document treats ventilation as clearly inadequate. Alerting at 1000
    // would fire all day in a full classroom with the windows open, which is
    // exactly the situation the number is meant to describe as normal.
    alertHigh: 1500,
    note: 'Ventilation indicator, not a health limit. ASHRAE 62.1 sets no CO₂ limit. Derived from the VOC element, not measured.',
    bands: [
      { min: 0,    max: 1000,     level: 'Well ventilated', color: COLORS.good, advice: 'Fresh air supply is keeping up with the room.' },
      { min: 1000, max: 1500,     level: 'Stuffy',          color: COLORS.fair, advice: 'Ventilation is thinning — open windows and doors wider.' },
      { min: 1500, max: Infinity, level: 'Poorly ventilated', color: COLORS.usg, advice: 'Ventilation is inadequate. Open everything, use fans to cross-ventilate, and reduce occupancy if you can.' },
    ],
  },

  // Source: WHO Guidelines for Indoor Air Quality: Selected Pollutants (2010),
  // Chapter 3 — 0.1 mg/m³ = 100 µg/m³, 30-minute average.
  //
  // UNITS: µg/m³ throughout, matching utils/sensorDecoder.js which decodes
  // word 17 as µg/m³. The frontend previously labelled the very same number
  // "ppb" against a "100 ppb" EPA figure. At 25 °C and 1 atm,
  // 100 µg/m³ ≈ 81 ppb — close enough to look right and wrong enough to
  // matter. They are NOT interchangeable; that mislabel was the bug.
  //
  // DERIVED VALUE — like CO2, simulated from the VOC element.
  Formaldehyde: {
    group: 'gases',
    citation: 'WHO IAQ guidelines 2010',
    label: 'Formaldehyde',
    unit: 'µg/m³',
    alerting: true,
    twoSided: false,
    derived: true,
    alertHigh: 100,
    note: 'WHO 2010 short-term guideline, 30-min average. Derived from the VOC element, not measured.',
    bands: [
      { min: 0,   max: 100,      level: 'Good',     color: COLORS.good, advice: 'Below the WHO indoor guideline (100 µg/m³, 30-minute average).' },
      { min: 100, max: 200,      level: 'Elevated', color: COLORS.usg,  advice: 'Ventilate — especially around new pressed-wood furniture, plywood or fresh paint.' },
      { min: 200, max: Infinity, level: 'High',     color: COLORS.very, advice: 'Ventilate aggressively and remove or seal the emitting material.' },
    ],
  },

  // Source: ASHRAE 55 adaptive comfort model for naturally ventilated spaces.
  //   Tcomf = 0.31 × T_outdoor_mean + 17.8
  // Manila's mean monthly outdoor temperature is ≈ 28.5 °C, giving
  // Tcomf ≈ 26.6 °C. The 80 % acceptability band is ±3.5 K, so 23–30 °C.
  //
  // DO NOT use 20–24 °C. That band is EN 16798-1 / DWEA — a European
  // heating-season standard for mechanically conditioned buildings. Applied to
  // a naturally ventilated Manila classroom it marks every normal school day
  // as unacceptable, which is what made this dashboard permanently red.
  Temperature: {
    group: 'comfort',
    citation: 'ASHRAE 55 adaptive comfort',
    label: 'Temperature',
    unit: '°C',
    alerting: true,
    twoSided: true, // too cold matters, not just too hot
    derived: false,
    alertLow: 23,
    alertHigh: 30,
    note: 'ASHRAE 55 adaptive comfort for naturally ventilated spaces, Manila outdoor mean ≈ 28.5 °C.',
    bands: [
      { min: -Infinity, max: 20,       level: 'Cold',       color: COLORS.very, advice: 'Unusually cold for this climate — check whether air conditioning is over-cooling the room.' },
      { min: 20,        max: 23,       level: 'Cool',       color: COLORS.fair, advice: 'Slightly below the adaptive comfort band. Reduce cooling or air-flow.' },
      { min: 23,        max: 30,       level: 'Comfortable', color: COLORS.good, advice: 'Within the ASHRAE 55 adaptive comfort band for a naturally ventilated room (23–30 °C).' },
      { min: 30,        max: 33,       level: 'Warm',       color: COLORS.fair, advice: 'Slightly above the comfort band. Increase air movement — fans raise the acceptable temperature.' },
      { min: 33,        max: Infinity, level: 'Hot',        color: COLORS.very, advice: 'Heat stress risk. Increase air movement, provide drinking water, and avoid strenuous activity.' },
    ],
  },

  // Source for the 70 % ceiling: WHO Guidelines for Indoor Air Quality:
  // Dampness and Mould (2009), and US EPA Mold Course Chapter 2 — sustained
  // surface/air humidity above ~70 % supports mould germination.
  //
  // THIS IS A MOLD-RISK THRESHOLD, NOT THERMAL COMFORT, and it must NOT be
  // attributed to ASHRAE: ASHRAE 55-2020 removed the lower humidity limit
  // entirely and sets no comfort-based upper humidity limit. The old 30–50 %
  // "ideal" band came from temperate-climate guidance and is unreachable in a
  // naturally ventilated room in Manila.
  //
  // The 30 % floor is a dryness/irritation floor (US EPA IAQ guidance). It is
  // effectively unreachable indoors here; it exists so the two-sided logic is
  // honest rather than because we expect to see it.
  //
  // BAND EDGE ≠ ALERT EDGE. The tile turns amber above 70 %, but the alert
  // waits until 75 %. A naturally ventilated PH classroom sits right on 70 %,
  // so alerting there would flap all day and train people to ignore alerts.
  // The 5-point gap is deliberate hysteresis; 70 % remains the cited
  // mould-risk boundary on screen.
  Humidity: {
    group: 'comfort',
    citation: 'WHO Dampness and Mould 2009',
    label: 'Humidity',
    unit: '%',
    alerting: true,
    twoSided: true,
    derived: false,
    alertLow: 30,
    alertHigh: 75,
    note: 'Mould-risk threshold (WHO Dampness and Mould 2009; US EPA), not thermal comfort. ASHRAE 55-2020 sets no RH comfort limits.',
    bands: [
      { min: -Infinity, max: 30,       level: 'Too Dry',    color: COLORS.fair, advice: 'Very dry air irritates eyes and airways. Rare indoors in this climate — check the sensor if it persists.' },
      { min: 30,        max: 70,       level: 'Acceptable', color: COLORS.good, advice: 'Below the mould-risk threshold (70 %).' },
      { min: 70,        max: 75,       level: 'Humid',      color: COLORS.fair, advice: 'Above the 70 % mould-risk threshold. Improve cross-ventilation and check for damp walls or leaks.' },
      { min: 75,        max: Infinity, level: 'Mould Risk', color: COLORS.usg,  advice: 'Sustained damp encourages mould and dust mites. Ventilate, fix leaks, and dry out soft furnishings.' },
    ],
  },
}

// Display groups for the admin UI. Membership comes from each field own
// `group` key rather than a list here, so a new field lands in a section
// without anyone editing the dashboard.
const FIELD_GROUPS = [
  { key: 'particulates', label: 'Particulates' },
  { key: 'gases',        label: 'Gases' },
  { key: 'comfort',      label: 'Comfort' },
]

// Order matters for the admin UI and the API payload.
const FIELD_ORDER = ['Aqi', 'PM1', 'PM25', 'PM10', 'TVOC', 'CO2', 'Formaldehyde', 'Temperature', 'Humidity']

// Fields whose limits are two-sided, stored as <Field>Min / <Field>Max.
const TWO_SIDED_FIELDS = FIELD_ORDER.filter((f) => FIELDS[f].twoSided)
const ONE_SIDED_FIELDS = FIELD_ORDER.filter((f) => !FIELDS[f].twoSided)

/** AQI index -> DENR category name. Null for null/undefined input. */
function categoryFor(aqi) {
  if (aqi == null || Number.isNaN(aqi)) return null
  for (const c of AQI_CATEGORIES) {
    if (aqi <= c.max) return c.name
  }
  return AQI_CATEGORIES[AQI_CATEGORIES.length - 1].name
}

/** AQI index -> the full category object (name, colour, actions). */
function aqiCategoryObject(aqi) {
  if (aqi == null || Number.isNaN(aqi)) return null
  return (
    AQI_CATEGORIES.find((c) => aqi <= c.max) ||
    AQI_CATEGORIES[AQI_CATEGORIES.length - 1]
  )
}

/**
 * Grade one field value against its bands.
 * Returns { label, unit, level, color, advice, derived, ok } or null.
 *
 * `ok` means "inside the acceptable band" — the band the field's alert limits
 * describe — so the UI's "needs attention" list and the alerting code cannot
 * disagree about which bands count as fine.
 *
 * Bands are matched with `value <= max`. The published DENR tables leave
 * fractional gaps (PM10 54 → 55); a value landing in one is graded into the
 * higher band, which is the conservative direction.
 */
function bandFor(field, value) {
  const def = FIELDS[field]
  if (!def || value == null || Number.isNaN(value)) return null
  const band = def.bands.find((b) => value <= b.max) || def.bands[def.bands.length - 1]
  return {
    label: def.label,
    unit: def.unit,
    level: band.level,
    color: band.color,
    advice: band.advice,
    derived: def.derived,
    ok: isAcceptable(field, value),
  }
}

/** True when the value is inside the field's acceptable range. */
function isAcceptable(field, value) {
  const def = FIELDS[field]
  if (!def || value == null || Number.isNaN(value)) return true
  if (def.twoSided) return value >= def.alertLow && value <= def.alertHigh
  return value <= def.alertHigh
}

/**
 * The canonical flat limit set. One-sided fields get a scalar; two-sided
 * fields get <Field>Min / <Field>Max. This is the shape stored in the
 * thresholds collection and the shape the alerting code consumes.
 */
function defaultLimits() {
  const limits = {}
  for (const f of ONE_SIDED_FIELDS) limits[f] = FIELDS[f].alertHigh
  for (const f of TWO_SIDED_FIELDS) {
    limits[`${f}Min`] = FIELDS[f].alertLow
    limits[`${f}Max`] = FIELDS[f].alertHigh
  }
  return limits
}

/** Fields that actually raise alerts, in display order. */
const ALERTING_FIELDS = FIELD_ORDER.filter((f) => FIELDS[f].alerting)

const SOURCE =
  'DENR DAO 2020-14 (PM/AQI) · WHO IAQ 2010 (formaldehyde) · WHO Dampness and Mould 2009 (humidity) · ' +
  'ASHRAE Position Document on Indoor CO2 · ASHRAE 55 adaptive comfort (temperature) · Seifert 1990 / Mølhave 1997 (TVOC)'

module.exports = {
  COLORS,
  AQI_CATEGORIES,
  FIELDS,
  FIELD_GROUPS,
  FIELD_ORDER,
  ALERTING_FIELDS,
  TWO_SIDED_FIELDS,
  ONE_SIDED_FIELDS,
  PM25_BREAKS,
  PM10_BREAKS,
  SOURCE,
  categoryFor,
  aqiCategoryObject,
  bandFor,
  isAcceptable,
  defaultLimits,
}
