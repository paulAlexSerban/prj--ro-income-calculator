import type { Currency } from "@offer-compare/engine";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button, Select } from "./ui";

const links = [
  ["/", "Dashboard"],
  ["/offers", "Offers"],
  ["/timelines", "Timeline"],
  ["/settings", "Settings"],
];

type Settings = { display_currency: Currency };
type TaxRule = { verified: boolean };

function initialTheme() {
  return localStorage.getItem("oc.theme") === "dark" ? "dark" : "light";
}

export function Shell() {
  const { user, logout } = useAuth();
  const client = useQueryClient();
  const [theme, setTheme] = useState(initialTheme);
  const [hideBanner, setHideBanner] = useState(() => sessionStorage.getItem("oc.hide-unverified") === "1");
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/api/settings") });
  const rules = useQuery({ queryKey: ["tax-rules"], queryFn: () => api<TaxRule[]>("/api/tax-rules") });
  const unverified = (rules.data ?? []).filter((rule) => !rule.verified).length;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("oc.theme", theme);
  }, [theme]);

  async function setCurrency(currency: Currency) {
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ display_currency: currency }) });
    await client.invalidateQueries({ queryKey: ["settings"] });
    await client.invalidateQueries({ queryKey: ["compare"] });
  }

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-teal-700 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="mr-2 rounded-md focus-visible:ring-2 focus-visible:ring-teal-600">
            <span className="block text-sm font-semibold tracking-tight">Offer Compare RO</span>
            <span className="block text-xs text-zinc-500">{user?.email}</span>
          </Link>
          <nav aria-label="Primary" className="flex flex-wrap gap-1">
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-teal-600",
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              Display
              <Select
                aria-label="Display currency"
                className="h-8 w-24"
                value={settings.data?.display_currency ?? "RON"}
                onChange={(event) => void setCurrency(event.target.value as Currency)}
              >
                <option>RON</option>
                <option>EUR</option>
                <option>USD</option>
              </Select>
            </label>
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <Button variant="ghost" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </div>
        {unverified > 0 && !hideBanner ? (
          <aside className="border-t border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
              <span>
                {unverified} tax {unverified === 1 ? "rule is" : "rules are"} still unverified. Figures are estimates until you check them against ANAF / Codul Fiscal.
              </span>
              <NavLink to="/settings" className="font-medium underline">
                Review in Settings
              </NavLink>
              <button
                type="button"
                className="ml-auto text-xs underline"
                onClick={() => {
                  sessionStorage.setItem("oc.hide-unverified", "1");
                  setHideBanner(true);
                }}
              >
                Dismiss for this session
              </button>
            </div>
          </aside>
        ) : null}
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs leading-relaxed text-zinc-500">
        <p>
          Estimates only, not tax advice. Romanian tax figures are seeded defaults until you mark them verified in Settings.
          Check every rate against ANAF / Codul Fiscal and confirm the result with an accountant.
        </p>
      </footer>
    </div>
  );
}
