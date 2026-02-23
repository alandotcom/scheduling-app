// Appointment detail panel component for split-pane layout

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { AppointmentWithRelations } from "@scheduling/dto";
import { getLogger } from "@logtape/logtape";
import {
  ArrowRight02Icon,
  Calendar03Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  Mail01Icon,
  TimeScheduleIcon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Label } from "@/components/ui/label";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DetailTabs, DetailTab } from "@/components/split-pane";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RescheduleDialog } from "./reschedule-dialog";
import { AppointmentHistory } from "./appointment-history";
import {
  toEventTypeLabel,
  toRunStatusBadgeVariant,
  toRunStatusLabel,
} from "@/features/workflows/workflow-runs-helpers";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useResetFormOnOpen } from "@/hooks/use-reset-form-on-open";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import {
  formatDisplayDateTime,
  formatDateWithWeekday,
  formatRelativeTime,
  formatTimeDisplay,
  formatTimezoneShort,
} from "@/lib/date-utils";
import type { SchedulingTimezoneMode } from "@/lib/scheduling-timezone";

type DetailTabValue = "details" | "client" | "history" | "workflows";
const isDetailTabValue = (value: string): value is DetailTabValue =>
  value === "details" ||
  value === "client" ||
  value === "history" ||
  value === "workflows";

interface AppointmentDetailProps {
  appointment: AppointmentWithRelations | null;
  displayTimezone: string;
  timezoneMode: SchedulingTimezoneMode;
  onTimezoneModeChange: (mode: SchedulingTimezoneMode) => void;
  activeTab: DetailTabValue;
  onTabChange: (tab: DetailTabValue) => void;
  onOpenClient?: (clientId: string) => void;
  onOpenWorkflowRun?: (input: { workflowId: string; runId: string }) => void;
  isLoading?: boolean;
  showHeader?: boolean;
}

const notesSchema = z.object({
  notes: z.string().optional(),
});

type NotesFormData = z.infer<typeof notesSchema>;
const logger = getLogger(["ui", "workflows", "appointments"]);

function getStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return <Badge variant="secondary">Scheduled</Badge>;
    case "confirmed":
      return <Badge variant="success">Confirmed</Badge>;
    case "cancelled":
      return <Badge variant="destructive">Cancelled</Badge>;
    case "no_show":
      return <Badge variant="warning">No Show</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function AppointmentDetail({
  appointment,
  displayTimezone,
  timezoneMode,
  onTimezoneModeChange,
  activeTab,
  onTabChange,
  onOpenClient,
  onOpenWorkflowRun,
  isLoading,
  showHeader = true,
}: AppointmentDetailProps) {
  const queryClient = useQueryClient();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showNoShowDialog, setShowNoShowDialog] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const notesFormRef = useRef<HTMLFormElement>(null);

  const notesForm = useForm<NotesFormData>({
    resolver: zodResolver(notesSchema),
    defaultValues: { notes: appointment?.notes ?? "" },
  });
  const isNotesDirty = notesForm.formState.isDirty;

  useResetFormOnOpen({
    open: !!appointment && !isLoading,
    entityKey: appointment?.id,
    values: appointment
      ? {
          notes: appointment.notes ?? "",
        }
      : null,
    reset: (values) => {
      notesForm.reset(values);
    },
  });

  // Prefetch audit history so History tab loads instantly
  useQuery({
    ...orpc.audit.list.queryOptions({
      input: {
        entityType: "appointment" as const,
        entityId: appointment?.id ?? "",
        limit: 50,
      },
    }),
    enabled: !!appointment?.id,
  });

  const workflowRunsQuery = useQuery({
    ...orpc.journeys.runs.listByEntity.queryOptions({
      input: {
        entityType: "appointment",
        entityId: appointment?.id ?? "00000000-0000-0000-0000-000000000000",
        limit: 20,
      },
    }),
    enabled: !!appointment?.id && activeTab === "workflows",
  });

  useEffect(() => {
    if (
      activeTab !== "workflows" ||
      !appointment?.id ||
      !workflowRunsQuery.isError
    ) {
      return;
    }

    logger.error(
      "Failed to load workflow runs for appointment {appointmentId}: {error}",
      {
        appointmentId: appointment.id,
        error: workflowRunsQuery.error,
        errorStack:
          workflowRunsQuery.error instanceof Error
            ? workflowRunsQuery.error.stack
            : undefined,
      },
    );
  }, [
    activeTab,
    appointment?.id,
    workflowRunsQuery.error,
    workflowRunsQuery.isError,
  ]);

  // Update notes mutation
  const updateMutation = useMutation(
    orpc.appointments.update.mutationOptions({
      onSuccess: (_updatedAppointment, variables) => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        notesForm.reset({ notes: variables.notes ?? "" });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update notes");
      },
    }),
  );

  // Confirm mutation
  const confirmMutation = useMutation(
    orpc.appointments.confirm.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        setShowConfirmDialog(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to confirm appointment");
      },
    }),
  );

  // Cancel mutation
  const cancelMutation = useMutation(
    orpc.appointments.cancel.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        setShowCancelDialog(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to cancel appointment");
      },
    }),
  );

  // No-show mutation
  const noShowMutation = useMutation(
    orpc.appointments.noShow.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        setShowNoShowDialog(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to mark as no-show");
      },
    }),
  );

  const isActionable =
    appointment?.status === "scheduled" || appointment?.status === "confirmed";

  useSubmitShortcut({
    enabled:
      !!appointment &&
      !isLoading &&
      isActionable &&
      activeTab === "details" &&
      isNotesDirty &&
      !updateMutation.isPending,
    onSubmit: () => notesFormRef.current?.requestSubmit(),
  });

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled:
      !!appointment && !isLoading && isActionable && activeTab === "details",
    fields: [{ id: "notes", key: "n", description: "Focus notes" }],
  });

  if (isLoading || !appointment) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
    );
  }

  const displayTimezoneShort = formatTimezoneShort(
    displayTimezone,
    appointment.startAt,
  );

  const handleSaveNotes = (data: NotesFormData) => {
    updateMutation.mutate({
      id: appointment.id,
      notes: data.notes || null,
    });
  };

  return (
    <>
      <div className="flex h-full flex-col">
        {showHeader ? (
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  {appointment.appointmentType?.name ?? "Appointment"}
                </h2>
                {getStatusBadge(appointment.status)}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateWithWeekday(appointment.startAt, displayTimezone)} ·{" "}
                {formatTimeDisplay(appointment.startAt, displayTimezone)} -{" "}
                {formatTimeDisplay(appointment.endAt, displayTimezone)} (
                {displayTimezoneShort})
              </p>
            </div>
          </div>
        ) : (
          <div className="px-4 pt-3 pb-1 sm:px-6 sm:pt-4">
            {getStatusBadge(appointment.status)}
          </div>
        )}

        {/* Tabs */}
        <DetailTabs
          className="px-4 sm:px-6"
          value={activeTab}
          onValueChange={(value) => {
            if (isDetailTabValue(value)) {
              onTabChange(value);
            }
          }}
        >
          <DetailTab value="details">Details</DetailTab>
          <DetailTab value="client">Client</DetailTab>
          <DetailTab value="history">History</DetailTab>
          <DetailTab value="workflows">Workflows</DetailTab>
        </DetailTabs>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {activeTab === "details" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Date/Time Card */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm">
                  <Icon
                    icon={Calendar03Icon}
                    className="text-muted-foreground"
                  />
                  <span className="font-medium">
                    {formatDateWithWeekday(
                      appointment.startAt,
                      displayTimezone,
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm mt-2">
                  <Icon
                    icon={Clock01Icon}
                    className="text-muted-foreground shrink-0"
                  />
                  <span className="shrink-0">
                    {formatTimeDisplay(appointment.startAt, displayTimezone)} -{" "}
                    {formatTimeDisplay(appointment.endAt, displayTimezone)}
                  </span>
                  <span
                    className="text-muted-foreground truncate"
                    title={displayTimezone}
                  >
                    ({displayTimezoneShort})
                  </span>
                </div>
              </div>

              {/* Calendar */}
              {appointment.calendar && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Calendar
                  </Label>
                  <div className="mt-2 text-sm font-medium">
                    {appointment.calendar.name}
                  </div>
                </div>
              )}

              {/* Duration */}
              {appointment.appointmentType && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Duration
                  </Label>
                  <div className="mt-2 text-sm">
                    {appointment.appointmentType.durationMin} minutes
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Notes
                </Label>
                {isActionable ? (
                  <form
                    id={`appointment-notes-form-${appointment.id}`}
                    ref={notesFormRef}
                    onSubmit={notesForm.handleSubmit(handleSaveNotes)}
                    className="mt-2"
                  >
                    <div className="relative" ref={registerField("notes")}>
                      <Textarea
                        {...notesForm.register("notes")}
                        placeholder="Add notes..."
                        rows={3}
                      />
                      <FieldShortcutHint shortcut="n" visible={hintsVisible} />
                    </div>
                  </form>
                ) : (
                  <div className="mt-2 rounded-lg border border-border p-3 text-sm">
                    {appointment.notes || (
                      <span className="text-muted-foreground italic">
                        No notes
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              {isActionable && (
                <div className="border-t border-border pt-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowRescheduleDialog(true)}
                      >
                        <Icon
                          icon={TimeScheduleIcon}
                          data-icon="inline-start"
                        />
                        Reschedule
                      </Button>
                      {appointment.status === "scheduled" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowConfirmDialog(true)}
                          disabled={confirmMutation.isPending}
                        >
                          <Icon
                            icon={CheckmarkCircle01Icon}
                            data-icon="inline-start"
                          />
                          {confirmMutation.isPending
                            ? "Confirming..."
                            : "Confirm"}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowNoShowDialog(true)}
                      >
                        <Icon icon={Clock01Icon} data-icon="inline-start" />
                        No-Show
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowCancelDialog(true)}
                      >
                        <Icon icon={Cancel01Icon} data-icon="inline-start" />
                        Cancel
                      </Button>
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      form={`appointment-notes-form-${appointment.id}`}
                      disabled={updateMutation.isPending || !isNotesDirty}
                      className="w-full sm:w-auto"
                    >
                      {updateMutation.isPending ? "Saving..." : "Save"}
                      <ShortcutBadge
                        shortcut="meta+enter"
                        className="ml-2 hidden sm:inline-flex"
                      />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "client" && (
            <div className="space-y-4 sm:space-y-6">
              <button
                type="button"
                className="w-full rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpenClient?.(appointment.client.id)}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    icon={UserCircle02Icon}
                    className="text-muted-foreground"
                  />
                  <span className="font-medium">
                    {appointment.client.firstName} {appointment.client.lastName}
                  </span>
                </div>
                {appointment.client.email && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <Icon icon={Mail01Icon} className="size-3.5" />
                    <span className="min-w-0 break-all">
                      {appointment.client.email}
                    </span>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-end text-sm text-muted-foreground">
                  <span>Open client</span>
                  <Icon icon={ArrowRight02Icon} className="ml-2 size-4" />
                </div>
              </button>
            </div>
          )}

          {activeTab === "history" && (
            <AppointmentHistory
              appointmentId={appointment.id}
              displayTimezone={displayTimezone}
            />
          )}

          {activeTab === "workflows" && (
            <div className="space-y-3">
              {workflowRunsQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">
                  Loading workflows...
                </div>
              ) : workflowRunsQuery.isError ? (
                <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                  Failed to load workflows for this appointment.
                </div>
              ) : (workflowRunsQuery.data?.length ?? 0) === 0 ? (
                <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                  No workflows found for this appointment.
                </div>
              ) : (
                workflowRunsQuery.data!.map((run) => {
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

                        onOpenWorkflowRun?.({
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
                          run.sidebarSummary?.triggerEventType ?? null,
                        )}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant={toRunStatusBadgeVariant(run.status)}>
                          {toRunStatusLabel(run.status)}
                        </Badge>
                        <Badge variant="outline">
                          {run.mode === "live" ? "Live" : "Test"}
                        </Badge>
                        {run.journeyVersion ? (
                          <Badge variant="outline">v{run.journeyVersion}</Badge>
                        ) : null}
                        {run.sidebarSummary?.channelHint ? (
                          <Badge variant="outline">
                            {run.sidebarSummary.channelHint}
                          </Badge>
                        ) : null}
                        {!run.journeyId ? (
                          <Badge variant="secondary">Deleted workflow</Badge>
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
          )}
        </div>
      </div>

      {/* Cancel Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this appointment as confirmed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Scheduled</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmMutation.mutate({ id: appointment.id })}
            >
              {confirmMutation.isPending ? "Confirming..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this appointment? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMutation.mutate({ id: appointment.id })}
            >
              {cancelMutation.isPending
                ? "Cancelling..."
                : "Cancel Appointment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No-Show Dialog */}
      <AlertDialog open={showNoShowDialog} onOpenChange={setShowNoShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as No-Show</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this appointment as a no-show?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => noShowMutation.mutate({ id: appointment.id })}
            >
              {noShowMutation.isPending ? "Saving..." : "Mark as No-Show"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule Dialog */}
      <RescheduleDialog
        appointment={appointment}
        open={showRescheduleDialog}
        onOpenChange={setShowRescheduleDialog}
        timezoneMode={timezoneMode}
        onTimezoneModeChange={onTimezoneModeChange}
        displayTimezone={displayTimezone}
        defaultTimezone={appointment.calendar?.timezone ?? appointment.timezone}
      />
    </>
  );
}
