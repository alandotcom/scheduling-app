import { Badge } from "@/components/ui/badge";
import type { SlotUsage } from "@scheduling/dto";

const SLOT_LABELS: { key: keyof SlotUsage; label: string }[] = [
  { key: "t", label: "Text / Select" },
  { key: "n", label: "Number" },
  { key: "d", label: "Date" },
  { key: "b", label: "Boolean" },
  { key: "j", label: "Multi-Select" },
];

interface SlotUsageDisplayProps {
  slotUsage: SlotUsage;
}

export function SlotUsageDisplay({ slotUsage }: SlotUsageDisplayProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {SLOT_LABELS.map(({ key, label }) => {
        const bucket = slotUsage[key];
        const isFull = bucket.used >= bucket.total;
        return (
          <Badge key={key} variant={isFull ? "destructive" : "outline"}>
            {label}: {bucket.used} of {bucket.total}
          </Badge>
        );
      })}
    </div>
  );
}
