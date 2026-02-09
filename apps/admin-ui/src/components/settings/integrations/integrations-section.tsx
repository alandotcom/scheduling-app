import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { AppIntegrationKey, IntegrationSummary } from "@scheduling/dto";

import { orpc } from "@/lib/query";

import { EntityModal } from "@/components/entity-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

import { getIntegrationSettingsPanel } from "./panel-registry";

function IntegrationCardHeader({
  integration,
}: {
  integration: IntegrationSummary;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {integration.logoUrl ? (
          <img
            src={integration.logoUrl}
            alt=""
            className="size-8 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="flex size-8 items-center justify-center rounded-md border border-border bg-muted">
            <Icon
              icon={Settings01Icon}
              className="size-4 text-muted-foreground"
            />
          </div>
        )}

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{integration.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {integration.description}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={integration.enabled ? "success" : "secondary"}>
          {integration.enabled ? "Enabled" : "Disabled"}
        </Badge>
        {integration.configured ? (
          <Badge variant="outline">Configured</Badge>
        ) : (
          <Badge variant="warning">Setup needed</Badge>
        )}
      </div>
    </div>
  );
}

export function IntegrationsSection() {
  const queryClient = useQueryClient();
  const [selectedIntegrationKey, setSelectedIntegrationKey] =
    useState<AppIntegrationKey | null>(null);
  const [updatingIntegrationKey, setUpdatingIntegrationKey] =
    useState<AppIntegrationKey | null>(null);

  const {
    data: integrationsResponse,
    isLoading,
    error,
  } = useQuery(orpc.integrations.list.queryOptions({}));

  const settingsQueryIntegrationKey = selectedIntegrationKey ?? "logger";
  const {
    data: selectedIntegrationSettings,
    isLoading: isLoadingSelectedSettings,
    error: selectedSettingsError,
  } = useQuery({
    ...orpc.integrations.getSettings.queryOptions({
      input: { key: settingsQueryIntegrationKey },
    }),
    enabled: selectedIntegrationKey !== null,
  });

  const updateIntegrationMutation = useMutation(
    orpc.integrations.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.integrations.key(),
        });
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to update integration");
      },
      onSettled: () => {
        setUpdatingIntegrationKey(null);
      },
    }),
  );

  const integrations = integrationsResponse?.items ?? [];

  const selectedIntegration = useMemo(
    () =>
      integrations.find(
        (integration) => integration.key === selectedIntegrationKey,
      ) ?? null,
    [integrations, selectedIntegrationKey],
  );

  const SettingsPanel = selectedIntegrationSettings
    ? getIntegrationSettingsPanel(selectedIntegrationSettings.key)
    : null;

  const onToggleEnabled = (
    integration: IntegrationSummary,
    enabled: boolean,
  ) => {
    setUpdatingIntegrationKey(integration.key);
    updateIntegrationMutation.mutate({
      key: integration.key,
      enabled,
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Manage app-level integrations for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            Array.from({ length: 2 }, (_, i) => (
              <div
                key={`integration-skeleton-${i}`}
                className="rounded-xl border border-border p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-md" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </div>
            ))
          ) : error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Failed to load integrations.
            </div>
          ) : integrations.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No app-managed integrations are registered.
            </div>
          ) : (
            integrations.map((integration) => (
              <div
                key={integration.key}
                className="space-y-3 rounded-xl border border-border p-4"
              >
                <IntegrationCardHeader integration={integration} />

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <Checkbox
                    checked={integration.enabled}
                    onChange={(checked) =>
                      onToggleEnabled(integration, checked)
                    }
                    disabled={
                      updateIntegrationMutation.isPending &&
                      updatingIntegrationKey === integration.key
                    }
                    label="Enabled"
                  />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIntegrationKey(integration.key)}
                  >
                    Configure
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <EntityModal
        open={selectedIntegrationKey !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIntegrationKey(null);
          }
        }}
        title={selectedIntegration?.name ?? "Integration Settings"}
        description={selectedIntegration?.description}
      >
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          {selectedIntegrationKey ===
          null ? null : isLoadingSelectedSettings ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : selectedSettingsError ||
            !selectedIntegrationSettings ||
            !SettingsPanel ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Failed to load integration settings.
            </div>
          ) : (
            <SettingsPanel settings={selectedIntegrationSettings} />
          )}
        </div>
      </EntityModal>
    </>
  );
}
