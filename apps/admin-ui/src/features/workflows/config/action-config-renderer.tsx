import type { WorkflowActionConfigField } from "@scheduling/dto";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  flattenActionConfigFields,
  isActionConfigFieldVisible,
  normalizeFieldValue,
} from "./schema-builder";

type ActionConfigRendererProps = {
  fields: WorkflowActionConfigField[] | undefined;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
};

export function ActionConfigRenderer({
  fields,
  config,
  onChange,
}: ActionConfigRendererProps) {
  const flatFields = flattenActionConfigFields(fields);

  if (flatFields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This action has no configurable fields.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {flatFields.map((field) => {
        if (!isActionConfigFieldVisible(field, config)) {
          return null;
        }

        const value = config[field.key];
        const stringValue =
          typeof value === "string" || typeof value === "number"
            ? String(value)
            : "";

        if (field.type === "select") {
          return (
            <div key={field.key} className="space-y-1.5">
              <Label>{field.label}</Label>
              <Select
                items={
                  field.options?.map((option) => ({
                    value: option.value,
                    label: option.label,
                  })) ?? []
                }
                value={stringValue}
                onValueChange={(next) =>
                  onChange({ ...config, [field.key]: next })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={field.placeholder ?? "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (field.type === "template-textarea") {
          return (
            <div key={field.key} className="space-y-1.5">
              <Label>{field.label}</Label>
              <Textarea
                placeholder={field.placeholder}
                rows={field.rows ?? 4}
                value={stringValue}
                onChange={(event) =>
                  onChange({
                    ...config,
                    [field.key]: event.target.value,
                  })
                }
              />
            </div>
          );
        }

        return (
          <div key={field.key} className="space-y-1.5">
            <Label>{field.label}</Label>
            <Input
              placeholder={field.placeholder}
              type={field.type === "number" ? "number" : "text"}
              value={stringValue}
              onChange={(event) =>
                onChange({
                  ...config,
                  [field.key]: normalizeFieldValue(field, event.target.value),
                })
              }
            />
          </div>
        );
      })}
    </div>
  );
}
