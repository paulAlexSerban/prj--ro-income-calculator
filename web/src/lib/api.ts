const ACCESS = "oc.access";
const REFRESH = "oc.refresh";
const USER = "oc.user";

export type SessionUser = { id: string; email: string };

export function loadSession(): { user: SessionUser | null; token: string | null } {
  const raw = localStorage.getItem(USER);
  return {
    user: raw ? (JSON.parse(raw) as SessionUser) : null,
    token: localStorage.getItem(ACCESS),
  };
}

export function saveSession(access: string, refresh: string, user: SessionUser) {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
  localStorage.setItem(USER, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
  localStorage.removeItem(USER);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function raw(path: string, init: RequestInit | undefined, token: string | null) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let token = localStorage.getItem(ACCESS);
  let response = await raw(path, init, token);
  if (response.status === 401) {
    const refresh = localStorage.getItem(REFRESH);
    if (refresh) {
      const refreshed = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (refreshed.ok) {
        const data = (await refreshed.json()) as {
          access_token: string;
          refresh_token: string;
          user: SessionUser;
        };
        saveSession(data.access_token, data.refresh_token, data.user);
        token = data.access_token;
        response = await raw(path, init, token);
      } else {
        clearSession();
      }
    }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, body.error ?? response.statusText);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
