import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForgotPassword } from '../hooks/useForgotPassword'
import bewairLogoWhite from '../assets/bewair_logo_white.png'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const { forgotPassword, error, isLoading, success } = useForgotPassword()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    await forgotPassword(email)
  }

  useEffect(() => {
    if (success) {
      navigate('/reset-password', { state: { email } })
    }
  }, [success, email, navigate])

  return (
    <div className="auth-page">

      {/* ── Left branded panel ── */}
      <div className="auth-panel-left">
        <div className="auth-brand-panel">
          <img src={bewairLogoWhite} alt="BewAir" className="auth-panel-logo" />
          <div className="auth-panel-name">BewAir</div>
          <p className="auth-panel-tagline">
            Real-time air quality monitoring for healthier learning environments.
          </p>
          <div className="auth-panel-divider" />
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="auth-panel-right">
        <div className="auth-form-wrap">
          <h2 className="auth-heading">Forgot Password</h2>
          <p className="auth-subheading">
            Enter your account email and we'll send you a code to reset your password.
          </p>
          <div className="auth-form-divider" />

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input
                className="auth-input"
                type="email"
                placeholder="teacher@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" disabled={isLoading}>
              {isLoading ? 'Sending…' : 'Send Code'}
            </button>
          </form>

          <p className="auth-switch">
            Remembered your password?{' '}
            <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>

    </div>
  )
}

export default ForgotPassword
