const AqiModel = require('../models/AqiModel')
const ThresholdModel = require('../models/ThresholdModel')
const Device = require('../models/DeviceModel')
const getVisibleDeviceIds = require('../utils/visibleDevices')

// GET /api/alerts/current — alerts for *latest* reading of each user device.
const getCurrentAlerts = async (req, res) => {
  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    if (userDeviceIds.length === 0) return res.status(200).json([])

    const thresholdDoc = await ThresholdModel.findOne().sort({ createdAt: -1 }).lean()
    const limits = buildLimits(thresholdDoc)

    const latestReadings = await AqiModel.aggregate([
      { $match: { deviceId: { $in: userDeviceIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$deviceId', latest: { $first: '$$ROOT' } } }
    ])

    const devices = await Device.find({ deviceId: { $in: userDeviceIds } }).lean()
    const deviceMap = Object.fromEntries(devices.map(d => [d.deviceId, d]))

    const alerts = []
    for (const r of latestReadings) {
      const reading = r.latest
      const device = deviceMap[reading.deviceId]
      if (!device) continue

      for (const f of FIELDS) {
        if (reading[f] != null && reading[f] > limits[f]) {
          alerts.push({
            deviceId: reading.deviceId,
            name: device.name,
            room: device.room,
            field: f,
            value: reading[f],
            limit: limits[f],
            severity: reading[f] > limits[f] * 1.5 ? 'high' : 'warning',
            at: reading.createdAt,
          })
        }
      }
    }
    res.status(200).json(alerts)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/alerts/history?days=7 — threshold-crossing events in the past N days.
// Uses a MongoDB aggregation pipeline so no raw readings are loaded into Node.js memory.
const getAlertHistory = async (req, res) => {
  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    if (userDeviceIds.length === 0) return res.status(200).json([])

    const days = Math.min(parseInt(req.query.days || '7', 10), 30)
    const since = new Date(Date.now() - days * 86400 * 1000)

    const thresholdDoc = await ThresholdModel.findOne().sort({ createdAt: -1 }).lean()
    const limits = buildLimits(thresholdDoc)

    const events = await AqiModel.aggregate([
      // 1. Narrow to user's devices within the requested time window
      { $match: { deviceId: { $in: userDeviceIds }, createdAt: { $gte: since } } },

      // 2. Sort ascending per device — required for $shift to look at the previous row
      { $sort: { deviceId: 1, createdAt: 1 } },

      // 3. Add a "previous" value for each monitored field using a lag window function
      { $setWindowFields: {
        partitionBy: '$deviceId',
        sortBy: { createdAt: 1 },
        output: {
          prevAqi:          { $shift: { output: '$Aqi',          by: -1, default: null } },
          prevPM25:         { $shift: { output: '$PM25',         by: -1, default: null } },
          prevPM10:         { $shift: { output: '$PM10',         by: -1, default: null } },
          prevCO2:          { $shift: { output: '$CO2',          by: -1, default: null } },
          prevTVOC:         { $shift: { output: '$TVOC',         by: -1, default: null } },
          prevFormaldehyde: { $shift: { output: '$Formaldehyde', by: -1, default: null } },
        }
      }},

      // 4. Build a "crossings" array: only fields that went from below → above threshold
      { $addFields: {
        crossings: {
          $filter: {
            input: [
              { field: 'Aqi',          value: '$Aqi',          prev: '$prevAqi',          thresh: limits.Aqi },
              { field: 'PM25',         value: '$PM25',         prev: '$prevPM25',         thresh: limits.PM25 },
              { field: 'PM10',         value: '$PM10',         prev: '$prevPM10',         thresh: limits.PM10 },
              { field: 'CO2',          value: '$CO2',          prev: '$prevCO2',          thresh: limits.CO2 },
              { field: 'TVOC',         value: '$TVOC',         prev: '$prevTVOC',         thresh: limits.TVOC },
              { field: 'Formaldehyde', value: '$Formaldehyde', prev: '$prevFormaldehyde', thresh: limits.Formaldehyde },
            ],
            cond: { $and: [
              // field has a value
              { $gt: [{ $ifNull: ['$$this.value', null] }, null] },
              // current reading exceeds threshold
              { $gt: ['$$this.value', '$$this.thresh'] },
              // previous reading did NOT exceed (null treated as 0 = below threshold)
              { $not: { $gt: [{ $ifNull: ['$$this.prev', 0] }, '$$this.thresh'] } }
            ]}
          }
        }
      }},

      // 5. Discard readings with no crossings
      { $match: { 'crossings.0': { $exists: true } } },

      // 6. Expand — one document per crossing event
      { $unwind: '$crossings' },

      // 7. Shape to final output
      { $project: {
        _id: 0,
        deviceId: 1,
        field: '$crossings.field',
        value: '$crossings.value',
        limit: '$crossings.thresh',
        severity: { $cond: [
          { $gt: ['$crossings.value', { $multiply: ['$crossings.thresh', 1.5] }] },
          'high', 'warning'
        ]},
        at: '$createdAt'
      }},

      // 8. Oldest first — required so the cooldown pass below can walk
      //    events in chronological order per device+field.
      { $sort: { at: 1 } }
    ])

    // A raw "crossing" (step 7 above) fires every time a noisy reading dips
    // below a threshold and pops back above it — which can happen many times
    // a minute. Collapse that into real alerts: once a device+field alerts,
    // suppress further alerts for the same device+field until the cooldown
    // elapses, unless the condition drastically worsens (warning -> high),
    // which always surfaces immediately.
    const surfaced = applyCooldown(events, ALERT_COOLDOWN_MS)

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

const FIELDS = ['Aqi', 'PM25', 'PM10', 'CO2', 'TVOC', 'Formaldehyde']

// Minimum time between surfaced alerts for the same device+field.
const ALERT_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes

// Collapses a chronological (ascending `at`) list of raw threshold crossings
// into real alerts: at most one per device+field per cooldown window, unless
// the severity escalates from 'warning' to 'high' — a drastic worsening,
// which always bypasses the cooldown and surfaces right away.
function applyCooldown(events, cooldownMs) {
  const lastByKey = new Map() // `${deviceId}|${field}` -> { at, severity }
  const surfaced = []

  for (const event of events) {
    const key = `${event.deviceId}|${event.field}`
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

function buildLimits(thresholdDoc) {
  return {
    Aqi:          thresholdDoc?.Aqi          ?? 100,
    PM25:         thresholdDoc?.PM25         ?? 40,
    PM10:         thresholdDoc?.PM10         ?? 100,
    CO2:          thresholdDoc?.CO2          ?? 1000,
    TVOC:         thresholdDoc?.TVOC         ?? 500,
    Formaldehyde: thresholdDoc?.Formaldehyde ?? 100,
  }
}

module.exports = { getCurrentAlerts, getAlertHistory }
