import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AppIntegrationKey,
  IntegrationSettings,
  IntegrationSummary,
} from "@scheduling/dto";

import { orpc } from "@/lib/query";

import { EntityModal } from "@/components/entity-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

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

const integrationLogoFallbackByKey: Partial<Record<AppIntegrationKey, string>> =
  {
    resend: "https://cdn.resend.com/brand/resend-icon-black.svg",
  };

function getIntegrationLogoUrl(integration: IntegrationSummary): string | null {
  return (
    integration.logoUrl ?? integrationLogoFallbackByKey[integration.key] ?? null
  );
}

export function getOrderedIntegrationsForDisplay(input: {
  integrations: readonly IntegrationSummary[];
  searchQuery: string;
}): IntegrationSummary[] {
  const normalizedQuery = input.searchQuery.trim().toLowerCase();

  return [...input.integrations]
    .filter((integration) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        integration.name.toLowerCase().includes(normalizedQuery) ||
        integration.description.toLowerCase().includes(normalizedQuery) ||
        integration.key.toLowerCase().includes(normalizedQuery)
      );
    })
    .toSorted((left, right) => {
      if (left.enabled !== right.enabled) {
        return left.enabled ? -1 : 1;
      }
      if (left.configured !== right.configured) {
        return left.configured ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

export function splitIntegrationsByEnabled(
  integrations: readonly IntegrationSummary[],
): {
  enabledIntegrations: IntegrationSummary[];
  disabledIntegrations: IntegrationSummary[];
} {
  const enabledIntegrations: IntegrationSummary[] = [];
  const disabledIntegrations: IntegrationSummary[] = [];

  for (const integration of integrations) {
    if (integration.enabled) {
      enabledIntegrations.push(integration);
      continue;
    }

    disabledIntegrations.push(integration);
  }

  return { enabledIntegrations, disabledIntegrations };
}

export function shouldHydrateIntegrationDrafts(input: {
  selectedIntegrationKey: AppIntegrationKey | null;
  selectedIntegrationSettings: IntegrationSettings | undefined;
  draftHydratedForKey: AppIntegrationKey | null;
}): boolean {
  if (
    input.selectedIntegrationKey === null ||
    input.selectedIntegrationSettings === undefined
  ) {
    return false;
  }

  return input.draftHydratedForKey !== input.selectedIntegrationKey;
}

function IntegrationLogo({
  integration,
  sizeClass = "size-8",
}: {
  integration: IntegrationSummary;
  sizeClass?: string;
}) {
  const logoUrl = getIntegrationLogoUrl(integration);

  if (logoUrl) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-1 ${sizeClass}`}
      >
        <img
          src={logoUrl}
          alt={`${integration.name} logo`}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground ${sizeClass}`}
      aria-hidden="true"
    >
      {integration.name.charAt(0).toUpperCase()}
    </div>
  );
}

function IntegrationRow({
  integration,
  disabled,
  onSetEnabled,
  onConfigure,
}: {
  integration: IntegrationSummary;
  disabled: boolean;
  onSetEnabled: (enabled: boolean) => void;
  onConfigure: () => void;
}) {
  const setupLabel = integration.configured ? "Configured" : "Needs setup";

  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <IntegrationLogo integration={integration} sizeClass="size-9" />

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{integration.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {integration.description}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground">Enabled</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{setupLabel}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSetEnabled(!integration.enabled)}
          disabled={disabled}
        >
          {integration.enabled ? "Disable" : "Enable"}
        </Button>
        {integration.hasSettingsPanel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onConfigure}
            disabled={disabled}
          >
            Configure
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AddConnectionList({
  integrations,
  onSelect,
  disabled,
}: {
  integrations: readonly IntegrationSummary[];
  onSelect: (integration: IntegrationSummary) => void;
  disabled: boolean;
}) {
  if (integrations.length === 0) {
    return (
      <div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
        No services match your search.
      </div>
    );
  }

  return (
    <div className="max-h-[420px] space-y-1 overflow-y-auto">
      {integrations.map((integration) => (
        <button
          key={integration.key}
          type="button"
          onClick={() => onSelect(integration)}
          disabled={disabled}
          className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <IntegrationLogo integration={integration} />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{integration.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {integration.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

export function IntegrationsSection() {
  const queryClient = useQueryClient();
  const [updatingIntegrationKey, setUpdatingIntegrationKey] =
    useState<AppIntegrationKey | null>(null);
  const [pageSearchQuery, setPageSearchQuery] = useState("");
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedIntegrationKey, setSelectedIntegrationKey] =
    useState<AppIntegrationKey | null>(null);
  const [draftConfig, setDraftConfig] = useState<Record<string, string>>({});
  const [draftSecrets, setDraftSecrets] = useState<Record<string, string>>({});
  const [clearSecretKeys, setClearSecretKeys] = useState<string[]>([]);
  const [draftHydratedForKey, setDraftHydratedForKey] =
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

  const { enabledIntegrations, disabledIntegrations } = useMemo(
    () => splitIntegrationsByEnabled(integrations),
    [integrations],
  );
  const filteredEnabledIntegrations = useMemo(
    () =>
      getOrderedIntegrationsForDisplay({
        integrations: enabledIntegrations,
        searchQuery: pageSearchQuery,
      }),
    [enabledIntegrations, pageSearchQuery],
  );
  const addableIntegrations = useMemo(
    () =>
      getOrderedIntegrationsForDisplay({
        integrations: disabledIntegrations,
        searchQuery: addSearchQuery,
      }),
    [disabledIntegrations, addSearchQuery],
  );

  useEffect(() => {
    if (selectedIntegrationKey === null) {
      setDraftHydratedForKey(null);
      setDraftConfig({});
      setDraftSecrets({});
      setClearSecretKeys([]);
      return;
    }
  }, [selectedIntegrationKey]);

  useEffect(() => {
    const settings = selectedIntegrationSettings;
    if (!settings) {
      return;
    }

    if (
      !shouldHydrateIntegrationDrafts({
        selectedIntegrationKey,
        selectedIntegrationSettings: settings,
        draftHydratedForKey,
      })
    ) {
      return;
    }

    const nextDraftConfig: Record<string, string> = {};
    for (const field of settings.configSchema) {
      nextDraftConfig[field.key] = normalizeConfigValue(
        settings.config[field.key],
      );
    }

    setDraftConfig(nextDraftConfig);
    setDraftSecrets({});
    setClearSecretKeys([]);
    setDraftHydratedForKey(selectedIntegrationKey);
  }, [
    selectedIntegrationSettings,
    selectedIntegrationKey,
    draftHydratedForKey,
  ]);

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

  const openAddModal = () => {
    setAddSearchQuery("");
    setIsAddModalOpen(true);
  };

  const onSelectIntegrationFromAddModal = (integration: IntegrationSummary) => {
    setIsAddModalOpen(false);

    if (integration.hasSettingsPanel) {
      setSelectedIntegrationKey(integration.key);
      return;
    }

    void onToggleEnabled(integration, true);
  };

  return (
    <>
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Integrations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect tools and services used by your workflows.
          </p>
          {!isLoading && !error ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {enabledIntegrations.length} enabled of {integrations.length}{" "}
              integrations
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input
              value={pageSearchQuery}
              onChange={(event) => setPageSearchQuery(event.target.value)}
              placeholder="Search enabled integrations"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={openAddModal}
            disabled={disabledIntegrations.length === 0}
          >
            Add Connection
          </Button>
        </div>

        <div>
          {isLoading ? (
            <div className="divide-y rounded-lg border border-border">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={`integration-skeleton-${index}`} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-8 rounded" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-56" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-24 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Failed to load integrations.
            </div>
          ) : integrations.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No app-managed integrations are registered.
            </div>
          ) : enabledIntegrations.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm">
              <p className="text-muted-foreground">
                No enabled integrations yet.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={openAddModal}
                disabled={disabledIntegrations.length === 0}
              >
                Add Connection
              </Button>
            </div>
          ) : filteredEnabledIntegrations.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No enabled integrations match your search.
            </div>
          ) : (
            <div className="divide-y rounded-lg border border-border">
              {filteredEnabledIntegrations.map((integration) => (
                <div key={integration.key} className="px-4">
                  <IntegrationRow
                    integration={integration}
                    disabled={
                      isSavingSettings ||
                      updatingIntegrationKey === integration.key
                    }
                    onSetEnabled={(enabled) =>
                      void onToggleEnabled(integration, enabled)
                    }
                    onConfigure={() =>
                      setSelectedIntegrationKey(integration.key)
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <EntityModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        title="Add Connection"
        description="Select a service to connect"
      >
        <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          <Input
            autoFocus
            value={addSearchQuery}
            onChange={(event) => setAddSearchQuery(event.target.value)}
            placeholder="Search services..."
          />

          <AddConnectionList
            integrations={addableIntegrations}
            onSelect={onSelectIntegrationFromAddModal}
            disabled={isSavingSettings}
          />
        </div>
      </EntityModal>

      <EntityModal
        open={
          selectedIntegrationKey !== null && selectedIntegrationHasSettingsPanel
        }
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIntegrationKey(null);
          }
        }}
        title={
          selectedIntegration
            ? `Configure ${selectedIntegration.name}`
            : "Integration Settings"
        }
        description={
          selectedIntegration?.description ?? "Enter credentials and settings."
        }
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
              {selectedIntegration ? (
                <div className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <IntegrationLogo integration={selectedIntegration} />
                    <p className="text-xs text-muted-foreground">
                      {selectedIntegration.enabled ? "Enabled" : "Disabled"} ·{" "}
                      {selectedIntegrationSettings.configured
                        ? "Configured"
                        : "Needs setup"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void onToggleEnabled(
                          selectedIntegration,
                          !selectedIntegration.enabled,
                        )
                      }
                      disabled={
                        isSavingSettings ||
                        updatingIntegrationKey === selectedIntegration.key ||
                        (!selectedIntegration.enabled &&
                          !selectedIntegrationSettings.configured)
                      }
                    >
                      {selectedIntegration.enabled ? "Disable" : "Enable"}
                    </Button>
                    {!selectedIntegration.enabled &&
                    !selectedIntegrationSettings.configured ? (
                      <p className="text-xs text-muted-foreground">
                        Save required settings before enabling.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

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
                          <div key={field.key} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <Label
                                htmlFor={`integration-secret-${field.key}`}
                              >
                                {field.label}
                                {field.required ? " *" : ""}
                              </Label>
                              <span className="text-xs text-muted-foreground">
                                {markedForClear
                                  ? "Will clear"
                                  : configured
                                    ? "Configured"
                                    : "Not set"}
                              </span>
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
