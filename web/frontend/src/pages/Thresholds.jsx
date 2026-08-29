import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuthContext } from '../hooks/useAuthContext'

const EMPTY_FORM = {
  label: '',
  Aqi: '',
  PM1: '',
  PM25: '',
  PM10: '',
  TVOC: '',
  CO2: '',
  Formaldehyde: '',
  Temperature: '',
  Humidity: ''
}

const FIELD_DEFS = [
  { key: 'Aqi',          label: 'AQI' },
  { key: 'PM1',          label: 'PM 1.0' },
  { key: 'PM25',         label: 'PM 2.5' },
  { key: 'PM10',         label: 'PM 10' },
  { key: 'TVOC',         label: 'TVOC' },
  { key: 'CO2',          label: 'CO₂' },
  { key: 'Formaldehyde', label: 'HCHO' },
  { key: 'Temperature',  label: 'Temperature' },
  { key: 'Humidity',     label: 'Humidity' }
]

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
      {FIELD_DEFS.map(({ key, label }) => (
        <div className="field" key={key}>
          <label>{label}</label>
          <input type="number" name={key} value={data[key]} onChange={onChange} className="search-input" />
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
                <div className="label-row">
                  <label>Label</label>
                  <input
                    type="text"
                    name="label"
                    placeholder="e.g. Unhealthy Air"
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

      <div className="table-card">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Label</th>
              {FIELD_DEFS.map(({ key, label }) => <th key={key}>{label}</th>)}
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {thresholds.map(t => (
              <tr key={t._id}>
                <td>{t.label}</td>
                {FIELD_DEFS.map(({ key }) => <td key={key}>{t[key] ?? '—'}</td>)}
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
                <td colSpan={FIELD_DEFS.length + 2} style={{ textAlign: 'center', padding: '15px' }}>
                  No thresholds configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Thresholds
