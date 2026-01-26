// Clients management page - stub for future implementation

import { createFileRoute } from "@tanstack/react-router";

function ClientsPage() {
  return (
    <div className="p-10">
      <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
      <p className="mt-3 text-muted-foreground">
        Manage client records and contact information.
      </p>
      <div className="mt-10 rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
        Clients will be implemented in Step 8.
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsPage,
});
