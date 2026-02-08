import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { formatTimezoneShort } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AvailabilitySubTabs } from "@/components/availability/availability-sub-tabs";
import { CompactBlockedTimeEditor } from "@/components/availability/blocked-time-editor";
import type { AvailabilitySubTabType } from "@/components/availability/constants";
import { DateOverridesEditor } from "@/components/availability/date-overrides-editor";
import { CompactWeeklyScheduleEditor } from "@/components/availability/weekly-schedule-editor";

interface AvailabilityManageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarId: string;
  calendarName?: string;
  timezone: string;
  initialTab?: AvailabilitySubTabType;
}

export function AvailabilityManageModal({
  open,
  onOpenChange,
  calendarId,
  calendarName,
  timezone,
  initialTab = "weekly",
}: AvailabilityManageModalProps) {
  const [activeTab, setActiveTab] =
    useState<AvailabilitySubTabType>(initialTab);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
  }, [initialTab, open, calendarId]);

  if (!calendarId) return null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      modal="trap-focus"
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="availability-manage-modal-backdrop"
          className={cn(
            "fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm",
            "data-open:animate-in data-open:fade-in-0 duration-100",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="availability-manage-modal-content"
          className={cn(
            "fixed left-1/2 top-2 z-[71] w-[calc(100vw-1rem)] max-w-4xl -translate-x-1/2 sm:top-8 sm:w-full",
            "rounded-xl border border-border bg-background shadow-xl",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 duration-150",
            "max-h-[calc(100dvh-1rem)] overflow-hidden flex flex-col sm:h-[min(86dvh,52rem)] sm:max-h-[calc(100dvh-4rem)]",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-lg font-medium">
                Manage Availability
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 truncate text-sm text-muted-foreground">
                {calendarName
                  ? `${calendarName} (${formatTimezoneShort(timezone)})`
                  : formatTimezoneShort(timezone)}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              render={<Button variant="ghost" size="icon-sm" />}
            >
              <span className="sr-only">Close</span>
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <AvailabilitySubTabs value={activeTab} onChange={setActiveTab} />

              {activeTab === "weekly" && (
                <CompactWeeklyScheduleEditor
                  calendarId={calendarId}
                  timezone={timezone}
                />
              )}
              {activeTab === "overrides" && (
                <DateOverridesEditor
                  calendarId={calendarId}
                  timezone={timezone}
                />
              )}
              {activeTab === "blocked" && (
                <CompactBlockedTimeEditor
                  calendarId={calendarId}
                  timezone={timezone}
                />
              )}
            </div>
          </div>

          <div className="border-t border-border bg-background px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
