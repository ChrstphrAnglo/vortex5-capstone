import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuthContext'
import { ArrowLeft, Users, ChevronDown, ChevronUp } from 'lucide-react'
import AqiDetails from '../components/AqiDetails'
import RecommendedActions from '../components/RecommendedActions'
import ShareDeviceModal from '../components/ShareDeviceModal'

// How long ago a reading can be and still be considered "live"
const STALE_MS = 2 * 60 * 1000 // 2 minutes

function timeAgo(dateStr) {
  if (!dateStr) return 'never'
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)  return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

const DeviceDetail = () => {
  const { deviceId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthContext()

  const [device,      setDevice]      = useState(null)
  const [reading,     setReading]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Recent readings table (diagnostic)
  const [recentReadings,     setRecentReadings]     = useState([])
  const [recentOpen,         setRecentOpen]         = useState(false)

  // Sharing state (admin only) — the modal itself owns the share/unshare
  // flow; this page just tracks whether it's open and the count for the badge.
  const [shareOpen,   setShareOpen]   = useState(false)
  const [sharedCount, setSharedCount] = useState(0)

  // ---------- Fetch device + latest AQI ----------
  useEffect(() => {
    if (!user) return

    const fetchData = async () => {
      try {
        const [devRes, aqiRes] = await Promise.all([
          fetch('/api/device',      { headers: { Authorization: `Bearer ${user.token}` } }),
          fetch('/api/aqi/latest',  { headers: { Authorization: `Bearer ${user.token}` } }),
        ])
        if (devRes.ok) {
          const devices = await devRes.json()
          setDevice(devices.find(x => x.deviceId === deviceId) || null)
        }
        if (aqiRes.ok) {
          const readings = await aqiRes.json()
          setReading(readings.find(x => x.deviceId === deviceId) || null)
        }
        setLastUpdated(new Date())
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const iv = setInterval(fetchData, 10000)
    return () => clearInterval(iv)
  }, [user, deviceId])

  // ---------- Fetch recent readings (diagnostic table) ----------
  const fetchRecent = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(`/api/aqi/device/${deviceId}?limit=20`, {
        headers: { Authorization: `Bearer ${user.token}` }
      })
      if (res.ok) setRecentReadings(await res.json())
    } catch (err) { console.error('recent readings:', err) }
  }, [user, deviceId])

  useEffect(() => {
    fetchRecent()
    const iv = setInterval(fetchRecent, 15000)
    return () => clearInterval(iv)
  }, [fetchRecent])

  // ---------- Render guards ----------
  if (loading) return <div className="dash-page"><p>Loading...</p></div>

  if (!device) {
    return (
      <div className="dash-page">
        <button className="dash-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Back
        </button>
        <p style={{ marginTop: 16 }}>Device not found, or you don't have access to it.</p>
      </div>
    )
  }

  // Determine freshness of the last reading
  const lastReadingAt = reading?.createdAt
  const isStale = !lastReadingAt || (Date.now() - new Date(lastReadingAt).getTime()) > STALE_MS
  const isOnline = device.status === 'online' && !isStale

  // Always show last known data — just mark it visually if stale
  const displayReading = reading || null

  return (
    <div className="dash-page">
      <button className="dash-back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={18} /> Back to devices
      </button>

      {/* ── Header ── */}
      <div className="dash-header" style={{ marginTop: 16 }}>
        <div>
          <h1 className="dash-title">{device.name}</h1>
          <p className="dash-subtitle">
            {device.room}
            {isStale && (
              <span style={{
                marginLeft: 12, padding: '3px 10px',
                background: '#fef3c7', color: '#d97706',
                borderRadius: 999, fontSize: 12, fontWeight: 700,
              }}>
                {lastReadingAt ? `Last reading ${timeAgo(lastReadingAt)}` : 'No data yet'}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user?.role === 'admin' && (
            <button
              className="btn btn-secondary share-header-btn"
              onClick={() => setShareOpen(true)}
            >
              <Users size={15} />
              Share
              {sharedCount > 0 && (
                <span className="share-header-count">{sharedCount}</span>
              )}
            </button>
          )}

          {lastUpdated && (
            <div className="dash-live">
              <span
                className="dash-live-dot"
                style={!isOnline ? { background: '#94a3b8', animation: 'none', boxShadow: 'none' } : undefined}
              />
              {isOnline ? 'Live · ' : 'Paused · '}
              Updated {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* ── Data (always shown; stale readings remain visible) ── */}
      <AqiDetails
        aqi={displayReading || {
          Aqi: null, Temperature: null, Humidity: null,
          PM1: null, PM25: null, PM10: null,
          TVOC: null, CO2: null, Formaldehyde: null,
        }}
      />

      {isOnline && <RecommendedActions reading={displayReading} />}

      {!isOnline && lastReadingAt && (
        <div className="dash-empty" style={{ marginTop: 16, borderColor: '#fcd34d', color: '#92400e', background: '#fffbeb' }}>
          Showing last known reading from {new Date(lastReadingAt).toLocaleString()}.
          Live data will resume when the device reconnects.
        </div>
      )}

      {/* ── Recent Readings (diagnostic) ── */}
      <div className="recent-readings-section">
        <button
          className="recent-readings-toggle"
          onClick={() => setRecentOpen(o => !o)}
        >
          <span>Recent Readings</span>
          <span className="recent-readings-meta">
            {recentReadings.length > 0
              ? `${recentReadings.length} records · last ${timeAgo(recentReadings[0]?.createdAt)}`
              : 'No records yet'}
          </span>
          {recentOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {recentOpen && (
          <div className="recent-readings-body">
            {recentReadings.length === 0 ? (
              <p className="recent-readings-empty">
                No readings recorded yet. Check that the device is connected to MQTT.
              </p>
            ) : (
              <div className="recent-readings-scroll">
                <table className="recent-readings-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>AQI</th>
                      <th>PM2.5</th>
                      <th>PM10</th>
                      <th>CO₂</th>
                      <th>TVOC</th>
                      <th>HCHO</th>
                      <th>Temp</th>
                      <th>Humidity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentReadings.map((r, i) => {
                      // Highlight row if values are identical to the one above it
                      const prev = recentReadings[i - 1]
                      const frozen = prev &&
                        r.PM25 === prev.PM25 &&
                        r.CO2  === prev.CO2  &&
                        r.Temperature === prev.Temperature
                      return (
                        <tr key={r._id} className={frozen ? 'reading-frozen' : ''}>
                          <td className="reading-time">
                            {new Date(r.createdAt).toLocaleTimeString()}
                          </td>
                          <td>{r.Aqi ?? '—'}</td>
                          <td>{r.PM25 ?? '—'}</td>
                          <td>{r.PM10 ?? '—'}</td>
                          <td>{r.CO2 ?? '—'}</td>
                          <td>{r.TVOC ?? '—'}</td>
                          <td>{r.Formaldehyde ?? '—'}</td>
                          <td>{r.Temperature != null ? r.Temperature.toFixed(1) : '—'}</td>
                          <td>{r.Humidity != null ? r.Humidity.toFixed(1) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="recent-readings-hint">
              Rows highlighted in yellow have the same PM2.5, CO₂ and Temperature as the row above — possible frozen/repeated sensor data.
            </p>
          </div>
        )}
      </div>

      {/* ══ Share Modal ══ */}
      {shareOpen && (
        <ShareDeviceModal
          deviceId={deviceId}
          deviceName={device.name}
          deviceRoom={device.room}
          token={user.token}
          onClose={() => setShareOpen(false)}
          onAccessChange={setSharedCount}
        />
      )}
    </div>
  )
}

export default DeviceDetail
