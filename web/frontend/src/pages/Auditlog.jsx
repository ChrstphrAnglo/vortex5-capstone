import { useEffect, useState } from 'react'
import { useAuthContext } from '../hooks/useAuthContext'

const LOGS_PER_PAGE = 10

const AuditLogs = () => {
  const { user } = useAuthContext()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [sortModule, setSortModule] = useState('all')
  const [sortDate, setSortDate] = useState('latest')

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      setLoading(false)
      return
    }
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/auditlog', {
          headers: { Authorization: `Bearer ${user.token}` }
        })
        const json = await res.json()
        if (res.ok) {
          setLogs(json)
        } else {
          setError(json.error || 'Failed to fetch audit logs')
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
  }, [user])

  if (!user) return <p>Please log in.</p>
  if (user.role !== 'admin') return <p style={{ color: 'red' }}>Audit Logs is admin-only.</p>
  if (loading) return <p>Loading audit logs...</p>
  if (error) return <p style={{ color: 'red' }}>{error}</p>

  // FILTER
  const filteredLogs =
    sortModule === 'all'
      ? logs
      : logs.filter(log => log.module === sortModule)

  // SORT
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    if (sortDate === 'latest') return new Date(b.date) - new Date(a.date)
    return new Date(a.date) - new Date(b.date)
  })

  // PAGINATION
  const totalPages = Math.ceil(sortedLogs.length / LOGS_PER_PAGE)
  const indexOfLast = currentPage * LOGS_PER_PAGE
  const indexOfFirst = indexOfLast - LOGS_PER_PAGE
  const currentLogs = sortedLogs.slice(indexOfFirst, indexOfLast)

  return (
    <div className="audit-logs">
      <div className="section-header">
        <h2 className="page-title">Audit Logs</h2>
      </div>

      {/* FILTER / SORT */}
      <div className="table-controls">
        <div>
          <label>Module:</label>
          <select
            value={sortModule}
            onChange={e => {
              setSortModule(e.target.value)
              setCurrentPage(1)
            }}
            className="sort-select"
          >
            <option value="all">All</option>
            <option value="Bulletin Board">Bulletin Board</option>
            <option value="Classroom">Classroom</option>
            <option value="Configuration">Configuration</option>
            <option value="Advisory">Advisory</option>
            <option value="User">User</option>
          </select>
        </div>

        <div>
          <label>Date:</label>
          <select
            value={sortDate}
            onChange={e => {
              setSortDate(e.target.value)
              setCurrentPage(1)
            }}
            className="sort-select"
          >
            <option value="latest">Latest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
      </div>

      {/* TABLE */}
      <div className="table-card">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Action</th>
              <th>User</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {currentLogs.map(log => (
              <tr key={log._id}>
                <td>{log.module}</td>
                <td>{log.action}</td>
                <td>{log.user}</td>
                <td>{new Date(log.date).toLocaleString()}</td>
              </tr>
            ))}

            {currentLogs.length === 0 && (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '15px' }}>
                  No logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <div className="pagination">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(p => p - 1)}
        >
          Prev
        </button>

        {[...Array(totalPages)].map((_, i) => {
          const page = i + 1;

          if (page <= 4 || page === totalPages) {
            return (
              <button
                key={i}
                className={currentPage === page ? 'active' : ''}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            );
          }

          if (page === 5) {
            return <span key={i} className="dots">…</span>;
          }

          return null;
        })}

        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage(p => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default AuditLogs