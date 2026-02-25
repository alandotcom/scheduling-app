import { cn } from "@/lib/utils";
import { formatShortcut } from "@/lib/shortcuts";

interface ShortcutBadgeProps {
  shortcut: string;
  className?: string;
}

export function ShortcutBadge({ shortcut, className }: ShortcutBadgeProps) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-6 select-none items-center rounded border border-border bg-muted px-2 font-mono text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {formatShortcut(shortcut)}
    </kbd>
  );
}
