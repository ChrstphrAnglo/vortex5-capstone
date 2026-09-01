const mqtt = require('mqtt')
const AqiModel = require('../models/AqiModel')
const Device = require('../models/DeviceModel')
const { decodeFrame } = require('../utils/sensorDecoder')
const { computeAqi } = require('../utils/aqiCalculator')

const HIVEMQ_URL = 'mqtts://1c097cff873e428286ffc57255b3a044.s1.eu.hivemq.cloud:8883'
const TOPIC      = 'bewair/+/telemetry'

let _client = null

// ---- write throttling ----
// The sensor pushes roughly one frame per second. Persisting every frame is
// ~86,000 documents per device per day, which fills a free-tier Atlas cluster
// in about two weeks. Instead we average the incoming frames and write one row
// per interval. Live values still arrive at full rate; only storage is reduced.
const WRITE_INTERVAL_MS = Number(process.env.AQI_WRITE_INTERVAL_SEC || 30) * 1000

// lastSeen must stay fresher than the 30s window dashboardController uses to
// decide a device is offline, so it updates on its own shorter cadence.
const LASTSEEN_INTERVAL_MS = 10 * 1000

const METRIC_FIELDS = ['PM1', 'PM25', 'PM10', 'TVOC', 'CO2', 'Formaldehyde', 'Temperature', 'Humidity']
const DECIMAL_FIELDS = new Set(['Temperature', 'Humidity'])

// deviceId -> { sums, count, lastWrite, lastSeenWrite }
const buffers = new Map()

function zeroSums() {
  const sums = {}
  for (const f of METRIC_FIELDS) sums[f] = 0
  return sums
}

// Average the buffered frames. AQI is recomputed from the averaged metrics
// rather than averaged itself, because the EPA AQI curve is piecewise linear
// and the mean of AQI values is not the AQI of the mean.
function averageOf(buf) {
  const avg = {}
  for (const f of METRIC_FIELDS) {
    const v = buf.sums[f] / buf.count
    avg[f] = DECIMAL_FIELDS.has(f) ? Math.round(v * 10) / 10 : Math.round(v)
  }
  return avg
}

function start() {
  if (!process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD) {
    console.error('[mqtt] MQTT_USERNAME / MQTT_PASSWORD missing in .env — subscriber disabled')
    return
  }

  _client = mqtt.connect(HIVEMQ_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: 'bewair-backend-' + Math.random().toString(16).slice(2, 8),
    reconnectPeriod: 5000,
    keepalive: 60
  })

  _client.on('connect', () => {
    console.log('[mqtt] connected to HiveMQ')
    _client.subscribe(TOPIC, (err) => {
      if (err) console.error('[mqtt] subscribe failed:', err.message)
      else     console.log('[mqtt] subscribed to', TOPIC)
    })
  })

  _client.on('error',     (err) => console.error('[mqtt] error:', err.message))
  _client.on('reconnect', ()    => console.log('[mqtt] reconnecting...'))
  _client.on('close',     ()    => console.log('[mqtt] connection closed'))

  _client.on('message', async (topic, payload) => {
    const parts = topic.split('/')
    if (parts.length !== 3 || parts[0] !== 'bewair' || parts[2] !== 'telemetry') return
    const deviceId = parts[1]

    let metrics
    try {
      metrics = decodeFrame(payload.toString('utf8'))
    } catch (err) {
      console.warn(`[mqtt] decode failed for ${deviceId}: ${err.message}`)
      return
    }

    const now = Date.now()
    let buf = buffers.get(deviceId)
    if (!buf) {
      buf = { sums: zeroSums(), count: 0, lastWrite: now, lastSeenWrite: 0 }
      buffers.set(deviceId, buf)
    }

    for (const f of METRIC_FIELDS) buf.sums[f] += Number(metrics[f]) || 0
    buf.count++

    // Heartbeat: keep the device marked online between stored readings.
    if (now - buf.lastSeenWrite >= LASTSEEN_INTERVAL_MS) {
      buf.lastSeenWrite = now
      Device.updateOne(
        { deviceId },
        { $set: { status: 'online', lastSeen: new Date() } }
        // do NOT upsert — only update devices the user has registered
      ).catch((err) => console.error(`[mqtt] device update failed for ${deviceId}: ${err.message}`))
    }

    // Persist one averaged reading per interval.
    if (now - buf.lastWrite >= WRITE_INTERVAL_MS) {
      const avg = averageOf(buf)
      const samples = buf.count
      buf.sums = zeroSums()
      buf.count = 0
      buf.lastWrite = now

      try {
        await AqiModel.create({ deviceId, Aqi: computeAqi(avg), ...avg })
      } catch (err) {
        console.error(`[mqtt] db write failed for ${deviceId} (${samples} samples): ${err.message}`)
      }
    }
  })

  return _client
}

function publishCommand(deviceId, command) {
  return new Promise((resolve, reject) => {
    if (!_client || !_client.connected) {
      return reject(new Error('MQTT client not connected'))
    }
    _client.publish(
      `bewair/${deviceId}/cmd`,
      command,
      { qos: 1, retain: false },
      (err) => (err ? reject(err) : resolve())
    )
  })
}

module.exports = { start, publishCommand }
