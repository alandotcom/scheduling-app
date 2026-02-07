import { Badge } from "@/components/ui/badge";

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

  return (
    <Badge variant="secondary">
      {count.toLocaleString()} {label}
    </Badge>
  );
}
