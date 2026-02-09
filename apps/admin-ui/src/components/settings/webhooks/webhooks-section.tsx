import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SvixProvider } from "svix-react";

import { orpc } from "@/lib/query";

import { WebhooksManager } from "./webhooks-manager";
import type { WebhooksRouteActions, WebhooksRouteState } from "./types";

interface WebhooksSectionProps {
  routeState: WebhooksRouteState;
  actions: WebhooksRouteActions;
}

export function WebhooksSection({ routeState, actions }: WebhooksSectionProps) {
  const {
    data: webhookSession,
    isLoading,
    error,
  } = useQuery({
    ...orpc.webhooks.session.queryOptions({}),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const svixOptions = useMemo(
    () =>
      webhookSession?.serverUrl
        ? { serverUrl: `${window.location.origin}/svix-api` }
        : undefined,
    [webhookSession?.serverUrl],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Connecting to webhook service...
      </div>
    );
  }

  if (error || !webhookSession) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load webhook management session.
      </div>
    );
  }

  return (
    <SvixProvider
      token={webhookSession.token}
      appId={webhookSession.appId}
      options={svixOptions}
    >
      <WebhooksManager routeState={routeState} actions={actions} />
    </SvixProvider>
  );
}
