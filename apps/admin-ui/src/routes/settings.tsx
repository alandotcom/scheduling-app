// Settings page - stub for future implementation

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/auth";

function SettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" />;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-2 text-muted-foreground">
        Configure organization and application settings.
      </p>
      <div className="mt-8 rounded-lg border bg-card p-8 text-center text-muted-foreground">
        Settings will be implemented in later steps.
      </div>
    </div>
  );
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});
