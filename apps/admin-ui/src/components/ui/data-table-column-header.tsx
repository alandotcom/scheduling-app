import type { Column } from "@tanstack/react-table";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <span className={cn("text-sm font-medium", className)}>{title}</span>
    );
  }

  const sorted = column.getIsSorted();
  const onToggleSorting = column.getToggleSortingHandler();
  const sortIcon =
    sorted === "asc"
      ? ArrowUp01Icon
      : sorted === "desc"
        ? ArrowDown01Icon
        : ArrowUpDownIcon;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("-ml-2 h-8 px-2 text-left hover:translate-y-0", className)}
      onClick={onToggleSorting}
    >
      <span>{title}</span>
      <Icon
        icon={sortIcon}
        aria-hidden
        className={cn(
          "size-3.5",
          sorted ? "text-foreground" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
