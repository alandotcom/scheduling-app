import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { cn } from "@/lib/utils";

interface FieldShortcutHintProps {
  shortcut: string;
  visible: boolean;
  label?: string;
  className?: string;
}

export function FieldShortcutHint({
  shortcut,
  visible,
  label,
  className,
}: FieldShortcutHintProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute right-2 top-2 z-10 origin-top-right transition-all duration-150",
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "-translate-y-1 scale-95 opacity-0",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background/95 px-1 py-0.5 shadow-sm backdrop-blur-sm">
        <ShortcutBadge
          shortcut={shortcut}
          className="h-5 border-0 bg-transparent px-1.5 text-[10px]"
        />
        {label ? (
          <span className="pr-1 text-[10px] font-medium text-muted-foreground">
            {label}
          </span>
        ) : null}
      </span>
    </span>
  );
}
