import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { api, clearSession, loadSession, saveSession, type SessionUser } from "./api";

type AuthState = {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => loadSession().user);

  const value = useMemo<AuthState>(
    () => ({
      user,
      async login(email, password) {
        const data = await api<{ access_token: string; refresh_token: string; user: SessionUser }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        saveSession(data.access_token, data.refresh_token, data.user);
        setUser(data.user);
      },
      async register(email, password) {
        const data = await api<{ access_token: string; refresh_token: string; user: SessionUser }>(
          "/api/auth/register",
          { method: "POST", body: JSON.stringify({ email, password }) },
        );
        saveSession(data.access_token, data.refresh_token, data.user);
        setUser(data.user);
      },
      async logout() {
        const refresh = localStorage.getItem("oc.refresh");
        if (refresh) {
          await api("/api/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: refresh }) }).catch(
            () => undefined,
          );
        }
        clearSession();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
