// Test render utilities with QueryClient and TanStack Router

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
} from "@tanstack/react-router";

// Create a test-specific QueryClient with disabled retries and caching
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Simple cleanup tracker
type Cleanup = () => void;
let cleanup: Cleanup | null = null;

export function getCleanup(): Cleanup | null {
  return cleanup;
}

export function clearCleanup() {
  cleanup?.();
  cleanup = null;
}

interface RenderOptions {
  queryClient?: QueryClient;
  initialUrl?: string;
}

/**
 * Render a component with QueryClient provider.
 * For simple component tests that don't need routing.
 */
export function renderWithQuery(
  ui: React.ReactElement,
  options: RenderOptions = {},
) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  });

  cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return {
    container,
    queryClient,
    unmount: () => cleanup?.(),
  };
}

/**
 * Create a test router with memory history for testing URL params.
 */
export function createTestRouter(options: {
  initialUrl?: string;
  component: () => React.ReactNode;
  validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>;
}) {
  const { initialUrl = "/", component, validateSearch } = options;

  const rootRoute = createRootRoute();

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch,
    component,
  });

  const routeTree = rootRoute.addChildren([indexRoute]);

  const memoryHistory = createMemoryHistory({
    initialEntries: [initialUrl],
  });

  return createRouter({
    routeTree,
    history: memoryHistory,
  });
}

/**
 * Render a component with both QueryClient and Router providers.
 * For full integration tests of routed components.
 */
export function renderWithProviders(
  component: () => React.ReactNode,
  options: RenderOptions & {
    validateSearch?: (
      search: Record<string, unknown>,
    ) => Record<string, unknown>;
  } = {},
) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const router = createTestRouter({
    initialUrl: options.initialUrl,
    component,
    validateSearch: options.validateSearch,
  });

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });

  cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return {
    container,
    queryClient,
    router,
    unmount: () => cleanup?.(),
  };
}
