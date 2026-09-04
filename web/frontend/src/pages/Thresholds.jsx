import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuthContext } from '../hooks/useAuthContext'
import {
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

      <div className="table-card">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Active</th>
              <th>Label</th>
              {FIELD_DEFS.map(({ key, label, unit }) => (
                <th key={key}>{label}{unit ? ` (${unit})` : ''}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {thresholds.map(t => (
              <tr key={t._id}>
                <td>
                  <input
                    type="radio"
                    name="activeThreshold"
                    checked={!!t.active}
                    onChange={() => handleSetActive(t._id)}
                    title="Use this row for alerting"
                  />
                </td>
                <td>{t.label}</td>
                {/* A blank cell is not "unset" — it is the standard value in force. */}
                {FIELD_DEFS.map(({ key }) => (
                  <td key={key}>
                    {t[key] ?? <span className="field-note">{canonical[key]}</span>}
                  </td>
                ))}
                <td>
                  <div className="action-buttons">
                    <button className="icon-btn edit-btn" onClick={() => handleEdit(t)}>
                      <Pencil size={18} />
                    </button>
                    <button className="icon-btn danger-btn" onClick={() => handleDelete(t._id)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {thresholds.length === 0 && (
              <tr>
                <td colSpan={FIELD_DEFS.length + 3} style={{ textAlign: 'center', padding: '15px' }}>
                  No thresholds configured — the standards below are in force
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="threshold-hint" style={{ marginTop: 12 }}>
        Standards: {airQualitySource()}
      </p>
    </div>
  )
}

export default Thresholds
