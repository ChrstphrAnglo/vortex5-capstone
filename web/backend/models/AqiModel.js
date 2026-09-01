const mongoose = require('mongoose')

const Schema = mongoose.Schema

const AqiSchema = new Schema({
    deviceId:     { type: String, required: true, index: true },
    Aqi:          { type: Number, required: true }, // computed from PM2.5/PM10
    PM1:          { type: Number, required: true },
    PM25:         { type: Number, required: true },
    PM10:         { type: Number, required: true },
    TVOC:         { type: Number, required: true }, // µg/m³
    CO2:          { type: Number, required: true }, // ppm
    Formaldehyde: { type: Number, required: true }, // µg/m³
    Temperature:  { type: Number, required: true }, // °C
    Humidity:     { type: Number, required: true }  // %RH
}, { timestamps: true })

// Compound index so getLatestPerDevice sorts only within each device,
// not across the entire collection.
AqiSchema.index({ deviceId: 1, createdAt: -1 })

// Auto-delete readings older than the retention window, so the collection
// cannot grow without bound. MongoDB sweeps expired documents in the
// background roughly once a minute.
//
// NOTE: MongoDB will not change expireAfterSeconds on an index that already
// exists. To adjust the window later, drop the index first:
//   db.aqis.dropIndex('createdAt_1')
const RETENTION_DAYS = Number(process.env.AQI_RETENTION_DAYS || 60)
AqiSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 })

module.exports = mongoose.model('AQI', AqiSchema)
