// Read-only export of AQI time-series to CSV, for offline analysis.
// Never writes to the database.
//
//   node scripts/exportAqi.js                        # stats + last 7 days, 1-min averages
//   node scripts/exportAqi.js --days 2 --every 60
//   node scripts/exportAqi.js --from 2026-08-31 --to 2026-09-02 --every 300
//   node scripts/exportAqi.js --device BewAir-1A2B --raw
//
// Flags:
//   --days N     look back N days from now (default 7)
//   --from/--to  explicit ISO dates, override --days
//   --every S    bucket size in seconds, averaged (default 60). Ignored with --raw.
//   --raw        export every stored row, no averaging
//   --device ID  restrict to one deviceId
//   --out PATH   output file (default ./aqi-export.csv)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const AqiModel = require('../models/AqiModel')

const FIELDS = ['Aqi','PM1','PM25','PM10','TVOC','CO2','Formaldehyde','Temperature','Humidity']

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback
}
const has = (name) => process.argv.includes('--' + name)

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing — run this from web/backend with .env in place.')
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGO_URI)
  console.log('connected\n')

  // ---- overall stats, before any filtering ----
  const total = await AqiModel.estimatedDocumentCount()
  const oldest = await AqiModel.findOne().sort({ createdAt: 1 }).select('createdAt').lean()
  const newest = await AqiModel.findOne().sort({ createdAt: -1 }).select('createdAt').lean()
  const devices = await AqiModel.distinct('deviceId')

  console.log('=== stored data ===')
  console.log('documents :', total.toLocaleString())
  console.log('devices   :', devices.join(', ') || '(none)')
  console.log('oldest    :', oldest?.createdAt?.toISOString() ?? '-')
  console.log('newest    :', newest?.createdAt?.toISOString() ?? '-')
  if (oldest && newest && total > 1) {
    const spanSec = (newest.createdAt - oldest.createdAt) / 1000
    console.log('span      :', (spanSec / 3600).toFixed(1), 'hours')
    console.log('avg rate  :', (total / spanSec).toFixed(2), 'rows/sec')
    console.log('projected :', ((total / spanSec) * 86400).toFixed(0), 'rows/day\n')
  }

  // ---- window ----
  const to   = arg('to')   ? new Date(arg('to'))   : new Date()
  const from = arg('from') ? new Date(arg('from'))
             : new Date(to.getTime() - Number(arg('days', 7)) * 86400000)

  const match = { createdAt: { $gte: from, $lte: to } }
  if (arg('device')) match.deviceId = arg('device')

  const outPath = path.resolve(arg('out', 'aqi-export.csv'))
  const header = ['timestamp','deviceId','samples', ...FIELDS].join(',')
  let rows = []

  if (has('raw')) {
    const docs = await AqiModel.find(match).sort({ createdAt: 1 }).lean()
    rows = docs.map(d => [
      d.createdAt.toISOString(), d.deviceId, 1,
      ...FIELDS.map(f => d[f] ?? '')
    ].join(','))
  } else {
    const every = Number(arg('every', 60)) * 1000
    const group = {
      _id: {
        deviceId: '$deviceId',
        bucket: { $toDate: { $subtract: [
          { $toLong: '$createdAt' },
          { $mod: [{ $toLong: '$createdAt' }, every] }
        ]}}
      },
      samples: { $sum: 1 }
    }
    for (const f of FIELDS) group[f] = { $avg: '$' + f }

    const docs = await AqiModel.aggregate([
      { $match: match },
      { $group: group },
      { $sort: { '_id.bucket': 1 } }
    ]).allowDiskUse(true)

    rows = docs.map(d => [
      d._id.bucket.toISOString(), d._id.deviceId, d.samples,
      ...FIELDS.map(f => d[f] == null ? '' : Math.round(d[f] * 100) / 100)
    ].join(','))
  }

  fs.writeFileSync(outPath, header + '\n' + rows.join('\n') + '\n')

  console.log('=== export ===')
  console.log('window    :', from.toISOString(), '->', to.toISOString())
  console.log('mode      :', has('raw') ? 'raw' : `${arg('every', 60)}s averages`)
  console.log('rows      :', rows.length.toLocaleString())
  console.log('written   :', outPath)
  console.log('size      :', (fs.statSync(outPath).size / 1024).toFixed(1), 'KB')

  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
