import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UserGroup02Icon } from "@hugeicons/core-free-icons";
import type { AssistantClientTableRow } from "@scheduling/dto";
import { useSetCommandCenterOpen } from "@/hooks/use-command-center";
import { Icon } from "@/components/ui/icon";

interface ClientTableBlockProps {
  rows: AssistantClientTableRow[];
}

const PAGE_SIZE = 5;

export function ClientTableBlock({ rows }: ClientTableBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const setOpen = useSetCommandCenterOpen();

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
        <Icon icon={UserGroup02Icon} className="size-3.5 shrink-0" />
        No matching clients found.
      </div>
    );
  }

  const visibleRows = expanded ? rows : rows.slice(0, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;

  const handleRowClick = (client: AssistantClientTableRow) => {
    setOpen(false);
    navigate({ to: "/clients", search: { selected: client.id } });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <div className="divide-y divide-border/50">
        {visibleRows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => handleRowClick(row)}
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 active:bg-muted/70"
          >
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {row.fullName}
            </span>
            <span className="truncate text-muted-foreground">
              {row.email ?? row.phone ?? ""}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground/70">
              {row.appointmentCount} appt
              {row.appointmentCount !== 1 ? "s" : ""}
            </span>
          </button>
        ))}
      </div>
      {hasMore ? (
        <div className="border-t border-border/50 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {expanded ? "Show less" : `Show all ${rows.length}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
