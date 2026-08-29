const Device = require('../models/DeviceModel')
const User = require('../models/userModel')
const AqiModel = require('../models/AqiModel')
const ThresholdModel = require('../models/ThresholdModel')
const getVisibleDeviceIds = require('../utils/visibleDevices')

function aqiCategory(aqi) {
  if (aqi <= 50)  return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy (SG)'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

// Admin-only: bundled dashboard data — KPIs, device cards, current alerts.
const getDashboardSummary = async (req, res) => {
  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)

    // 1. User count
    const userCount = await User.countDocuments({ status: 'active' })

    // 2. Devices the admin owns, with their latest reading
    const devices = await Device.find({ deviceId: { $in: userDeviceIds } }).lean()

    const latestReadings = await AqiModel.aggregate([
      { $match: { deviceId: { $in: userDeviceIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$deviceId', latest: { $first: '$$ROOT' } } }
    ])
    const readingMap = Object.fromEntries(
      latestReadings.map(r => [r._id, r.latest])
    )

    // Derive online/offline status (lastSeen < 30s = online).
    // When offline, null out reading-derived fields so the UI shows "--" instead of stale data.
    const now = Date.now()
    const enrichedDevices = devices.map(d => {
      const lastSeen = d.lastSeen ? new Date(d.lastSeen).getTime() : 0
      const isOnline = d.status === 'online' && (now - lastSeen) < 30 * 1000
      const reading = isOnline ? readingMap[d.deviceId] : null
      const aqi = reading?.Aqi
      return {
        deviceId: d.deviceId,
        name: d.name,
        room: d.room,
        status: isOnline ? (reading ? 'active' : 'available') : 'offline',
        lastSeen: d.lastSeen,
        aqi: aqi ?? null,
        category: aqi != null ? aqiCategory(aqi) : null,
        pm25: reading?.PM25 ?? null,
        co2: reading?.CO2 ?? null,
        temp: reading?.Temperature ?? null,
      }
    })

    const onlineCount = enrichedDevices.filter(d => d.status === 'active' || d.status === 'available').length
    const offlineCount = enrichedDevices.length - onlineCount

    // 3. Average AQI across all online devices right now.
    // null (not 0) when nothing is reporting — 0 would read as a real
    // "Good" measurement instead of "no data available".
    const activeReadings = enrichedDevices.filter(d => d.aqi != null).map(d => d.aqi)
    const avgAqi = activeReadings.length > 0
      ? Math.round(activeReadings.reduce((s, v) => s + v, 0) / activeReadings.length)
      : null

    // 4. Current alerts: devices above threshold right now
    //    Pull the most recent threshold doc (or use defaults)
    const thresholdDoc = await ThresholdModel.findOne().sort({ createdAt: -1 }).lean()
    const limits = {
      Aqi:          thresholdDoc?.Aqi          ?? 100,
      PM25:         thresholdDoc?.PM25         ?? 40,
      PM10:         thresholdDoc?.PM10         ?? 100,
      CO2:          thresholdDoc?.CO2          ?? 1000,
      TVOC:         thresholdDoc?.TVOC         ?? 500,
      Formaldehyde: thresholdDoc?.Formaldehyde ?? 100,
      Temperature:  thresholdDoc?.Temperature  ?? 32,
      Humidity:     thresholdDoc?.Humidity     ?? 80,
    }

    const alerts = []
    for (const d of enrichedDevices) {
      // Skip offline devices — stale readings shouldn't trigger active alerts.
      if (d.status === 'offline') continue
      const r = readingMap[d.deviceId]
      if (!r) continue
      const fields = ['Aqi', 'PM25', 'PM10', 'CO2', 'TVOC', 'Formaldehyde']
      for (const f of fields) {
        if (r[f] != null && r[f] > limits[f]) {
          alerts.push({
            deviceId: d.deviceId,
            name: d.name,
            room: d.room,
            field: f,
            value: r[f],
            limit: limits[f],
            severity: r[f] > limits[f] * 1.5 ? 'high' : 'warning',
            at: r.createdAt,
          })
        }
      }
    }
    // sort by severity then magnitude
    alerts.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1
      return (b.value / b.limit) - (a.value / a.limit)
    })

    res.status(200).json({
      kpis: {
        totalDevices: enrichedDevices.length,
        onlineDevices: onlineCount,
        offlineDevices: offlineCount,
        userCount,
        activeAlerts: alerts.length,
        avgAqi,
        avgCategory: avgAqi != null ? aqiCategory(avgAqi) : null,
      },
      devices: enrichedDevices,
      alerts,
    })
  } catch (error) {
    console.error('[dashboard] error:', error)
    res.status(500).json({ error: error.message })
  }
}

module.exports = { getDashboardSummary }
