import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft01Icon,
  MoreHorizontalIcon,
  PlayIcon,
  Delete01Icon,
  CheckmarkCircle03Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RunEntityType } from "./workflow-editor-types";
import { RUN_ENTITY_TYPES } from "./workflow-editor-types";
import { isRunEntityType } from "./workflow-editor-utils";

type AppointmentOption = {
  id: string;
  label: string;
  secondary: string;
};

type WorkflowToolbarProps = {
  status: "draft" | "active" | "archived";
  workflowName: string;
  onWorkflowNameChange: (name: string) => void;
  isDirty: boolean;
  isMutating: boolean;
  onSave: () => Promise<unknown>;
  onValidate: () => Promise<void>;
  onDelete: () => Promise<void>;
  isDeleting: boolean;
  onRunDraft: (input: {
    entityType: RunEntityType;
    entityId: string;
  }) => Promise<void>;
  isRunningDraft: boolean;
  appointmentOptions: AppointmentOption[];
  isAppointmentsLoading: boolean;
};

export function WorkflowToolbar({
  status,
  workflowName,
  onWorkflowNameChange,
  isDirty,
  isMutating,
  onSave,
  onValidate,
  onDelete,
  isDeleting,
  onRunDraft,
  isRunningDraft,
  appointmentOptions,
  isAppointmentsLoading,
}: WorkflowToolbarProps) {
  const [isRunOpen, setIsRunOpen] = useState(false);
  const [runEntityType, setRunEntityType] =
    useState<RunEntityType>("appointment");
  const [appointmentQuery, setAppointmentQuery] = useState("");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const filteredAppointments = useMemo(() => {
    const term = appointmentQuery.trim().toLowerCase();
    if (term.length === 0) {
      return appointmentOptions;
    }

    return appointmentOptions.filter((option) =>
      `${option.label} ${option.secondary}`.toLowerCase().includes(term),
    );
  }, [appointmentOptions, appointmentQuery]);

  const runDisabled =
    isRunningDraft ||
    (runEntityType === "appointment"
      ? selectedAppointmentId.length === 0
      : true);

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link to="/workflows">
              <Icon icon={ArrowLeft01Icon} className="size-4" />
              Back
            </Link>
          </Button>
          <Badge variant={status === "active" ? "default" : "warning"}>
            {status}
          </Badge>
          {isDirty ? <Badge variant="secondary">Unsaved</Badge> : null}
          <Input
            className="w-64"
            value={workflowName}
            onChange={(event) => onWorkflowNameChange(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={isMutating}
            onClick={() => {
              setIsRunOpen(true);
            }}
            variant="outline"
          >
            <Icon icon={PlayIcon} className="size-4" />
            Run draft
          </Button>
          <Button
            disabled={!isDirty || isMutating}
            onClick={() => void onSave()}
          >
            Save
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="icon-sm" variant="outline" />}
            >
              <Icon icon={MoreHorizontalIcon} className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom">
              <DropdownMenuItem
                disabled={isMutating}
                onClick={() => void onValidate()}
              >
                <Icon icon={CheckmarkCircle03Icon} className="size-4" />
                Validate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setIsDeleteOpen(true);
                }}
                variant="destructive"
              >
                <Icon icon={Delete01Icon} className="size-4" />
                Delete workflow
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>Duplicate (TODO)</DropdownMenuItem>
              <DropdownMenuItem disabled>Make public (TODO)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <AlertDialog onOpenChange={setIsRunOpen} open={isRunOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Run workflow draft</AlertDialogTitle>
            <AlertDialogDescription>
              Choose an entity type and target entity.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Entity type</Label>
              <Select
                items={RUN_ENTITY_TYPES.map((entityType) => ({
                  value: entityType,
                  label: entityType,
                }))}
                value={runEntityType}
                onValueChange={(value) => {
                  if (typeof value === "string" && isRunEntityType(value)) {
                    setRunEntityType(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Entity type" />
                </SelectTrigger>
                <SelectContent>
                  {RUN_ENTITY_TYPES.map((entityType) => (
                    <SelectItem key={entityType} value={entityType}>
                      {entityType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {runEntityType === "appointment" ? (
              <div className="space-y-1.5">
                <Label>Appointment</Label>
                <Input
                  placeholder="Search appointments"
                  value={appointmentQuery}
                  onChange={(event) => setAppointmentQuery(event.target.value)}
                />
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                  {isAppointmentsLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading appointments...
                    </p>
                  ) : null}
                  {!isAppointmentsLoading &&
                  filteredAppointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No appointments found.
                    </p>
                  ) : null}
                  {filteredAppointments.map((option) => (
                    <button
                      key={option.id}
                      className="w-full rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => setSelectedAppointmentId(option.id)}
                      type="button"
                    >
                      <p className="font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {option.secondary}
                      </p>
                      {selectedAppointmentId === option.id ? (
                        <p className="text-xs text-primary">Selected</p>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
                TODO: Search support for <strong>{runEntityType}</strong> is not
                implemented yet. Run is disabled for this entity type.
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={runDisabled}
              onClick={() => {
                if (runEntityType === "appointment" && selectedAppointmentId) {
                  void onRunDraft({
                    entityType: runEntityType,
                    entityId: selectedAppointmentId,
                  }).then(() => {
                    setIsRunOpen(false);
                  });
                }
              }}
            >
              {isRunningDraft ? "Running..." : "Run draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={setIsDeleteOpen} open={isDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workflow</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes this workflow and its published versions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void onDelete().then(() => {
                  setIsDeleteOpen(false);
                });
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
