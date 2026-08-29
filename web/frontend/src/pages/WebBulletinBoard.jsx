import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuthContext } from '../hooks/useAuthContext'

const WebBulletinBoard = () => {
  const { user } = useAuthContext()
  const isAdmin = user && user.role === 'admin'

 /* ------------------ EDUCATIONAL VIDEO -------------- */

  const [videoFile, setVideoFile] = useState(null)
  const [mediaList, setMediaList] = useState([])
  const [mediaError, setMediaError] = useState('')
  const [mediaDeleteTarget, setMediaDeleteTarget] = useState(null) // { id, title }
  const [mediaDeleting, setMediaDeleting] = useState(false)

  useEffect(() => {
    const fetchMedia = async () => {
      const res = await fetch('/api/media', {
        headers: { Authorization: `Bearer ${user?.token}` }
      })
      const json = await res.json()
      if (res.ok) setMediaList(json)
    }

    fetchMedia()
  }, [user])

      const handleFileChange = (e) => {
      setVideoFile(e.target.files[0])
    }

    const handleUpload = async () => {
  if (!videoFile) {
    setMediaError('Please choose a video file first.')
    return false
  }

  const formData = new FormData()
  formData.append('title', videoFile.name)
  formData.append('video', videoFile)

  try {
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user?.token}` },
      body: formData
    })

    const json = await res.json()

    if (res.ok) {
      setMediaList(prev => [json, ...prev])
      setVideoFile(null)
      return true
    } else {
      setMediaError(json.error || 'Upload failed.')
      return false
    }
  } catch (err) {
    setMediaError(err.message || 'Upload failed.')
    return false
  }
}
const [showMediaModal, setShowMediaModal] = useState(false)

/* announcements */

const [showModal, setShowModal] = useState(false)
const [announcements, setAnnouncements] = useState([])

const [showEditModal, setShowEditModal] = useState(false)
const [selectedId, setSelectedId] = useState(null)
const [formError, setFormError] = useState('')
const [editError, setEditError] = useState('')
const [listError, setListError] = useState('')

const [editData, setEditData] = useState({
  title: '',
  description: '',
  date: '',
  time: ''
})
const handleChange = (e) => {
  setFormData({
    ...formData,
    [e.target.name]: e.target.value
  })
}

const handleSubmit = async (e) => {
  e.preventDefault()
  setFormError('')

  if (!formData.title || !formData.date) {
    setFormError('Title and date are required.')
    return
  }

  const res = await fetch('/api/announcements', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user?.token}`
    },
    body: JSON.stringify(formData)
  })

  const json = await res.json()

  if (res.ok) {
      setAnnouncements(prev => [json, ...prev])
    setShowModal(false)
    setFormData({
      title: '',
      description: '',
      date: '',
      time: ''
    })
  } else {
    setFormError(json.error || 'Failed to add announcement.')
  }
}
const [formData, setFormData] = useState({
  title: '',
  description: '',
  date: '',
  time: ''
})
useEffect(() => {
  const fetchAnnouncements = async () => {
    const res = await fetch('/api/announcements')
    const json = await res.json()
    if (res.ok) setAnnouncements(json)
  }

  fetchAnnouncements()
}, [])

const handleDelete = async (id) => {
  setListError('')
  const res = await fetch(`/api/announcements/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${user?.token}` }
  })

  if (res.ok) {
    setAnnouncements(prev => prev.filter(a => a._id !== id))
  } else {
    const json = await res.json().catch(() => ({}))
    setListError(json.error || 'Failed to delete announcement.')
  }
}
const handleEdit = (a) => {
  setSelectedId(a._id)
  setEditData({
    title: a.title || '',
    description: a.description || '',
    date: a.date || '',
    time: a.time || ''
  })
  setEditError('')
  setShowEditModal(true)
}

const handleEditChange = (e) => {
  setEditData(prev => ({
    ...prev,
    [e.target.name]: e.target.value
  }))
}

