import { useNavigate } from "@tanstack/react-router";
import {
  CheckmarkCircle01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import type { AssistantActionResult } from "@scheduling/dto";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { useSetCommandCenterOpen } from "@/hooks/use-command-center";

interface ActionResultBlockProps {
  result: AssistantActionResult;
}

export function ActionResultBlock({ result }: ActionResultBlockProps) {
  const navigate = useNavigate();
  const setOpen = useSetCommandCenterOpen();

  const handleViewAppointment = () => {
    if (!result.entityId) return;
    setOpen(false);
    navigate({ to: "/appointments", search: { selected: result.entityId } });
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium",
        result.success
          ? "bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
          : "bg-destructive/5 text-destructive",
      )}
    >
      <Icon
        icon={result.success ? CheckmarkCircle01Icon : Cancel01Icon}
        className="size-3.5 shrink-0"
      />
      <span className="flex-1">{result.message}</span>
      {result.success && result.entityId && (
        <button
          type="button"
          onClick={handleViewAppointment}
          className="shrink-0 font-medium underline underline-offset-2 opacity-80 transition-opacity hover:opacity-100"
        >
          View appointment &rarr;
        </button>
      )}
    </div>
  );
}
