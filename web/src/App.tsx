import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { TooltipProvider } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { DashboardPage, PrintPage } from "./pages/Dashboard";
import { EditOfferPage, NewOfferPage, OfferDetailPage, OffersPage } from "./pages/Offers";
import { SettingsPage } from "./pages/Settings";
import { TimelineDetailPage, TimelinesPage } from "./pages/Timelines";

const client = new QueryClient();

function Private({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
        <TooltipProvider delayDuration={200}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            element={
              <Private>
                <Shell />
              </Private>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/print" element={<PrintPage />} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="/offers/new" element={<NewOfferPage />} />
            <Route path="/offers/:id" element={<OfferDetailPage />} />
            <Route path="/offers/:id/edit" element={<EditOfferPage />} />
            <Route path="/timelines" element={<TimelinesPage />} />
            <Route path="/timelines/:id" element={<TimelineDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
        </TooltipProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
