import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LimitKey =
  | "minNoticeMinutes"
  | "maxNoticeDays"
  | "maxPerSlot"
  | "maxPerDay"
  | "maxPerWeek";

type LimitsPayload = {
  minNoticeMinutes: number | null;
  maxNoticeDays: number | null;
  maxPerSlot: number | null;
  maxPerDay: number | null;
  maxPerWeek: number | null;
};

type LimitsFormState = Record<LimitKey, string>;
type LimitsErrors = Partial<Record<LimitKey, string>>;

const LIMIT_FIELDS: Array<{
  key: LimitKey;
  label: string;
  description: string;
  min: number;
}> = [
  {
    key: "minNoticeMinutes",
    label: "Minimum notice (minutes)",
    description: "How soon before start time booking is allowed in minutes.",
    min: 0,
  },
  {
    key: "maxNoticeDays",
    label: "Maximum advance (days)",
    description: "How far in advance booking is allowed.",
    min: 1,
  },
  {
    key: "maxPerSlot",
    label: "Max per slot",
    description: "Maximum bookings allowed in the same start time.",
    min: 1,
  },
  {
    key: "maxPerDay",
    label: "Max per day",
    description: "Maximum bookings allowed per calendar day.",
    min: 1,
  },
  {
    key: "maxPerWeek",
    label: "Max per week",
    description: "Maximum bookings allowed per week.",
    min: 1,
  },
];

function toFormState(
  limits: Partial<LimitsPayload> | null | undefined,
): LimitsFormState {
  return {
    minNoticeMinutes:
      limits?.minNoticeMinutes == null ? "" : String(limits.minNoticeMinutes),
    maxNoticeDays:
      limits?.maxNoticeDays == null ? "" : String(limits.maxNoticeDays),
    maxPerSlot: limits?.maxPerSlot == null ? "" : String(limits.maxPerSlot),
    maxPerDay: limits?.maxPerDay == null ? "" : String(limits.maxPerDay),
    maxPerWeek: limits?.maxPerWeek == null ? "" : String(limits.maxPerWeek),
  };
}

function parseLimits(form: LimitsFormState): {
  data: LimitsPayload | null;
  errors: LimitsErrors;
} {
  const errors: LimitsErrors = {};
  const data: LimitsPayload = {
    minNoticeMinutes: null,
    maxNoticeDays: null,
    maxPerSlot: null,
    maxPerDay: null,
    maxPerWeek: null,
  };

  for (const field of LIMIT_FIELDS) {
    const raw = form[field.key].trim();
    if (!raw) {
      data[field.key] = null;
      continue;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < field.min) {
      errors[field.key] =
        field.min === 0
          ? "Enter a whole number 0 or greater."
          : `Enter a whole number ${field.min} or greater.`;
      continue;
    }

    data[field.key] = parsed;
  }

  if (Object.keys(errors).length > 0) {
    return { data: null, errors };
  }

  return { data, errors: {} };
}

function areFormsEqual(a: LimitsFormState, b: LimitsFormState): boolean {
  return (
    a.minNoticeMinutes === b.minNoticeMinutes &&
    a.maxNoticeDays === b.maxNoticeDays &&
    a.maxPerSlot === b.maxPerSlot &&
    a.maxPerDay === b.maxPerDay &&
    a.maxPerWeek === b.maxPerWeek
  );
}

