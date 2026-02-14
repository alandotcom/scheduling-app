import { useMemo } from "react";
import type { WorkflowActionCatalogItem } from "@scheduling/dto";
import { ActionGrid } from "./action-grid";
import { ActionConfigRenderer } from "./action-config-renderer";
import { createActionDefaultConfig } from "./schema-builder";
import { isRecord } from "../workflow-editor-utils";

type ActionConfigProps = {
  actions: WorkflowActionCatalogItem[];
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
};

export function ActionConfig({ actions, config, onChange }: ActionConfigProps) {
  const selectedActionId =
    typeof config.actionId === "string"
      ? config.actionId
      : typeof config.actionType === "string"
        ? config.actionType
        : "";

  const selectedAction = useMemo(
    () => actions.find((action) => action.id === selectedActionId) ?? null,
    [actions, selectedActionId],
  );

  return (
    <div className="space-y-3">
      <ActionGrid
        actions={actions}
        selectedActionId={selectedActionId}
        onSelect={(action) => {
          const defaults = createActionDefaultConfig(action);
          const currentInput = isRecord(config.input) ? config.input : {};
          onChange({
            ...defaults,
            ...currentInput,
            input: currentInput,
          });
        }}
      />

      {selectedAction ? (
        <ActionConfigRenderer
          fields={selectedAction.configFields}
          config={config}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}
