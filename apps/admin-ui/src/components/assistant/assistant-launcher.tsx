import { AiChatIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useOpenCommandCenter } from "@/hooks/use-command-center";
import { authClient } from "@/lib/auth-client";
import { hasSessionHistory } from "@/hooks/assistant-session-storage";

interface AssistantLauncherProps {
  /**
   * Icon-only presentation for the compact (sub-`lg`) top header, where a
   * labeled button would crowd the bar. The desktop header action cluster
   * uses the default labeled button.
   */
  compact?: boolean;
}

/**
 * Top-header entry point for the AI assistant. Labeled in the desktop action
 * cluster, icon-only in the compact header. The launcher lives in the header
 * on every breakpoint; the mobile bottom bar carries only the page's primary
 * action.
 */
export function AssistantLauncher({ compact = false }: AssistantLauncherProps) {
  const openCommandCenter = useOpenCommandCenter();
  const { data: session } = authClient.useSession();

  const hasConversation = hasSessionHistory({
    orgId: session?.session.activeOrganizationId ?? null,
    userId: session?.user.id ?? null,
  });

  const indicator = hasConversation ? (
    <span className="absolute -top-1 -right-1 flex size-2.5">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
      <span className="relative inline-flex size-2.5 rounded-full bg-primary ring-2 ring-background" />
    </span>
  ) : null;

  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open assistant"
        onClick={() => openCommandCenter("assistant")}
        className="relative"
      >
        <Icon icon={AiChatIcon} className="size-5" />
        {indicator}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => openCommandCenter("assistant")}
      className="relative"
    >
      <Icon icon={AiChatIcon} data-icon="inline-start" />
      <span>Assistant</span>
      {indicator}
    </Button>
  );
}
