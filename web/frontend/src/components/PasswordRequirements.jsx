import { CheckCircle2, Circle } from 'lucide-react'
import { PASSWORD_RULES } from '../utils/validators'

// Live checklist of password strength requirements, matching the rules
// enforced server-side (validator.isStrongPassword: 8+ chars, upper, lower,
// number, symbol). Meant to be shown under a password field and re-rendered
// as the user types.
const PasswordRequirements = ({ password }) => {
    const checks = PASSWORD_RULES.map(({ label, test }) => ({ label, met: test(password) }))

    return (
        <div style={{ marginTop: '-6px', marginBottom: '4px' }}>
            {checks.map(({ label, met }) => (
                <div
                    key={label}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        color: met ? '#16a34a' : '#64748b',
                        marginBottom: '2px',
                    }}
                >
                    {met ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                    <span>{label}</span>
                </div>
            ))}
        </div>
    )
}

export default PasswordRequirements
