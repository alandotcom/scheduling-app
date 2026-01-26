// Settings page - stub for future implementation

import { createFileRoute } from "@tanstack/react-router";

function SettingsPage() {
  return (
    <div className="p-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-3 text-muted-foreground">
        Configure organization and application settings.
      </p>
      <div className="mt-10 rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
        Settings will be implemented in later steps.
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});
