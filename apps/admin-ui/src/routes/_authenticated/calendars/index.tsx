// Calendars management page with modal-based CRUD

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useClosingSnapshot } from "@/hooks/use-closing-snapshot";
import { DateTime } from "luxon";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  Clock01Icon,
  Copy01Icon,
  Delete01Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { createCalendarSchema } from "@scheduling/dto";
import type { CreateCalendarInput } from "@scheduling/dto";
import {
  EntityListEmptyState,
  EntityListLoadingState,
} from "@/components/entity-list";
import { AvailabilitySubTabs } from "@/components/availability/availability-sub-tabs";
import { AvailabilityPreviewPanel } from "@/components/availability/availability-preview-panel";
import { BlockedTimeEditor } from "@/components/availability/blocked-time-editor";
import { AppointmentModal } from "@/components/appointment-modal";
import {
  WEEKDAYS,
  type AvailabilityPreviewDraftState,
  type AvailabilitySubTabType,
  type DaySchedule,
  type TimeBlock,
  type WeeklySchedule,
} from "@/components/availability/constants";
import { CalendarSchedulingLimitsEditor } from "@/components/availability/scheduling-limits-editor";
import {
  formatTimeBlocksForInput,
  parseTimeRanges,
  validateTimeBlocks,
} from "@/components/availability/time-range-parser";
import { WeeklyScheduleEditor } from "@/components/availability/weekly-schedule-editor";
import type { ContextMenuItem } from "@/components/context-menu";
import { CopyIdHeaderAction } from "@/components/copy-id-header-action";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DetailTab, DetailTabs } from "@/components/workbench";
import { EntityModal } from "@/components/entity-modal";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { CalendarsListPresentation } from "@/components/calendars/calendars-list-presentation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrudState } from "@/hooks/use-crud-state";
import { useBufferedPending } from "@/hooks/use-buffered-pending";
import { useCreateDraft, useResetCreateDraft } from "@/hooks/use-create-draft";
import { useCreateIntentTrigger } from "@/hooks/use-create-intent";
import {
  useKeyboardShortcuts,
  useListNavigation,
} from "@/hooks/use-keyboard-shortcuts";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import { useUrlDrivenModal } from "@/hooks/use-url-driven-modal";
import { useValidateSelection } from "@/hooks/use-selection-search-params";
import {
  formatDateISO,
  formatDisplayDateTime,
  formatTimezonePickerLabel,
  formatTimezoneShort,
} from "@/lib/date-utils";
import { TIMEZONES } from "@/lib/constants";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";
import { resolveSelectValueLabel } from "@/lib/select-value-label";

const CALENDAR_CREATE_DRAFT_KEY = "calendars:create";
const CALENDAR_CREATE_FORM_ID = "calendar-create-form";

interface CreateCalendarFormInput {
  calendar: CreateCalendarInput;
  weeklySchedule: WeeklySchedule;
}

interface CreateCalendarDraft extends CreateCalendarInput {
  weeklySchedule: WeeklySchedule;
}

function createEmptyWeeklySchedule(): WeeklySchedule {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [day.value, { enabled: false, blocks: [] }]),
  ) as WeeklySchedule;
}

function buildRulesFromWeeklySchedule(weeklySchedule: WeeklySchedule) {
  const rules: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
  }> = [];

  for (const day of WEEKDAYS) {
    const daySchedule = weeklySchedule[day.value];
    if (!daySchedule?.enabled) continue;
    for (const block of daySchedule.blocks) {
      rules.push({
        weekday: day.value,
        startTime: block.startTime,
        endTime: block.endTime,
      });
    }
  }

  return rules;
}

