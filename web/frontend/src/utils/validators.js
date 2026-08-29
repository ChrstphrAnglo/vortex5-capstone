// Single source of truth for password strength rules — mirrors the
// backend's validator.isStrongPassword (8+ chars, upper, lower, number,
// symbol). Previously duplicated separately in Signup.jsx, ResetPassword.jsx,
// and PasswordRequirements.jsx.
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
  { label: 'A symbol', test: (p) => /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]~`]/.test(p) },
]

export const isStrongPassword = (password) => PASSWORD_RULES.every((r) => r.test(password))
