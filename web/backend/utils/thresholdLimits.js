// Resolves the alert limits actually in force.
//
// Precedence:
//   1. the threshold row flagged `active` — an admin's deliberate choice
//   2. the canonical defaults from config/airQualityBands.js
//
// There is deliberately NO "fall back to the newest row" step. The admin UI
// turns an override on and off with a switch, and off has to mean the
// published standards; falling through to whichever row happened to be created
// last would quietly re-apply the override the admin just switched off.
//
// Merging is field-by-field, so a null in the DB row falls through to the
// canonical value. That is what makes the admin UI an OVERRIDE of the canonical
// bands rather than a replacement of them: an admin can pin one number without
// having to re-type — or silently invent — the other ten.
//
// Reading the newest row used to be the ONLY behaviour, in three separately
// maintained copies of this logic (alertsController, dashboardController,
// aqiController). Adding a row to experiment therefore changed live alerting
// for everyone, and the three copies had drifted to three different defaults.

const ThresholdModel = require('../models/ThresholdModel')
const {
  defaultLimits,
  ONE_SIDED_FIELDS,
  TWO_SIDED_FIELDS,
} = require('../config/airQualityBands')

/** All keys in a limit set: scalars for one-sided fields, Min/Max pairs otherwise. */
const LIMIT_KEYS = [
  ...ONE_SIDED_FIELDS,
  ...TWO_SIDED_FIELDS.flatMap((f) => [`${f}Min`, `${f}Max`]),
]

/** Merge one threshold document over the canonical defaults. Pure — testable without a DB. */
function mergeLimits(thresholdDoc) {
  const limits = defaultLimits()
  if (!thresholdDoc) return limits
  for (const key of LIMIT_KEYS) {
    const v = thresholdDoc[key]
    if (v != null && !Number.isNaN(Number(v))) limits[key] = Number(v)
  }
  return limits
}

/** The limits in force right now, plus which row (if any) supplied them. */
async function resolveLimits() {
  const doc = await ThresholdModel.findOne({ active: true }).lean()

  return {
    limits: mergeLimits(doc),
    source: doc ? 'active' : 'canonical',
    label: doc?.label ?? null,
  }
}

module.exports = { resolveLimits, mergeLimits, LIMIT_KEYS }
