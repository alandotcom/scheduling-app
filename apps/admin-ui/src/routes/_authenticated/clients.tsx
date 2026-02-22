// Clients management page with table list and modal-based detail/create flows

import { useCallback, useEffect, useMemo, useState } from "react";
import { useClosingSnapshot } from "@/hooks/use-closing-snapshot";
import { DateTime } from "luxon";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Add01Icon,
  ArrowRight02Icon,
  Calendar03Icon,
  Delete01Icon,
  PencilEdit01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { getLogger } from "@logtape/logtape";
import { toast } from "sonner";

import type {
  CreateClientInput,
  CustomAttributeDefinitionResponse,
} from "@scheduling/dto";
import type { ContextMenuItem } from "@/components/context-menu";
import { AppointmentModal } from "@/components/appointment-modal";
import { ClientForm } from "@/components/clients/client-form";
import { CopyIdHeaderAction } from "@/components/copy-id-header-action";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DetailTab, DetailTabs } from "@/components/workbench";
import { EntityModal } from "@/components/entity-modal";
import {
  EntityListEmptyState,
  EntityListLoadingState,
} from "@/components/entity-list";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClientsListPresentation } from "@/components/clients/clients-list-presentation";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { useCrudState } from "@/hooks/use-crud-state";
import { useCreateDraft, useResetCreateDraft } from "@/hooks/use-create-draft";
import { useCreateIntentTrigger } from "@/hooks/use-create-intent";
import {
  useKeyboardShortcuts,
  useListNavigation,
} from "@/hooks/use-keyboard-shortcuts";
import { useUrlDrivenModal } from "@/hooks/use-url-driven-modal";
import { useValidateSelection } from "@/hooks/use-selection-search-params";
import { AppointmentDetail } from "@/components/appointments/appointment-detail";
import {
  toEventTypeLabel,
  toRunStatusBadgeVariant,
  toRunStatusLabel,
} from "@/features/workflows/workflow-runs-helpers";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatRelativeTime,
} from "@/lib/date-utils";
import { deriveCountryFromPhone, formatPhoneForDisplay } from "@/lib/phone";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";
import {
  DEFAULT_SCHEDULING_TIMEZONE_MODE,
  type SchedulingTimezoneMode,
} from "@/lib/scheduling-timezone";
import {
  buildClientDetailDescription,
  sanitizeClientMutationInput,
} from "@/routes/_authenticated/clients/client-reference-utils";

const CLIENT_CREATE_DRAFT_KEY = "clients:create";
const logger = getLogger(["ui", "workflows", "clients"]);

