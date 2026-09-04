import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuthContext } from '../hooks/useAuthContext'
import {
  airQualityFieldGroups,
  airQualityLimitKeys,
  airQualityLimits,
} from '../utils/airQualityGuidance'
import { buildScale, edgeLabels, alertMarkers } from '../utils/bandScale'

// The form is built from the canonical band table the backend serves, not from
// a hand-maintained list here — adding a field to the canonical table cannot
// silently skip this page, and the "alerting" tags can no longer be wrong.
//
// Temperature and Humidity appear as min/max PAIRS because they are two-sided:
// a classroom that is too cold or too dry is a problem too, not just one that
// is too hot or too humid.
const FIELD_DEFS = airQualityLimitKeys()

// The read view is grouped by the served `group` key, so a field added to the
// canonical table appears in its section without this page changing.
const GROUPS = airQualityFieldGroups()

// Which stored limit keys a field owns. Two-sided fields own a Min/Max pair.
const keysOf = (f) => (f.twoSided ? [`${f.key}Min`, `${f.key}Max`] : [f.key])

// The caption under each value: where the number comes from, then any way this
// field departs from the norm. Both are read from the served metadata rather
// than a list of field names kept here, which would drift.
const captionOf = (f) =>
  [
    f.citation,
    !f.alerting && 'reported through AQI, no separate alert',
    f.derived && 'simulated by the sensor, not measured',
  ]
    .filter(Boolean)
    .join(' · ')

// Pre-computed once: the geometry never changes, only which limits sit on it.
const SCALES = Object.fromEntries(
  GROUPS.flatMap((g) => g.fields).map((f) => [f.key, buildScale(f)])
)

const EMPTY_FORM = Object.fromEntries([['label', ''], ...FIELD_DEFS.map(({ key }) => [key, ''])])

// A blank input stays null, and null means "use the canonical value". That is
// what makes a row an OVERRIDE of the standard rather than a replacement of it.
const toPayload = (data) => {
  const payload = { label: data.label }
  for (const { key } of FIELD_DEFS) {
    payload[key] = data[key] !== '' ? Number(data[key]) : null
  }
  return payload
}

