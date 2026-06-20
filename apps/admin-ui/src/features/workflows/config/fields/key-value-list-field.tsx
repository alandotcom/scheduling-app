import { useRef, useState } from "react";
import { Delete01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFieldLabel } from "@/lib/field-label";
import { ExpressionInput } from "../expression-input";
import type { FieldComponentProps } from "./types";
import { useFieldRenderContext } from "./field-render-context";
import { isRecord, serializeConfigValueForKey } from "./field-helpers";

type KeyValueRow = {
  id: string;
  key: string;
  value: string;
};

function createKeyValueRow(input?: {
  key?: string;
  value?: string;
}): KeyValueRow {
  return {
    id: crypto.randomUUID(),
    key: input?.key ?? "",
    value: input?.value ?? "",
  };
}

function toKeyValueRows(value: unknown): KeyValueRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows: KeyValueRow[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const key = typeof entry["key"] === "string" ? entry["key"] : "";
    const itemValue = typeof entry["value"] === "string" ? entry["value"] : "";
    rows.push(createKeyValueRow({ key, value: itemValue }));
  }

  return rows;
}

function serializeKeyValueRowsForDraft(rows: KeyValueRow[]): Array<{
  key: string;
  value: string;
}> {
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
  }));
}

export function KeyValueListField({
  field,
  config,
  onUpdateConfig,
  disabled,
}: FieldComponentProps) {
  const { expressionSuggestions } = useFieldRenderContext();
  const configValue = config[field.key];
  const [rows, setRows] = useState<KeyValueRow[]>(() =>
    toKeyValueRows(configValue),
  );
  const rowsRef = useRef(rows);

  // Reconcile internal rows when the config value changes outside this field
  // (node switch, undo, condition builder writes) — matches the other fields'
  // prevConfigValue pattern.
  const serializedConfigValue = serializeConfigValueForKey(configValue);
  const [prevSerializedConfigValue, setPrevSerializedConfigValue] = useState(
    serializedConfigValue,
  );
  if (serializedConfigValue !== prevSerializedConfigValue) {
    setPrevSerializedConfigValue(serializedConfigValue);
    const nextRows = toKeyValueRows(configValue);
    rowsRef.current = nextRows;
    setRows(nextRows);
  }

  const commitRows = (nextRows: KeyValueRow[]) => {
    onUpdateConfig(field.key, serializeKeyValueRowsForDraft(nextRows));
  };

  const commitCurrentRows = () => {
    commitRows(rowsRef.current);
  };

  const commitRowPatch = (
    rowId: string,
    patch: Partial<Pick<KeyValueRow, "key" | "value">>,
  ) => {
    const nextRows = rowsRef.current.map((row) =>
      row.id === rowId ? { ...row, ...patch } : row,
    );
    rowsRef.current = nextRows;
    setRows(nextRows);
    commitRows(nextRows);
  };

  const updateRow = (
    rowId: string,
    patch: Partial<Pick<KeyValueRow, "key" | "value">>,
  ) => {
    const nextRows = rowsRef.current.map((row) =>
      row.id === rowId ? { ...row, ...patch } : row,
    );
    rowsRef.current = nextRows;
    setRows(nextRows);
  };

  return (
    <div className="space-y-2">
      <Label>{formatFieldLabel(field.label, field.required === true)}</Label>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <Input
                disabled={disabled}
                onBlur={(event) =>
                  commitRowPatch(row.id, { key: event.target.value })
                }
                onChange={(event) =>
                  updateRow(row.id, { key: event.target.value })
                }
                placeholder={field.keyPlaceholder ?? "Key"}
                type="text"
                value={row.key}
              />
            </div>
            <div className="min-w-0">
              <ExpressionInput
                disabled={disabled}
                onBlur={commitCurrentRows}
                onChange={(nextValue) =>
                  updateRow(row.id, { value: nextValue })
                }
                placeholder={field.valuePlaceholder ?? "Value"}
                suggestions={expressionSuggestions}
                value={row.value}
              />
            </div>
            <Button
              aria-label="Remove variable"
              className="lg:justify-self-end"
              disabled={disabled}
              onClick={() => {
                const nextRows = rowsRef.current.filter(
                  (candidate) => candidate.id !== row.id,
                );
                rowsRef.current = nextRows;
                setRows(nextRows);
                commitRows(nextRows);
              }}
              size="icon-sm"
              type="button"
              variant="destructive"
            >
              <Icon className="size-4" icon={Delete01Icon} />
            </Button>
          </div>
        ))}
        <Button
          disabled={disabled}
          onClick={() => {
            const nextRows = [...rowsRef.current, createKeyValueRow()];
            rowsRef.current = nextRows;
            setRows(nextRows);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {field.addButtonLabel ?? "Add row"}
        </Button>
      </div>
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}
