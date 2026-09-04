const mongoose = require('mongoose')

const Schema = mongoose.Schema

// An admin OVERRIDE of the canonical band table in config/airQualityBands.js —
// not a replacement for it. Every numeric field defaults to null, and null
// means "use the canonical value" (see utils/thresholdLimits.js). So an admin
// can pin one limit without having to restate the other ten.
//
// Temperature and Humidity are TWO-SIDED: too cold and too dry are real
// problems, not just too hot and too humid, so they are stored as Min/Max
// pairs rather than a single ceiling.
const ThresholdSchema = new Schema(
  {
    label:          { type: String, required: true },

    // One-sided ceilings.
    Aqi:            { type: Number, default: null },
    PM1:            { type: Number, default: null },
    PM25:           { type: Number, default: null },
    PM10:           { type: Number, default: null },
    TVOC:           { type: Number, default: null },
    CO2:            { type: Number, default: null },
    Formaldehyde:   { type: Number, default: null },

    // Two-sided ranges.
    TemperatureMin: { type: Number, default: null },
    TemperatureMax: { type: Number, default: null },
    HumidityMin:    { type: Number, default: null },
    HumidityMax:    { type: Number, default: null },

    advisories:     { type: [String], default: [] },

    // Which row the alerting code actually uses. Previously the newest row
    // silently won, so adding a threshold to experiment with changed live
    // alerting without anyone choosing it.
    active:         { type: Boolean, default: false }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Threshold', ThresholdSchema)
