import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RelationshipCountBadgeProps {
  count: number;
  singular: string;
  plural?: string;
}

export function RelationshipCountBadge({
  count,
  singular,
  plural,
}: RelationshipCountBadgeProps) {
  const pluralLabel = plural ?? `${singular}s`;
  const label = count === 1 ? singular : pluralLabel;
  const isZero = count === 0;

  return (
    <Badge
      variant={isZero ? "ghost" : "secondary"}
      className={cn("tabular-nums", isZero && "text-muted-foreground/60")}
    >
      {count.toLocaleString()} {label}
    </Badge>
  );
}
