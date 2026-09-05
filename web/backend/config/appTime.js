// Time zone for every date-based aggregation.
//
// The sensors and the school are in Asia/Manila (UTC+8). MongoDB date
// operators default to UTC, so without an explicit timezone $hour, $dayOfWeek
// and $dateTrunc all answer in UTC: a 10 AM classroom peak reported as 2 AM,
// and every reading after 4 PM Manila filed under the previous day, which
// corrupted the weekday/weekend split.
//
// ONE constant, imported wherever a date operator is built. Do not inline the
// literal anywhere else.

const TZ = process.env.APP_TIMEZONE || 'Asia/Manila'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// Offset of `date` in `tz`, in milliseconds east of UTC.
//
// Intl is used rather than a date library because the backend has no dayjs and
// this is the only place that needs it. Recomputed per instant, so a zone with
// daylight saving stays correct; Asia/Manila has none, so it is always +8h.
function zoneOffsetMs(date, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  }).formatToParts(date)

  const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00'
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  if (!match) return 0

  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * HOUR_MS + Number(match[3]) * MINUTE_MS)
}

// Start of the local calendar day containing `date`, returned as a UTC instant.
function startOfZonedDay(date, tz = TZ) {
  const offset = zoneOffsetMs(date, tz)
  const local = date.getTime() + offset
  const localMidnight = Math.floor(local / DAY_MS) * DAY_MS
  return new Date(localMidnight - offset)
}

// Local day-of-week in Mongo numbering (1 = Sunday ... 7 = Saturday), so the
// value can be compared directly against a $dayOfWeek result.
function zonedDayOfWeek(date, tz = TZ) {
  const offset = zoneOffsetMs(date, tz)
  return new Date(date.getTime() + offset).getUTCDay() + 1
}

module.exports = {
  TZ,
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  zoneOffsetMs,
  startOfZonedDay,
  zonedDayOfWeek,
}
