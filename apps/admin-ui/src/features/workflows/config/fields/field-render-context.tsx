import { createContext, useContext, type ReactNode } from "react";
import type { EventAttributeSuggestion } from "../event-attribute-suggestions";
import type {
  WorkflowFilterFieldOption,
  WorkflowFilterValueOption,
} from "../../filter-builder-shared";

// Ambient dependencies shared by every field renderer. Provided once by
// ActionConfigRenderer so individual fields stop receiving drilled props.
export interface FieldRenderContextValue {
  expressionSuggestions: EventAttributeSuggestion[];
  fieldOptions?: WorkflowFilterFieldOption[];
  selectOptionsByKey: Record<string, Array<{ value: string; label: string }>>;
  conditionValueOptionsByField: Record<string, WorkflowFilterValueOption[]>;
  defaultTimezone: string;
  configScopeKey: string;
  fieldDefaults: Record<string, string>;
}

const FieldRenderContext = createContext<FieldRenderContextValue | null>(null);

export function FieldRenderProvider({
  value,
  children,
}: {
  value: FieldRenderContextValue;
  children: ReactNode;
}) {
  return (
    <FieldRenderContext.Provider value={value}>
      {children}
    </FieldRenderContext.Provider>
  );
}

export function useFieldRenderContext(): FieldRenderContextValue {
  const context = useContext(FieldRenderContext);
  if (!context) {
    throw new Error(
      "useFieldRenderContext must be used within a FieldRenderProvider",
    );
  }
  return context;
}
