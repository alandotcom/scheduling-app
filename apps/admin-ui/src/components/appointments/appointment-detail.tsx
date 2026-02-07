// Appointment detail panel component for split-pane layout

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { AppointmentWithRelations } from "@scheduling/dto";
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
import { Label } from "@/components/ui/label";
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
import { useResetFormOnOpen } from "@/hooks/use-reset-form-on-open";

type DetailTabValue = "details" | "client" | "history";

interface AppointmentDetailProps {
  appointment: AppointmentWithRelations | null;
  activeTab: DetailTabValue;
  onTabChange: (tab: DetailTabValue) => void;
  isLoading?: boolean;
}

const notesSchema = z.object({
  notes: z.string().optional(),
});

type NotesFormData = z.infer<typeof notesSchema>;

function formatDate(dateString: string | Date) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateString: string | Date) {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

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
  activeTab,
  onTabChange,
  isLoading,
}: AppointmentDetailProps) {
  const queryClient = useQueryClient();
  const [editingNotes, setEditingNotes] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showNoShowDialog, setShowNoShowDialog] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);

  const notesForm = useForm<NotesFormData>({
    resolver: zodResolver(notesSchema),
    defaultValues: { notes: appointment?.notes ?? "" },
  });

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
    onReset: () => {
      setEditingNotes(false);
    },
  });

  // Update notes mutation
  const updateMutation = useMutation(
    orpc.appointments.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        setEditingNotes(false);
        toast.success("Notes updated");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update notes");
      },
    }),
  );

  // Cancel mutation
  const cancelMutation = useMutation(
    orpc.appointments.cancel.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        setShowCancelDialog(false);
        toast.success("Appointment cancelled");
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
        setShowNoShowDialog(false);
        toast.success("Marked as no-show");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to mark as no-show");
      },
    }),
  );

  if (isLoading || !appointment) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Loading appointment...
      </div>
    );
  }

  const isActionable =
    appointment.status === "scheduled" || appointment.status === "confirmed";

  const handleSaveNotes = (data: NotesFormData) => {
    updateMutation.mutate({
      id: appointment.id,
      data: {
        notes: data.notes || null,
      },
    });
  };

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">
                {appointment.appointmentType?.name ?? "Appointment"}
              </h2>
              {getStatusBadge(appointment.status)}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(appointment.startAt)} ·{" "}
              {formatTime(appointment.startAt)} -{" "}
              {formatTime(appointment.endAt)}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <DetailTabs
          value={activeTab}
          onValueChange={(value) => onTabChange(value as DetailTabValue)}
        >
          <DetailTab value="details">Details</DetailTab>
          <DetailTab value="client">Client</DetailTab>
          <DetailTab value="history">History</DetailTab>
        </DetailTabs>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === "details" && (
            <div className="space-y-6">
              {/* Date/Time Card */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm">
                  <Icon
                    icon={Calendar03Icon}
                    className="text-muted-foreground"
                  />
                  <span className="font-medium">
                    {formatDate(appointment.startAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm mt-2">
                  <Icon
                    icon={Clock01Icon}
                    className="text-muted-foreground shrink-0"
                  />
                  <span className="shrink-0">
                    {formatTime(appointment.startAt)} -{" "}
                    {formatTime(appointment.endAt)}
                  </span>
                  <span
                    className="text-muted-foreground truncate"
                    title={appointment.timezone}
                  >
                    ({appointment.timezone})
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
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Notes
                  </Label>
                  {!editingNotes && isActionable && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        notesForm.reset({ notes: appointment.notes ?? "" });
                        setEditingNotes(true);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
                {editingNotes ? (
                  <form
                    onSubmit={notesForm.handleSubmit(handleSaveNotes)}
                    className="mt-2 space-y-3"
                  >
                    <Textarea
                      {...notesForm.register("notes")}
                      placeholder="Add notes..."
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingNotes(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-2 rounded-lg border border-border/50 p-3 text-sm">
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
                <div className="border-t border-border/50 pt-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRescheduleDialog(true)}
                    >
                      <Icon icon={TimeScheduleIcon} data-icon="inline-start" />
                      Reschedule
                    </Button>
                    {appointment.status === "scheduled" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          toast.info("Confirm feature requires API endpoint")
                        }
                      >
                        <Icon
                          icon={CheckmarkCircle01Icon}
                          data-icon="inline-start"
                        />
                        Confirm
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
                </div>
              )}
            </div>
          )}

          {activeTab === "client" && (
            <div className="space-y-6">
              {appointment.client ? (
                <>
                  <div className="rounded-lg border border-border/50 p-4">
                    <div className="flex items-center gap-2">
                      <Icon
                        icon={UserCircle02Icon}
                        className="text-muted-foreground"
                      />
                      <span className="font-medium">
                        {appointment.client.firstName}{" "}
                        {appointment.client.lastName}
                      </span>
                    </div>
                    {appointment.client.email && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <Icon icon={Mail01Icon} className="size-3.5" />
                        <span>{appointment.client.email}</span>
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    asChild
                  >
                    <Link
                      to="/clients"
                      search={{ selected: appointment.client.id }}
                    >
                      <span>View Client Profile</span>
                      <Icon icon={ArrowRight02Icon} />
                    </Link>
                  </Button>
                </>
              ) : (
                <div className="rounded-lg border border-border/50 p-6 text-center text-sm text-muted-foreground">
                  No client associated with this appointment
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <AppointmentHistory appointmentId={appointment.id} />
          )}
        </div>
      </div>

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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
      />
    </>
  );
}
