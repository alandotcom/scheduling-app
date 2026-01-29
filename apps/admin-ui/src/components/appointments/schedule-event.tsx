// Schedule event block component for the schedule grid

import { cn } from "@/lib/utils";

interface ScheduleEventProps {
  id: string;
  startAt: Date;
  endAt: Date;
  status: "scheduled" | "confirmed" | "cancelled" | "no_show";
  clientName?: string | null;
  appointmentTypeName?: string | null;
  isSelected: boolean;
  onClick: () => void;
  // Grid positioning
  top: number;
  height: number;
}

const STATUS_COLORS = {
  scheduled: "bg-blue-100 border-blue-300 text-blue-900 hover:bg-blue-200",
  confirmed: "bg-green-100 border-green-300 text-green-900 hover:bg-green-200",
  cancelled: "bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200",
  no_show: "bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200",
};

const STATUS_COLORS_SELECTED = {
  scheduled: "bg-blue-200 border-blue-400 text-blue-900 ring-2 ring-blue-500",
  confirmed:
    "bg-green-200 border-green-400 text-green-900 ring-2 ring-green-500",
  cancelled: "bg-gray-200 border-gray-400 text-gray-600 ring-2 ring-gray-500",
  no_show: "bg-amber-200 border-amber-400 text-amber-900 ring-2 ring-amber-500",
};

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function ScheduleEvent({
  startAt,
  endAt,
  status,
  clientName,
  appointmentTypeName,
  isSelected,
  onClick,
  top,
  height,
}: ScheduleEventProps) {
  const colorClass = isSelected
    ? STATUS_COLORS_SELECTED[status]
    : STATUS_COLORS[status];

  // Minimum height for readability
  const minHeight = 24;
  const actualHeight = Math.max(height, minHeight);

  // Determine if we have enough space for full content
  const isCompact = height < 48;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute left-1 right-1 rounded border px-2 py-1 text-left transition-colors cursor-pointer",
        "overflow-hidden text-xs",
        colorClass,
      )}
      style={{
        top: `${top}px`,
        height: `${actualHeight}px`,
      }}
    >
      {isCompact ? (
        <div className="truncate font-medium">
          {formatTime(startAt)}{" "}
          {clientName || appointmentTypeName || "Appointment"}
        </div>
      ) : (
        <>
          <div className="truncate font-medium">
            {clientName || "No client"}
          </div>
          <div className="truncate text-[10px] opacity-80">
            {appointmentTypeName || "Appointment"}
          </div>
          <div className="truncate text-[10px] opacity-70">
            {formatTime(startAt)} - {formatTime(endAt)}
          </div>
        </>
      )}
    </button>
  );
}
