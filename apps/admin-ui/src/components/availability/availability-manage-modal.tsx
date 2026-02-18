import { useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { formatTimezoneShort } from "@/lib/date-utils";
import { MOBILE_FIRST_MODAL_CONTENT_CLASS } from "@/lib/modal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
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
  if (!calendarId) return null;
  const contentKey = `${calendarId}:${open ? initialTab : "closed"}`;

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
            "fixed inset-0 z-[70] bg-black/60 md:backdrop-blur-sm",
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "duration-200",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="availability-manage-modal-content"
          className={cn(
            MOBILE_FIRST_MODAL_CONTENT_CLASS,
            "z-[71]",
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "data-closed:zoom-out-95 data-open:zoom-in-95",
            "duration-200",
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
              <Icon icon={Cancel01Icon} />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            <AvailabilityManageModalContent
              key={contentKey}
              calendarId={calendarId}
              timezone={timezone}
              initialTab={initialTab}
            />
          </div>

          <div className="mt-auto border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
            <div className="flex justify-end">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function AvailabilityManageModalContent({
  calendarId,
  timezone,
  initialTab,
}: {
  calendarId: string;
  timezone: string;
  initialTab: AvailabilitySubTabType;
}) {
  const [activeTab, setActiveTab] =
    useState<AvailabilitySubTabType>(initialTab);

  return (
    <div className="space-y-4">
      <AvailabilitySubTabs value={activeTab} onChange={setActiveTab} />

      {activeTab === "weekly" && (
        <CompactWeeklyScheduleEditor
          calendarId={calendarId}
          timezone={timezone}
        />
      )}
      {activeTab === "overrides" && (
        <DateOverridesEditor calendarId={calendarId} timezone={timezone} />
      )}
      {activeTab === "blocked" && (
        <CompactBlockedTimeEditor calendarId={calendarId} timezone={timezone} />
      )}
    </div>
  );
}
