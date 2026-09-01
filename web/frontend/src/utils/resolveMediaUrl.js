// Resolve a stored media URL (bulletin board video) to something a <video>
// tag can actually load. Older uploads were relative paths like
// "/uploads/xyz.mp4" served by this app's own backend; current uploads are
// already full Cloudinary URLs. Only prefix when it's actually relative —
// blindly prefixing an already-absolute URL breaks it.
const API_BASE = import.meta.env.VITE_API_URL || 'https://vortex5-capstone.onrender.com'

export function resolveMediaUrl(url) {
  if (!url) return url
  if (url.startsWith('http')) return url
  return `${API_BASE}${url}`
}
