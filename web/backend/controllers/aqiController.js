const AqiModel = require('../models/AqiModel')
const Device = require('../models/DeviceModel')
const getVisibleDeviceIds = require('../utils/visibleDevices')
const { resolveLimits } = require('../utils/thresholdLimits')
const { AQI_CATEGORIES, categoryFor } = require('../config/airQualityBands')

// Categories and limits come from config/airQualityBands.js. This file used to
// carry a private copy of both, which is how the API ended up emitting US EPA
// category names while the dashboard coloured DENR ones.
const aqiCategory = categoryFor

// all readings for user's devices, newest first
const getAqi = async (req, res) => {
  const userDeviceIds = await getVisibleDeviceIds(req.user)
  if (userDeviceIds.length === 0) return res.status(200).json([])
  const aqis = await AqiModel.find({ deviceId: { $in: userDeviceIds } })
    .sort({ createdAt: -1 })
    .limit(500)
  res.status(200).json(aqis)
}

// latest reading per device (only user's devices)
const getLatestPerDevice = async (req, res) => {
  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    if (userDeviceIds.length === 0) return res.status(200).json([])
    const latest = await AqiModel.aggregate([
      { $match: { deviceId: { $in: userDeviceIds } } },
      { $sort: { createdAt: -1 } },
      { $group: {
          _id: '$deviceId',
          doc: { $first: '$$ROOT' }
      }},
      { $replaceRoot: { newRoot: '$doc' } }
    ])
    res.status(200).json(latest)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// Per-pollutant fields we compute statistics for.
const POLLUTANT_FIELDS = ['Aqi', 'PM1', 'PM25', 'PM10', 'TVOC', 'CO2', 'Formaldehyde', 'Temperature', 'Humidity']

// Build a $group spec that computes avg/min/max/std for every pollutant field.
function buildStatsGroup() {
  const spec = { _id: null, count: { $sum: 1 } }
  for (const f of POLLUTANT_FIELDS) {
    spec[`${f}_avg`] = { $avg: `$${f}` }
    spec[`${f}_min`] = { $min: `$${f}` }
    spec[`${f}_max`] = { $max: `$${f}` }
    spec[`${f}_std`] = { $stdDevPop: `$${f}` }
  }
  return spec
}

// Convert a raw stats agg result into { field: {avg,min,max,std} }.
function shapeStats(row) {
  const out = {}
  for (const f of POLLUTANT_FIELDS) {
    out[f] = {
      avg: round(row?.[`${f}_avg`]),
      min: round(row?.[`${f}_min`]),
      max: round(row?.[`${f}_max`]),
      std: round(row?.[`${f}_std`]),
    }
  }
  return out
}

const round = (v, d = 1) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d

// Descriptive analytics — single bundled payload for the front-end.
// Admin-only. Features: aggregation/stats, trend, pattern heatmap, exceedance
// reporting, comparative analysis, AQI distribution.
const getAnalytics = async (req, res) => {
  const empty = {
    kpis: { avg: 0, max: 0, min: 0, count: 0, pctGood: 0, avgCategory: 'Good' },
    buckets: [], categories: [], byDevice: [], heatmap: [], recent: [],
    pollutantStats: {}, exceedances: [], comparison: null,
  }
  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    if (userDeviceIds.length === 0) return res.status(200).json(empty)

    if (req.query.deviceId && !userDeviceIds.includes(req.query.deviceId)) {
      return res.status(200).json(empty)
    }

    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 24 * 3600 * 1000)
    const to   = req.query.to   ? new Date(req.query.to)   : new Date()
    const rangeMs = to - from

    const deviceFilter = req.query.deviceId
      ? { deviceId: req.query.deviceId }
      : { deviceId: { $in: userDeviceIds } }
    const match = { ...deviceFilter, createdAt: { $gte: from, $lte: to } }

    // ----- Trend bucket size -----
    // Honour an explicit granularity, else auto-pick for ~60-100 points.
    const granularity = req.query.granularity // 'hour' | 'day' | 'week' | 'month' | undefined
    const bucketMs = granularity === 'hour'  ? 3600 * 1000
                  : granularity === 'day'   ? 86400 * 1000
                  : granularity === 'week'  ? 7 * 86400 * 1000
                  : granularity === 'month' ? 30 * 86400 * 1000
                  : rangeMs <= 6 * 3600 * 1000  ? 5 * 60 * 1000
                  : rangeMs <= 24 * 3600 * 1000 ? 15 * 60 * 1000
                  : rangeMs <= 7 * 86400 * 1000 ? 3600 * 1000
                  : 6 * 3600 * 1000

    // Heatmap always uses last 7 days for a meaningful hour×weekday picture.
    const heatmapFrom = new Date(Date.now() - 7 * 86400 * 1000)
    const heatmapMatch = { ...deviceFilter, createdAt: { $gte: heatmapFrom } }

    // Previous equal-length window (for comparative analysis).
    const prevFrom = new Date(from.getTime() - rangeMs)
    const prevMatch = { ...deviceFilter, createdAt: { $gte: prevFrom, $lt: from } }

    // Limits in force: the active threshold row merged over the canonical bands.
    const { limits } = await resolveLimits()

    const [
      statsAgg, prevStatsAgg, weekdayStatsAgg, weekendStatsAgg,
      bucketsAgg, byDeviceAgg, heatmapAgg, hourlyAgg, categoryAgg, recent,
    ] = await Promise.all([
      // 1. Per-pollutant stats for the current range
      AqiModel.aggregate([{ $match: match }, { $group: buildStatsGroup() }]),

      // 5a. Same stats for previous equal window
      AqiModel.aggregate([{ $match: prevMatch }, { $group: buildStatsGroup() }]),

      // 5b. Weekday-only stats (Mon–Fri => dayOfWeek 2..6)
      AqiModel.aggregate([
        { $match: match },
        { $addFields: { dow: { $dayOfWeek: '$createdAt' } } },
        { $match: { dow: { $gte: 2, $lte: 6 } } },
        { $group: buildStatsGroup() },
      ]),

      // 5c. Weekend-only stats (Sun=1, Sat=7)
      AqiModel.aggregate([
        { $match: match },
        { $addFields: { dow: { $dayOfWeek: '$createdAt' } } },
        { $match: { $or: [{ dow: 1 }, { dow: 7 }] } },
        { $group: buildStatsGroup() },
      ]),

      // 2. Trend buckets
      AqiModel.aggregate([
        { $match: match },
        { $group: {
            _id: { $toDate: { $subtract: [
              { $toLong: '$createdAt' },
              { $mod: [{ $toLong: '$createdAt' }, bucketMs] }
            ] }},
            avgAqi:  { $avg: '$Aqi' },
            maxAqi:  { $max: '$Aqi' },   // peak AQI within the bucket (for the trend line)
            avgPM25: { $avg: '$PM25' },
            avgPM10: { $avg: '$PM10' },
            avgCO2:  { $avg: '$CO2' },
            avgTVOC: { $avg: '$TVOC' },
            avgHCHO: { $avg: '$Formaldehyde' },
            avgTemp: { $avg: '$Temperature' },
            avgHum:  { $avg: '$Humidity' }
        }},
        { $sort: { _id: 1 } }
      ]),

      // Per-device averages
      AqiModel.aggregate([
        { $match: match },
        { $group: { _id: '$deviceId', avgAqi: { $avg: '$Aqi' }, maxAqi: { $max: '$Aqi' }, count: { $sum: 1 } } },
        { $sort: { avgAqi: -1 } }
      ]),

      // 3. Heatmap (hour × weekday)
      AqiModel.aggregate([
        { $match: heatmapMatch },
        { $group: {
            _id: { dow: { $dayOfWeek: '$createdAt' }, hour: { $hour: '$createdAt' } },
            avgAqi: { $avg: '$Aqi' }, count: { $sum: 1 }
        }}
      ]),

      // 4. Hourly buckets for exceedance reporting (count hours each pollutant crossed its limit)
      AqiModel.aggregate([
        { $match: match },
        { $group: {
            _id: { $dateTrunc: { date: '$createdAt', unit: 'hour' } },
            Aqi:          { $avg: '$Aqi' },
            PM25:         { $avg: '$PM25' },
            PM10:         { $avg: '$PM10' },
            CO2:          { $avg: '$CO2' },
            TVOC:         { $avg: '$TVOC' },
            Formaldehyde: { $avg: '$Formaldehyde' },
        }}
      ]),

      // 6. AQI category distribution
      AqiModel.aggregate([
        { $match: match },
        { $bucket: {
            groupBy: '$Aqi',
            boundaries: [...AQI_CATEGORIES.map(c => c.min), Infinity],
            default: 'above-range',
            output: { count: { $sum: 1 } }
        }}
      ]),

      // Recent readings
      AqiModel.find(match).sort({ createdAt: -1 }).limit(100).lean(),
    ])

    // ----- KPIs (derived from current stats) -----
    const statsRow = statsAgg[0] || {}
    const totalCount = statsRow.count || 0
    // % good needs a separate quick count
    const goodAgg = await AqiModel.aggregate([
      { $match: match },
      { $group: { _id: null, good: { $sum: { $cond: [{ $lte: ['$Aqi', 50] }, 1, 0] } } } }
    ])
    const goodCount = goodAgg[0]?.good || 0
    const avgAqi = Math.round(statsRow.Aqi_avg || 0)
    const kpis = {
      avg: avgAqi,
      max: statsRow.Aqi_max || 0,
      min: statsRow.Aqi_min || 0,
      count: totalCount,
      pctGood: totalCount > 0 ? Math.round((goodCount / totalCount) * 100) : 0,
      avgCategory: aqiCategory(avgAqi),
    }

    // ----- Category distribution -----
    const lastIndex = AQI_CATEGORIES.length - 1
    const categories = AQI_CATEGORIES.map((cat, i) => {
      const label = cat.name
      // Anything past the top boundary lands in the default bucket; fold it
      // into the top category rather than reporting it separately.
      const bucket = categoryAgg.find(b => b._id === cat.min || (i === lastIndex && b._id === 'above-range'))
      const count = bucket?.count || 0
      return { label, count, pct: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0 }
    })

    // ----- Per-device -----
    const devices = await Device.find({ deviceId: { $in: userDeviceIds } }).lean()
    const deviceMap = Object.fromEntries(devices.map(d => [d.deviceId, d]))
    const byDevice = byDeviceAgg.map(d => ({
      deviceId: d._id,
      name: deviceMap[d._id]?.name || d._id,
      room: deviceMap[d._id]?.room || '',
      avgAqi: Math.round(d.avgAqi),
      maxAqi: d.maxAqi,
      count: d.count,
    }))

    // ----- Heatmap -----
    const heatmap = heatmapAgg.map(h => ({
      dow: h._id.dow, hour: h._id.hour, avgAqi: Math.round(h.avgAqi),
    }))

    // ----- Exceedances (feature 4) -----
    // Each hourly bucket = ~1 hour. Count buckets where the hour's average exceeded the limit.
    const totalHours = hourlyAgg.length
    // One-sided fields only: hourlyAgg above does not carry Temperature or
    // Humidity, and both are two-sided, so "hours over the limit" would need a
    // second aggregation and a different question. PM2.5/PM10 stay here even
    // though they no longer alert on their own — as an exceedance REPORT they
    // are exactly what a school needs to show against the DENR standard.
    const exceedanceFields = ['Aqi', 'PM25', 'PM10', 'CO2', 'TVOC', 'Formaldehyde']
    const exceedances = exceedanceFields.map(f => {
      const hours = hourlyAgg.filter(h => h[f] != null && h[f] > limits[f]).length
      return {
        field: f,
        limit: limits[f],
        hours,
        totalHours,
        pctTime: totalHours > 0 ? Math.round((hours / totalHours) * 100) : 0,
      }
    })

    // ----- Comparative analysis (feature 5) -----
    const comparison = {
      current:  { avgAqi: round(statsRow.Aqi_avg, 0), maxAqi: statsRow.Aqi_max || 0, count: totalCount },
      previous: {
        avgAqi: round(prevStatsAgg[0]?.Aqi_avg, 0),
        maxAqi: prevStatsAgg[0]?.Aqi_max || 0,
        count: prevStatsAgg[0]?.count || 0,
      },
      weekday: { avgAqi: round(weekdayStatsAgg[0]?.Aqi_avg, 0), count: weekdayStatsAgg[0]?.count || 0 },
      weekend: { avgAqi: round(weekendStatsAgg[0]?.Aqi_avg, 0), count: weekendStatsAgg[0]?.count || 0 },
    }

    res.status(200).json({
      kpis,
      pollutantStats: shapeStats(statsRow),       // feature 1
      buckets: bucketsAgg.map(b => ({             // feature 2
        time: b._id,
        aqi: Math.round(b.avgAqi),
        aqiMax: Math.round(b.maxAqi),
        pm25: round(b.avgPM25),
        pm10: round(b.avgPM10),
        co2: Math.round(b.avgCO2),
        tvoc: Math.round(b.avgTVOC),
        hcho: Math.round(b.avgHCHO),
        temp: round(b.avgTemp),
        humidity: round(b.avgHum),
      })),
      heatmap,                                     // feature 3
      exceedances,                                 // feature 4
      comparison,                                  // feature 5
      categories,                                  // feature 6
      byDevice,
      recent: recent.map(r => ({ ...r, category: aqiCategory(r.Aqi) })),
    })
  } catch (error) {
    console.error('[analytics] error:', error)
    res.status(500).json({ error: error.message })
  }
}

// GET /api/aqi/device/:deviceId?limit=20  — recent readings for one device
// Used by the device detail page for the "Recent Readings" diagnostic table.
const getDeviceReadings = async (req, res) => {
  try {
    const { deviceId } = req.params
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    if (!userDeviceIds.includes(deviceId)) {
      return res.status(403).json({ error: 'Access denied' })
    }
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const readings = await AqiModel.find({ deviceId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
    res.status(200).json(readings)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

module.exports = { getAqi, getLatestPerDevice, getAnalytics, getDeviceReadings }
