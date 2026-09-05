// When the classrooms are actually occupied.
//
// A classroom sits empty roughly sixteen hours a day, and those empty hours
// dilute every average: a room that is stuffy all afternoon looks fine once the
// quiet night is averaged in. Analytics can therefore restrict itself to school
// hours, and this module is the one definition of what those are.
//
// Configurable rather than hardcoded in a query, because school hours differ by
// school and by term.
//
//   SCHOOL_DAYS       comma-separated Mongo $dayOfWeek numbers (1=Sun .. 7=Sat)
//   SCHOOL_START_HOUR local hour the school day starts, inclusive
//   SCHOOL_END_HOUR   local hour it ends, exclusive

const { TZ, MINUTE_MS, HOUR_MS, DAY_MS, startOfZonedDay, zonedDayOfWeek } = require('./appTime')

const parseDays = (raw) => {
  if (!raw) return null
  const days = raw
    .split(',')
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  return days.length ? days : null
}

const SCHOOL_HOURS = {
  // Monday to Friday in Mongo $dayOfWeek numbering.
  days: parseDays(process.env.SCHOOL_DAYS) || [2, 3, 4, 5, 6],
  startHour: Number(process.env.SCHOOL_START_HOUR ?? 7),
  endHour: Number(process.env.SCHOOL_END_HOUR ?? 17),
}

const DOW_NAMES = ['', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n) => String(n).padStart(2, '0')

// Human label for the window, so the UI can state the real configured hours
// rather than assuming the default.
function describeSchoolHours(cfg = SCHOOL_HOURS) {
  const days = [...cfg.days].sort((a, b) => a - b)
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1)
  const dayLabel = contiguous && days.length > 1
    ? `${DOW_NAMES[days[0]]}-${DOW_NAMES[days[days.length - 1]]}`
    : days.map((d) => DOW_NAMES[d]).join(', ')
  return `${dayLabel} ${pad(cfg.startHour)}:00-${pad(cfg.endHour)}:00`
}

/**
 * Aggregation stages restricting a pipeline to school hours.
 *
 * Returns [] when the filter is off, so a pipeline can spread this
 * unconditionally and every panel gets the same treatment. That is the point:
 * composing it once is what stops one panel quietly disagreeing with another.
 */
function schoolHoursStages(active, tz = TZ, cfg = SCHOOL_HOURS) {
  if (!active) return []
  return [
    { $addFields: {
      _shDow: { $dayOfWeek: { date: '$createdAt', timezone: tz } },
      _shHour: { $hour: { date: '$createdAt', timezone: tz } },
    }},
    { $match: {
      _shDow: { $in: cfg.days },
      _shHour: { $gte: cfg.startHour, $lt: cfg.endHour },
    }},
  ]
}

/**
 * Minutes between two instants that fall inside the window — the denominator
 * for the data-coverage figure.
 *
 * Walks calendar days in the target zone rather than doing modular arithmetic
 * on the epoch, so a partial first or last day is counted correctly. Asia/Manila
 * has no daylight saving; in a zone that does, a transition day would be off by
 * up to an hour, which is acceptable for a coverage percentage.
 */
function expectedMinutes(from, to, { active = false, tz = TZ, cfg = SCHOOL_HOURS } = {}) {
  const total = Math.max(0, to.getTime() - from.getTime())
  if (!active) return Math.round(total / MINUTE_MS)

  let minutes = 0
  let cursor = startOfZonedDay(from, tz)
  const end = to.getTime()

  // Guard against a pathological range producing an unbounded loop.
  for (let i = 0; i < 4000 && cursor.getTime() < end; i++) {
    const dayStart = cursor.getTime()

    if (cfg.days.includes(zonedDayOfWeek(cursor, tz))) {
      const windowStart = dayStart + cfg.startHour * HOUR_MS
      const windowEnd = dayStart + cfg.endHour * HOUR_MS
      const overlap = Math.min(windowEnd, end) - Math.max(windowStart, from.getTime())
      if (overlap > 0) minutes += overlap / MINUTE_MS
    }

    cursor = new Date(dayStart + DAY_MS)
  }

  return Math.round(minutes)
}

module.exports = { SCHOOL_HOURS, describeSchoolHours, schoolHoursStages, expectedMinutes }
