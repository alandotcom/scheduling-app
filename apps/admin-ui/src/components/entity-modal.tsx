import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EntityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}

export function EntityModal({
  open,
  onOpenChange,
  title,
  description,
  className,
  children,
}: EntityModalProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      modal="trap-focus"
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="entity-modal-backdrop"
          className={cn(
            "fixed inset-0 z-50 bg-black/40",
            "data-open:animate-in data-open:fade-in-0 duration-100",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="entity-modal-content"
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2",
            "max-h-[90vh] overflow-hidden rounded-xl border border-border bg-background shadow-xl",
            "data-open:animate-in data-open:zoom-in-95 duration-150",
            className,
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-base font-semibold tracking-tight sm:text-lg">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              render={<Button variant="ghost" size="icon-sm" />}
            >
              <span className="sr-only">Close</span>
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </DialogPrimitive.Close>
          </div>

          <div className="max-h-[calc(90vh-68px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            {children}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
