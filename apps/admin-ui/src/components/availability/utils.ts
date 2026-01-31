// Availability editor utility functions

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

export function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDisplayDateTime(dateOrString: Date | string): string {
  const date =
    dateOrString instanceof Date ? dateOrString : new Date(dateOrString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Add padding for days before the first of the month
  const startPadding = firstDay.getDay();
  for (let i = startPadding - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    days.push(date);
  }

  // Add all days of the month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Add padding for days after the last of the month
  const endPadding = 6 - lastDay.getDay();
  for (let i = 1; i <= endPadding; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

export function rruleToLabel(rrule: string | null): string {
  if (!rrule) return "One-time block";
  if (rrule.includes("FREQ=DAILY")) return "Repeats daily";
  if (rrule.includes("BYDAY=MO,TU,WE,TH,FR")) return "Repeats weekdays";
  if (rrule.includes("FREQ=WEEKLY")) return "Repeats weekly";
  return "Custom recurrence";
}

export function recurrenceToRrule(type: string): string | null {
  switch (type) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return "FREQ=WEEKLY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    default:
      return null;
  }
}

export function rruleToRecurrence(rrule: string | null): string {
  if (!rrule) return "none";
  if (rrule.includes("BYDAY=MO,TU,WE,TH,FR")) return "weekdays";
  if (rrule.includes("FREQ=DAILY")) return "daily";
  if (rrule.includes("FREQ=WEEKLY")) return "weekly";
  return "none";
}
