import { cn } from "@/lib/utils";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

interface InitialsAvatarProps {
  name: string;
  className?: string;
}

/**
 * Neutral initials avatar. Carries the person/entity identity in a calm,
 * palette-safe circle (no per-entity color). Decorative — the adjacent
 * name is the accessible label, so this is aria-hidden.
 */
export function InitialsAvatar({ name, className }: InitialsAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-7 shrink-0 select-none items-center justify-center rounded-full bg-muted text-[0.6875rem] font-semibold text-foreground/75 ring-1 ring-border/60",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
