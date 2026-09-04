// Decides which fields of one reading are in an alert state.
//
// Pure and DB-free on purpose: alertsController and dashboardController both
// call it, so the "current alerts" list on the mobile app and the alert cards
// on the web dashboard can no longer disagree, and it can be exercised with a
// hand-written reading in a scratch script.

const { FIELDS, ALERTING_FIELDS } = require('../config/airQualityBands')
const { computeAqiWithDriver } = require('./aqiCalculator')

// A one-sided field is "high" once it is half again over its limit — the rule
// this project has always used, kept so existing severity sorting still holds.
const HIGH_MULTIPLIER = 1.5

// Two-sided fields need a different rule: 1.5 x 30 °C would be 45 °C, which no
// classroom reaches, so every temperature alert would forever read "warning".
// Instead an alert escalates once the reading is a fifth of the acceptable
// band's own width past its edge (for 23-30 °C that is 1.4 K, so 31.4 °C).
const TWO_SIDED_HIGH_FRACTION = 0.2

function severityFor(field, value, limit, limits) {
  const def = FIELDS[field]
  if (def?.twoSided) {
    const min = limits[`${field}Min`]
    const max = limits[`${field}Max`]
    const margin = (max - min) * TWO_SIDED_HIGH_FRACTION
    const beyond = value > max ? value - max : min - value
    return beyond > margin ? 'high' : 'warning'
  }
  return value > limit * HIGH_MULTIPLIER ? 'high' : 'warning'
}

/**
 * @param {object} reading  a reading document (or an averaged stand-in)
 * @param {object} limits   a resolved limit set from utils/thresholdLimits
 * @returns {Array<{field, value, limit, direction, severity, driver?}>}
 */
function evaluateReading(reading, limits) {
  if (!reading) return []
  const out = []

  for (const field of ALERTING_FIELDS) {
    const value = reading[field]
    if (value == null || Number.isNaN(Number(value))) continue

    const def = FIELDS[field]

    if (def.twoSided) {
      const min = limits[`${field}Min`]
      const max = limits[`${field}Max`]
      if (value > max) {
        out.push({ field, value, limit: max, direction: 'above', severity: severityFor(field, value, max, limits) })
      } else if (value < min) {
        out.push({ field, value, limit: min, direction: 'below', severity: severityFor(field, value, min, limits) })
      }
      continue
    }

    const limit = limits[field]
    if (limit == null || value <= limit) continue

    const alert = { field, value, limit, direction: 'above', severity: severityFor(field, value, limit, limits) }

    // PM2.5 and PM10 do not alert on their own — they already drive the AQI,
    // and alerting on all three produced three notifications for one dusty
    // moment. The AQI alert names the responsible pollutant instead.
    if (field === 'Aqi' && reading.PM25 != null && reading.PM10 != null) {
      alert.driver = computeAqiWithDriver({ PM25: reading.PM25, PM10: reading.PM10 }).driver
    }

    out.push(alert)
  }

  return out
}

module.exports = { evaluateReading, severityFor, ALERTING_FIELDS }
