import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type {
  AppIntegrationKey,
  IntegrationSettings,
  IntegrationSummary,
} from "@scheduling/dto";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

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

function normalizeConfigValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return `${value}`;
  }
  if (value === null || value === undefined) {
    return "";
  }

  return "";
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function buildConfigUpdates(input: {
  settings: IntegrationSettings;
  draftConfig: Record<string, string>;
}): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const field of input.settings.configSchema) {
    const nextValue = input.draftConfig[field.key] ?? "";
    const currentValue = normalizeConfigValue(input.settings.config[field.key]);

    if (nextValue !== currentValue) {
      updates[field.key] = nextValue;
    }
  }

  return updates;
}

function buildSecretUpdatePayload(input: {
  draftSecrets: Record<string, string>;
  clearKeys: readonly string[];
}): {
  set?: Record<string, string>;
  clear?: string[];
} {
  const set: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(input.draftSecrets)) {
    const value = rawValue.trim();
    if (value.length > 0) {
      set[key] = value;
    }
  }

  const clear = input.clearKeys.filter((key) => !(key in set));

  return {
    ...(Object.keys(set).length > 0 ? { set } : {}),
    ...(clear.length > 0 ? { clear } : {}),
  };
}

export function IntegrationsSection() {
  const queryClient = useQueryClient();
  const [selectedIntegrationKey, setSelectedIntegrationKey] =
    useState<AppIntegrationKey | null>(null);
  const [updatingIntegrationKey, setUpdatingIntegrationKey] =
    useState<AppIntegrationKey | null>(null);
  const [draftConfig, setDraftConfig] = useState<Record<string, string>>({});
  const [draftSecrets, setDraftSecrets] = useState<Record<string, string>>({});
  const [clearSecretKeys, setClearSecretKeys] = useState<string[]>([]);

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
    }),
  );

  const updateIntegrationSecretsMutation = useMutation(
    orpc.integrations.updateSecrets.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.integrations.key(),
        });
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
  const selectedIntegrationHasSettingsPanel =
    selectedIntegration?.hasSettingsPanel ?? false;

  useEffect(() => {
    if (!selectedIntegrationSettings) {
      return;
    }

    const nextDraftConfig: Record<string, string> = {};
    for (const field of selectedIntegrationSettings.configSchema) {
      nextDraftConfig[field.key] = normalizeConfigValue(
        selectedIntegrationSettings.config[field.key],
      );
    }

    setDraftConfig(nextDraftConfig);
    setDraftSecrets({});
    setClearSecretKeys([]);
  }, [selectedIntegrationSettings]);

  const isSavingSettings =
    updateIntegrationMutation.isPending ||
    updateIntegrationSecretsMutation.isPending;

  const onToggleEnabled = async (
    integration: IntegrationSummary,
    enabled: boolean,
  ) => {
    setUpdatingIntegrationKey(integration.key);

    try {
      await updateIntegrationMutation.mutateAsync({
        key: integration.key,
        enabled,
      });
    } catch (mutationError) {
      toast.error(
        toErrorMessage(mutationError, "Failed to update integration"),
      );
    } finally {
      setUpdatingIntegrationKey(null);
    }
  };

  const onSaveSettings = async () => {
    if (!selectedIntegrationKey || !selectedIntegrationSettings) {
      return;
    }

    const configUpdates = buildConfigUpdates({
      settings: selectedIntegrationSettings,
      draftConfig,
    });
    const secretPayload = buildSecretUpdatePayload({
      draftSecrets,
      clearKeys: clearSecretKeys,
    });

    const hasConfigUpdates = Object.keys(configUpdates).length > 0;
    const hasSecretUpdates =
      (secretPayload.set && Object.keys(secretPayload.set).length > 0) ||
      (secretPayload.clear && secretPayload.clear.length > 0);

    if (!hasConfigUpdates && !hasSecretUpdates) {
      toast.message("No settings changes to save");
      return;
    }

    try {
      if (hasConfigUpdates) {
        await updateIntegrationMutation.mutateAsync({
          key: selectedIntegrationKey,
          config: configUpdates,
        });
      }

      if (hasSecretUpdates) {
        await updateIntegrationSecretsMutation.mutateAsync({
          key: selectedIntegrationKey,
          ...secretPayload,
        });
      }

      setDraftSecrets({});
      setClearSecretKeys([]);
      toast.success("Integration settings saved");
    } catch (mutationError) {
      toast.error(
        toErrorMessage(mutationError, "Failed to save integration settings"),
      );
    }
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
                      void onToggleEnabled(integration, checked)
                    }
                    disabled={
                      updatingIntegrationKey === integration.key ||
                      isSavingSettings
                    }
                    label="Enabled"
                  />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!integration.hasSettingsPanel) {
                        return;
                      }
                      setSelectedIntegrationKey(integration.key);
                    }}
                    disabled={!integration.hasSettingsPanel || isSavingSettings}
                  >
                    {integration.hasSettingsPanel ? "Configure" : "No settings"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <EntityModal
        open={
          selectedIntegrationKey !== null && selectedIntegrationHasSettingsPanel
        }
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIntegrationKey(null);
          }
        }}
        title={selectedIntegration?.name ?? "Integration Settings"}
        description={selectedIntegration?.description}
      >
        <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          {selectedIntegrationKey ===
          null ? null : isLoadingSelectedSettings ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : selectedSettingsError || !selectedIntegrationSettings ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Failed to load integration settings.
            </div>
          ) : (
            <>
              {selectedIntegrationSettings.configSchema.length === 0 &&
              selectedIntegrationSettings.secretSchema.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  This integration does not require credentials or additional
                  setup.
                </div>
              ) : (
                <>
                  {selectedIntegrationSettings.configSchema.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium">Configuration</h3>
                      {selectedIntegrationSettings.configSchema.map((field) => (
                        <div key={field.key} className="space-y-1.5">
                          <Label htmlFor={`integration-config-${field.key}`}>
                            {field.label}
                            {field.required ? " *" : ""}
                          </Label>
                          <Input
                            id={`integration-config-${field.key}`}
                            type={field.inputType}
                            value={draftConfig[field.key] ?? ""}
                            placeholder={field.placeholder}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraftConfig((current) => ({
                                ...current,
                                [field.key]: value,
                              }));
                            }}
                            disabled={isSavingSettings}
                          />
                          {field.description ? (
                            <p className="text-xs text-muted-foreground">
                              {field.description}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {selectedIntegrationSettings.secretSchema.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium">Secrets</h3>
                      {selectedIntegrationSettings.secretSchema.map((field) => {
                        const configured =
                          selectedIntegrationSettings.secretFields[
                            field.key
                          ] === true;
                        const markedForClear = clearSecretKeys.includes(
                          field.key,
                        );

                        return (
                          <div
                            key={field.key}
                            className="space-y-1.5 rounded-md border border-border p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <Label
                                htmlFor={`integration-secret-${field.key}`}
                              >
                                {field.label}
                                {field.required ? " *" : ""}
                              </Label>
                              <Badge
                                variant={
                                  markedForClear
                                    ? "warning"
                                    : configured
                                      ? "outline"
                                      : "secondary"
                                }
                              >
                                {markedForClear
                                  ? "Will clear"
                                  : configured
                                    ? "Configured"
                                    : "Not set"}
                              </Badge>
                            </div>

                            <Input
                              id={`integration-secret-${field.key}`}
                              type="password"
                              value={draftSecrets[field.key] ?? ""}
                              placeholder={field.placeholder}
                              onChange={(event) => {
                                const value = event.target.value;

                                setDraftSecrets((current) => ({
                                  ...current,
                                  [field.key]: value,
                                }));

                                if (value.trim().length > 0) {
                                  setClearSecretKeys((current) =>
                                    current.filter((key) => key !== field.key),
                                  );
                                }
                              }}
                              disabled={isSavingSettings}
                            />

                            <div className="flex items-center justify-between gap-3">
                              {field.description ? (
                                <p className="text-xs text-muted-foreground">
                                  {field.description}
                                </p>
                              ) : (
                                <span />
                              )}

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDraftSecrets((current) => ({
                                    ...current,
                                    [field.key]: "",
                                  }));
                                  setClearSecretKeys((current) => {
                                    if (current.includes(field.key)) {
                                      return current.filter(
                                        (key) => key !== field.key,
                                      );
                                    }
                                    return [...current, field.key];
                                  });
                                }}
                                disabled={isSavingSettings || !configured}
                              >
                                {markedForClear ? "Undo clear" : "Clear saved"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}

              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedIntegrationKey(null)}
                  disabled={isSavingSettings}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void onSaveSettings()}
                  disabled={isSavingSettings}
                >
                  Save settings
                </Button>
              </div>
            </>
          )}
        </div>
      </EntityModal>
    </>
  );
}
