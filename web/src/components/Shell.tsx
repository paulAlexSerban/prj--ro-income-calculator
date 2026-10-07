import { Moon, Sun } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

const links = [
  ["/", "Dashboard"],
  ["/offers", "Offers"],
  ["/timelines", "Timeline"],
  ["/settings", "Settings"],
];

function initialTheme() {
  return localStorage.getItem("oc.theme") === "dark" ? "dark" : "light";
}

export function Shell() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("oc.theme", theme);
  }, [theme]);

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-2">
            <div className="text-sm font-semibold tracking-tight">Offer Compare RO</div>
            <div className="text-xs text-zinc-500">{user?.email}</div>
          </div>
          <nav className="flex flex-wrap gap-1">
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm",
                    isActive ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <Button variant="ghost" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs leading-relaxed text-zinc-500">
        Estimates only, not tax advice. Romanian tax figures are seeded defaults until you mark them verified in Settings.
        Check every rate against ANAF / Codul Fiscal and confirm the result with an accountant.
      </footer>
    </div>
  );
}
