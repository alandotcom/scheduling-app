import { useMemo, type ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { authClient } from "@/lib/auth-client";
import { loadSessionHistory } from "@/hooks/assistant-session-storage";
import { useSaveSessionHistory } from "@/hooks/use-assistant-session-history";

const transport = new AssistantChatTransport({
  api: "/api/assistant/chat",
  credentials: "include",
});

function SessionHistorySaver({
  orgId,
  userId,
}: {
  orgId: string | null;
  userId: string | null;
}) {
  useSaveSessionHistory({ orgId, userId });
  return null;
}

export function AssistantRuntime({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const orgId = session?.session.activeOrganizationId ?? null;
  const userId = session?.user.id ?? null;

  const initialMessages = useMemo(
    () => loadSessionHistory({ orgId, userId }),
    [orgId, userId],
  );

  const runtime = useChatRuntime({
    transport,
    messages: initialMessages,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SessionHistorySaver orgId={orgId} userId={userId} />
      {children}
    </AssistantRuntimeProvider>
  );
}
