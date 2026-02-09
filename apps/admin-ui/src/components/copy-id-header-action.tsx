import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { CheckmarkCircle01Icon, Copy02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const COPIED_STATE_MS = 1200;

async function copyTextToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard API unavailable");
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();

  if (!copied) {
    throw new Error("Failed to copy");
  }
}

interface CopyIdHeaderActionProps {
  id: string;
  entityLabel: string;
}

export function CopyIdHeaderAction({
  id,
  entityLabel,
}: CopyIdHeaderActionProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(id);
      setCopied(true);

      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }

      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        resetTimerRef.current = null;
      }, COPIED_STATE_MS);
    } catch {
      setCopied(false);
      toast.error("Could not copy ID");
    }
  }, [id]);

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              void handleCopy();
            }}
            className={cn(
              "opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100",
              copied && "opacity-100",
            )}
            title="Copy ID"
            aria-label={
              copied ? `Copied ${entityLabel} ID` : `Copy ${entityLabel} ID`
            }
          />
        }
      >
        <Icon icon={copied ? CheckmarkCircle01Icon : Copy02Icon} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="bottom" sideOffset={8}>
          <Tooltip.Popup className="rounded-md bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-md origin-(--transform-origin) transition-[transform,scale,opacity] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 data-instant:transition-none">
            Copy ID
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
