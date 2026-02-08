import { useState } from "react";
import type { ComponentProps } from "react";
import { Popover } from "@base-ui/react/popover";
import { Menu01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  onClick: () => void;
  icon?: ComponentProps<typeof Icon>["icon"];
  variant?: "default" | "destructive";
  disabled?: boolean;
  separator?: boolean;
}

interface RowActionsProps {
  actions: RowAction[];
  ariaLabel: string;
}

export function RowActions({ actions, ariaLabel }: RowActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="flex items-center justify-end"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={ariaLabel}
    >
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={ariaLabel}
              title="Open row actions"
              className="hover:translate-y-0"
            >
              <Icon icon={Menu01Icon} className="size-4" />
            </Button>
          }
        />
        <Popover.Portal>
          <Popover.Positioner sideOffset={6} align="end" className="z-50">
            <Popover.Popup
              className={cn(
                "min-w-44 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-lg",
                "data-open:animate-in data-closed:animate-out",
                "data-closed:fade-out-0 data-open:fade-in-0",
                "data-closed:zoom-out-95 data-open:zoom-in-95",
                "duration-150",
              )}
            >
              {actions.map((action, index) => (
                <div key={`${action.label}-${index}`}>
                  {action.separator && index > 0 ? (
                    <div className="my-1 h-px bg-border/50" />
                  ) : null}
                  <button
                    type="button"
                    disabled={action.disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      action.onClick();
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                      "transition-colors hover:bg-accent hover:text-accent-foreground",
                      "disabled:pointer-events-none disabled:opacity-50",
                      action.variant === "destructive" &&
                        "text-destructive hover:bg-destructive/10 hover:text-destructive",
                    )}
                  >
                    {action.icon ? (
                      <Icon icon={action.icon} className="size-4" />
                    ) : null}
                    <span>{action.label}</span>
                  </button>
                </div>
              ))}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
