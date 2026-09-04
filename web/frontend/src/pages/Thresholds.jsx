import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuthContext } from '../hooks/useAuthContext'
import {
  airQualityFields,
  airQualityLimitKeys,
  airQualityLimits,
  airQualitySource,
} from '../utils/airQualityGuidance'

// The form is built from the canonical band table the backend serves, not from
// a hand-maintained list here — adding a field to the canonical table cannot
// silently skip this page, and the "alerting" tags can no longer be wrong.
//
// Temperature and Humidity appear as min/max PAIRS because they are two-sided:
// a classroom that is too cold or too dry is a problem too, not just one that
// is too hot or too humid.
const FIELD_DEFS = airQualityLimitKeys()

// The TABLE groups a two-sided field back into one column showing its range —
// "23–30" reads as a range, whereas separate Min and Max columns pushed this to
// fourteen columns of squeezed, overlapping headers.
const COLUMNS = airQualityFields().map((f) =>
  f.twoSided
    ? { key: f.key, label: f.label, unit: f.unit, alerting: f.alerting, keys: [`${f.key}Min`, `${f.key}Max`] }
    : { key: f.key, label: f.label, unit: f.unit, alerting: f.alerting, keys: [f.key] }
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

  // A two-sided field renders as a range ("23–30"); a one-sided one as a single
  // number. Either way an absent override falls back to the canonical value, so
  // a card always shows the limit actually in force rather than a blank.
  const limitText = (row, col) =>
    col.keys.map((k) => row?.[k] ?? canonical[k]).join('–')

  const isOverridden = (row, col) => col.keys.some((k) => row?.[k] != null)

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
        <h2 className="page-title">Configure Thresholds</h2>
        <button className="add-btn" onClick={() => { setAddError(''); setShowModal(true) }}>
          + Add Threshold
        </button>
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

      <hr />

      <h3>Existing Thresholds</h3>
      <p className="threshold-hint">
        Alerting uses the row marked <strong>Active</strong>, with any blank field
        falling back to the standard. With no row selected the standards apply on
        their own — AQI {canonical.Aqi}, CO₂ {canonical.CO2} ppm, TVOC {canonical.TVOC} µg/m³,
        temperature {canonical.TemperatureMin}–{canonical.TemperatureMax} °C,
        humidity {canonical.HumidityMin}–{canonical.HumidityMax} %.
        Rows marked <em>feeds AQI</em> are reported through the AQI rather than
        raising a separate alert.
      </p>

      {/* Cards, not a table: there are nine limit fields but usually only one
          row, so a row-per-record table meant twelve columns for one record and
          scrolled sideways at any window size. */}
      <div className="threshold-cards">
        {thresholds.map(t => (
          <article key={t._id} className={`threshold-card${t.active ? ' is-active' : ''}`}>
            <header className="threshold-card-head">
              <label className="threshold-active">
                <input
                  type="radio"
                  name="activeThreshold"
                  checked={!!t.active}
                  onChange={() => handleSetActive(t._id)}
                />
                <span>{t.active ? 'Active' : 'Use for alerting'}</span>
              </label>

              <h4 className="threshold-card-title">{t.label}</h4>

              <div className="action-buttons">
                <button className="icon-btn edit-btn" onClick={() => handleEdit(t)} title="Edit">
                  <Pencil size={18} />
                </button>
                <button className="icon-btn danger-btn" onClick={() => handleDelete(t._id)} title="Delete">
                  <Trash2 size={18} />
                </button>
              </div>
            </header>

            <dl className="threshold-limits">
              {COLUMNS.map((col) => (
                <div className="threshold-limit" key={col.key}>
                  <dt>{col.label}</dt>
                  {/* Greyed means "no override here" — the standard is in force,
                      not that the value is missing. */}
                  <dd className={isOverridden(t, col) ? '' : 'is-standard'}>
                    {limitText(t, col)}
                    {col.unit && <span className="threshold-unit">{col.unit}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}

        {thresholds.length === 0 && (
          <article className="threshold-card is-active">
            <header className="threshold-card-head">
              <span className="threshold-badge">In force</span>
              <h4 className="threshold-card-title">Published standards</h4>
            </header>
            <p className="threshold-hint" style={{ margin: '4px 0 0' }}>
              No overrides configured. These are the values alerting uses.
            </p>
            <dl className="threshold-limits">
              {COLUMNS.map((col) => (
                <div className="threshold-limit" key={col.key}>
                  <dt>{col.label}</dt>
                  <dd>
                    {limitText(null, col)}
                    {col.unit && <span className="threshold-unit">{col.unit}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        )}
      </div>

      <p className="threshold-hint" style={{ marginTop: 12 }}>
        Standards: {airQualitySource()}
      </p>
    </div>
  )
}

export default Thresholds
