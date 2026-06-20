import { useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ActionConfigFieldGroup } from "../../action-registry";
import { FieldRenderer } from "./field-renderer";

export function GroupField({
  group,
  config,
  onUpdateConfig,
  onUpdateConfigBatch,
  disabled,
}: {
  group: ActionConfigFieldGroup;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch: (patch: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(group.defaultExpanded ?? true);

  return (
    <div className="space-y-2">
      <button
        className="flex w-full items-center gap-1.5 text-sm font-medium"
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        <Icon
          icon={ArrowDown01Icon}
          className={cn(
            "size-4 transition-transform duration-150",
            !expanded && "-rotate-90",
          )}
        />
        {group.label}
      </button>
      {expanded ? (
        <div className="space-y-3 pl-1">
          {group.fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              config={config}
              onUpdateConfig={onUpdateConfig}
              onUpdateConfigBatch={onUpdateConfigBatch}
              disabled={disabled}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
