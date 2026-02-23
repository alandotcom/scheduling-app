import { Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { EntityModal } from "@/components/entity-modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/query";
import { cn } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/phone";

export interface RelatedClientOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  unresolvedId?: string;
}

interface ClientRelationPickerModalProps {
  open: boolean;
  mode: "single" | "multi";
  selectedIds: string[];
  selectedClientById: Record<string, RelatedClientOption>;
  currentClientId?: string;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (selectedIds: string[]) => void;
}

const SEARCH_DEBOUNCE_MS = 150;
type MobileFilter = "all" | "selected";

function dedupeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => id.length > 0)));
}

function toClientLabel(client: RelatedClientOption): string {
  const label = `${client.firstName} ${client.lastName}`.trim();
  return label.length > 0 ? label : "Unknown client";
}

function toClientSubLabel(client: RelatedClientOption): string {
  const contactLabel = [client.email, formatPhoneForDisplay(client.phone)]
    .filter(Boolean)
    .join(" | ");
  if (contactLabel.length > 0) {
    return contactLabel;
  }

  return client.unresolvedId ?? "";
}

export function ClientRelationPickerModal(
  props: ClientRelationPickerModalProps,
) {
  const selectionKey = dedupeIds(props.selectedIds).join("|");
  const modalKey = `${props.open ? "open" : "closed"}:${selectionKey}:${props.mode}`;

  return <ClientRelationPickerModalContent key={modalKey} {...props} />;
}

