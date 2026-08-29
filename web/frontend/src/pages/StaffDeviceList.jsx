import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuthContext'
import { useCachedFetch } from '../hooks/useCachedFetch'
import { CATEGORY_COLORS, aqiCategory } from '../utils/airQualityGuidance'

const STATUS_LABELS = {
  active:    { label: 'Active',   color: '#16a34a', bg: '#dcfce7' },
  available: { label: 'No Data',  color: '#d97706', bg: '#fef3c7' },
  offline:   { label: 'Inactive', color: '#dc2626', bg: '#fee2e2' },
}

const StaffDeviceList = () => {
  const { user } = useAuthContext()
  const navigate = useNavigate()

  const { data: devices, loading: devLoading } = useCachedFetch(
    user ? '/api/device' : null, user?.token, { pollInterval: 10000 }
  )
  const { data: readingsList } = useCachedFetch(
    user ? '/api/aqi/latest' : null, user?.token, { pollInterval: 10000 }
  )

  const readings = useMemo(() => {
    const list = readingsList || []
    return Object.fromEntries(list.map(r => [r.deviceId, r]))
  }, [readingsList])

  // Only show the loading screen on the very first visit, when there's no cached data.
  if (devLoading && !devices) return <div className="dash-page"><p>Loading your devices...</p></div>

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">My Devices</h1>
          <p className="dash-subtitle">
            Welcome, {user.firstName}. Click a device to see live readings.
          </p>
        </div>
      </div>

      {(devices || []).length === 0 ? (
        <div className="dash-empty">
          You don't have any devices yet. Ask your admin to share a sensor with your account.
        </div>
      ) : (
        <div className="dash-device-grid">
          {(devices || []).map(d => {
            const now = Date.now()
            const lastSeen = d.lastSeen ? new Date(d.lastSeen).getTime() : 0
            const isOnline = d.status === 'online' && (now - lastSeen) < 30 * 1000
            // Only use the reading if the device is online — stale data clears to "--"
            const r = isOnline ? readings[d.deviceId] : null
            const aqi = r?.Aqi
            const category = aqiCategory(aqi)
            const aqiColor = category ? CATEGORY_COLORS[category] : '#94a3b8'

            const statusKey = !isOnline ? 'offline' : (r ? 'active' : 'available')
            const status = STATUS_LABELS[statusKey]

            return (
              <div
                key={d.deviceId}
                className="dash-device-card dash-device-card-clickable"
                onClick={() => navigate(`/device/${d.deviceId}`)}
              >
                <div className="dash-device-head">
                  <div>
                    <div className="dash-device-name">{d.name}</div>
                    <div className="dash-device-room">{d.room}</div>
                  </div>
                  <span
                    className="dash-status-pill"
                    style={{ background: status.bg, color: status.color }}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="dash-aqi-big" style={{ color: aqiColor }}>
                  {aqi != null ? aqi : '--'}
                </div>
                <div className="dash-aqi-label" style={{ color: aqiColor }}>
                  {category || 'No data'}
                </div>

                <div className="dash-device-cta">View details →</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default StaffDeviceList
