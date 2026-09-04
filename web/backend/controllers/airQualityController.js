const bands = require('../config/airQualityBands')
const { resolveLimits } = require('../utils/thresholdLimits')

// JSON has no Infinity. An open-ended band edge is serialised as null, which
// both clients read as "no bound on this side".
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
    // The FS00905B simulates CO2 and formaldehyde from its VOC element rather
    // than measuring them. Clients must surface this next to the value.
    derived: f.derived,
    note: f.note,
    alertLow: f.alertLow ?? null,
    alertHigh: f.alertHigh ?? null,
    bands: f.bands.map(serializeBand),
  }
}

// GET /api/air-quality/bands — the canonical band table.
//
// Public on purpose: this is published-standard data, not user data, and the
// logged-out landing page and the mobile app's pre-login screens both need it.
// `limits` is the RESOLVED set (active admin override merged over the canonical
// defaults), so clients grade values exactly as the alerting code does.
const getBands = async (req, res) => {
  try {
    let resolved
    try {
      resolved = await resolveLimits()
    } catch (dbError) {
      // The band table itself does not need the database. If Mongo is
      // unreachable, still serve the canonical values rather than 500-ing and
      // pushing every client onto its bundled fallback.
      console.warn('[air-quality] threshold lookup failed, serving canonical limits:', dbError.message)
      resolved = { limits: bands.defaultLimits(), source: 'canonical', label: null }
    }

    res.status(200).json({
      categories: bands.AQI_CATEGORIES,
      fields: bands.FIELD_ORDER.map(serializeField),
      alertingFields: bands.ALERTING_FIELDS,
      limits: resolved.limits,
      limitsSource: resolved.source, // 'active' | 'newest' | 'canonical'
      limitsLabel: resolved.label,
      source: bands.SOURCE,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

module.exports = { getBands }
