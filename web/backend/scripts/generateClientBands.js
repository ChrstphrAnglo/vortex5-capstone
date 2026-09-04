// Regenerates the clients' bundled FALLBACK copy of the canonical band table
// from config/airQualityBands.js.
//
// Both clients fetch GET /api/air-quality/bands at startup, but they have to
// render something before that request lands (and when it fails, and on the
// logged-out landing page). That bundled copy is the fallback. Generating it
// rather than hand-maintaining it is the whole point: a hand-typed second copy
// is exactly the drift this reset was undoing.
//
// Run after ANY change to config/airQualityBands.js:
//
//   node scripts/generateClientBands.js
//
// Read-only with respect to the database; touches only generated files.

const fs = require('fs')
const path = require('path')
const bands = require('../config/airQualityBands')

// JSON has no Infinity — an open-ended edge serialises as null. Mirrors
// controllers/airQualityController.js, which serves the same shape.
const finite = (v) => (Number.isFinite(v) ? v : null)

const serializeBand = (b) => ({
  min: finite(b.min),
  max: finite(b.max),
  level: b.level,
  color: b.color,
  advice: b.advice,
})

const serializeField = (key) => {
  const f = bands.FIELDS[key]
  return {
    key,
    label: f.label,
    unit: f.unit,
    alerting: f.alerting,
    twoSided: f.twoSided,
    derived: f.derived,
    note: f.note,
    alertLow: f.alertLow ?? null,
    alertHigh: f.alertHigh ?? null,
    bands: f.bands.map(serializeBand),
  }
}

const payload = {
  _generated: 'DO NOT EDIT BY HAND. Regenerate: node scripts/generateClientBands.js',
  categories: bands.AQI_CATEGORIES,
  fields: bands.FIELD_ORDER.map(serializeField),
  alertingFields: bands.ALERTING_FIELDS,
  // Canonical limits only. The live endpoint serves the resolved set (an active
  // admin override merged over these), which is why the fetch still matters.
  limits: bands.defaultLimits(),
  limitsSource: 'canonical',
  limitsLabel: null,
  source: bands.SOURCE,
}

const targets = [
  path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'airQualityBands.fallback.json'),
  path.join(__dirname, '..', '..', '..', 'mobile', 'assets', 'air_quality_bands.json'),
]

const json = JSON.stringify(payload, null, 2) + '\n'
for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, json)
  console.log('wrote', path.relative(process.cwd(), target), `(${json.length} bytes)`)
}
