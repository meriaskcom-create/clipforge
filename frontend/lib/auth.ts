export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("clipforge_token");
}

export function setToken(token: string): void {
  localStorage.setItem("clipforge_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("clipforge_token");
}

export function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = {
    ...(options.headers || {}),
    ...authHeaders(),
  };

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
}

export async function getCurrentUser() {
  const res = await apiFetch("/auth/me", { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.detail || "Login required");
  }
  return data.user;
}
