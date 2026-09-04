// Geometry for the threshold band bars.
//
// Turns a served field's `bands[]` into drawable zones, edge labels and marker
// positions. Kept apart from the page so it can be exercised on its own — the
// arithmetic is where this feature can be quietly wrong.
//
// Two problems this solves:
//
// 1. Several bands are open-ended (max === null, and min === null for the
//    two-sided fields). Nothing infinite can be drawn, so the scale is capped a
//    quarter of the finite span past the last finite edge. The open zone then
//    runs off that end WITHOUT a terminal number, which is what tells the
//    reader it continues.
//
// 2. The ranges are wildly non-linear. TVOC runs 300 / 1000 / 3000 / 10000 /
//    25000, so a strictly proportional "Good" zone would be 1.2% of the bar —
//    invisible. Every zone therefore gets a minimum share of the width, taken
//    proportionally from the zones that can afford it. Temperature and Humidity,
//    whose ranges are already even, are left essentially untouched by this.

/** No zone may be drawn narrower than this share of the bar. */
export const MIN_ZONE_SHARE = 0.06

/** How far past the last finite edge an open-ended end of the scale extends. */
const OPEN_END_PAD = 0.25

const clamp01 = (n) => Math.min(1, Math.max(0, n))

/**
 * Raise every zone below the floor up to it, taking the difference from the
 * zones above the floor in proportion to how much room each has to give.
 * Iterates because lifting one zone can push another below the floor.
 */
function applyFloor(shares, floor = MIN_ZONE_SHARE) {
  const out = shares.slice()

  // A field with more zones than the floor allows cannot satisfy it at all;
  // fall back to equal widths rather than producing negative shares.
  if (floor * out.length >= 1) return out.map(() => 1 / out.length)

  for (let pass = 0; pass < 6; pass++) {
    const below = []
    const above = []
    out.forEach((s, i) => (s < floor ? below.push(i) : above.push(i)))
    if (below.length === 0) break

    const deficit = below.reduce((d, i) => d + (floor - out[i]), 0)
    const surplus = above.reduce((t, i) => t + (out[i] - floor), 0)
    if (surplus <= 0) return out.map(() => 1 / out.length)

    const take = Math.min(1, deficit / surplus)
    for (const i of below) out[i] = floor
    for (const i of above) out[i] -= (out[i] - floor) * take
  }

  const total = out.reduce((a, b) => a + b, 0)
  return out.map((s) => s / total)
}

/**
 * @param {object} field a served field definition (label, unit, bands, ...)
 * @returns {{scaleMin, scaleMax, openBelow, openAbove, zones}} where each zone
 *          is { band, from, to, share } and shares sum to 1.
 */
export function buildScale(field) {
  const bands = field?.bands ?? []
  if (bands.length === 0) return null

  const finite = []
  for (const b of bands) {
    if (b.min != null && Number.isFinite(b.min)) finite.push(b.min)
    if (b.max != null && Number.isFinite(b.max)) finite.push(b.max)
  }
  if (finite.length === 0) return null

  const lo = Math.min(...finite)
  const hi = Math.max(...finite)
  const span = hi - lo || Math.abs(hi) || 1

  const openBelow = bands[0].min == null
  const openAbove = bands[bands.length - 1].max == null

  const scaleMin = openBelow ? lo - OPEN_END_PAD * span : lo
  const scaleMax = openAbove ? hi + OPEN_END_PAD * span : hi
  const drawn = scaleMax - scaleMin

  const raw = bands.map((band) => {
    const from = band.min == null ? scaleMin : Math.max(band.min, scaleMin)
    const to = band.max == null ? scaleMax : Math.min(band.max, scaleMax)
    return { band, from, to }
  })

  const shares = applyFloor(raw.map((z) => Math.max(0, (z.to - z.from) / drawn)))

  return {
    scaleMin,
    scaleMax,
    openBelow,
    openAbove,
    zones: raw.map((z, i) => ({ ...z, share: shares[i] })),
  }
}

/**
 * Where a value sits along the drawn bar, 0..1.
 *
 * Maps through the SAME piecewise transform the zones were drawn with, so a
 * marker always lands on the boundary the eye actually sees. Using a plain
 * linear percentage here would put markers in the wrong zone for every field
 * whose widths were adjusted by the floor.
 */
export function positionOf(scale, value) {
  if (!scale || value == null) return null
  let acc = 0
  for (let i = 0; i < scale.zones.length; i++) {
    const z = scale.zones[i]
    const isLast = i === scale.zones.length - 1
    if (value <= z.to || isLast) {
      const width = z.to - z.from
      const frac = width === 0 ? 0 : (value - z.from) / width
      return clamp01(acc + clamp01(frac) * z.share)
    }
    acc += z.share
  }
  return 1
}

const trim = (n) =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)

/**
 * Labels for every FINITE band boundary, at its true drawn position.
 *
 * An open end is deliberately left unlabelled: the padding beyond the last real
 * edge is a drawing convention, not a value, and putting a number on it would
 * assert a ceiling the standard does not set.
 *
 * `row` alternates 0/1 on fields with more than four boundaries so labels can be
 * staggered onto two lines. That avoids collisions without measuring text.
 */
export function edgeLabels(field, scale) {
  if (!scale) return []
  const values = []

  const first = scale.zones[0]
  if (!scale.openBelow) values.push(first.from)
  for (const z of scale.zones) {
    if (z.band.max != null && Number.isFinite(z.band.max)) values.push(z.band.max)
  }

  const stagger = values.length > 4
  return values.map((value, i) => ({
    value,
    text: trim(value),
    pos: positionOf(scale, value),
    row: stagger ? i % 2 : 0,
  }))
}

/**
 * The alert markers for a field: one for a ceiling, two for a two-sided field.
 * These are the only high-contrast marks on the bar.
 */
export function alertMarkers(field, scale, limits = {}) {
  if (!scale) return []
  const markers = []

  const push = (value, kind) => {
    if (value == null) return
    markers.push({ value, kind, text: trim(value), pos: positionOf(scale, value) })
  }

  if (field.twoSided) {
    push(limits[`${field.key}Min`] ?? field.alertLow, 'low')
    push(limits[`${field.key}Max`] ?? field.alertHigh, 'high')
  } else {
    push(limits[field.key] ?? field.alertHigh, 'high')
  }

  return markers
}