interface CalendarFormProps {
  defaultValues?: {
    name: string;
    timezone: string;
    slotIntervalMin?: number;
    locationId?: string;
    requiresConfirmation?: boolean;
  };
  locations: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateCalendarInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  footerStart?: ReactNode;
  onDraftChange?: (data: CreateCalendarInput) => void;
  onDiscardDraft?: () => void;
  showDiscardAction?: boolean;
  formId?: string;
  showActions?: boolean;
  extraContent?: ReactNode;
  disableSubmitWhenPristine?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

function CalendarForm({
  defaultValues,
  locations,
  onSubmit,
  onCancel,
  isSubmitting,
  footerStart,
  onDraftChange,
  onDiscardDraft,
  showDiscardAction = false,
  formId,
  showActions = true,
  extraContent,
  disableSubmitWhenPristine = false,
  onDirtyChange,
}: CalendarFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const showSubmittingVisual = useBufferedPending(isSubmitting);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<CreateCalendarInput>({
    resolver: zodResolver(createCalendarSchema),
    mode: "onBlur",
    defaultValues: defaultValues ?? {
      name: "",
      timezone: "America/New_York",
      slotIntervalMin: 15,
      requiresConfirmation: false,
    },
  });

  const timezone = watch("timezone");
  const slotIntervalMin = watch("slotIntervalMin");
  const locationId = watch("locationId");
  const requiresConfirmation = watch("requiresConfirmation");

  const timezoneSelectLabel = resolveSelectValueLabel({
    value: timezone,
    options: TIMEZONES,
    getOptionValue: (tz) => tz,
    getOptionLabel: (tz) => formatTimezonePickerLabel(tz),
    unknownLabel: "Unknown timezone",
  });

  const locationSelectLabel = resolveSelectValueLabel({
    value: locationId ?? "none",
    options: locations,
    getOptionValue: (location) => location.id,
    getOptionLabel: (location) => location.name,
    noneLabel: "No location",
    unknownLabel: "Unknown location",
  });

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: true,
    fields: [
      { id: "name", key: "n", description: "Focus name" },
      {
        id: "timezone",
        key: "t",
        description: "Focus timezone",
        openOnFocus: true,
      },
      {
        id: "location",
        key: "l",
        description: "Focus location",
        openOnFocus: true,
      },
    ],
  });

  useSubmitShortcut({
    enabled: !isSubmitting && (!disableSubmitWhenPristine || isDirty),
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  useEffect(() => {
    if (!onDraftChange) return;
    const subscription = watch((values) => {
      onDraftChange({
        name: values.name ?? "",
        timezone: values.timezone ?? "America/New_York",
        slotIntervalMin: values.slotIntervalMin ?? 15,
        locationId: values.locationId,
        requiresConfirmation: values.requiresConfirmation ?? false,
      });
    });
    return () => subscription.unsubscribe();
  }, [onDraftChange, watch]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  return (
    <form
      id={formId}
      ref={formRef}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
    >
      <div
        className={
          extraContent
            ? "space-y-5 md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0"
            : "space-y-5"
        }
      >
        <div className="space-y-5">
          <div className="space-y-2.5 relative" ref={registerField("name")}>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Dr. Smith's Calendar"
              aria-describedby={errors.name ? "name-error" : undefined}
              aria-invalid={!!errors.name}
              {...register("name")}
              disabled={isSubmitting}
            />
            {errors.name && (
              <p id="name-error" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
            <FieldShortcutHint shortcut="n" visible={hintsVisible} />
          </div>

          <div className="space-y-2.5 relative" ref={registerField("timezone")}>
            <Label htmlFor="timezone">Timezone *</Label>
            <Select
              value={timezone}
              onValueChange={(value) => value && setValue("timezone", value)}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select timezone">
                  {timezoneSelectLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {formatTimezonePickerLabel(tz)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.timezone && (
              <p className="text-sm text-destructive">
                {errors.timezone.message}
              </p>
            )}
            <FieldShortcutHint shortcut="t" visible={hintsVisible} />
          </div>

          <div className="space-y-2.5 relative" ref={registerField("location")}>
            <Label htmlFor="locationId">Location</Label>
            <Select
              value={locationId ?? "none"}
              onValueChange={(value) =>
                value &&
                setValue("locationId", value === "none" ? undefined : value)
              }
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select location">
                  {locationSelectLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No location</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldShortcutHint shortcut="l" visible={hintsVisible} />
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="slotIntervalMin">Start Time Interval *</Label>
            <Input
              id="slotIntervalMin"
              type="number"
              min={1}
              max={120}
              step={1}
              value={slotIntervalMin ?? 15}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                setValue(
                  "slotIntervalMin",
                  Number.isInteger(parsed) ? parsed : 15,
                  { shouldDirty: true },
                );
              }}
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">
              Minutes between available start times (1-120).
            </p>
            {errors.slotIntervalMin && (
              <p className="text-sm text-destructive">
                {errors.slotIntervalMin.message}
              </p>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="flex items-start justify-between rounded-lg border border-border/70 px-3 py-3">
              <div className="pr-3">
                <Label htmlFor="requires-confirmation">
                  Require confirmation
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Appointments on this calendar must be confirmed.
                </p>
              </div>
              <Switch
                id="requires-confirmation"
                checked={requiresConfirmation ?? false}
                onCheckedChange={(checked) =>
                  setValue("requiresConfirmation", checked, {
                    shouldDirty: true,
                  })
                }
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {extraContent ? <div>{extraContent}</div> : null}
      </div>

      {showActions ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {footerStart ? <div>{footerStart}</div> : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {showDiscardAction && onDiscardDraft ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onDiscardDraft}
                disabled={isSubmitting}
              >
                Discard Draft
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || (disableSubmitWhenPristine && !isDirty)}
              className={isSubmitting ? "disabled:opacity-100" : undefined}
            >
              {showSubmittingVisual ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

interface CreateCalendarFormProps {
  locations: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateCalendarFormInput) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  formId?: string;
  showActions?: boolean;
}

function CreateAvailabilityDayInput({
  day,
  daySchedule,
  onUpdate,
  isSubmitting,
}: {
  day: (typeof WEEKDAYS)[number];
  daySchedule: DaySchedule;
  onUpdate: (weekday: number, schedule: DaySchedule) => void;
  isSubmitting: boolean;
}) {
  const [draftInputValue, setDraftInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayInputValue =
    daySchedule.enabled && daySchedule.blocks.length > 0
      ? formatTimeBlocksForInput(daySchedule.blocks)
      : "";
  const inputValue = isFocused ? draftInputValue : displayInputValue;
  const error = isFocused ? draftError : null;
  const isActive = daySchedule.enabled && daySchedule.blocks.length > 0;

  const commitValue = useCallback(
    (value: string) => {
      const trimmed = value.trim();

      if (!trimmed) {
        onUpdate(day.value, { enabled: false, blocks: [] });
        setDraftError(null);
        return;
      }

      const parsed = parseTimeRanges(trimmed);
      if (parsed.length === 0) {
        setDraftError("Could not parse time ranges. Try: 9am-5pm");
        return;
      }

      const validationError = validateTimeBlocks(parsed);
      if (validationError) {
        setDraftError(validationError);
        return;
      }

      setDraftError(null);
      onUpdate(day.value, { enabled: true, blocks: parsed });
    },
    [day.value, onUpdate],
  );

  return (
    <div className="group flex items-start gap-3">
      <button
        type="button"
        onClick={() => {
          if (isActive) {
            onUpdate(day.value, { enabled: false, blocks: [] });
            setDraftInputValue("");
            setDraftError(null);
            return;
          }
          const defaultBlocks: TimeBlock[] = [
            { startTime: "09:00", endTime: "17:00" },
          ];
          onUpdate(day.value, { enabled: true, blocks: defaultBlocks });
        }}
        disabled={isSubmitting}
        className={`mt-1 shrink-0 h-8 w-12 flex items-center justify-center rounded-lg text-sm font-semibold transition-all ${
          isActive
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
        aria-label={`Toggle ${day.label}`}
      >
        {day.short}
      </button>

      <div className="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(event) => setDraftInputValue(event.target.value)}
          onFocus={() => {
            setIsFocused(true);
            setDraftError(null);
            setDraftInputValue(displayInputValue);
          }}
          onBlur={() => {
            setIsFocused(false);
            commitValue(draftInputValue);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitValue(draftInputValue);
              inputRef.current?.blur();
            }
          }}
          placeholder={
            isActive ? "9am-5pm" : "Off - type times to enable (e.g. 9am-5pm)"
          }
          disabled={isSubmitting}
          className={`h-10 w-full rounded-lg border bg-transparent px-3.5 text-base transition-all focus:outline-none focus:ring-2 focus:ring-ring/50 md:text-sm ${
            error
              ? "border-destructive text-destructive"
              : isActive
                ? "border-border text-foreground"
                : "border-border/50 text-muted-foreground"
          }`}
          aria-label={`Availability times for ${day.label}`}
          aria-invalid={!!error}
        />
        {error ? (
          <p className="mt-1 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CreateWeeklyAvailabilityEditor({
  schedule,
  onChange,
  isSubmitting,
}: {
  schedule: WeeklySchedule;
  onChange: (next: WeeklySchedule) => void;
  isSubmitting: boolean;
}) {
  const getDay = useCallback(
    (weekday: number): DaySchedule =>
      schedule[weekday] ?? { enabled: false, blocks: [] },
    [schedule],
  );

  const updateDay = useCallback(
    (weekday: number, daySchedule: DaySchedule) => {
      onChange({
        ...schedule,
        [weekday]: daySchedule,
      });
    },
    [onChange, schedule],
  );

  const copyMondayToWeekdays = useCallback(() => {
    const monday = getDay(1);
    const copiedBlocks = monday.blocks.map((block) => ({ ...block }));
    onChange({
      ...schedule,
      2: {
        enabled: monday.enabled,
        blocks: copiedBlocks.map((block) => ({ ...block })),
      },
      3: {
        enabled: monday.enabled,
        blocks: copiedBlocks.map((block) => ({ ...block })),
      },
      4: {
        enabled: monday.enabled,
        blocks: copiedBlocks.map((block) => ({ ...block })),
      },
      5: {
        enabled: monday.enabled,
        blocks: copiedBlocks.map((block) => ({ ...block })),
      },
    });
  }, [getDay, onChange, schedule]);

  const clearAll = useCallback(() => {
    onChange(createEmptyWeeklySchedule());
  }, [onChange]);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Type time ranges for each day, e.g.{" "}
        <span className="font-medium text-foreground/70">9am-5pm</span> or{" "}
        <span className="font-medium text-foreground/70">
          9am-12pm, 1pm-5pm
        </span>
        . Leave blank for days off.
      </p>

      <div className="space-y-2">
        {WEEKDAYS.map((day) => (
          <CreateAvailabilityDayInput
            key={day.value}
            day={day}
            daySchedule={getDay(day.value)}
            onUpdate={updateDay}
            isSubmitting={isSubmitting}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-2">
        <Button
          type="button"
          variant="outline"
          size="default"
          onClick={copyMondayToWeekdays}
          disabled={!getDay(1).enabled || isSubmitting}
        >
          <Icon icon={Copy01Icon} className="mr-1.5" />
          Copy Mon
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="default"
          onClick={clearAll}
          disabled={isSubmitting}
        >
          <Icon icon={Cancel01Icon} className="mr-1.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}

function CreateCalendarForm({
  locations,
  onSubmit,
  onCancel,
  isSubmitting,
  formId,
  showActions = true,
}: CreateCalendarFormProps) {
  const initialValues = useMemo<CreateCalendarDraft>(
    () => ({
      name: "",
      timezone: "America/New_York",
      slotIntervalMin: 15,
      locationId: undefined,
      requiresConfirmation: false,
      weeklySchedule: createEmptyWeeklySchedule(),
    }),
    [],
  );
  const { draft, setDraft, resetDraft, hasDraft } = useCreateDraft({
    key: CALENDAR_CREATE_DRAFT_KEY,
    initialValues,
  });
  const handleDiscardDraft = useCallback(() => {
    resetDraft();
    onCancel();
  }, [onCancel, resetDraft]);

  return (
    <CalendarForm
      defaultValues={{
        name: draft.name,
        timezone: draft.timezone,
        slotIntervalMin: draft.slotIntervalMin,
        locationId: draft.locationId,
        requiresConfirmation: draft.requiresConfirmation,
      }}
      locations={locations}
      onSubmit={(calendar) =>
        onSubmit({
          calendar,
          weeklySchedule: draft.weeklySchedule,
        })
      }
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      onDraftChange={(calendar) => {
        setDraft((previous) => ({
          ...previous,
          ...calendar,
        }));
      }}
      onDiscardDraft={handleDiscardDraft}
      showDiscardAction={hasDraft}
      formId={formId}
      showActions={showActions}
      extraContent={
        <div className="space-y-4 rounded-lg border border-border/70 bg-muted/20 p-4 sm:p-5">
          <div className="space-y-1">
            <h3 className="text-base font-medium">Availability</h3>
            <p className="text-sm text-muted-foreground">
              Set your weekly hours now. You can add date overrides and blocked
              time after creating the calendar.
            </p>
          </div>
          <CreateWeeklyAvailabilityEditor
            schedule={draft.weeklySchedule}
            onChange={(next) => {
              setDraft((previous) => ({
                ...previous,
                weeklySchedule: next,
              }));
            }}
            isSubmitting={isSubmitting}
          />
        </div>
      }
    />
  );
}

type DetailTabValue = "details" | "availability" | "appointments";

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "availability" || value === "appointments";

function CalendarsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, tab } = Route.useSearch();
  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab && isDetailTab(tab) ? tab : "details";
  const [availabilitySubTab, setAvailabilitySubTab] =
    useState<AvailabilitySubTabType>("weekly");
  const activeAvailabilitySubTab: Exclude<AvailabilitySubTabType, "overrides"> =
    availabilitySubTab === "overrides" ? "weekly" : availabilitySubTab;
  const [availabilityPreviewDraft, setAvailabilityPreviewDraft] =
    useState<AvailabilityPreviewDraftState>({});
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [isDetailFormDirty, setIsDetailFormDirty] = useState(false);
  const detailFormId = "calendar-detail-form";

  const { data, isLoading, isFetching, error } = useQuery({
    ...orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type CalendarItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<CalendarItem>();
  const resetCreateDraft = useResetCreateDraft(CALENDAR_CREATE_DRAFT_KEY);

  useCreateIntentTrigger("calendars", crud.openCreate);

  const calendars = data?.items ?? [];
  const isSelectionDataResolved = !isLoading && !isFetching && !error;
  const selectedCalendar =
    calendars.find((calendar) => calendar.id === selectedId) ?? null;
  const displayCalendar = useClosingSnapshot(selectedCalendar ?? undefined);
  const { isOpen: detailModalOpen, closeNow: closeDetailModalNow } =
    useUrlDrivenModal({
      selectedId,
      hasResolvedEntity: !!selectedCalendar,
    });

  const openDetails = useCallback(
    (calendarId: string, nextTab: DetailTabValue = "details") => {
      setAvailabilityPreviewDraft({});
      navigate({
        search: (prev) => ({
          ...prev,
          selected: calendarId,
          tab: nextTab,
        }),
      });
    },
    [navigate],
  );

  const clearDetails = useCallback(() => {
    closeDetailModalNow();
    setAvailabilitySubTab("weekly");
    setAvailabilityPreviewDraft({});
    navigate({
      search: (prev) => ({
        ...prev,
        selected: undefined,
        tab: undefined,
      }),
      replace: true,
    });
  }, [closeDetailModalNow, navigate]);

  const handleDraftWeeklyRulesChange = useCallback(
    (rules: AvailabilityPreviewDraftState["weeklyRules"] | null) => {
      const nextRules = rules ?? undefined;
      setAvailabilityPreviewDraft((previous) =>
        previous.weeklyRules === nextRules
          ? previous
          : {
              ...previous,
              weeklyRules: nextRules,
            },
      );
    },
    [],
  );

  const handleDraftBlockedTimeChange = useCallback(
    (blockedTime: AvailabilityPreviewDraftState["blockedTime"] | null) => {
      const nextBlockedTime = blockedTime ?? undefined;
      setAvailabilityPreviewDraft((previous) =>
        previous.blockedTime === nextBlockedTime
          ? previous
          : {
              ...previous,
              blockedTime: nextBlockedTime,
            },
      );
    },
    [],
  );

  const handleDraftSchedulingLimitsChange = useCallback(
    (
      schedulingLimits:
        | AvailabilityPreviewDraftState["schedulingLimits"]
        | null,
    ) => {
      const nextSchedulingLimits = schedulingLimits ?? undefined;
      setAvailabilityPreviewDraft((previous) =>
        previous.schedulingLimits === nextSchedulingLimits
          ? previous
          : {
              ...previous,
              schedulingLimits: nextSchedulingLimits,
            },
      );
    },
    [],
  );

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

  useValidateSelection({
    items: calendars,
    selectedId,
    isDataResolved: isSelectionDataResolved,
    onInvalidSelection: clearDetails,
  });

  const selectedIndex = selectedId
    ? calendars.findIndex((calendar) => calendar.id === selectedId)
    : -1;

  useListNavigation({
    items: calendars,
    selectedIndex,
    onSelect: (index) => {
      const calendar = calendars[index];
      if (calendar) openDetails(calendar.id);
    },
    onOpen: (calendar) => openDetails(calendar.id),
    enabled:
      calendars.length > 0 &&
      !crud.showCreateForm &&
      !detailModalOpen &&
      !appointmentModalOpen,
  });

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "c",
        action: crud.openCreate,
        description: "Create calendar",
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

  const { data: locationsData } = useQuery(
    orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  const createMutation = useMutation(
    orpc.calendars.create.mutationOptions({
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to create calendar");
      },
    }),
  );
  const setWeeklyAvailabilityMutation = useMutation(
    orpc.availability.rules.setWeekly.mutationOptions(),
  );

  const updateMutation = useMutation(
    orpc.calendars.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to update calendar");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.calendars.remove.mutationOptions({
      onSuccess: () => {
        if (crud.deletingItemId && crud.deletingItemId === selectedId) {
          clearDetails();
        }
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        crud.closeDelete();
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to delete calendar");
      },
    }),
  );
  const createSavePending =
    createMutation.isPending || setWeeklyAvailabilityMutation.isPending;
  const showCreatePendingVisual = useBufferedPending(createSavePending);
  const showUpdatePendingVisual = useBufferedPending(updateMutation.isPending);

  const locations = locationsData?.items ?? [];

  const { data: appointmentsData } = useQuery({
    ...orpc.appointments.list.queryOptions({
      input: {
        calendarId: selectedId ?? "",
        limit: 5,
        startDate: formatDateISO(DateTime.now()),
      },
    }),
    enabled: !!selectedId,
  });

  const appointments = appointmentsData?.items ?? [];

  const getLocationName = (locationId: string | null | undefined) => {
    if (!locationId) return "-";
    const location = locations.find((l) => l.id === locationId);
    return location?.name ?? "-";
  };

  const handleCreate = async ({
    calendar,
    weeklySchedule,
  }: CreateCalendarFormInput) => {
    let createdCalendar: { id: string } | null = null;
    try {
      createdCalendar = await createMutation.mutateAsync(calendar);
    } catch {
      return;
    }

    queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
    queryClient.invalidateQueries({ queryKey: orpc.locations.key() });

    const rules = buildRulesFromWeeklySchedule(weeklySchedule);
    if (rules.length === 0) {
      resetCreateDraft();
      crud.closeCreate();
      openDetails(createdCalendar.id, "details");
      return;
    }

    try {
      await setWeeklyAvailabilityMutation.mutateAsync({
        calendarId: createdCalendar.id,
        rules,
      });
      queryClient.invalidateQueries({ queryKey: orpc.availability.key() });
      resetCreateDraft();
      crud.closeCreate();
      openDetails(createdCalendar.id, "details");
    } catch {
      resetCreateDraft();
      crud.closeCreate();
      openDetails(createdCalendar.id, "availability");
      toast.error(
        "Calendar created, but availability could not be saved. Finish setup in Availability.",
      );
    }
  };

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

  const handleUpdate = (formData: CreateCalendarInput) => {
    if (!displayCalendar) return;
    updateMutation.mutate({
      id: displayCalendar.id,
      ...formData,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

  const getContextMenuItems = useCallback(
    (calendar: CalendarItem): ContextMenuItem[] => [
      {
        label: "View",
        icon: ArrowRight02Icon,
        onClick: () => openDetails(calendar.id),
      },
      {
        label: "Manage Availability",
        icon: Clock01Icon,
        onClick: () => openDetails(calendar.id, "availability"),
      },
      {
        label: "View Appointments",
        icon: ArrowRight02Icon,
        onClick: () => openDetails(calendar.id, "appointments"),
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () => openDetails(calendar.id, "details"),
        separator: true,
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(calendar.id),
        variant: "destructive",
      },
    ],
    [crud, openDetails],
  );

  return (
    <PageScaffold className="pb-24 sm:pb-6">
      <div className="mt-6">
        {isLoading ? (
          <EntityListLoadingState rows={5} cols={6} />
        ) : error ? (
          <div className="py-10 text-center text-destructive">
            Error loading calendars
          </div>
        ) : !calendars.length ? (
          <EntityListEmptyState
            actionLabel="Create Calendar"
            onAction={crud.openCreate}
          >
            No calendars yet. Create your first calendar to get started.
          </EntityListEmptyState>
        ) : (
          <CalendarsListPresentation
            calendars={calendars}
            getLocationName={getLocationName}
            getActions={getContextMenuItems}
            onOpen={openDetails}
          />
        )}
      </div>

      <EntityModal
        open={crud.showCreateForm}
        onOpenChange={(isOpen) => {
          if (!isOpen) crud.closeCreate();
        }}
        title="New Calendar"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={crud.closeCreate}
              disabled={
                createMutation.isPending ||
                setWeeklyAvailabilityMutation.isPending
              }
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              form={CALENDAR_CREATE_FORM_ID}
              disabled={
                createMutation.isPending ||
                setWeeklyAvailabilityMutation.isPending
              }
              className={createSavePending ? "disabled:opacity-100" : undefined}
            >
              {showCreatePendingVisual ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <CreateCalendarForm
            locations={locations}
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={
              createMutation.isPending ||
              setWeeklyAvailabilityMutation.isPending
            }
            formId={CALENDAR_CREATE_FORM_ID}
            showActions={false}
          />
        </div>
      </EntityModal>

      <EntityModal
        open={detailModalOpen && !!displayCalendar}
        onOpenChange={(isOpen) => {
          if (!isOpen) clearDetails();
        }}
        headerActions={
          displayCalendar ? (
            <CopyIdHeaderAction
              id={displayCalendar.id}
              entityLabel="calendar"
            />
          ) : null
        }
        title={displayCalendar?.name ?? ""}
        description={
          displayCalendar
            ? `${formatTimezoneShort(displayCalendar.timezone)} · ${getLocationName(displayCalendar.locationId)}`
            : undefined
        }
        footer={
          activeTab === "details" && displayCalendar ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => crud.openDelete(displayCalendar.id)}
                disabled={updateMutation.isPending}
              >
                <Icon icon={Delete01Icon} data-icon="inline-start" />
                Delete Calendar
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
                  className={
                    updateMutation.isPending
                      ? "disabled:opacity-100"
                      : undefined
                  }
                >
                  {showUpdatePendingVisual ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {displayCalendar ? (
          <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <DetailTabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="px-0"
              >
                <DetailTab value="details">Details</DetailTab>
                <DetailTab value="availability">Availability</DetailTab>
                <DetailTab value="appointments">Appointments</DetailTab>
              </DetailTabs>

              <div className="space-y-6">
                {activeTab === "details" && (
                  <div className="space-y-4">
                    <CalendarForm
                      key={displayCalendar.id}
                      formId={detailFormId}
                      showActions={false}
                      defaultValues={{
                        name: displayCalendar.name,
                        timezone: displayCalendar.timezone,
                        slotIntervalMin: displayCalendar.slotIntervalMin,
                        locationId: displayCalendar.locationId ?? undefined,
                        requiresConfirmation:
                          displayCalendar.requiresConfirmation,
                      }}
                      locations={locations}
                      onSubmit={handleUpdate}
                      onCancel={clearDetails}
                      isSubmitting={updateMutation.isPending}
                      disableSubmitWhenPristine
                      onDirtyChange={setIsDetailFormDirty}
                    />
                  </div>
                )}

                {activeTab === "availability" && (
                  <div className="xl:min-h-0">
                    <div className="grid gap-6 xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
                      <div className="space-y-6 xl:pr-1">
                        <AvailabilitySubTabs
                          value={activeAvailabilitySubTab}
                          onChange={setAvailabilitySubTab}
                          includeOverrides={false}
                        />

                        {activeAvailabilitySubTab === "weekly" && (
                          <WeeklyScheduleEditor
                            calendarId={displayCalendar.id}
                            timezone={displayCalendar.timezone}
                            onDraftRulesChange={handleDraftWeeklyRulesChange}
                          />
                        )}
                        {activeAvailabilitySubTab === "blocked" && (
                          <BlockedTimeEditor
                            calendarId={displayCalendar.id}
                            timezone={displayCalendar.timezone}
                            onDraftBlockedTimeChange={
                              handleDraftBlockedTimeChange
                            }
                          />
                        )}
                        {activeAvailabilitySubTab === "limits" && (
                          <CalendarSchedulingLimitsEditor
                            calendarId={displayCalendar.id}
                            onDraftSchedulingLimitsChange={
                              handleDraftSchedulingLimitsChange
                            }
                          />
                        )}
                      </div>

                      <div className="xl:pl-1">
                        <AvailabilityPreviewPanel
                          key={`${displayCalendar.id}:${displayCalendar.timezone}`}
                          calendarId={displayCalendar.id}
                          timezone={displayCalendar.timezone}
                          activeTab={activeAvailabilitySubTab}
                          draft={availabilityPreviewDraft}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "appointments" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Upcoming Appointments
                      </h3>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => setAppointmentModalOpen(true)}
                        >
                          <Icon icon={Add01Icon} data-icon="inline-start" />
                          New Appointment
                        </Button>
                        <Link
                          to="/appointments"
                          search={{ calendarId: displayCalendar.id }}
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
                    </div>

                    {appointments.length === 0 ? (
                      <div className="rounded-lg border border-border p-6 text-center">
                        <p className="text-sm text-muted-foreground">
                          No upcoming appointments
                        </p>
                        <Button
                          className="mt-4"
                          size="sm"
                          onClick={() => setAppointmentModalOpen(true)}
                        >
                          <Icon icon={Add01Icon} data-icon="inline-start" />
                          Create Appointment
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border divide-y divide-border/50">
                        {appointments.map((apt) => (
                          <div key={apt.id} className="px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium">
                                  {formatDisplayDateTime(
                                    apt.startAt,
                                    displayCalendar.timezone,
                                  )}{" "}
                                  (
                                  {formatTimezoneShort(
                                    displayCalendar.timezone,
                                    apt.startAt,
                                  )}
                                  )
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {apt.appointmentType?.name}
                                  {` - ${apt.client.firstName} ${apt.client.lastName}`}
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
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </EntityModal>

      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Calendar"
        description="Are you sure you want to delete this calendar? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />

      <AppointmentModal
        open={appointmentModalOpen}
        onOpenChange={setAppointmentModalOpen}
        defaultCalendarId={displayCalendar?.id}
        defaultCalendarName={displayCalendar?.name}
        onCreated={handleAppointmentCreated}
      />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <Button className="w-full" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Add Calendar
        </Button>
      </div>
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/calendars/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { selected?: string; tab?: DetailTabValue } => {
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isDetailTab(rawTab) ? rawTab : undefined;
    return { selected, tab };
  },
  loader: async () => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      Promise.all([
        queryClient.ensureQueryData(
          orpc.calendars.list.queryOptions({ input: { limit: 100 } }),
        ),
        queryClient.ensureQueryData(
          orpc.locations.list.queryOptions({ input: { limit: 100 } }),
        ),
      ]),
    );
  },
  component: CalendarsPage,
});