function InheritHint({
  field,
  orgDefault,
  formValue,
}: {
  field: LimitKey;
  orgDefault: LimitsPayload | null;
  formValue: string;
}) {
  if (formValue.trim() !== "") {
    return (
      <span className="text-xs text-muted-foreground">Calendar override</span>
    );
  }

  const inherited = orgDefault?.[field] ?? null;
  if (inherited == null) {
    return (
      <span className="text-xs text-muted-foreground">
        No limit (no org default)
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground">
      Inheriting org default: {inherited}
    </span>
  );
}

interface CalendarSchedulingLimitsEditorProps {
  calendarId: string;
  compact?: boolean;
}

export function CalendarSchedulingLimitsEditor({
  calendarId,
  compact = false,
}: CalendarSchedulingLimitsEditorProps) {
  const queryClient = useQueryClient();

  const { data: orgDefault, isLoading: isOrgDefaultLoading } = useQuery(
    orpc.org.settings.schedulingLimits.get.queryOptions({
      input: {},
    }),
  );
  const { data: calendarOverride, isLoading: isCalendarLoading } = useQuery(
    orpc.calendars.schedulingLimits.get.queryOptions({
      input: { calendarId },
    }),
  );

  const [form, setForm] = useState<LimitsFormState>(() =>
    toFormState(calendarOverride),
  );
  const [initialForm, setInitialForm] = useState<LimitsFormState>(() =>
    toFormState(calendarOverride),
  );
  const [errors, setErrors] = useState<LimitsErrors>({});

  useEffect(() => {
    const next = toFormState(calendarOverride);
    setForm(next);
    setInitialForm(next);
    setErrors({});
  }, [calendarOverride]);

  const upsertMutation = useMutation(
    orpc.calendars.schedulingLimits.upsert.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.calendars.schedulingLimits.key(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.org.settings.schedulingLimits.key(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.availability.engine.key(),
        });
        toast.success("Calendar scheduling limits saved");
      },
      onError: (error) => {
        toast.error(
          error.message || "Failed to save calendar scheduling limits",
        );
      },
    }),
  );

  const isLoading = isOrgDefaultLoading || isCalendarLoading;
  const hasChanges = useMemo(
    () => !areFormsEqual(form, initialForm),
    [form, initialForm],
  );
  const isInheritedOnly = LIMIT_FIELDS.every(
    (field) => form[field.key].trim() === "",
  );

  const save = () => {
    const parsed = parseLimits(form);
    if (!parsed.data) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    upsertMutation.mutate({
      calendarId,
      data: parsed.data,
    });
  };

  const resetToInherited = () => {
    const next = toFormState(null);
    setForm(next);
    setErrors({});
  };

  const containerClassName = compact
    ? "space-y-4 rounded-lg border border-border bg-card p-4"
    : "space-y-4 rounded-lg border border-border bg-card p-5";

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div className={containerClassName}>
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Scheduling Limits</h3>
          <p className="text-xs text-muted-foreground">
            Blank values inherit organization defaults.
          </p>
        </div>
        {isInheritedOnly ? (
          <Badge variant="secondary">Using org defaults</Badge>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {LIMIT_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`${calendarId}-${field.key}`}>{field.label}</Label>
            <Input
              id={`${calendarId}-${field.key}`}
              type="number"
              min={field.min}
              step={1}
              value={form[field.key]}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  [field.key]: event.target.value,
                }))
              }
              placeholder="No limit"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {field.description}
              </span>
              <InheritHint
                field={field.key}
                orgDefault={
                  orgDefault
                    ? {
                        minNoticeMinutes: orgDefault.minNoticeMinutes,
                        maxNoticeDays: orgDefault.maxNoticeDays,
                        maxPerSlot: orgDefault.maxPerSlot,
                        maxPerDay: orgDefault.maxPerDay,
                        maxPerWeek: orgDefault.maxPerWeek,
                      }
                    : null
                }
                formValue={form[field.key]}
              />
            </div>
            {errors[field.key] ? (
              <p className="text-xs text-destructive">{errors[field.key]}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={resetToInherited}
          disabled={upsertMutation.isPending}
        >
          Reset to inherited
        </Button>
        <Button
          type="button"
          onClick={save}
          disabled={upsertMutation.isPending || !hasChanges}
        >
          {upsertMutation.isPending ? "Saving..." : "Save limits"}
        </Button>
      </div>
    </div>
  );
}

export function OrgSchedulingLimitsCard() {
  const queryClient = useQueryClient();
  const { data: orgDefault, isLoading } = useQuery(
    orpc.org.settings.schedulingLimits.get.queryOptions({
      input: {},
    }),
  );

  const [form, setForm] = useState<LimitsFormState>(() =>
    toFormState(orgDefault),
  );
  const [initialForm, setInitialForm] = useState<LimitsFormState>(() =>
    toFormState(orgDefault),
  );
  const [errors, setErrors] = useState<LimitsErrors>({});

  useEffect(() => {
    const next = toFormState(orgDefault);
    setForm(next);
    setInitialForm(next);
    setErrors({});
  }, [orgDefault]);

  const upsertMutation = useMutation(
    orpc.org.settings.schedulingLimits.upsert.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.org.settings.schedulingLimits.key(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.calendars.schedulingLimits.key(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.availability.engine.key(),
        });
        toast.success("Organization scheduling limits saved");
      },
      onError: (error) => {
        toast.error(
          error.message || "Failed to save organization scheduling limits",
        );
      },
    }),
  );

  const hasChanges = useMemo(
    () => !areFormsEqual(form, initialForm),
    [form, initialForm],
  );

  const save = () => {
    const parsed = parseLimits(form);
    if (!parsed.data) {
      setErrors(parsed.errors);
      return;
    }

    setErrors({});
    upsertMutation.mutate({ data: parsed.data });
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Default Scheduling Limits</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-4">
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading defaults...
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              These defaults apply to all calendars unless overridden.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {LIMIT_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`org-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`org-${field.key}`}
                    type="number"
                    min={field.min}
                    step={1}
                    value={form[field.key]}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
                    }
                    placeholder="No limit"
                  />
                  <p className="text-xs text-muted-foreground">
                    {field.description}
                  </p>
                  {errors[field.key] ? (
                    <p className="text-xs text-destructive">
                      {errors[field.key]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-end">
              <Button
                type="button"
                onClick={save}
                disabled={upsertMutation.isPending || !hasChanges}
              >
                {upsertMutation.isPending ? "Saving..." : "Save defaults"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
