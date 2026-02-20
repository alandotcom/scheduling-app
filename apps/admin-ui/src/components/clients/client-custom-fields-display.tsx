import type {
  CustomAttributeDefinitionResponse,
  CustomAttributeType,
} from "@scheduling/dto";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { formatDisplayDate } from "@/lib/date-utils";

interface ClientCustomFieldsDisplayProps {
  definitions: CustomAttributeDefinitionResponse[];
  customAttributes:
    | Record<string, string | number | boolean | string[] | null>
    | null
    | undefined;
}

function renderValue(
  type: CustomAttributeType,
  value: string | number | boolean | string[] | null | undefined,
) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">Not set</span>;
  }

  switch (type) {
    case "BOOLEAN":
      return <span>{value ? "Yes" : "No"}</span>;
    case "DATE":
      return (
        <span>
          {typeof value === "string" ? formatDisplayDate(value) : String(value)}
        </span>
      );
    case "MULTI_SELECT":
      if (Array.isArray(value) && value.length > 0) {
        return (
          <div className="flex flex-wrap gap-1">
            {value.map((v) => (
              <Badge key={v} variant="secondary">
                {v}
              </Badge>
            ))}
          </div>
        );
      }
      return <span className="text-muted-foreground">Not set</span>;
    default:
      return <span>{String(value)}</span>;
  }
}

export function ClientCustomFieldsDisplay({
  definitions,
  customAttributes,
}: ClientCustomFieldsDisplayProps) {
  if (definitions.length === 0) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        No custom fields defined. An admin can configure them in Settings.
      </div>
    );
  }

  const sorted = definitions.toSorted(
    (a, b) => a.displayOrder - b.displayOrder,
  );

  return (
    <div className="space-y-4">
      {sorted.map((def) => (
        <div key={def.id}>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {def.label}
          </Label>
          <div className="mt-1 text-sm">
            {renderValue(def.type, customAttributes?.[def.fieldKey])}
          </div>
        </div>
      ))}
    </div>
  );
}
