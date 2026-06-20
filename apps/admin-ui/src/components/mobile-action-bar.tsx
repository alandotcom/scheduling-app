import type { ReactNode } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { hasSessionHistory } from "@/hooks/assistant-session-storage";
import { useOpenCommandCenter } from "@/hooks/use-command-center";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface MobileActionBarProps {
  /**
   * The page's primary action (e.g. an "Add client" button). It fills the
   * available width; the Assistant launcher always sits to its right. Omit it
   * to render an Assistant-only bar on pages without a primary action.
   */
  children?: ReactNode;
  className?: string;
}

/**
 * Compact-only bottom action bar. Holds the page's primary action alongside the
 * Assistant launcher so the two never overlap. Hidden from `lg` up, where the
 * sidebar header and the floating Assistant launcher take over.
 */
export function MobileActionBar({ children, className }: MobileActionBarProps) {
  const openCommandCenter = useOpenCommandCenter();
  const { data: session } = authClient.useSession();

  const hasConversation = hasSessionHistory({
    orgId: session?.session.activeOrganizationId ?? null,
    userId: session?.user.id ?? null,
  });

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden",
        className,
      )}
    >
      {children ? (
        <div className="min-w-0 flex-1">{children}</div>
      ) : (
        <div className="flex-1" />
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() => openCommandCenter("assistant")}
        className="relative shrink-0"
      >
        <Icon icon={Search01Icon} data-icon="inline-start" />
        Assistant
        {hasConversation && (
          <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
        )}
      </Button>
    </div>
  );
}
