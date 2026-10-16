// Base URL is build-time configurable. An empty value enables same-origin
// requests through the frontend nginx proxy (used by Kubernetes).
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export function apiUrl(path) {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}
