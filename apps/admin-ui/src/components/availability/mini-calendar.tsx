// Mini calendar component for date selection

import { useState, useMemo } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatDate, getMonthDays } from "./utils";

interface MiniCalendarProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  markedDates: Set<string>;
}

export function MiniCalendar({
  selectedDate,
  onSelectDate,
  markedDates,
}: MiniCalendarProps) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days = useMemo(() => getMonthDays(year, month), [year, month]);
  const today = formatDate(new Date());

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const monthName = viewDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="w-full max-w-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon-sm" onClick={prevMonth}>
          <Icon icon={ArrowLeft01Icon} />
        </Button>
        <span className="text-sm font-medium">{monthName}</span>
        <Button variant="ghost" size="icon-sm" onClick={nextMonth}>
          <Icon icon={ArrowRight01Icon} />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            className="text-center text-xs text-muted-foreground font-medium py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, i) => {
          const dateStr = formatDate(date);
          const isCurrentMonth = date.getMonth() === month;
          const isSelected =
            selectedDate && formatDate(selectedDate) === dateStr;
          const isMarked = markedDates.has(dateStr);
          const isToday = dateStr === today;

          return (
            <button
              key={i}
              onClick={() => onSelectDate(date)}
              disabled={!isCurrentMonth}
              className={`
                relative aspect-square flex items-center justify-center text-sm rounded-md
                transition-all duration-150
                ${!isCurrentMonth ? "text-muted-foreground/40 cursor-not-allowed" : "hover:bg-muted"}
                ${isSelected ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
                ${isToday && !isSelected ? "ring-1 ring-primary" : ""}
              `}
            >
              {date.getDate()}
              {isMarked && !isSelected && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
