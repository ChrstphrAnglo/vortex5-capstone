/// Lightweight "does this look like an email" check — not full RFC
/// compliance, just enough to catch obvious typos before they hit the
/// backend (mirrors the intent of the existing password-strength check,
/// which the email field never had a client-side equivalent of).
final RegExp _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

bool isValidEmail(String value) => _emailPattern.hasMatch(value.trim());
