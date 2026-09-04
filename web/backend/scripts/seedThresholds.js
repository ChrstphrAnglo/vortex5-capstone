// Wipe the thresholds collection and reseed it with ONE row derived from the
// canonical band table, marked active.
//
// Why a wipe: the collection accumulated hand-typed experimental rows, and
// because the alerting code used to read whichever row was newest, whichever
// experiment happened last became the live limit for everyone. There is no
// merge that makes those rows meaningful against the new canonical table, so
// the honest migration is to start from the canonical row.
//
// DESTRUCTIVE. Refuses to run without --yes, and prints what it will delete
// first. Not wired into server.js; run it by hand:
//
//   node scripts/seedThresholds.js            # dry run, shows what would go
//   node scripts/seedThresholds.js --yes      # actually does it

require('dotenv').config()

const mongoose = require('mongoose')
const Threshold = require('../models/ThresholdModel')
const { defaultLimits, SOURCE } = require('../config/airQualityBands')

const CONFIRM_FLAG = '--yes'
const LABEL = 'Canonical (DENR / WHO / ASHRAE)'

async function main() {
  const confirmed = process.argv.includes(CONFIRM_FLAG)

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Copy .env.example to .env first.')
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGO_URI)

  const existing = await Threshold.find().sort({ createdAt: -1 }).lean()
  console.log(`\nthresholds collection currently holds ${existing.length} row(s):`)
  for (const row of existing) {
    console.log(`  - ${row.active ? '[active] ' : '         '}${row.label}  (created ${row.createdAt?.toISOString?.() ?? 'unknown'})`)
  }

  const limits = defaultLimits()
  console.log('\nwould insert one row, active:true, from config/airQualityBands.js:')
  console.log(`  label: ${LABEL}`)
  for (const [key, value] of Object.entries(limits)) {
    console.log(`  ${key.padEnd(16)} ${value}`)
  }

  if (!confirmed) {
    console.log(`\nDry run. Nothing changed. Re-run with ${CONFIRM_FLAG} to apply.\n`)
    await mongoose.disconnect()
    return
  }

  const deleted = await Threshold.deleteMany({})
  console.log(`\ndeleted ${deleted.deletedCount} row(s)`)

  const seeded = await Threshold.create({
    label: LABEL,
    ...limits,
    advisories: [SOURCE],
    active: true
  })
  console.log(`inserted ${seeded.label} (${seeded._id}), active:true\n`)

  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('seed failed:', err.message)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