const handleUpdate = async () => {
  setEditError('')
  const res = await fetch(`/api/announcements/${selectedId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user?.token}`
    },
    body: JSON.stringify(editData)
  })

  const json = await res.json()

  if (res.ok) {
    setAnnouncements(prev =>
      prev.map(a => (a._id === selectedId ? json : a))
    )
    setShowEditModal(false)
    setSelectedId(null)
  } else {
    setEditError(json.error || 'Failed to update announcement.')
  }
}

    return(
<div className="configuration">
<div className="section-header">
      <h2 className="page-title">Virtual Bulletin Board</h2>
    </div>

<div className="section-header">
  <h2 className="page-title">Announcements</h2>
  {isAdmin && (
    <button className="add-btn" onClick={() => { setFormError(''); setShowModal(true) }}>
      + Add Announcement
    </button>
  )}
</div>

{listError && <p style={{ color: 'red', marginTop: 10 }}>{listError}</p>}

{showModal && isAdmin && (
  <div className="modal-overlay">
    <div className="modal-card">
      <form onSubmit={handleSubmit}>

        <div className="modal-header">
          <h3>Create Announcement</h3>
        </div>

        <div className="modal-body">
          <div className="label-row">
            <label>Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              className="search-input"
            />
          </div>

          <div className="label-row">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="search-input"
              rows={3}
            />
          </div>

          <div className="threshold-grid">
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="search-input"
              />
            </div>

            <div className="field">
              <label>Time</label>
              <input
                type="time"
                name="time"
                value={formData.time}
                onChange={handleChange}
                className="search-input"
              />
            </div>
          </div>

          {formError && <p style={{ color: 'red', marginTop: 10 }}>{formError}</p>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
            Cancel
          </button>
          <button className="btn btn-primary">Add Announcement</button>
        </div>

      </form>
    </div>
  </div>
)}

{showEditModal && isAdmin && (
  <div className="modal-overlay">
    <div className="modal-card">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleUpdate()
        }}
      >

        <div className="modal-header">
          <h3>Edit Announcement</h3>
        </div>

        <div className="modal-body">
          <div className="label-row">
            <label>Title</label>
            <input
              type="text"
              name="title"
              value={editData.title}
              onChange={handleEditChange}
              required
              className="search-input"
            />
          </div>

          <div className="label-row">
            <label>Description</label>
            <textarea
              name="description"
              value={editData.description}
              onChange={handleEditChange}
              className="search-input"
              rows={3}
            />
          </div>

          <div className="threshold-grid">
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                name="date"
                value={editData.date}
                onChange={handleEditChange}
                className="search-input"
              />
            </div>

            <div className="field">
              <label>Time</label>
              <input
                type="time"
                name="time"
                value={editData.time}
                onChange={handleEditChange}
                className="search-input"
              />
            </div>
          </div>

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

<h3>Existing Announcements</h3>

<div className="table-card">
  <table className="modern-table">
    <thead>
      <tr>
        <th>Title</th>
        {isAdmin && <th className="action-col">Status</th>}
      </tr>
    </thead>

    <tbody>
      {announcements.map(a => (
        <tr key={a._id}>
          <td>{a.title}</td>

          {isAdmin && (
            <td>
              <div className="action-buttons">
                <button
                  className="icon-btn edit-btn"
                  onClick={() => handleEdit(a)}
                >
                  <Pencil size={18} />
                </button>

                <button
                  className="icon-btn danger-btn"
                  onClick={() => handleDelete(a._id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </td>
          )}
        </tr>
      ))}

      {announcements.length === 0 && (
        <tr>
          <td colSpan="2" style={{ textAlign: 'center', padding: '15px' }}>
            No announcements yet
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>

<div className="section-header">
  <h2 className="page-title">Educational Media Display</h2>

  {isAdmin && (
    <button className="add-btn" onClick={() => { setMediaError(''); setShowMediaModal(true) }}>
      + Upload Video
    </button>
  )}
</div>

{mediaError && <p style={{ color: 'red', marginTop: 10 }}>{mediaError}</p>}

{showMediaModal && isAdmin && (
  <div className="modal-overlay">
    <div className="modal-card">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const ok = await handleUpload()
          if (ok) setShowMediaModal(false)
        }}
      >

        <div className="modal-header">
          <h3>Upload Video</h3>
        </div>

        <div className="modal-body">
          <div className="label-row">
            <label>Choose File *</label>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              required
              className="search-input"
            />
          </div>

          {mediaError && <p style={{ color: 'red', marginTop: 10 }}>{mediaError}</p>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowMediaModal(false)}>
            Cancel
          </button>
          <button className="btn btn-primary">Upload</button>
        </div>

      </form>
    </div>
  </div>
)}

<div className="media-list">
  {mediaList.map(m => (
    <div key={m._id} className="media-card">
      <video width="250" controls>
        <source
          src={`https://vortex5-capstone.onrender.com${m.videoUrl}`}
          type="video/mp4"
        />
      </video>

      {isAdmin && (
        <button
          className="danger-media-btn"
          onClick={() => { setMediaError(''); setMediaDeleteTarget({ id: m._id, title: m.title || 'Untitled' }) }}
        >
          Delete
        </button>
      )}
    </div>
  ))}
</div>

{mediaDeleteTarget && (
  <div className="modal-overlay">
    <div className="modal-card">
      <div className="modal-header">
        <h3>Delete Video</h3>
      </div>
      <div className="modal-body">
        <p>Are you sure you want to delete <strong>{mediaDeleteTarget.title}</strong>?</p>
        <p className="modal-warning">This cannot be undone.</p>
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setMediaDeleteTarget(null)}
          disabled={mediaDeleting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={mediaDeleting}
          onClick={async () => {
            setMediaDeleting(true)
            try {
              const res = await fetch(`/api/media/${mediaDeleteTarget.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${user?.token}` },
              })
              const json = await res.json()
              if (!res.ok) {
                setMediaError(json.error || 'Delete failed.')
              } else {
                setMediaList(prev => prev.filter(x => x._id !== mediaDeleteTarget.id))
              }
            } catch (err) {
              setMediaError(err.message || 'Delete failed.')
            } finally {
              setMediaDeleting(false)
              setMediaDeleteTarget(null)
            }
          }}
        >
          {mediaDeleting ? 'Deleting...' : 'Delete Video'}
        </button>
      </div>
    </div>
  </div>
)}
    </div>
    )
}
export default WebBulletinBoard