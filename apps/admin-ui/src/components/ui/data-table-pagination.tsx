import type { Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  className?: string;
}

export function DataTablePagination<TData>({
  table,
  className,
}: DataTablePaginationProps<TData>) {
  const {
    pagination: { pageIndex },
  } = table.getState();
  const pageCount = table.getPageCount();
  const canPreviousPage = table.getCanPreviousPage();
  const canNextPage = table.getCanNextPage();

  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border px-4 py-3",
        className,
      )}
    >
      <p className="mr-2 text-xs text-muted-foreground">
        Page {Math.max(pageIndex + 1, 1)} of {Math.max(pageCount, 1)}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => table.previousPage()}
        disabled={!canPreviousPage}
      >
        Previous
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => table.nextPage()}
        disabled={!canNextPage}
      >
        Next
      </Button>
    </div>
  );
}