interface CreateClientFormProps {
  onSubmit: (data: CreateClientInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  shortcutsEnabled: boolean;
  customFieldDefinitions?: CustomAttributeDefinitionResponse[];
}

function CreateClientForm({
  onSubmit,
  onCancel,
  isSubmitting,
  shortcutsEnabled,
  customFieldDefinitions,
}: CreateClientFormProps) {
  const initialValues = useMemo<CreateClientInput>(
    () => ({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      phoneCountry: "US",
      customAttributes: {},
    }),
    [],
  );
  const { draft, setDraft, resetDraft, hasDraft } = useCreateDraft({
    key: CLIENT_CREATE_DRAFT_KEY,
    initialValues,
  });
  const handleDiscardDraft = useCallback(() => {
    resetDraft();
    onCancel();
  }, [onCancel, resetDraft]);

  return (
    <ClientForm
      defaultValues={draft}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      shortcutsEnabled={shortcutsEnabled}
      onDraftChange={setDraft}
      onDiscardDraft={handleDiscardDraft}
      showDiscardAction={hasDraft}
      customFieldDefinitions={customFieldDefinitions}
    />
  );
}

type DetailTabValue = "details" | "history" | "workflows";
type AppointmentDetailTabValue = "details" | "client" | "history" | "workflows";

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "history" || value === "workflows";
const isAppointmentDetailTab = (
  value: string,
): value is AppointmentDetailTabValue =>
  value === "details" ||
  value === "client" ||
  value === "history" ||
  value === "workflows";

function ClientsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, tab, appointment, appointmentTab } = Route.useSearch();
  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab && isDetailTab(tab) ? tab : "details";
  const selectedAppointmentId = appointment ?? null;
  const activeAppointmentTab: AppointmentDetailTabValue =
    appointmentTab && isAppointmentDetailTab(appointmentTab)
      ? appointmentTab
      : "details";

  const [search, setSearch] = useState("");
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentModalClientPrefill, setAppointmentModalClientPrefill] =
    useState<{ id: string; name: string } | null>(null);
  const [appointmentTimezoneMode, setAppointmentTimezoneMode] =
    useState<SchedulingTimezoneMode>(DEFAULT_SCHEDULING_TIMEZONE_MODE);
  const [isDetailFormDirty, setIsDetailFormDirty] = useState(false);
  const detailFormId = "client-detail-form";

  const { data, isLoading, isFetching, error } = useQuery({
    ...orpc.clients.list.queryOptions({
      input: { search: search || undefined, limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  const { data: customFieldDefinitions } = useQuery(
    orpc.customAttributes.listDefinitions.queryOptions(),
  );

  const { data: selectedClientFull, isLoading: isLoadingClientFull } = useQuery(
    {
      ...orpc.clients.get.queryOptions({ input: { id: selectedId ?? "" } }),
      enabled: !!selectedId,
    },
  );

  type ClientItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<ClientItem>();
  const resetCreateDraft = useResetCreateDraft(CLIENT_CREATE_DRAFT_KEY);

  useCreateIntentTrigger("clients", crud.openCreate);

  const clients = data?.items ?? [];
  const isSelectionDataResolved = !isLoading && !isFetching && !error;
  const selectedClient =
    clients.find((client) => client.id === selectedId) ?? null;
  const displayClient = useClosingSnapshot(selectedClient ?? undefined);
  const { isOpen: detailModalOpen, closeNow: closeDetailModalNow } =
    useUrlDrivenModal({
      selectedId,
      hasResolvedEntity: !!selectedClient,
    });

  const openDetails = useCallback(
    (clientId: string, nextTab: DetailTabValue = "details") => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: clientId,
          tab: nextTab,
          appointment: undefined,
          appointmentTab: undefined,
        }),
      });
    },
    [navigate],
  );

  const clearDetails = useCallback(() => {
    closeDetailModalNow();
    navigate({
      search: (prev) => ({
        ...prev,
        selected: undefined,
        tab: undefined,
        appointment: undefined,
        appointmentTab: undefined,
      }),
      replace: true,
    });
  }, [closeDetailModalNow, navigate]);

  const setActiveTab = useCallback(
    (value: string) => {
      if (!selectedId || !isDetailTab(value)) return;
      navigate({
        search: (prev) => ({
          ...prev,
          tab: value,
        }),
      });
    },
    [navigate, selectedId],
  );

  const openAppointmentDetails = useCallback(
    (appointmentId: string, nextTab: AppointmentDetailTabValue = "details") => {
      navigate({
        search: (prev) => ({
          ...prev,
          tab: "history",
          appointment: appointmentId,
          appointmentTab: nextTab,
        }),
      });
    },
    [navigate],
  );

  const clearSelectedAppointment = useCallback(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        appointment: undefined,
        appointmentTab: undefined,
      }),
      replace: true,
    });
  }, [navigate]);

  const openClientFromAppointment = useCallback(
    (clientId: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: clientId,
          tab: "details",
          appointment: undefined,
          appointmentTab: undefined,
        }),
      });
    },
    [navigate],
  );

  const openWorkflowRun = useCallback(
    (input: { workflowId: string; runId: string }) => {
      navigate({
        to: "/workflows/$workflowId",
        params: { workflowId: input.workflowId },
        search: {
          sidebarTab: "runs",
          runId: input.runId,
        },
      });
    },
    [navigate],
  );

  const setActiveAppointmentTab = useCallback(
    (value: AppointmentDetailTabValue) => {
      if (!selectedAppointmentId) return;
      navigate({
        search: (prev) => ({
          ...prev,
          appointmentTab: value,
        }),
      });
    },
    [navigate, selectedAppointmentId],
  );

  useValidateSelection({
    items: clients,
    selectedId,
    isDataResolved: isSelectionDataResolved,
    onInvalidSelection: clearDetails,
  });

  const selectedIndex = selectedId
    ? clients.findIndex((client) => client.id === selectedId)
    : -1;

  useListNavigation({
    items: clients,
    selectedIndex,
    onSelect: (index) => {
      const client = clients[index];
      if (client) openDetails(client.id);
    },
    onOpen: (client) => openDetails(client.id),
    enabled:
      clients.length > 0 &&
      !crud.showCreateForm &&
      !detailModalOpen &&
      !appointmentModalOpen,
  });

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "c",
        action: crud.openCreate,
        description: "Create client",
      },
      {
        key: "escape",
        action: clearDetails,
        description: "Close details",
        ignoreInputs: false,
      },
    ],
    enabled: !crud.showCreateForm && !detailModalOpen && !appointmentModalOpen,
  });

  const createMutation = useMutation(
    orpc.clients.create.mutationOptions({
      onSuccess: (createdClient) => {
        resetCreateDraft();
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        setSearch("");
        crud.closeCreate();
        navigate({
          search: (prev) => ({
            ...prev,
            selected: createdClient.id,
            tab: "details",
            appointment: undefined,
            appointmentTab: undefined,
          }),
        });
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to create client");
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.clients.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to update client");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.clients.remove.mutationOptions({
      onSuccess: () => {
        if (crud.deletingItemId && crud.deletingItemId === selectedId) {
          clearDetails();
        }
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        crud.closeDelete();
      },
      onError: (mutationError) => {
        toast.error(
          mutationError.message || "Failed to delete client. Please try again.",
        );
      },
    }),
  );

  const handleCreate = (formData: CreateClientInput) => {
    createMutation.mutate(sanitizeClientMutationInput(formData));
  };

  const handleUpdate = (formData: CreateClientInput) => {
    if (!selectedId) return;
    const safeFormData = sanitizeClientMutationInput(formData);
    updateMutation.mutate({
      id: selectedId,
      ...safeFormData,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

  const handleBookAppointment = useCallback((client: ClientItem) => {
    setAppointmentModalClientPrefill({
      id: client.id,
      name: `${client.firstName} ${client.lastName}`,
    });
    setAppointmentModalOpen(true);
  }, []);

  const getContextMenuItems = useCallback(
    (client: ClientItem): ContextMenuItem[] => [
      {
        label: "View",
        icon: ArrowRight02Icon,
        onClick: () => openDetails(client.id),
      },
      {
        label: "Book",
        icon: Calendar03Icon,
        onClick: () => handleBookAppointment(client),
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () => openDetails(client.id, "details"),
        separator: true,
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(client.id),
        variant: "destructive",
      },
    ],
    [openDetails, handleBookAppointment, crud],
  );

  const handleAppointmentCreated = useCallback(
    (appointmentId: string) => {
      navigate({
        to: "/appointments",
        search: {
          selected: appointmentId,
          tab: "details",
        },
      });
    },
    [navigate],
  );

  const { data: appointmentsData, isLoading: isLoadingAppointments } = useQuery(
    {
      ...orpc.appointments.list.queryOptions({
        input: { clientId: selectedId ?? "", limit: 20 },
      }),
      enabled: !!selectedId,
    },
  );
  const {
    data: workflowRunsData,
    isLoading: isLoadingWorkflowRuns,
    isError: isWorkflowRunsError,
    error: workflowRunsError,
  } = useQuery({
    ...orpc.journeys.runs.listByEntity.queryOptions({
      input: {
        entityType: "client",
        entityId: selectedId ?? "00000000-0000-0000-0000-000000000000",
        limit: 20,
      },
    }),
    enabled: !!selectedId && activeTab === "workflows",
  });

  useEffect(() => {
    if (activeTab !== "workflows" || !selectedId || !isWorkflowRunsError) {
      return;
    }

    logger.error(
      "Failed to load workflow runs for client {clientId}: {error}",
      {
        clientId: selectedId,
        error: workflowRunsError,
        errorStack:
          workflowRunsError instanceof Error
            ? workflowRunsError.stack
            : undefined,
      },
    );
  }, [activeTab, isWorkflowRunsError, selectedId, workflowRunsError]);
  const deletingClientId = crud.deletingItemId ?? null;
  const {
    data: deletingClientHistorySummary,
    isLoading: isLoadingDeletingClientHistory,
  } = useQuery({
    ...orpc.clients.historySummary.queryOptions({
      input: { id: deletingClientId ?? "" },
    }),
    enabled: !!deletingClientId,
    retry: false,
  });

  const appointments = useMemo(
    () => appointmentsData?.items ?? [],
    [appointmentsData],
  );
  const selectedAppointmentFromList =
    appointments.find((apt) => apt.id === selectedAppointmentId) ?? null;
  const { data: selectedAppointmentFromGet, isLoading: isLoadingAppointment } =
    useQuery({
      ...orpc.appointments.get.queryOptions({
        input: { id: selectedAppointmentId ?? "" },
      }),
      enabled: !!selectedAppointmentId && !selectedAppointmentFromList,
    });
  const selectedAppointment =
    selectedAppointmentFromList ?? selectedAppointmentFromGet ?? null;
  const displayAppointment = selectedAppointmentId ? selectedAppointment : null;
  const isAppointmentDetailOpen = !!selectedAppointmentId;
  const appointmentDisplayTimezone =
    displayAppointment?.calendar?.timezone ??
    displayAppointment?.timezone ??
    "America/New_York";

  const { upcomingAppointments, pastAppointments } = useMemo(() => {
    const now = DateTime.now();
    const toDateTime = (value: string | Date) =>
      typeof value === "string"
        ? DateTime.fromISO(value, { setZone: true })
        : DateTime.fromJSDate(value);

    return {
      upcomingAppointments: appointments.filter(
        (apt) => toDateTime(apt.startAt) >= now && apt.status !== "cancelled",
      ),
      pastAppointments: appointments.filter(
        (apt) => toDateTime(apt.startAt) < now || apt.status === "cancelled",
      ),
    };
  }, [appointments]);
  const deletingUpcomingAppointments =
    deletingClientHistorySummary?.upcomingAppointments ?? 0;
  const deleteDialogDescription = useMemo(() => {
    const baseDescription =
      "Are you sure you want to delete this client? This action cannot be undone.";

    if (!deletingClientId) {
      return baseDescription;
    }

    if (isLoadingDeletingClientHistory) {
      return `${baseDescription} Checking for upcoming appointments...`;
    }

    if (deletingUpcomingAppointments > 0) {
      return `This client has ${deletingUpcomingAppointments} upcoming appointment${deletingUpcomingAppointments === 1 ? "" : "s"}. Deleting this client will also delete those appointments.`;
    }

    return baseDescription;
  }, [
    deletingClientId,
    deletingUpcomingAppointments,
    isLoadingDeletingClientHistory,
  ]);

  return (
    <PageScaffold className="pb-24 sm:pb-6">
      <div className="mt-6 space-y-6">
        <div className="max-w-sm">
          <div className="relative">
            <Icon
              icon={Search01Icon}
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div>
          {isLoading ? (
            <EntityListLoadingState rows={5} cols={6} />
          ) : error ? (
            <div className="py-10 text-center text-destructive">
              Error loading clients
            </div>
          ) : !clients.length ? (
            <EntityListEmptyState
              actionLabel={search ? undefined : "Create Client"}
              onAction={search ? undefined : crud.openCreate}
            >
              {search
                ? "No clients found matching your search."
                : "No clients yet. Create your first client to get started."}
            </EntityListEmptyState>
          ) : (
            <ClientsListPresentation
              clients={clients}
              onOpen={openDetails}
              getActions={getContextMenuItems}
            />
          )}
        </div>
      </div>

      <EntityModal
        open={detailModalOpen && !!displayClient}
        onOpenChange={(isOpen) => {
          if (!isOpen) clearDetails();
        }}
        headerActions={
          displayAppointment ? (
            <CopyIdHeaderAction
              id={displayAppointment.id}
              entityLabel="appointment"
            />
          ) : displayClient ? (
            <CopyIdHeaderAction id={displayClient.id} entityLabel="client" />
          ) : null
        }
        title={
          isAppointmentDetailOpen
            ? (displayAppointment?.appointmentType?.name ?? "Appointment")
            : displayClient
              ? `${displayClient.firstName} ${displayClient.lastName}`
              : ""
        }
        description={
          isAppointmentDetailOpen && displayAppointment
            ? formatDisplayDate(
                displayAppointment.startAt,
                appointmentDisplayTimezone,
              )
            : !isAppointmentDetailOpen
              ? buildClientDetailDescription({
                  email: displayClient?.email,
                  formattedPhone: formatPhoneForDisplay(displayClient?.phone),
                  referenceId: displayClient?.referenceId,
                })
              : undefined
        }
        className={
          displayAppointment
            ? "sm:h-[min(94dvh,60rem)] sm:min-h-[42rem]"
            : undefined
        }
        footer={
          isAppointmentDetailOpen ? (
            <Button
              size="sm"
              variant="outline"
              onClick={clearSelectedAppointment}
            >
              <Icon
                icon={ArrowRight02Icon}
                data-icon="inline-start"
                className="rotate-180"
              />
              Back to client
            </Button>
          ) : activeTab === "details" && displayClient ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => crud.openDelete(displayClient.id)}
                disabled={updateMutation.isPending}
              >
                <Icon icon={Delete01Icon} data-icon="inline-start" />
                Delete Client
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={clearDetails}
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  form={detailFormId}
                  disabled={updateMutation.isPending || !isDetailFormDirty}
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : displayClient ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => crud.openDelete(displayClient.id)}
              >
                <Icon icon={Delete01Icon} data-icon="inline-start" />
                Delete Client
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    clearDetails();
                    handleBookAppointment(displayClient);
                  }}
                >
                  <Icon icon={Calendar03Icon} data-icon="inline-start" />
                  Book
                </Button>
                <Button
                  size="sm"
                  onClick={() => openDetails(displayClient.id, "details")}
                >
                  <Icon icon={PencilEdit01Icon} data-icon="inline-start" />
                  Edit Details
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {displayClient ? (
          <div className="flex h-full min-h-0 flex-col">
            {isAppointmentDetailOpen ? (
              <div className="min-h-0 flex-1">
                <AppointmentDetail
                  appointment={displayAppointment}
                  displayTimezone={appointmentDisplayTimezone}
                  timezoneMode={appointmentTimezoneMode}
                  onTimezoneModeChange={setAppointmentTimezoneMode}
                  activeTab={activeAppointmentTab}
                  onTabChange={(tabValue) => setActiveAppointmentTab(tabValue)}
                  onOpenClient={openClientFromAppointment}
                  onOpenWorkflowRun={openWorkflowRun}
                  isLoading={isLoadingAppointment}
                  showHeader={false}
                />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                <div className="space-y-4">
                  <DetailTabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="px-0"
                  >
                    <DetailTab value="details">Details</DetailTab>
                    <DetailTab value="history">History</DetailTab>
                    <DetailTab value="workflows">Workflows</DetailTab>
                  </DetailTabs>

                  <div className="space-y-6">
                    {activeTab === "details" ? (
                      <div className="space-y-4">
                        {isLoadingClientFull &&
                        (customFieldDefinitions?.length ?? 0) > 0 ? (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            Loading client details...
                          </div>
                        ) : (
                          <ClientForm
                            key={displayClient.id}
                            formId={detailFormId}
                            showActions={false}
                            defaultValues={{
                              firstName: displayClient.firstName,
                              lastName: displayClient.lastName,
                              email: displayClient.email ?? undefined,
                              phone:
                                formatPhoneForDisplay(displayClient.phone) ??
                                undefined,
                              phoneCountry:
                                deriveCountryFromPhone(displayClient.phone) ??
                                "US",
                              customAttributes:
                                selectedClientFull?.customAttributes ?? {},
                            }}
                            onSubmit={handleUpdate}
                            onCancel={clearDetails}
                            isSubmitting={updateMutation.isPending}
                            shortcutsEnabled={detailModalOpen}
                            disableSubmitWhenPristine
                            onDirtyChange={setIsDetailFormDirty}
                            customFieldDefinitions={customFieldDefinitions}
                          />
                        )}
                      </div>
                    ) : null}

                    {activeTab === "history" ? (
                      <div className="space-y-6">
                        {isLoadingAppointments ? (
                          <div className="py-6 text-center text-muted-foreground">
                            Loading appointments...
                          </div>
                        ) : (
                          <>
                            <div>
                              <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                Upcoming
                              </h3>
                              {upcomingAppointments.length === 0 ? (
                                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                                  No upcoming appointments
                                </div>
                              ) : (
                                <div className="divide-y divide-border/50 rounded-lg border border-border">
                                  {upcomingAppointments.map((apt) => (
                                    <button
                                      key={apt.id}
                                      type="button"
                                      className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      onClick={() =>
                                        openAppointmentDetails(apt.id)
                                      }
                                    >
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="font-medium">
                                            {formatDisplayDateTime(apt.startAt)}
                                          </div>
                                          <div className="text-sm text-muted-foreground">
                                            {apt.appointmentType?.name}
                                            {apt.calendar &&
                                              ` - ${apt.calendar.name}`}
                                          </div>
                                        </div>
                                        <Badge
                                          variant={
                                            apt.status === "confirmed"
                                              ? "success"
                                              : "secondary"
                                          }
                                        >
                                          {apt.status}
                                        </Badge>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                  Past
                                </h3>
                                <Link
                                  to="/appointments"
                                  search={{ clientId: displayClient.id }}
                                  className={buttonVariants({
                                    variant: "ghost",
                                    size: "sm",
                                  })}
                                >
                                  View all
                                  <Icon
                                    icon={ArrowRight02Icon}
                                    data-icon="inline-end"
                                  />
                                </Link>
                              </div>
                              {pastAppointments.length === 0 ? (
                                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                                  No past appointments
                                </div>
                              ) : (
                                <div className="divide-y divide-border/50 rounded-lg border border-border">
                                  {pastAppointments.slice(0, 5).map((apt) => (
                                    <button
                                      key={apt.id}
                                      type="button"
                                      className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      onClick={() =>
                                        openAppointmentDetails(apt.id)
                                      }
                                    >
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="font-medium">
                                            {formatDisplayDateTime(apt.startAt)}
                                          </div>
                                          <div className="text-sm text-muted-foreground">
                                            {apt.appointmentType?.name}
                                          </div>
                                        </div>
                                        <Badge
                                          variant={
                                            apt.status === "confirmed"
                                              ? "success"
                                              : apt.status === "cancelled" ||
                                                  apt.status === "no_show"
                                                ? "destructive"
                                                : "secondary"
                                          }
                                        >
                                          {apt.status === "no_show"
                                            ? "No Show"
                                            : apt.status}
                                        </Badge>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}

                    {activeTab === "workflows" ? (
                      <div className="space-y-3">
                        {isLoadingWorkflowRuns ? (
                          <div className="py-6 text-center text-muted-foreground">
                            Loading workflows...
                          </div>
                        ) : isWorkflowRunsError ? (
                          <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                            Failed to load workflows for this client.
                          </div>
                        ) : (workflowRunsData?.length ?? 0) === 0 ? (
                          <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                            No workflows found for this client.
                          </div>
                        ) : (
                          workflowRunsData!.map((run) => {
                            const canOpenWorkflow = !!run.journeyId;

                            return (
                              <button
                                key={run.id}
                                type="button"
                                className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                                disabled={!canOpenWorkflow}
                                onClick={() => {
                                  if (!run.journeyId) {
                                    return;
                                  }

                                  openWorkflowRun({
                                    workflowId: run.journeyId,
                                    runId: run.id,
                                  });
                                }}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-medium text-sm">
                                    {run.journeyNameSnapshot}
                                  </p>
                                  <span
                                    className="shrink-0 text-muted-foreground text-xs"
                                    title={formatDisplayDateTime(run.startedAt)}
                                  >
                                    {formatRelativeTime(run.startedAt)}
                                  </span>
                                </div>
                                <p className="mt-1 truncate text-muted-foreground text-xs">
                                  {toEventTypeLabel(
                                    run.sidebarSummary?.triggerEventType ??
                                      null,
                                  )}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <Badge
                                    variant={toRunStatusBadgeVariant(
                                      run.status,
                                    )}
                                  >
                                    {toRunStatusLabel(run.status)}
                                  </Badge>
                                  <Badge variant="outline">
                                    {run.mode === "live" ? "Live" : "Test"}
                                  </Badge>
                                  {run.journeyVersion ? (
                                    <Badge variant="outline">
                                      v{run.journeyVersion}
                                    </Badge>
                                  ) : null}
                                  {run.sidebarSummary?.channelHint ? (
                                    <Badge variant="outline">
                                      {run.sidebarSummary.channelHint}
                                    </Badge>
                                  ) : null}
                                  {!run.journeyId ? (
                                    <Badge variant="secondary">
                                      Deleted workflow
                                    </Badge>
                                  ) : null}
                                </div>
                                {run.sidebarSummary?.nextState ? (
                                  <p className="mt-1 text-muted-foreground text-xs">
                                    {run.sidebarSummary.nextState.label}
                                    {run.sidebarSummary.nextState.at
                                      ? ` ${formatDisplayDateTime(run.sidebarSummary.nextState.at)}`
                                      : ""}
                                  </p>
                                ) : run.sidebarSummary?.statusReason ? (
                                  <p className="mt-1 text-muted-foreground text-xs">
                                    {run.sidebarSummary.statusReason}
                                  </p>
                                ) : null}
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </EntityModal>

      <EntityModal
        open={crud.showCreateForm}
        onOpenChange={(isOpen) => {
          if (!isOpen) crud.closeCreate();
        }}
        title="New Client"
      >
        <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <CreateClientForm
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={createMutation.isPending}
            shortcutsEnabled={crud.showCreateForm}
            customFieldDefinitions={customFieldDefinitions}
          />
        </div>
      </EntityModal>

      <AppointmentModal
        open={appointmentModalOpen}
        onOpenChange={(nextOpen) => {
          setAppointmentModalOpen(nextOpen);
          if (!nextOpen) {
            setAppointmentModalClientPrefill(null);
          }
        }}
        defaultClientId={appointmentModalClientPrefill?.id}
        defaultClientName={appointmentModalClientPrefill?.name}
        onCreated={handleAppointmentCreated}
      />

      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Client"
        description={deleteDialogDescription}
        isPending={deleteMutation.isPending}
      />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <Button className="w-full" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Add Client
        </Button>
      </div>
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/clients")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    selected?: string;
    tab?: DetailTabValue;
    appointment?: string;
    appointmentTab?: AppointmentDetailTabValue;
  } => {
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isDetailTab(rawTab) ? rawTab : undefined;
    const appointment =
      typeof search.appointment === "string" ? search.appointment : undefined;
    const rawAppointmentTab =
      typeof search.appointmentTab === "string" ? search.appointmentTab : "";
    const parsedAppointmentTab = isAppointmentDetailTab(rawAppointmentTab)
      ? rawAppointmentTab
      : undefined;
    return {
      selected,
      tab,
      appointment,
      appointmentTab: parsedAppointmentTab,
    };
  },
  loader: async () => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      queryClient.ensureQueryData(
        orpc.clients.list.queryOptions({
          input: { limit: 100 },
        }),
      ),
    );
  },
  component: ClientsPage,
});
