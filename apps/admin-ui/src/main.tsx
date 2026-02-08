// Main entry point for the admin UI

import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    {
      category: ["logtape", "meta"],
      sinks: ["console"],
      lowestLevel: "warning",
    },
    {
      category: [],
      sinks: ["console"],
      lowestLevel: import.meta.env.DEV ? "debug" : "warning",
    },
  ],
});

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";

import { routeTree } from "./routeTree.gen";
import { getQueryClient } from "./lib/query";

// eslint-disable-next-line import/no-unassigned-import
import "./index.css";

// Create a new router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPreloadDelay: 80,
  defaultPreloadStaleTime: 45_000,
  defaultPendingMs: 220,
  defaultPendingMinMs: 80,
  defaultViewTransition: false,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  );
}

// Render the app
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(<App />);
