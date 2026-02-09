// Webhook management dashboard — Clerk-inspired drill-in UI
// Extracted from settings.tsx to keep that file focused on org/users/developers tabs

import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useEndpoints,
  useEndpoint,
  useEndpointStats,
  useEndpointSecret,
  useEndpointFunctions,
  useEndpointMessageAttempts,
  useEventTypes,
  useMessages,
  useMessage,
  useMessageAttempts,
  useSvix,
} from "svix-react";
// MessageStatus enum from svix: Success=0, Pending=1, Fail=2, Sending=3
import { toast } from "sonner";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  Copy01Icon,
  ViewIcon,
  ViewOffIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

import { RowActions } from "@/components/row-actions";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EntityModal } from "@/components/entity-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  type AttemptFilter,
  type WebhookTab,
  type WebhooksRouteActions,
  type WebhooksRouteState,
} from "./types";
import { formatWebhookPayloadPreview } from "./utils/format-webhook-payload-preview";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function formatRelativeTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function normalizeWebhookUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

// MessageStatus enum: Success=0, Pending=1, Fail=2, Sending=3
function MessageStatusBadge({ status }: { status: number }) {
  switch (status) {
    case 0:
      return <Badge variant="success">Delivered</Badge>;
    case 1:
      return <Badge variant="warning">Pending</Badge>;
    case 2:
      return <Badge variant="destructive">Failed</Badge>;
    case 3:
      return <Badge variant="outline">Sending</Badge>;
    default:
      return <Badge variant="secondary">Unknown</Badge>;
  }
}

function StatusCodeBadge({ code }: { code: number }) {
  if (code >= 200 && code < 300) {
    return <Badge variant="success">{code}</Badge>;
  }
  if (code >= 400) {
    return <Badge variant="destructive">{code}</Badge>;
  }
  return <Badge variant="outline">{code}</Badge>;
}

// ---------------------------------------------------------------------------
// useAttemptEventTypes — resolves msgId → eventType for attempt rows
// ---------------------------------------------------------------------------

function useAttemptEventTypes(attempts: Array<{ msgId: string }> | undefined) {
  const { svix, appId } = useSvix();
  const [eventTypeMap, setEventTypeMap] = useState<Map<string, string>>(
    new Map(),
  );
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!attempts?.length) return;

    const newMsgIds = attempts
      .map((a) => a.msgId)
      .filter((id) => !fetchedRef.current.has(id));

    if (newMsgIds.length === 0) return;

    const uniqueIds = [...new Set(newMsgIds)];

    let cancelled = false;

    async function fetchEventTypes() {
      const results = await Promise.all(
        uniqueIds.map(async (msgId) => {
          try {
            const msg = await svix.message.get(appId, msgId);
            return [msgId, msg.eventType] as const;
          } catch {
            return [msgId, null] as const;
          }
        }),
      );

      if (cancelled) return;

      setEventTypeMap((prev) => {
        const next = new Map(prev);
        for (const [msgId, eventType] of results) {
          if (eventType) next.set(msgId, eventType);
          fetchedRef.current.add(msgId);
        }
        return next;
      });
    }

    fetchEventTypes();

    return () => {
      cancelled = true;
    };
  }, [appId, attempts, svix]);

  return eventTypeMap;
}

function resolveWebhookTab(raw: string | undefined): WebhookTab {
  if (raw === "endpoints" || raw === "catalog" || raw === "logs") return raw;
  return "endpoints";
}

function resolveAttemptFilter(raw: string | undefined): AttemptFilter {
  if (raw === "all" || raw === "succeeded" || raw === "failed") return raw;
  return "all";
}

function attemptFilterToStatus(filter: AttemptFilter): number | undefined {
  if (filter === "succeeded") return 0;
  if (filter === "failed") return 2;
  return undefined;
}

// ---------------------------------------------------------------------------
// WebhooksManager — tab controller + tab content
// ---------------------------------------------------------------------------

const TABS: { id: WebhookTab; label: string }[] = [
  { id: "endpoints", label: "Endpoints" },
  { id: "catalog", label: "Event Catalog" },
  { id: "logs", label: "Logs" },
];

interface WebhooksManagerProps {
  routeState: WebhooksRouteState;
  actions: WebhooksRouteActions;
}