const Thresholds = () => {
  const { user } = useAuthContext()
  const [thresholds, setThresholds] = useState([])
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [showModal, setShowModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [editData, setEditData] = useState(EMPTY_FORM)
  const [loadError, setLoadError] = useState('')
  const [addError, setAddError] = useState('')
  const [editError, setEditError] = useState('')
  const [rowError, setRowError] = useState('')

  // Canonical values, shown as input placeholders so a blank field visibly
  // reads as "the standard applies here".
  const canonical = airQualityLimits()

  // The row alerting actually uses: the one marked active, else none. Values
  // fall back key by key, so a partial override shows its own numbers for the
  // fields it sets and the published standard for the rest.
  const activeRow = thresholds.find((t) => t.active) || null

  const limitsInForce = { ...canonical }
  if (activeRow) {
    for (const key of FIELD_DEFS.map((d) => d.key)) {
      if (activeRow[key] != null) limitsInForce[key] = activeRow[key]
    }
  }

  // A two-sided field renders as a range ("23–30"); a one-sided one as a single
  // number.
  const limitText = (f) => keysOf(f).map((k) => limitsInForce[k]).join('–')

  const isOverridden = (f) => keysOf(f).some((k) => activeRow?.[k] != null)

  // How many limits a row actually sets — the useful thing to know about an
  // override at a glance.
  const overrideCount = (row) =>
    FIELD_DEFS.filter(({ key }) => row[key] != null).length

  useEffect(() => {
    const fetchThresholds = async () => {
      const res = await fetch('/api/threshold', {
        headers: { Authorization: `Bearer ${user?.token}` }
      })
      const json = await res.json()
      if (res.ok) {
        setThresholds(json)
      } else {
        setLoadError(json.error || 'Failed to load thresholds.')
      }
    }
    fetchThresholds()
  }, [user])

  const handleChange = (e) =>
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleEditChange = (e) =>
    setEditData(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setAddError('')
    const res = await fetch('/api/threshold', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user?.token}`
      },
      body: JSON.stringify(toPayload(formData))
    })
    const json = await res.json()
    if (res.ok) {
      setThresholds(prev => [json, ...prev])
      setFormData(EMPTY_FORM)
      setShowModal(false)
    } else {
      setAddError(json.error || 'Failed to add threshold.')
    }
  }

  // Exactly one row drives alerting. Without this the newest row silently
  // won, so adding a row to experiment changed live alerting immediately.
  const handleSetActive = async (id) => {
    setRowError('')
    const res = await fetch(`/api/threshold/${id}/active`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user?.token}` }
    })
    if (res.ok) {
      setThresholds(prev => prev.map(t => ({ ...t, active: t._id === id })))
    } else {
      const json = await res.json().catch(() => ({}))
      setRowError(json.error || 'Failed to set the active threshold.')
    }
  }

  const handleDelete = async (id) => {
    setRowError('')
    const res = await fetch(`/api/threshold/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user?.token}` }
    })
    if (res.ok) {
      setThresholds(prev => prev.filter(t => t._id !== id))
    } else {
      const json = await res.json().catch(() => ({}))
      setRowError(json.error || 'Failed to delete threshold.')
    }
  }

  const handleEdit = (t) => {
    setSelectedId(t._id)
    const next = { label: t.label || '' }
    for (const { key } of FIELD_DEFS) next[key] = t[key] ?? ''
    setEditData(next)
    setEditError('')
    setShowEditModal(true)
  }

  const handleUpdate = async () => {
    setEditError('')
    const res = await fetch(`/api/threshold/${selectedId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user?.token}`
      },
      body: JSON.stringify(toPayload(editData))
    })
    const json = await res.json()
    if (res.ok) {
      setThresholds(prev => prev.map(t => (t._id === selectedId ? json : t)))
      setShowEditModal(false)
      setSelectedId(null)
    } else {
      setEditError(json.error || 'Failed to update threshold.')
    }
  }

  const renderFields = (data, onChange) => (
    <div className="threshold-grid">
      {FIELD_DEFS.map(({ key, label, unit, alerting }) => (
        <div className="field" key={key}>
          <label>
            {label}{unit ? ` (${unit})` : ''}
            {!alerting && <span className="field-note"> · feeds AQI</span>}
          </label>
          <input
            type="number"
            name={key}
            value={data[key]}
            onChange={onChange}
            placeholder={canonical[key] != null ? String(canonical[key]) : ''}
            className="search-input"
          />
        </div>
      ))}
    </div>
  )

  return (
    <div className="configuration">
      <div className="section-header">
        <h2 className="page-title">Air quality thresholds</h2>
      </div>

      {loadError && <p style={{ color: 'red', marginTop: 10 }}>{loadError}</p>}
      {rowError && <p style={{ color: 'red', marginTop: 10 }}>{rowError}</p>}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <form onSubmit={handleSubmit}>
              <div className="modal-header">
                <h3>Configure Threshold</h3>
              </div>

              <div className="modal-body">
                <p className="threshold-hint">
                  Leave a field blank to keep the standard value shown in grey.
                  A number here overrides that one limit only.
                </p>

                <div className="label-row">
                  <label>Label</label>
                  <input
                    type="text"
                    name="label"
                    placeholder="e.g. Exam week, windows closed"
                    value={formData.label}
                    onChange={handleChange}
                    required
                    className="search-input"
                  />
                </div>

                {renderFields(formData, handleChange)}

                {addError && <p style={{ color: 'red', marginTop: 10 }}>{addError}</p>}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary">Add Threshold</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <form onSubmit={(e) => { e.preventDefault(); handleUpdate() }}>
              <div className="modal-header">
                <h3>Edit Threshold</h3>
              </div>

              <div className="modal-body">
                <p className="threshold-hint">
                  Leave a field blank to keep the standard value shown in grey.
                  A number here overrides that one limit only.
                </p>

                <div className="label-row">
                  <label>Label</label>
                  <input
                    type="text"
                    name="label"
                    value={editData.label}
                    onChange={handleEditChange}
                    required
                    className="search-input"
                  />
                </div>

                {renderFields(editData, handleEditChange)}

                {editError && <p style={{ color: 'red', marginTop: 10 }}>{editError}</p>}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One status line replaces the old paragraph, the IN FORCE badge, the
          "Published standards" heading and the "No overrides configured" line —
          four elements that all said the same thing. Reading is the common case
          here, so adding an override is a secondary action beside it. */}
      <div className="tl-status">
        <p className="tl-status-text">
          {activeRow
            ? <>Alerting uses <strong>{activeRow.label}</strong>. Blank fields fall back to the published standard.</>
            : <>Alerting uses the published standards below. No overrides set.</>}
        </p>
        <button
          type="button"
          className="tl-status-action"
          onClick={() => { setAddError(''); setShowModal(true) }}
        >
          Add override
        </button>
      </div>

      {thresholds.length > 0 && (
        <section className="tl-overrides">
          <h3 className="tl-group-head"><span>Overrides</span></h3>
          {thresholds.map((t) => (
            <div className={`tl-override${t.active ? ' is-active' : ''}`} key={t._id}>
              <label className="tl-override-pick">
                <input
                  type="radio"
                  name="activeThreshold"
                  checked={!!t.active}
                  onChange={() => handleSetActive(t._id)}
                />
                <span>{t.active ? 'Alerting' : 'Use this'}</span>
              </label>
              <span className="tl-override-label">{t.label}</span>
              <span className="tl-override-count">
                {overrideCount(t) === 0
                  ? 'no limits set, standards apply'
                  : `${overrideCount(t)} of ${FIELD_DEFS.length} limits set`}
              </span>
              <div className="action-buttons">
                <button className="icon-btn edit-btn" onClick={() => handleEdit(t)} title="Edit override">
                  <Pencil size={18} />
                </button>
                <button className="icon-btn danger-btn" onClick={() => handleDelete(t._id)} title="Delete override">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {GROUPS.map((group) => (
        <section className="tl-group" key={group.key}>
          <h3 className="tl-group-head"><span>{group.label}</span></h3>

          {group.fields.map((f) => {
            const scale = SCALES[f.key]
            const labels = edgeLabels(f, scale)
            const markers = alertMarkers(f, scale, limitsInForce)
            const overridden = isOverridden(f)

            return (
              <article className="tl-row" key={f.key}>
                <div className="tl-id">
                  <h4 className="tl-name">{f.label}</h4>
                  <p className="tl-value">
                    {limitText(f)}
                    {f.unit && <span className="tl-unit">{f.unit}</span>}
                  </p>
                  <p className="tl-caption">
                    {captionOf(f)}
                    {overridden && <span className="tl-overridden"> · overridden</span>}
                  </p>
                </div>

                {/* The bar supplements the number, so it carries no information
                    a screen reader needs beyond the value already announced. */}
                <div className="tl-scale" aria-hidden="true">
                  <div className="tl-bar">
                    {scale.zones.map((z, i) => (
                      <span
                        className="tl-zone"
                        key={i}
                        style={{ '--zone': z.band.color, flexGrow: z.share }}
                      >
                        <span className="tl-zone-name">{z.band.level}</span>
                      </span>
                    ))}

                    {markers.map((m) => (
                      <span
                        className="tl-mark"
                        key={m.kind}
                        style={{ left: `${m.pos * 100}%` }}
                      >
                        <span className="tl-mark-value">{m.text}</span>
                      </span>
                    ))}
                  </div>

                  <div className={`tl-edges${labels.some((l) => l.row) ? ' is-staggered' : ''}`}>
                    {labels.map((l) => (
                      <span
                        className={`tl-edge tl-edge-r${l.row}`}
                        key={l.value}
                        style={{ left: `${l.pos * 100}%` }}
                      >
                        {l.text}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      ))}

    </div>
  )
}

export default Thresholds
