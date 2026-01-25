// Settings page - stub for future implementation

import { createFileRoute } from "@tanstack/react-router";

function SettingsPage() {
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

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});
