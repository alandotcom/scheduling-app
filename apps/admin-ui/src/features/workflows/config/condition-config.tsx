import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type ConditionConfigProps = {
  guard: unknown;
  onChange: (guard: unknown) => void;
};

export function ConditionConfig({ guard, onChange }: ConditionConfigProps) {
  const serialized = JSON.stringify(
    guard ?? { combinator: "all", conditions: [] },
    null,
    2,
  );

  return (
    <div className="space-y-1.5">
      <Label>Guard JSON</Label>
      <Textarea
        rows={8}
        value={serialized}
        onChange={(event) => {
          try {
            const parsed = JSON.parse(event.target.value);
            onChange(parsed);
          } catch {
            // Keep editing free-form until valid JSON is entered.
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        Condition nodes map to canonical guard predicates.
      </p>
    </div>
  );
}
