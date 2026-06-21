import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useId, type ReactNode } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { MOBILE_FIRST_MODAL_CONTENT_CLASS } from "@/lib/modal";
import { cn, overlayClassName } from "@/lib/utils";

interface EntityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  headerActions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

interface CreateModalFooterProps {
  /** id of the create `<form>` this footer's Save button submits. */
  formId: string;
  isPending: boolean;
  onCancel: () => void;
}

/**
 * Standard Cancel/Save footer for an entity create form rendered inside an
 * `EntityModal`. Shared so the create surfaces stay identical across routes.
 */
export function CreateModalFooter({
  formId,
  isPending,
  onCancel,
}: CreateModalFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onCancel}
        disabled={isPending}
      >
        Cancel
      </Button>
      <Button type="submit" size="sm" form={formId} loading={isPending}>
        Save
        <ShortcutBadge
          shortcut="meta+enter"
          className="ml-2 hidden sm:inline-flex"
        />
      </Button>
    </div>
  );
}

export function EntityModal({
  open,
  onOpenChange,
  title,
  description,
  headerActions,
  footer,
  className,
  children,
}: EntityModalProps) {
  const closeButtonId = useId();
  const resolveInitialFocus = () => {
    if (!headerActions) {
      return true;
    }

    const closeButton = document.getElementById(closeButtonId);
    if (closeButton instanceof HTMLElement) {
      return closeButton;
    }

    return true;
  };

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
            "fixed inset-0 z-50",
            overlayClassName,
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "duration-200",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="entity-modal-content"
          initialFocus={resolveInitialFocus}
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
                render={
                  <Button
                    id={closeButtonId}
                    data-slot="entity-modal-close-button"
                    variant="ghost"
                    size="icon-sm"
                  />
                }
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

          {footer ? (
            <div
              data-slot="entity-modal-footer"
              className="shrink-0 border-t border-border px-4 py-3 sm:px-6"
            >
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
