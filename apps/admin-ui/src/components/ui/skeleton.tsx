import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded bg-muted", className)}
      {...props}
    />
  );
}

function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  const columnKeys = Array.from(
    { length: cols },
    (_, colNumber) => `col-${colNumber}`,
  );
  const rowKeys = Array.from(
    { length: rows },
    (_, rowNumber) => `row-${rowNumber}`,
  );

  return (
    <div className="w-full">
      <div className="flex gap-4 border-b border-border pb-3 mb-3">
        {columnKeys.map((columnKey) => (
          <Skeleton key={columnKey} className="h-4 flex-1" />
        ))}
      </div>
      {rowKeys.map((rowKey) => (
        <div key={rowKey} className="flex gap-4 py-3">
          {columnKeys.map((columnKey) => (
            <Skeleton key={`${rowKey}-${columnKey}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export { Skeleton, TableSkeleton };
