// Appointment detail drawer for viewing and editing

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar03Icon,
  Clock01Icon,
  UserCircle02Icon,
  Mail01Icon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
  TimeScheduleIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { orpc } from "@/lib/query";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from "@/components/drawer";
import { Button } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  formatDateWithWeekday,
  formatTimeDisplay,
  formatTimezoneShort,
} from "@/lib/date-utils";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";

interface AppointmentDrawerProps {
  appointment: {
    id: string;
    startAt: string | Date;
    endAt: string | Date;
    timezone: string;
    status: "scheduled" | "confirmed" | "cancelled" | "no_show";
    notes: string | null;
    calendar?: { id: string; name: string; timezone: string } | null;
    appointmentType?: { id: string; name: string; durationMin: number } | null;
    client: {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
    };
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const notesSchema = z.object({
  notes: z.string().optional(),
});

type NotesFormData = z.infer<typeof notesSchema>;

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

export function AppointmentDrawer({
  appointment,
  open,
  onOpenChange,
}: AppointmentDrawerProps) {
  const queryClient = useQueryClient();
  const [editingNotes, setEditingNotes] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showNoShowDialog, setShowNoShowDialog] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const notesFormRef = useRef<HTMLFormElement>(null);

  const notesForm = useForm<NotesFormData>({
    resolver: zodResolver(notesSchema),
    defaultValues: { notes: appointment?.notes ?? "" },
  });

  // Update notes mutation
  const updateMutation = useMutation(
    orpc.appointments.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        setEditingNotes(false);
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

  const handleSaveNotes = (data: NotesFormData) => {
    if (!appointment) {
      return;
    }

    updateMutation.mutate({
      id: appointment.id,
      notes: data.notes || null,
    });
  };

  useSubmitShortcut({
    enabled: open && editingNotes && isActionable && !updateMutation.isPending,
    onSubmit: () => notesFormRef.current?.requestSubmit(),
  });

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: open && editingNotes && isActionable,
    fields: [{ id: "notes", key: "n", description: "Focus notes" }],
  });

  if (!appointment) return null;
  const timezoneShortLabel = formatTimezoneShort(
    appointment.timezone,
    appointment.startAt,
  );

  const handleConfirm = () => {
    confirmMutation.mutate({ id: appointment.id });
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent width="md">
          <DrawerHeader onClose={() => onOpenChange(false)}>
            <DrawerTitle>Appointment Details</DrawerTitle>
          </DrawerHeader>

          <DrawerBody>
            {/* Type and Calendar */}
            <div className="space-y-1 mb-6">
              <h3 className="text-lg font-medium">
                {appointment.appointmentType?.name ?? "Appointment"}
                {appointment.appointmentType?.durationMin && (
                  <span className="text-muted-foreground font-normal ml-2">
                    ({appointment.appointmentType.durationMin} min)
                  </span>
                )}
              </h3>
              {appointment.calendar && (
                <p className="text-sm text-muted-foreground">
                  {appointment.calendar.name}
                </p>
              )}
            </div>

            {/* Date/Time Card */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 mb-6">
              <div className="flex items-center gap-2 text-sm">
                <Icon icon={Calendar03Icon} className="text-muted-foreground" />
                <span className="font-medium">
                  {formatDateWithWeekday(
                    appointment.startAt,
                    appointment.timezone,
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm mt-2">
                <Icon icon={Clock01Icon} className="text-muted-foreground" />
                <span>
                  {formatTimeDisplay(appointment.startAt, appointment.timezone)}{" "}
                  - {formatTimeDisplay(appointment.endAt, appointment.timezone)}
                </span>
                <span
                  className="text-muted-foreground"
                  title={appointment.timezone}
                >
                  ({timezoneShortLabel})
                </span>
              </div>
            </div>

            {/* Client Info */}
            <div className="mb-6">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Client
              </Label>
              <div className="mt-2 rounded-lg border border-border p-4">
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
                    <span>{appointment.client.email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="mb-6">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </Label>
              <div className="mt-2">{getStatusBadge(appointment.status)}</div>
            </div>

            {/* Notes */}
            <div className="mb-6">
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
                  ref={notesFormRef}
                  onSubmit={notesForm.handleSubmit(handleSaveNotes)}
                  className="mt-2 space-y-3"
                >
                  <div className="relative" ref={registerField("notes")}>
                    <Textarea
                      {...notesForm.register("notes")}
                      placeholder="Add notes..."
                      rows={3}
                    />
                    <FieldShortcutHint shortcut="n" visible={hintsVisible} />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? "Saving..." : "Save"}
                      <ShortcutBadge
                        shortcut="meta+enter"
                        className="ml-2 hidden sm:inline-flex"
                      />
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
                <div className="mt-2 rounded-lg border border-border p-3 text-sm">
                  {appointment.notes || (
                    <span className="text-muted-foreground italic">
                      No notes
                    </span>
                  )}
                </div>
              )}
            </div>
          </DrawerBody>

          {/* Actions */}
          {isActionable && (
            <DrawerFooter>
              <div className="flex flex-wrap gap-2 w-full">
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
                    onClick={handleConfirm}
                    disabled={confirmMutation.isPending}
                  >
                    <Icon
                      icon={CheckmarkCircle01Icon}
                      data-icon="inline-start"
                    />
                    {confirmMutation.isPending ? "Confirming..." : "Confirm"}
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
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>

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

      {/* Reschedule Dialog - Placeholder for now */}
      <AlertDialog
        open={showRescheduleDialog}
        onOpenChange={setShowRescheduleDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reschedule Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Select a new date and time for this appointment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled>Coming Soon</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
