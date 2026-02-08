import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MOBILE_FIRST_MODAL_CONTENT_CLASS } from "@/lib/modal";
import { cn } from "@/lib/utils";

interface EntityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  headerActions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function EntityModal({
  open,
  onOpenChange,
  title,
  description,
  headerActions,
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
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "duration-200",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="entity-modal-content"
          className={cn(
            MOBILE_FIRST_MODAL_CONTENT_CLASS,
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "data-closed:zoom-out-95 data-open:zoom-in-95",
            "duration-200",
            className,
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
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
            <div className="flex items-center gap-2">
              {headerActions ? (
                <div className="shrink-0">{headerActions}</div>
              ) : null}
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <span className="sr-only">Close</span>
                <Icon icon={Cancel01Icon} />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div
            data-slot="entity-modal-body"
            className="flex-1 overflow-y-auto p-0"
          >
            {children}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