export function WebhooksManager({ routeState, actions }: WebhooksManagerProps) {
  const activeTab = resolveWebhookTab(routeState.webhookTab);

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => actions.goToTab(tab.id)}
            className={cn(
              "h-8 shrink-0 rounded-md px-3 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Keep tab components mounted to preserve svix hook state between tab switches. */}
      <div className={activeTab !== "endpoints" ? "hidden" : undefined}>
        <EndpointsTab routeState={routeState} actions={actions} />
      </div>
      <div className={activeTab !== "catalog" ? "hidden" : undefined}>
        <EventCatalogTab />
      </div>
      <div className={activeTab !== "logs" ? "hidden" : undefined}>
        <LogsTab />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EndpointsTab — List or drill-in
// ---------------------------------------------------------------------------

function EndpointsTab({
  routeState,
  actions,
}: {
  routeState: WebhooksRouteState;
  actions: WebhooksRouteActions;
}) {
  const { endpointId, messageId } = routeState;
  const endpoints = useEndpoints({ limit: 50 });
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Drill-in: message detail
  if (endpointId && messageId) {
    return (
      <MessageDetailView
        endpointId={endpointId}
        messageId={messageId}
        actions={actions}
      />
    );
  }

  // Drill-in: endpoint detail
  if (endpointId) {
    const cachedEndpoint = endpoints.data?.find((ep) => ep.id === endpointId);
    return (
      <EndpointDetailView
        endpointId={endpointId}
        cachedEndpoint={cachedEndpoint}
        routeState={routeState}
        actions={actions}
      />
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Endpoints</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Webhook destinations and delivery history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => endpoints.reload()}
          >
            <Icon icon={RefreshIcon} data-icon="inline-start" />
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            Add endpoint
          </Button>
        </div>
      </div>

      <CreateEndpointModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={() => {
          setIsCreateOpen(false);
          endpoints.reload();
        }}
      />

      {endpoints.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={`ep-skel-${i}`}
              className="rounded-lg border border-border p-4 space-y-2"
            >
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : endpoints.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load endpoints.
        </div>
      ) : !endpoints.data?.length ? (
        <div className="rounded-lg bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No webhook endpoints yet.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setIsCreateOpen(true)}
          >
            Create your first endpoint
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {endpoints.data.map((endpoint) => {
            const eventCount = endpoint.filterTypes?.length ?? 0;
            const isDisabled = endpoint.disabled ?? false;

            return (
              <button
                key={endpoint.id}
                type="button"
                onClick={() => actions.goToEndpoint(endpoint.id)}
                className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {endpoint.url}
                      </span>
                      <Badge
                        variant={isDisabled ? "secondary" : "success"}
                        className="shrink-0"
                      >
                        {isDisabled ? "Disabled" : "Active"}
                      </Badge>
                    </div>
                    {endpoint.description ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {endpoint.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {eventCount
                      ? `${eventCount} event${eventCount === 1 ? "" : "s"}`
                      : "All events"}
                  </span>
                  <span>Created {formatRelativeTime(endpoint.createdAt)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateEndpointModal
// ---------------------------------------------------------------------------

function CreateEndpointModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { svix, appId } = useSvix();
  const eventTypes = useEventTypes({ limit: 100 });
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);

  const sortedEventTypes = useMemo(
    () =>
      (eventTypes.data ?? []).toSorted((a, b) => a.name.localeCompare(b.name)),
    [eventTypes.data],
  );

  const createMutation = useMutation({
    mutationFn: async () =>
      svix.endpoint.create(appId, {
        url: normalizeWebhookUrl(url) ?? "",
        description: description.trim() || undefined,
        filterTypes: selectedEventTypes.length ? selectedEventTypes : null,
        metadata: { source: "admin-ui" },
      }),
    onSuccess: () => {
      setUrl("");
      setDescription("");
      setSelectedEventTypes([]);
      onCreated();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create endpoint");
    },
  });

  const onSubmit = () => {
    if (!normalizeWebhookUrl(url)) {
      toast.error("Enter a valid http(s) URL");
      return;
    }
    createMutation.mutate();
  };

  return (
    <EntityModal
      open={open}
      onOpenChange={onOpenChange}
      title="Create Endpoint"
      description="Register a destination URL and choose which event types it receives."
    >
      <div className="space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="webhook-endpoint-url">Endpoint URL</Label>
            <Input
              id="webhook-endpoint-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/scheduling"
              disabled={createMutation.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-endpoint-description">
              Description (optional)
            </Label>
            <Input
              id="webhook-endpoint-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Production endpoint"
              disabled={createMutation.isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Event filters</Label>
            {sortedEventTypes.length > 0 && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  const allNames = sortedEventTypes.map((et) => et.name);
                  setSelectedEventTypes(
                    selectedEventTypes.length === allNames.length
                      ? []
                      : allNames,
                  );
                }}
                disabled={createMutation.isPending}
              >
                {selectedEventTypes.length === sortedEventTypes.length
                  ? "Deselect all"
                  : "Select all"}
              </Button>
            )}
          </div>
          {eventTypes.loading ? (
            <div className="grid gap-1.5 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton
                  key={`et-skel-${i}`}
                  className="h-8 w-full rounded-md"
                />
              ))}
            </div>
          ) : eventTypes.error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Failed to load event catalog.
            </div>
          ) : !sortedEventTypes.length ? (
            <div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
              No event types found. Run the Svix catalog sync script first.
            </div>
          ) : (
            <div className="grid gap-1.5 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
              {sortedEventTypes.map((eventType) => (
                <div
                  key={eventType.name}
                  className="rounded-md px-2.5 py-2 transition-colors hover:bg-background"
                >
                  <Checkbox
                    checked={selectedEventTypes.includes(eventType.name)}
                    onChange={() => {
                      setSelectedEventTypes((prev) =>
                        prev.includes(eventType.name)
                          ? prev.filter((n) => n !== eventType.name)
                          : [...prev, eventType.name],
                      );
                    }}
                    disabled={createMutation.isPending}
                    label={eventType.name}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={createMutation.isPending}
            onClick={onSubmit}
          >
            {createMutation.isPending ? "Creating..." : "Create endpoint"}
          </Button>
        </div>
      </div>
    </EntityModal>
  );
}

// ---------------------------------------------------------------------------
// EndpointDetailView
// ---------------------------------------------------------------------------

function EndpointDetailView({
  endpointId,
  cachedEndpoint,
  routeState,
  actions,
}: {
  endpointId: string;
  cachedEndpoint?: {
    id: string;
    url: string;
    disabled?: boolean;
    description?: string;
    filterTypes?: string[] | null;
    createdAt: Date;
    updatedAt: Date;
  };
  routeState: WebhooksRouteState;
  actions: WebhooksRouteActions;
}) {
  const attemptFilter = resolveAttemptFilter(routeState.attemptFilter);

  const endpoint = useEndpoint(endpointId);
  const stats = useEndpointStats(endpointId);
  const secret = useEndpointSecret(endpointId);
  const fns = useEndpointFunctions(endpointId);
  const attempts = useEndpointMessageAttempts(endpointId, {
    limit: 20,
    status: attemptFilterToStatus(attemptFilter),
  });
  const eventTypeMap = useAttemptEventTypes(attempts.data);

  const [showSecret, setShowSecret] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditEventsOpen, setIsEditEventsOpen] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  const onDelete = async () => {
    setIsDeleting(true);
    try {
      await fns.deleteEndpoint();
      actions.goToEndpoints();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete endpoint",
      );
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

  const onToggleDisabled = async () => {
    if (!endpoint.data) return;
    try {
      await fns.updateEndpoint({
        url: endpoint.data.url,
        disabled: !endpoint.data.disabled,
      });
      endpoint.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update endpoint",
      );
    }
  };

  const onRecover = async () => {
    setIsRecovering(true);
    try {
      // Recover messages from the last 14 days
      const since = new Date();
      since.setDate(since.getDate() - 14);
      await fns.recoverEndpointMessages({ since });
      toast.success("Recovery started for failed messages");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to recover messages",
      );
    } finally {
      setIsRecovering(false);
    }
  };

  const onCopySecret = async () => {
    if (!secret.data?.key) return;
    try {
      await navigator.clipboard.writeText(secret.data.key);
    } catch {
      toast.error("Failed to copy signing secret");
    }
  };

  // Use fetched data, falling back to cached data from the list
  const ep = endpoint.data ?? cachedEndpoint;

  // Only show full skeleton if we have NO data at all
  if (!ep) {
    if (endpoint.loading) {
      return (
        <div className="space-y-5">
          {/* Breadcrumb skeleton */}
          <Skeleton className="h-4 w-48" />
          {/* Header skeleton */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-72" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          {/* Grid skeleton */}
          <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-5">
              <Skeleton className="h-2.5 w-full rounded-full" />
              <TableSkeleton rows={4} cols={5} />
            </div>
            <div className="space-y-5">
              <div className="rounded-lg border border-border p-4 space-y-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
              </div>
              <div className="rounded-lg border border-border p-4 space-y-2">
                <Skeleton className="h-3 w-28" />
                <div className="flex flex-wrap gap-1">
                  <Skeleton className="h-5 w-32 rounded-full" />
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-5 w-36 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={actions.goToEndpoints}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Icon icon={ArrowLeft02Icon} className="size-4" />
          Back to endpoints
        </button>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load endpoint.
        </div>
      </div>
    );
  }

  const isDisabled = ep.disabled ?? false;
  const filterTypes = ep.filterTypes ?? [];

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <button
          type="button"
          onClick={actions.goToEndpoints}
          className="text-muted-foreground hover:text-foreground"
        >
          Endpoints
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="truncate font-medium">{ep.url}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold tracking-tight">
              {ep.url}
            </h3>
            <Badge variant={isDisabled ? "secondary" : "success"}>
              {isDisabled ? "Disabled" : "Active"}
            </Badge>
          </div>
          {ep.description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {ep.description}
            </p>
          ) : null}
        </div>
        <RowActions
          ariaLabel={`Actions for ${ep.url}`}
          actions={[
            {
              label: isRecovering ? "Recovering..." : "Recover failed messages",
              onClick: onRecover,
              disabled: isRecovering,
            },
            {
              label: isDisabled ? "Enable endpoint" : "Disable endpoint",
              onClick: onToggleDisabled,
            },
            {
              label: "Delete endpoint",
              onClick: () => setIsDeleteOpen(true),
              variant: "destructive",
              separator: true,
            },
          ]}
        />
      </div>

      {/* Info grid */}
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* Left: stats + attempts */}
        <div className="space-y-5">
          {/* Delivery stats bar */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Delivery stats
            </Label>
            {stats.loading ? (
              <div className="space-y-2">
                <Skeleton className="h-2.5 w-full rounded-full" />
                <div className="flex gap-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-18" />
                </div>
              </div>
            ) : stats.error ? null : stats.data ? (
              <DeliveryStatsBar stats={stats.data} />
            ) : null}
          </div>

          {/* Message attempts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Message attempts
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => attempts.reload()}
              >
                <Icon icon={RefreshIcon} className="size-3.5" />
              </Button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "succeeded", label: "Succeeded" },
                  { id: "failed", label: "Failed" },
                ] as const
              ).map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => actions.setAttemptFilter(filter.id)}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                    attemptFilter === filter.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {attempts.loading ? (
              <TableSkeleton rows={4} cols={5} />
            ) : attempts.error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load message attempts.
              </div>
            ) : !attempts.data?.length ? (
              <div className="rounded-lg bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No message attempts
                {attemptFilter !== "all" ? ` matching "${attemptFilter}"` : ""}.
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-border/50">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Event Type</TableHead>
                        <TableHead>Response</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attempts.data.map((attempt) => (
                        <AttemptRow
                          key={attempt.id}
                          attempt={attempt}
                          eventType={eventTypeMap.get(attempt.msgId)}
                          onViewMessage={() =>
                            actions.goToMessage(attempt.msgId)
                          }
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!attempts.hasPrevPage}
                    onClick={() => attempts.prevPage()}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!attempts.hasNextPage}
                    onClick={() => attempts.nextPage()}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: info sidebar */}
        <div className="space-y-5">
          {/* Dates */}
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div>
              <Label className="text-xs text-muted-foreground">Created</Label>
              <p className="text-sm">{formatDateTime(ep.createdAt)}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Last updated
              </Label>
              <p className="text-sm">{formatDateTime(ep.updatedAt)}</p>
            </div>
          </div>

          {/* Subscribed events */}
          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Subscribed events
              </Label>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setIsEditEventsOpen(true)}
              >
                Edit
              </Button>
            </div>
            {filterTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">All events</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {filterTypes.map((et) => (
                  <Badge key={et} variant="outline" className="text-xs">
                    {et}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Signing secret */}
          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            <Label className="text-xs text-muted-foreground">
              Signing secret
            </Label>
            {secret.loading ? (
              <Skeleton className="h-9 w-full rounded-md" />
            ) : secret.data?.key ? (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    readOnly
                    value={
                      showSecret
                        ? secret.data.key
                        : "whsec_" + "\u2022".repeat(24)
                    }
                    className="pr-16 font-mono text-xs"
                    aria-label="Endpoint signing secret"
                  />
                  <div className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setShowSecret(!showSecret)}
                      aria-label={showSecret ? "Hide secret" : "Show secret"}
                    >
                      <Icon
                        icon={showSecret ? ViewOffIcon : ViewIcon}
                        className="size-3.5"
                      />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={onCopySecret}
                      aria-label="Copy secret"
                    >
                      <Icon icon={Copy01Icon} className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Secret not available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit events modal */}
      <EditEndpointEventsModal
        open={isEditEventsOpen}
        onOpenChange={setIsEditEventsOpen}
        endpointId={endpointId}
        currentFilterTypes={filterTypes}
        endpointUrl={ep.url}
        onUpdated={() => {
          setIsEditEventsOpen(false);
          endpoint.reload();
        }}
      />

      {/* Delete confirm */}
      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onConfirm={onDelete}
        title="Delete Endpoint"
        description={`Are you sure you want to delete the endpoint "${ep.url}"? This action cannot be undone.`}
        isPending={isDeleting}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AttemptRow — expandable row in attempts table
// ---------------------------------------------------------------------------

function AttemptRow({
  attempt,
  eventType,
  onViewMessage,
}: {
  attempt: {
    id: string;
    msgId: string;
    status: number;
    responseStatusCode: number;
    response: string;
    timestamp: Date | string;
    triggerType: number;
  };
  eventType?: string;
  onViewMessage: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell>
          <MessageStatusBadge status={attempt.status} />
        </TableCell>
        <TableCell className="font-mono text-xs">{eventType ?? "—"}</TableCell>
        <TableCell>
          <StatusCodeBadge code={attempt.responseStatusCode} />
        </TableCell>
        <TableCell className="text-xs">
          {formatDateTime(attempt.timestamp)}
        </TableCell>
        <TableCell className="text-right">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onViewMessage();
            }}
          >
            View message
          </Button>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/20 p-0">
            <div className="p-4">
              <Label className="text-xs text-muted-foreground">
                Response body
              </Label>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-3 font-mono text-xs">
                {attempt.response || "(empty)"}
              </pre>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// EditEndpointEventsModal
// ---------------------------------------------------------------------------

function EditEndpointEventsModal({
  open,
  onOpenChange,
  endpointId,
  currentFilterTypes,
  endpointUrl,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpointId: string;
  currentFilterTypes: string[];
  endpointUrl: string;
  onUpdated: () => void;
}) {
  const fns = useEndpointFunctions(endpointId);
  const eventTypes = useEventTypes({ limit: 100 });
  const [selected, setSelected] = useState<string[]>(currentFilterTypes);
  const [isSaving, setIsSaving] = useState(false);

  // Reset selection when modal opens
  const prevOpen = useState(open)[0];
  if (open && !prevOpen) {
    // noop — we set initial state from props
  }

  const sortedEventTypes = useMemo(
    () =>
      (eventTypes.data ?? []).toSorted((a, b) => a.name.localeCompare(b.name)),
    [eventTypes.data],
  );

  const onSave = async () => {
    setIsSaving(true);
    try {
      await fns.updateEndpoint({
        url: endpointUrl,
        filterTypes: selected.length ? selected : null,
      });
      onUpdated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update events",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <EntityModal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Subscribed Events"
      description="Select which event types this endpoint receives."
    >
      <div className="space-y-4 p-6">
        {eventTypes.loading ? (
          <div className="grid gap-1.5 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton
                key={`edit-et-skel-${i}`}
                className="h-8 w-full rounded-md"
              />
            ))}
          </div>
        ) : !sortedEventTypes.length ? (
          <div className="text-sm text-muted-foreground">
            No event types available.
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  const allNames = sortedEventTypes.map((et) => et.name);
                  setSelected(
                    selected.length === allNames.length ? [] : allNames,
                  );
                }}
              >
                {selected.length === sortedEventTypes.length
                  ? "Deselect all"
                  : "Select all"}
              </Button>
            </div>
            <div className="grid gap-1.5 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
              {sortedEventTypes.map((et) => (
                <div
                  key={et.name}
                  className="rounded-md px-2.5 py-2 transition-colors hover:bg-background"
                >
                  <Checkbox
                    checked={selected.includes(et.name)}
                    onChange={() =>
                      setSelected((prev) =>
                        prev.includes(et.name)
                          ? prev.filter((n) => n !== et.name)
                          : [...prev, et.name],
                      )
                    }
                    label={et.name}
                  />
                </div>
              ))}
            </div>
          </>
        )}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={onSave}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </EntityModal>
  );
}

// ---------------------------------------------------------------------------
// DeliveryStatsBar
// ---------------------------------------------------------------------------

function DeliveryStatsBar({
  stats,
}: {
  stats: { success: number; fail: number; pending: number; sending: number };
}) {
  const total = stats.success + stats.fail + stats.pending + stats.sending;

  if (total === 0) {
    return (
      <span className="text-xs text-muted-foreground">No deliveries yet</span>
    );
  }

  const segments: {
    key: string;
    count: number;
    color: string;
    label: string;
  }[] = [
    {
      key: "success",
      count: stats.success,
      color: "bg-emerald-500",
      label: `${stats.success} delivered`,
    },
    {
      key: "fail",
      count: stats.fail,
      color: "bg-destructive",
      label: `${stats.fail} failed`,
    },
    {
      key: "pending",
      count: stats.pending,
      color: "bg-amber-500",
      label: `${stats.pending} pending`,
    },
    {
      key: "sending",
      count: stats.sending,
      color: "bg-muted-foreground",
      label: `${stats.sending} sending`,
    },
  ].filter((s) => s.count > 0);

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={cn("h-full transition-all", seg.color)}
            style={{ width: `${(seg.count / total) * 100}%` }}
            title={seg.label}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((seg) => (
          <span key={seg.key} className="flex items-center gap-1.5 text-xs">
            <span
              className={cn("inline-block size-2 rounded-full", seg.color)}
            />
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageDetailView
// ---------------------------------------------------------------------------

function MessageDetailView({
  endpointId,
  messageId,
  actions,
}: {
  endpointId: string;
  messageId: string;
  actions: WebhooksRouteActions;
}) {
  const endpoint = useEndpoint(endpointId);
  const message = useMessage(messageId);
  const messageAttempts = useMessageAttempts(messageId, { limit: 25 });
  const [viewMode, setViewMode] = useState<"formatted" | "raw">("formatted");

  const payload = useMemo(() => {
    if (!message.data?.payload) return "";
    return formatWebhookPayloadPreview(message.data.payload);
  }, [message.data?.payload]);

  const onCopyPayload = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      toast.error("Failed to copy payload");
    }
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <button
          type="button"
          onClick={actions.goToEndpoints}
          className="text-muted-foreground hover:text-foreground"
        >
          Endpoints
        </button>
        <span className="text-muted-foreground">/</span>
        <button
          type="button"
          onClick={() => actions.goToEndpoint(endpointId)}
          className="truncate text-muted-foreground hover:text-foreground"
        >
          {endpoint.data?.url ?? endpointId}
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="truncate font-medium">
          {messageId.slice(0, 12)}...
        </span>
      </div>

      {message.loading ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <TableSkeleton rows={3} cols={4} />
          </div>
        </div>
      ) : message.error || !message.data ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load message.
        </div>
      ) : (
        <>
          {/* Header */}
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              {message.data.eventType}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Created {formatDateTime(message.data.timestamp)}
            </p>
          </div>

          {/* Payload */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Message content
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("formatted")}
                    className={cn(
                      "h-6 rounded-md px-2 text-xs font-medium transition-colors",
                      viewMode === "formatted"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Formatted
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("raw")}
                    className={cn(
                      "h-6 rounded-md px-2 text-xs font-medium transition-colors",
                      viewMode === "raw"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Raw
                  </button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onCopyPayload}
                  disabled={!payload}
                >
                  <Icon icon={Copy01Icon} data-icon="inline-start" />
                  Copy
                </Button>
              </div>
            </div>
            {viewMode === "formatted" && payload ? (
              <JsonTreeViewer data={message.data.payload} />
            ) : (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed">
                {payload || "(empty)"}
              </pre>
            )}
          </div>

          {/* Attempts table */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">
              Webhook attempts
            </Label>
            {messageAttempts.loading ? (
              <TableSkeleton rows={3} cols={4} />
            ) : messageAttempts.error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load attempts.
              </div>
            ) : !messageAttempts.data?.length ? (
              <div className="rounded-lg bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No delivery attempts yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/50">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Response</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messageAttempts.data.map((attempt) => (
                      <MessageAttemptRow key={attempt.id} attempt={attempt} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageAttemptRow — expandable row for message detail attempts
// ---------------------------------------------------------------------------

function MessageAttemptRow({
  attempt,
}: {
  attempt: {
    id: string;
    status: number;
    url: string;
    responseStatusCode: number;
    response: string;
    timestamp: Date | string;
  };
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell>
          <MessageStatusBadge status={attempt.status} />
        </TableCell>
        <TableCell className="max-w-48 truncate font-mono text-xs">
          {attempt.url}
        </TableCell>
        <TableCell>
          <StatusCodeBadge code={attempt.responseStatusCode} />
        </TableCell>
        <TableCell className="text-xs">
          {formatDateTime(attempt.timestamp)}
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/20 p-0">
            <div className="p-4">
              <Label className="text-xs text-muted-foreground">
                Response body
              </Label>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-3 font-mono text-xs">
                {attempt.response || "(empty)"}
              </pre>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// JsonTreeViewer — recursive JSON renderer
// ---------------------------------------------------------------------------

function JsonTreeViewer({ data }: { data: unknown }) {
  const parsed = useMemo(() => {
    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }, [data]);

  if (typeof parsed !== "object" || parsed === null) {
    return (
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs">
        {String(parsed)}
      </pre>
    );
  }

  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs">
      <JsonNode value={parsed} depth={0} defaultExpanded />
    </div>
  );
}

function JsonNode({
  name,
  value,
  depth,
  defaultExpanded = false,
}: {
  name?: string;
  value: unknown;
  depth: number;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 1);

  if (value === null) {
    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        {name !== undefined ? (
          <span className="text-sky-600 dark:text-sky-400">"{name}"</span>
        ) : null}
        {name !== undefined ? ": " : null}
        <span className="text-muted-foreground">null</span>
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        {name !== undefined ? (
          <span className="text-sky-600 dark:text-sky-400">"{name}"</span>
        ) : null}
        {name !== undefined ? ": " : null}
        <span className="text-amber-600 dark:text-amber-400">
          {String(value)}
        </span>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        {name !== undefined ? (
          <span className="text-sky-600 dark:text-sky-400">"{name}"</span>
        ) : null}
        {name !== undefined ? ": " : null}
        <span className="text-emerald-600 dark:text-emerald-400">
          {String(value)}
        </span>
      </div>
    );
  }

  if (typeof value === "string") {
    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        {name !== undefined ? (
          <span className="text-sky-600 dark:text-sky-400">"{name}"</span>
        ) : null}
        {name !== undefined ? ": " : null}
        <span className="text-rose-600 dark:text-rose-400">"{value}"</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
          {name !== undefined ? (
            <span className="text-sky-600 dark:text-sky-400">"{name}"</span>
          ) : null}
          {name !== undefined ? ": " : null}
          <span className="text-muted-foreground">[]</span>
        </div>
      );
    }

    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="hover:text-foreground"
        >
          <span className="text-muted-foreground">{expanded ? "▼" : "▶"}</span>{" "}
          {name !== undefined ? (
            <span className="text-sky-600 dark:text-sky-400">"{name}"</span>
          ) : null}
          {name !== undefined ? ": " : null}
          {!expanded ? (
            <span className="text-muted-foreground">
              [{value.length} items]
            </span>
          ) : (
            "["
          )}
        </button>
        {expanded ? (
          <>
            {value.map((item, index) => (
              <JsonNode
                key={`${depth}-${index}`}
                value={item}
                depth={depth + 1}
              />
            ))}
            <div>]</div>
          </>
        ) : null}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return (
        <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
          {name !== undefined ? (
            <span className="text-sky-600 dark:text-sky-400">"{name}"</span>
          ) : null}
          {name !== undefined ? ": " : null}
          <span className="text-muted-foreground">{"{}"}</span>
        </div>
      );
    }

    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="hover:text-foreground"
        >
          <span className="text-muted-foreground">{expanded ? "▼" : "▶"}</span>{" "}
          {name !== undefined ? (
            <span className="text-sky-600 dark:text-sky-400">"{name}"</span>
          ) : null}
          {name !== undefined ? ": " : null}
          {!expanded ? (
            <span className="text-muted-foreground">
              {"{"}
              {entries.length} keys
              {"}"}
            </span>
          ) : (
            "{"
          )}
        </button>
        {expanded ? (
          <>
            {entries.map(([key, val]) => (
              <JsonNode
                key={`${depth}-${key}`}
                name={key}
                value={val}
                depth={depth + 1}
              />
            ))}
            <div>{"}"}</div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      {name !== undefined ? (
        <span className="text-sky-600 dark:text-sky-400">"{name}"</span>
      ) : null}
      {name !== undefined ? ": " : null}
      <span className="text-muted-foreground">{JSON.stringify(value)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EventCatalogTab
// ---------------------------------------------------------------------------

function EventCatalogTab() {
  const eventTypes = useEventTypes({ limit: 100 });
  const [selectedEventName, setSelectedEventName] = useState<string | null>(
    null,
  );

  const grouped = useMemo(() => {
    if (!eventTypes.data)
      return new Map<string, NonNullable<typeof eventTypes.data>>();
    const groups = new Map<string, NonNullable<typeof eventTypes.data>>();
    for (const et of eventTypes.data) {
      const prefix = et.name.split(".")[0] ?? "other";
      const group = groups.get(prefix) ?? [];
      group.push(et);
      groups.set(prefix, group);
    }
    return new Map(
      [...groups.entries()].toSorted(([a], [b]) => a.localeCompare(b)),
    );
  }, [eventTypes.data]);

  // Auto-select first event on load
  useEffect(() => {
    const first = eventTypes.data?.[0];
    if (!selectedEventName && first) {
      setSelectedEventName(first.name);
    }
  }, [selectedEventName, eventTypes.data]);

  const selectedEvent = useMemo(
    () => eventTypes.data?.find((et) => et.name === selectedEventName),
    [eventTypes.data, selectedEventName],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Event Catalog
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            All registered webhook event types grouped by domain.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => eventTypes.reload()}
        >
          <Icon icon={RefreshIcon} data-icon="inline-start" />
          Refresh
        </Button>
      </div>

      {eventTypes.loading ? (
        <div className="flex gap-6">
          <div className="w-[280px] shrink-0 space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={`skel-group-${i}`}>
                <Skeleton className="mb-1 h-4 w-20" />
                {Array.from({ length: 3 }, (_, j) => (
                  <Skeleton
                    key={`skel-item-${i}-${j}`}
                    className="my-0.5 h-7 w-full"
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={`skel-prop-${i}`} className="h-4 w-full" />
              ))}
            </div>
          </div>
        </div>
      ) : eventTypes.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load event catalog.
        </div>
      ) : !eventTypes.data?.length ? (
        <div className="rounded-lg bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          No event types registered. Run the Svix catalog sync script.
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Left panel — event list */}
          <div className="w-full shrink-0 lg:w-[280px]">
            <div className="max-h-[600px] space-y-1 overflow-y-auto pr-1">
              {[...grouped.entries()].map(([prefix, events]) => (
                <EventCatalogGroup
                  key={prefix}
                  prefix={prefix}
                  events={events}
                  selectedEventName={selectedEventName}
                  onSelect={setSelectedEventName}
                />
              ))}
            </div>
          </div>

          {/* Right panel — schema preview */}
          <div className="min-w-0 flex-1 overflow-hidden">
            {selectedEvent ? (
              <EventSchemaDetail event={selectedEvent} />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Select an event to view its schema
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JSON Schema property helpers
// ---------------------------------------------------------------------------

function getTypeBadgeClasses(type: string): string {
  switch (type) {
    case "string":
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    case "integer":
    case "number":
      return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
    case "object":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "boolean":
      return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
    case "array":
      return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

interface PropertyInfo {
  type: string;
  format?: string;
  description?: string;
  nullable: boolean;
  constValue?: string;
  enumValues?: string[];
  nestedProperties?: Record<string, unknown>;
  nestedRequired?: string[];
  isRecord?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : undefined;
}

function resolvePropertyInfo(
  prop: Record<string, unknown>,
  _name?: string,
): PropertyInfo {
  // Zod nullable pattern: { anyOf: [{ ...actual }, { type: "null" }] }
  if (Array.isArray(prop.anyOf) && prop.anyOf.length === 2) {
    const nonNull = prop.anyOf.find(
      (s: unknown) => isRecord(s) && s.type !== "null",
    );
    if (isRecord(nonNull)) {
      const info = resolvePropertyInfo(nonNull);
      return { ...info, nullable: true };
    }
  }

  const type = typeof prop.type === "string" ? prop.type : "unknown";
  const format = typeof prop.format === "string" ? prop.format : undefined;
  const description =
    typeof prop.description === "string" ? prop.description : undefined;

  const constValue =
    prop.const !== undefined ? JSON.stringify(prop.const) : undefined;

  const enumValues = Array.isArray(prop.enum)
    ? prop.enum.map(String)
    : undefined;

  let nestedProperties: Record<string, unknown> | undefined;
  let nestedRequired: string[] | undefined;
  let isRecordType = false;

  if (type === "object" && isRecord(prop.properties)) {
    nestedProperties = prop.properties;
    nestedRequired = toStringArray(prop.required);
  } else if (type === "object" && isRecord(prop.additionalProperties)) {
    isRecordType = true;
  }

  return {
    type,
    format,
    description,
    nullable: false,
    constValue,
    enumValues,
    nestedProperties,
    nestedRequired,
    isRecord: isRecordType,
  };
}

// ---------------------------------------------------------------------------
// Schema property table components
// ---------------------------------------------------------------------------

function SchemaPropertiesView({ schema }: { schema: Record<string, unknown> }) {
  const properties = isRecord(schema.properties)
    ? schema.properties
    : undefined;
  const required = toStringArray(schema.required) ?? [];

  if (!properties || Object.keys(properties).length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No schema properties
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-border/60">
      <PropertyList properties={properties} required={required} depth={0} />
    </div>
  );
}

function PropertyList({
  properties,
  required,
  depth,
}: {
  properties: Record<string, unknown>;
  required: string[];
  depth: number;
}) {
  return (
    <div>
      {Object.entries(properties).map(([name, propSchema]) =>
        isRecord(propSchema) ? (
          <PropertyRow
            key={name}
            name={name}
            schema={propSchema}
            isRequired={required.includes(name)}
            depth={depth}
          />
        ) : null,
      )}
    </div>
  );
}

function PropertyRow({
  name,
  schema,
  isRequired,
  depth,
}: {
  name: string;
  schema: Record<string, unknown>;
  isRequired: boolean;
  depth: number;
}) {
  const info = resolvePropertyInfo(schema, name);
  const hasNested = !!info.nestedProperties;
  // Auto-expand "data" at depth 0
  const [expanded, setExpanded] = useState(
    hasNested && name === "data" && depth === 0,
  );

  return (
    <div
      className={cn(depth === 0 && "border-b border-border/50 last:border-b-0")}
    >
      <div
        className="flex items-center gap-2.5 py-3"
        style={{ paddingLeft: depth * 20 + 12 }}
      >
        {/* Expand toggle or spacer */}
        {hasNested ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Icon
              icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
              className="size-3.5"
            />
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}

        {/* Name + optional description */}
        <div className="flex min-w-0 flex-col">
          <code className="shrink-0 text-[13px] font-semibold">{name}</code>
          {info.description ? (
            <span className="text-xs text-muted-foreground">
              {info.description}
            </span>
          ) : null}
        </div>

        {/* Type badge */}
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
            getTypeBadgeClasses(info.type),
          )}
        >
          {info.type}
          {info.isRecord ? " (record)" : ""}
        </span>

        {/* Format badge */}
        {info.format ? (
          <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {info.format}
          </span>
        ) : null}

        {/* Optional label (required is default — no label needed) */}
        {!isRequired ? (
          <span className="shrink-0 text-[11px] italic text-muted-foreground/60">
            optional
          </span>
        ) : null}

        {/* Nullable */}
        {info.nullable ? (
          <Badge
            variant="outline"
            className="h-4 px-1 text-[10px] leading-none"
          >
            nullable
          </Badge>
        ) : null}

        {/* Const value */}
        {info.constValue !== undefined ? (
          <code className="text-[10px] text-muted-foreground">
            = "{info.constValue}"
          </code>
        ) : null}

        {/* Enum values */}
        {info.enumValues ? (
          <code className="truncate text-[10px] text-muted-foreground">
            [{info.enumValues.map((v) => `"${v}"`).join(" | ")}]
          </code>
        ) : null}
      </div>

      {/* Nested properties */}
      {expanded && info.nestedProperties ? (
        <div
          className="mb-3 rounded-md border border-border/60 bg-muted/20"
          style={{ marginLeft: depth * 20 + 12 + 20 + 10 }}
        >
          <PropertyList
            properties={info.nestedProperties}
            required={info.nestedRequired ?? []}
            depth={depth + 1}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EventSchemaDetail — right panel showing schema for a selected event
// ---------------------------------------------------------------------------

function EventSchemaDetail({
  event,
}: {
  event: {
    name: string;
    description?: string | null;
    schemas?: Record<string, unknown> | null;
  };
}) {
  const rawV1 = event.schemas?.v1;
  const schemaV1 = isRecord(rawV1) ? rawV1 : undefined;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-5">
        <code className="text-base font-bold">{event.name}</code>
        {event.description ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            {event.description}
          </p>
        ) : null}
      </div>
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Payload
      </h4>
      {schemaV1 ? (
        <SchemaPropertiesView schema={schemaV1} />
      ) : (
        <span className="text-xs text-muted-foreground">
          No schema available
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EventCatalogGroup — collapsible group with clickable event names
// ---------------------------------------------------------------------------

function EventCatalogGroup({
  prefix,
  events,
  selectedEventName,
  onSelect,
}: {
  prefix: string;
  events: Array<{
    name: string;
    description?: string | null;
    schemas?: Record<string, unknown> | null;
  }>;
  selectedEventName: string | null;
  onSelect: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent/30"
      >
        <Icon
          icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
          className="size-3 shrink-0 text-muted-foreground"
        />
        <span className="text-xs font-semibold capitalize">{prefix}</span>
        <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px]">
          {events.length}
        </Badge>
      </button>
      {expanded ? (
        <div className="ml-5 space-y-px">
          {events.map((et) => (
            <button
              key={et.name}
              type="button"
              onClick={() => onSelect(et.name)}
              className={cn(
                "block w-full truncate rounded px-2 py-1 text-left text-sm",
                selectedEventName === et.name
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
              )}
            >
              {et.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogsTab — Global message log
// ---------------------------------------------------------------------------

function LogsTab() {
  const messages = useMessages({ limit: 25 });
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );

  // Auto-select first message on load
  useEffect(() => {
    const first = messages.data?.[0];
    if (!selectedMessageId && first) {
      setSelectedMessageId(first.id);
    }
  }, [selectedMessageId, messages.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Logs</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Global webhook message log across all endpoints.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => messages.reload()}
        >
          <Icon icon={RefreshIcon} data-icon="inline-start" />
          Refresh
        </Button>
      </div>

      {messages.loading ? (
        <div className="flex gap-6">
          <div className="w-[320px] shrink-0 space-y-1">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={`skel-msg-${i}`} className="h-14 w-full" />
            ))}
          </div>
          <div className="flex-1 space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </div>
          </div>
        </div>
      ) : messages.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load messages.
        </div>
      ) : !messages.data?.length ? (
        <div className="rounded-lg bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          No webhook messages yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Left panel — message list */}
          <div className="w-full shrink-0 lg:w-[320px]">
            <div className="max-h-[600px] space-y-0.5 overflow-y-auto pr-1">
              {messages.data.map((msg) => (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => setSelectedMessageId(msg.id)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors",
                    selectedMessageId === msg.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/30",
                  )}
                >
                  <span className="truncate font-mono text-xs font-medium text-foreground">
                    {msg.eventType}
                  </span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {msg.id.slice(0, 20)}...
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDateTime(msg.timestamp)}
                  </span>
                </button>
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-3 flex items-center justify-between">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!messages.hasPrevPage}
                onClick={() => {
                  setSelectedMessageId(null);
                  messages.prevPage();
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!messages.hasNextPage}
                onClick={() => {
                  setSelectedMessageId(null);
                  messages.nextPage();
                }}
              >
                Next
              </Button>
            </div>
          </div>

          {/* Right panel — message detail */}
          <div className="min-w-0 flex-1 overflow-hidden">
            {selectedMessageId ? (
              <LogsMessageDetail messageId={selectedMessageId} />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Select a message to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogsMessageDetail — Inline message detail for split-view logs tab
// ---------------------------------------------------------------------------

function LogsMessageDetail({ messageId }: { messageId: string }) {
  const message = useMessage(messageId);
  const messageAttempts = useMessageAttempts(messageId, { limit: 25 });
  const [viewMode, setViewMode] = useState<"formatted" | "raw">("formatted");

  const payload = useMemo(() => {
    if (!message.data?.payload) return "";
    return formatWebhookPayloadPreview(message.data.payload);
  }, [message.data?.payload]);

  const onCopyPayload = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      toast.error("Failed to copy payload");
    }
  };

  if (message.loading) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <TableSkeleton rows={3} cols={4} />
        </div>
      </div>
    );
  }

  if (message.error || !message.data) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load message.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">
          {message.data.eventType}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Created {formatDateTime(message.data.timestamp)}
        </p>
      </div>

      {/* Payload */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">
            Message content
          </Label>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("formatted")}
                className={cn(
                  "h-6 rounded-md px-2 text-xs font-medium transition-colors",
                  viewMode === "formatted"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Formatted
              </button>
              <button
                type="button"
                onClick={() => setViewMode("raw")}
                className={cn(
                  "h-6 rounded-md px-2 text-xs font-medium transition-colors",
                  viewMode === "raw"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Raw
              </button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCopyPayload}
              disabled={!payload}
            >
              <Icon icon={Copy01Icon} data-icon="inline-start" />
              Copy
            </Button>
          </div>
        </div>
        {viewMode === "formatted" && payload ? (
          <JsonTreeViewer data={message.data.payload} />
        ) : (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed">
            {payload || "(empty)"}
          </pre>
        )}
      </div>

      {/* Attempts */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground">
          Delivery attempts
        </Label>
        {messageAttempts.loading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : messageAttempts.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load attempts.
          </div>
        ) : !messageAttempts.data?.length ? (
          <div className="rounded-lg bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No delivery attempts yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messageAttempts.data.map((attempt) => (
                  <MessageAttemptRow key={attempt.id} attempt={attempt} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
