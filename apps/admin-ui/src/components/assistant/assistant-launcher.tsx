import { Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useOpenCommandCenter } from "@/hooks/use-command-center";
import { authClient } from "@/lib/auth-client";
import { hasSessionHistory } from "@/hooks/assistant-session-storage";

export function AssistantLauncher() {
  const openCommandCenter = useOpenCommandCenter();
  const { data: session } = authClient.useSession();

  const hasConversation = hasSessionHistory({
    orgId: session?.session.activeOrganizationId ?? null,
    userId: session?.user.id ?? null,
  });

  return (
    <Button
      type="button"
      size="sm"
      onClick={() => openCommandCenter("assistant")}
      className="fixed bottom-4 right-4 z-40 rounded-full pl-2.5 pr-3 shadow-lg"
    >
      <Icon icon={Search01Icon} data-icon="inline-start" />
      <span>Assistant</span>
      {hasConversation && (
        <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground/60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-primary-foreground" />
        </span>
      )}
    </Button>
  );
}
