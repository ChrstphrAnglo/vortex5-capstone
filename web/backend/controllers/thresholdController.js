const Threshold = require('../models/ThresholdModel')
const logAudit = require('../utils/logAudit');
const { LIMIT_KEYS } = require('../utils/thresholdLimits')

// A threshold row OVERRIDES config/airQualityBands.js field by field: a key
// left blank stays null and the canonical value applies. Picking the keys off
// LIMIT_KEYS rather than listing them here means adding a field to the
// canonical table cannot silently skip the admin form.
//
// Temperature and Humidity arrive as TemperatureMin/TemperatureMax and
// HumidityMin/HumidityMax — they are two-sided, because too cold and too dry
// are real problems in a room, not just too hot and too humid.
function pickLimits(body) {
  const out = {}
  for (const key of LIMIT_KEYS) {
    const v = body[key]
    out[key] = v === '' || v === undefined || v === null ? null : Number(v)
  }
  return out
}

/* ---------------- GET ---------------- */

const getThresholds = async (req, res) => {
  const thresholds = await Threshold.find().sort({ createdAt: -1 })
  res.status(200).json(thresholds)
}

/* ---------------- CREATE ---------------- */

  const createThreshold = async (req, res) => {
    const { label } = req.body

    try {
      const threshold = await Threshold.create({
        label,
        ...pickLimits(req.body)
      })

      logAudit({
        module: 'Configuration',
        action: `Created threshold "${label}"`,
        user: req.user?.email || 'Unknown'
      })

      res.status(200).json(threshold)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  }

/* ---------------- DELETE THRESHOLD ---------------- */

const deleteThreshold = async (req, res) => {
  const { id } = req.params

  try {
    const threshold = await Threshold.findByIdAndDelete(id)
    if (!threshold) {
      return res.status(404).json({ error: 'Threshold not found' })
    }

    logAudit({
    module: 'Configuration',
    action: `Deleted threshold "${threshold.label}`,
    user: req.user?.email || 'Unknown'
  });

    res.status(200).json(threshold)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/* ---------------- ADD ADVISORY ---------------- */

const addAdvisory = async (req, res) => {
  const { id } = req.params
  const { advisory } = req.body

  if (!advisory) {
    return res.status(400).json({ error: 'Advisory text is required' })
  }

  try {
    const threshold = await Threshold.findById(id)
    if (!threshold) {
      return res.status(404).json({ error: 'Threshold not found' })
    }

    threshold.advisories.push(advisory)
    await threshold.save()

    // Audit log
    logAudit({
    module: 'Advisory',
    action: `Added advisory "${advisory}" to threshold "${threshold.label}"`,
    user: req.user?.email || 'Unknown'
  });

    res.status(200).json(threshold)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/* ---------------- UPDATE ADVISORY ---------------- */

const updateAdvisory = async (req, res) => {
  const { id, index } = req.params
  const { advisory } = req.body

  try {
    const threshold = await Threshold.findById(id)
    if (!threshold) {
      return res.status(404).json({ error: 'Threshold not found' })
    }

    if (!threshold.advisories[index]) {
      return res.status(404).json({ error: 'Advisory not found' })
    }

    threshold.advisories[index] = advisory
    await threshold.save()

    logAudit({
    module: 'Advisory',
    action: `Updated advisory at index ${index} for threshold "${threshold.label}"`,
    user: req.user?.email || 'Unknown'
  });

    res.status(200).json(threshold)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/* ---------------- DELETE ADVISORY ---------------- */

const deleteAdvisory = async (req, res) => {
  const { id, index } = req.params

  try {
    const threshold = await Threshold.findById(id)
    if (!threshold) {
      return res.status(404).json({ error: 'Threshold not found' })
    }

    threshold.advisories.splice(index, 1)
    await threshold.save()

    logAudit({
    module: 'Advisory',
    action: `Deleted advisory at index ${index} from threshold "${threshold.label}"`,
    user: req.user?.email || 'Unknown'
  });

    res.status(200).json(threshold)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/* ---------------- SET ACTIVE ---------------- */

// Exactly one threshold row may be active. Alerting reads that row; if none is
// marked, the code falls back to the newest row and then to sourced defaults.
const setActiveThreshold = async (req, res) => {
  const { id } = req.params

  try {
    const threshold = await Threshold.findById(id)
    if (!threshold) {
      return res.status(404).json({ error: "Threshold not found" })
    }

    await Threshold.updateMany({ _id: { $ne: id } }, { $set: { active: false } })
    threshold.active = true
    await threshold.save()

    logAudit({
      module: "Configuration",
      action: `Set threshold "${threshold.label}" as the active alert threshold`,
      user: req.user?.email || "Unknown"
    })

    res.status(200).json(threshold)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/* ---------------- UPDATE THRESHOLD ---------------- */

const updateThreshold = async (req, res) => {
  const { id } = req.params
  const { label } = req.body

  try {
    const threshold = await Threshold.findByIdAndUpdate(
      id,
      { label, ...pickLimits(req.body) },
      { new: true }
    )

    if (!threshold) {
      return res.status(404).json({ error: 'Threshold not found' })
    }

    logAudit({
      module: 'Configuration',
      action: `Updated threshold "${threshold.label}"`,
      user: req.user?.email || 'Unknown'
    })

    res.status(200).json(threshold)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

module.exports = {
  getThresholds,
  createThreshold,
  setActiveThreshold,
  deleteThreshold,
  updateThreshold,
  addAdvisory,
  updateAdvisory,
  deleteAdvisory
}
