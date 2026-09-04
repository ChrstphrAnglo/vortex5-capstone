const AqiModel = require('../models/AqiModel')
const Device = require('../models/DeviceModel')
const getVisibleDeviceIds = require('../utils/visibleDevices')
const { resolveLimits } = require('../utils/thresholdLimits')
const { evaluateReading, severityFor } = require('../utils/alertEvaluator')
const { computeAqi, computeAqiWithDriver } = require('../utils/aqiCalculator')
const { FIELDS, ALERTING_FIELDS } = require('../config/airQualityBands')

// ---------------------------------------------------------------------------
// Dwell window for "current" alerts.
//
// mqttSubscriber writes one averaged row every 30 s. Alerting on the single
// latest row meant one noisy 30-second sample — someone walking past with a
// cigarette, a door opening — raised a classroom-wide alert. Instead we alert
// on the MEAN of the last 5 minutes, and only when the window actually holds
// enough samples to mean something (10 are expected; 4 tolerates gaps and
// reconnects).
// ---------------------------------------------------------------------------
const DWELL_MS = 5 * 60 * 1000
const DWELL_MIN_SAMPLES = 4

// Minimum time between surfaced alerts for the same device+field.
const ALERT_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes

const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d)

// GET /api/alerts/current — alerts from the 5-minute mean of each user device.
const getCurrentAlerts = async (req, res) => {
  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    if (userDeviceIds.length === 0) return res.status(200).json([])

    const { limits } = await resolveLimits()

    const since = new Date(Date.now() - DWELL_MS)
    const windows = await AqiModel.aggregate([
      { $match: { deviceId: { $in: userDeviceIds }, createdAt: { $gte: since } } },
      { $group: {
        _id: '$deviceId',
        samples:      { $sum: 1 },
        at:           { $max: '$createdAt' },
        PM1:          { $avg: '$PM1' },
        PM25:         { $avg: '$PM25' },
        PM10:         { $avg: '$PM10' },
        TVOC:         { $avg: '$TVOC' },
        CO2:          { $avg: '$CO2' },
        Formaldehyde: { $avg: '$Formaldehyde' },
        Temperature:  { $avg: '$Temperature' },
        Humidity:     { $avg: '$Humidity' },
      }},
      // Not enough of the window present to judge — stay quiet rather than
      // alerting off one sample that happened to survive.
      { $match: { samples: { $gte: DWELL_MIN_SAMPLES } } }
    ])

    const devices = await Device.find({ deviceId: { $in: userDeviceIds } }).lean()
    const deviceMap = Object.fromEntries(devices.map(d => [d.deviceId, d]))

    const alerts = []
    for (const w of windows) {
      const device = deviceMap[w._id]
      if (!device) continue

      // AQI is recomputed from the averaged PM, never averaged itself — the
      // AQI curve is piecewise linear, so mean(AQI) != AQI(mean).
      const reading = { ...w, Aqi: computeAqi({ PM25: w.PM25, PM10: w.PM10 }) }

      for (const hit of evaluateReading(reading, limits)) {
        alerts.push({
          deviceId: w._id,
          name: device.name,
          room: device.room,
          ...hit,
          value: round(hit.value),
          samples: w.samples,
          dwellMinutes: DWELL_MS / 60000,
          at: w.at,
        })
      }
    }

    // Note: applyCooldown is deliberately NOT run here. This endpoint returns a
    // single point-in-time snapshot, so there is no series for a cooldown to
    // collapse — the dwell window above is what stops one noisy sample from
    // surfacing. The cooldown does its work in getAlertHistory, which walks a
    // real time series.
    res.status(200).json(alerts)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// Builds the per-field crossing descriptors the aggregation tests. Two-sided
// fields contribute two entries (one per direction) so "too cold" and "too hot"
// are separate events.
function crossingInputs(limits) {
  const inputs = []
  for (const field of ALERTING_FIELDS) {
    const def = FIELDS[field]
    if (def.twoSided) {
      inputs.push({ field, value: `$${field}`, prev: `$prev${field}`, thresh: limits[`${field}Max`], dir: 'above' })
      inputs.push({ field, value: `$${field}`, prev: `$prev${field}`, thresh: limits[`${field}Min`], dir: 'below' })
    } else {
      inputs.push({ field, value: `$${field}`, prev: `$prev${field}`, thresh: limits[field], dir: 'above' })
    }
  }
  return inputs
}

// GET /api/alerts/history?days=7 — threshold-crossing events in the past N days.
// Uses a MongoDB aggregation pipeline so no raw readings are loaded into Node.js memory.
const getAlertHistory = async (req, res) => {
  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    if (userDeviceIds.length === 0) return res.status(200).json([])

    const days = Math.min(parseInt(req.query.days || '7', 10), 30)
    const since = new Date(Date.now() - days * 86400 * 1000)

    const { limits } = await resolveLimits()

    // A "previous value" per alerting field, so we can spot the moment a field
    // crossed rather than every row it spent outside the line.
    const shiftOutput = {}
    for (const field of ALERTING_FIELDS) {
      shiftOutput[`prev${field}`] = { $shift: { output: `$${field}`, by: -1, default: null } }
    }

    const events = await AqiModel.aggregate([
      // 1. Narrow to user's devices within the requested time window
      { $match: { deviceId: { $in: userDeviceIds }, createdAt: { $gte: since } } },

      // 2. Sort ascending per device — required for $shift to look at the previous row
      { $sort: { deviceId: 1, createdAt: 1 } },

      // 3. Add a "previous" value for each monitored field using a lag window function
      { $setWindowFields: {
        partitionBy: '$deviceId',
        sortBy: { createdAt: 1 },
        output: shiftOutput
      }},

      // 4. Build a "crossings" array: only fields that moved from inside the
      //    acceptable range to outside it. Two-sided fields are tested in both
      //    directions, so a room going cold is its own event.
      { $addFields: {
        crossings: {
          $filter: {
            input: crossingInputs(limits),
            cond: { $and: [
              // field has a value
              { $ne: [{ $ifNull: ['$$this.value', null] }, null] },
              // current reading is outside the limit, in this entry's direction
              { $cond: [
                { $eq: ['$$this.dir', 'above'] },
                { $gt: ['$$this.value', '$$this.thresh'] },
                { $lt: ['$$this.value', '$$this.thresh'] }
              ]},
              // previous reading was NOT outside it (a missing previous value
              // counts as inside, so the first reading after a gap can alert)
              { $cond: [
                { $eq: ['$$this.dir', 'above'] },
                { $not: { $gt: [{ $ifNull: ['$$this.prev', -Infinity] }, '$$this.thresh'] } },
                { $not: { $lt: [{ $ifNull: ['$$this.prev', Infinity] }, '$$this.thresh'] } }
              ]}
            ]}
          }
        }
      }},

      // 5. Discard readings with no crossings
      { $match: { 'crossings.0': { $exists: true } } },

      // 6. Expand — one document per crossing event
      { $unwind: '$crossings' },

      // 7. Shape to final output. Severity is left to JS: the two-sided rule is
      //    band-width relative and would be unreadable expressed here.
      { $project: {
        _id: 0,
        deviceId: 1,
        field: '$crossings.field',
        value: '$crossings.value',
        limit: '$crossings.thresh',
        direction: '$crossings.dir',
        PM25: 1,
        PM10: 1,
        at: '$createdAt'
      }},

      // 8. Oldest first — required so the cooldown pass below can walk
      //    events in chronological order per device+field.
      { $sort: { at: 1 } }
    ])

    const scored = events.map(e => {
      const out = {
        deviceId: e.deviceId,
        field: e.field,
        value: round(e.value),
        limit: e.limit,
        direction: e.direction,
        severity: severityFor(e.field, e.value, e.limit, limits),
        at: e.at,
      }
      // Same as the live endpoint: the AQI alert names the pollutant behind it
      // instead of PM2.5 and PM10 raising alerts of their own.
      if (e.field === 'Aqi' && e.PM25 != null && e.PM10 != null) {
        out.driver = computeAqiWithDriver({ PM25: e.PM25, PM10: e.PM10 }).driver
      }
      return out
    })

    // A raw "crossing" (step 7 above) fires every time a noisy reading dips
    // back inside a threshold and pops out again — which can happen many times
    // a minute. Collapse that into real alerts: once a device+field alerts,
    // suppress further alerts for the same device+field until the cooldown
    // elapses, unless the condition drastically worsens (warning -> high),
    // which always surfaces immediately.
    const surfaced = applyCooldown(scored, ALERT_COOLDOWN_MS)

    // Most recent 100 surfaced alerts, newest first.
    const capped = surfaced.slice(-100).reverse()

    // Enrich with device name and room (tiny lookup — only device documents, not readings)
    const devices = await Device.find({ deviceId: { $in: userDeviceIds } }).lean()
    const deviceMap = Object.fromEntries(devices.map(d => [d.deviceId, d]))

    const result = capped
      .map(e => {
        const device = deviceMap[e.deviceId]
        if (!device) return null
        return { ...e, name: device.name, room: device.room }
      })
      .filter(Boolean)

    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// Collapses a chronological (ascending `at`) list of raw threshold crossings
// into real alerts: at most one per device+field+direction per cooldown window,
// unless the severity escalates from 'warning' to 'high' — a drastic worsening,
// which always bypasses the cooldown and surfaces right away.
//
// Direction is part of the key so a room that went cold does not silence a
// later alert about it going hot.
function applyCooldown(events, cooldownMs) {
  const lastByKey = new Map() // `${deviceId}|${field}|${direction}` -> { at, severity }
  const surfaced = []

  for (const event of events) {
    const key = `${event.deviceId}|${event.field}|${event.direction}`
    const last = lastByKey.get(key)

    const cooledDown = !last || (new Date(event.at) - new Date(last.at)) >= cooldownMs
    const drasticWorsening = last && last.severity === 'warning' && event.severity === 'high'

    if (!last || cooledDown || drasticWorsening) {
      surfaced.push(event)
      lastByKey.set(key, { at: event.at, severity: event.severity })
    }
  }

  return surfaced
}

module.exports = { getCurrentAlerts, getAlertHistory, applyCooldown, DWELL_MS, DWELL_MIN_SAMPLES }