function ClientRelationPickerModalContent({
  open,
  mode,
  selectedIds,
  selectedClientById,
  currentClientId,
  disabled = false,
  onOpenChange,
  onApply,
}: ClientRelationPickerModalProps) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mobileFilter, setMobileFilter] = useState<MobileFilter>("all");
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>(() =>
    dedupeIds(selectedIds),
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useQuery({
    ...orpc.clients.list.queryOptions({
      input: {
        limit: 50,
        search: debouncedSearch || undefined,
      },
    }),
    enabled: open,
    placeholderData: (previous) => previous,
  });

  const clients = useMemo(() => {
    return (data?.items ?? [])
      .filter((client) => client.id !== currentClientId)
      .map((client) => ({
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
      }));
  }, [currentClientId, data?.items]);

  const selectedClients = useMemo(() => {
    return draftSelectedIds.map((id) => {
      const resolvedClient =
        selectedClientById[id] ?? clients.find((client) => client.id === id);
      if (resolvedClient) {
        return resolvedClient;
      }

      return {
        id,
        firstName: "Unknown client",
        lastName: "",
        email: null,
        phone: null,
        unresolvedId: id,
      } satisfies RelatedClientOption;
    });
  }, [clients, draftSelectedIds, selectedClientById]);
  const mobileVisibleClients =
    mobileFilter === "selected" ? selectedClients : clients;
  const selectedTitle =
    mode === "single"
      ? `Selected (${draftSelectedIds.length > 0 ? 1 : 0})`
      : `Selected (${draftSelectedIds.length})`;

  const isSelected = (clientId: string) => draftSelectedIds.includes(clientId);

  const toggleMultiSelection = (clientId: string) => {
    setDraftSelectedIds((previous) =>
      previous.includes(clientId)
        ? previous.filter((selectedId) => selectedId !== clientId)
        : [...previous, clientId],
    );
  };

  const handleSingleSelect = (clientId: string) => {
    if (disabled) return;
    onApply([clientId]);
    onOpenChange(false);
  };

  const handleClear = () => {
    if (disabled) return;
    if (mode === "single") {
      onApply([]);
      onOpenChange(false);
      return;
    }

    setDraftSelectedIds([]);
  };

  const handleDone = () => {
    if (disabled) return;
    onApply(dedupeIds(draftSelectedIds));
    onOpenChange(false);
  };

  const title =
    mode === "single" ? "Select Related Client" : "Select Related Clients";

  const renderClientList = (
    listClients: RelatedClientOption[],
    emptyLabel: string,
  ) => {
    if (isLoading && !data) {
      return (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          Loading clients...
        </p>
      );
    }

    if (listClients.length === 0) {
      return (
        <p className="px-2 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
      );
    }

    return listClients.map((client) => {
      const selected = isSelected(client.id);
      return (
        <button
          key={client.id}
          type="button"
          disabled={disabled}
          onClick={() =>
            mode === "single"
              ? handleSingleSelect(client.id)
              : toggleMultiSelection(client.id)
          }
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-accent",
            selected ? "bg-accent/60" : "",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{toClientLabel(client)}</p>
            {toClientSubLabel(client) ? (
              <p className="truncate text-xs text-muted-foreground">
                {toClientSubLabel(client)}
              </p>
            ) : null}
          </div>
          {selected ? (
            <Icon icon={Tick02Icon} className="size-4 text-primary" />
          ) : null}
        </button>
      );
    });
  };

  return (
    <EntityModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Search by name, email, or phone."
      className="md:h-[min(90dvh,52rem)]"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={disabled}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
          >
            {mode === "single" ? "Clear selection" : "Clear all"}
          </Button>
          {mode === "multi" ? (
            <Button
              type="button"
              size="sm"
              className="ml-auto"
              onClick={handleDone}
              disabled={disabled}
            >
              Done
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <div className="relative">
            <Icon
              icon={Search01Icon}
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search clients..."
              className="pl-10"
            />
          </div>
        </div>

        {mode === "multi" ? (
          <div
            className="border-b border-border px-4 py-2 sm:px-6 md:hidden"
            data-testid="relation-picker-mobile-tabs"
          >
            <div className="inline-flex rounded-md border border-border bg-muted/40 p-1">
              <button
                type="button"
                className={cn(
                  "rounded-sm px-3 py-1 text-xs font-medium",
                  mobileFilter === "all" ? "bg-background shadow-sm" : "",
                )}
                onClick={() => setMobileFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-sm px-3 py-1 text-xs font-medium",
                  mobileFilter === "selected" ? "bg-background shadow-sm" : "",
                )}
                onClick={() => setMobileFilter("selected")}
              >
                Selected
              </button>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 md:hidden">
          <div className="h-full overflow-y-auto px-2 py-2 sm:px-3">
            {renderClientList(
              mobileVisibleClients,
              mobileFilter === "selected"
                ? "No selected clients."
                : "No clients found.",
            )}
          </div>
        </div>

        <div
          className="hidden min-h-0 flex-1 md:grid md:grid-cols-[minmax(0,1fr)_320px]"
          data-testid="relation-picker-desktop-layout"
        >
          <div className="min-h-0 border-r border-border">
            <div className="h-full overflow-y-auto px-2 py-2">
              {renderClientList(clients, "No clients found.")}
            </div>
          </div>

          <div
            className="flex min-h-0 flex-col"
            data-testid="relation-picker-selected-pane"
          >
            <div className="border-b border-border px-4 py-2.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {selectedTitle}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {selectedClients.length === 0 ? (
                <p className="px-2 py-2 text-sm text-muted-foreground">
                  No clients selected.
                </p>
              ) : (
                selectedClients.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (mode === "single") {
                        handleSingleSelect(client.id);
                        return;
                      }
                      toggleMultiSelection(client.id);
                    }}
                    className="mb-1 flex w-full items-center justify-between gap-3 rounded-md border border-border/60 px-2.5 py-2 text-left text-sm hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {toClientLabel(client)}
                      </p>
                      {toClientSubLabel(client) ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {toClientSubLabel(client)}
                        </p>
                      ) : null}
                    </div>
                    <Icon icon={Tick02Icon} className="size-4 text-primary" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {isFetching ? (
          <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground sm:px-6">
            Updating results...
          </div>
        ) : null}
      </div>
    </EntityModal>
  );
}
