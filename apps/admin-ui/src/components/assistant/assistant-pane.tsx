import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  useAui,
  useAuiState,
  useThreadViewport,
  AuiIf,
} from "@assistant-ui/react";
import {
  AiChatIcon,
  ArrowDown01Icon,
  Calendar02Icon,
  Clock01Icon,
  Copy01Icon,
  NoteAddIcon,
  RefreshIcon,
  Search01Icon,
  SentIcon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { AssistantRuntime } from "./assistant-runtime";
import { assistantToolRenderers, ToolFallback } from "./assistant-tool-uis";
import {
  ProposalProvider,
  clearProposalResults,
} from "./assistant-proposal-context";
import { MarkdownText } from "./assistant-markdown";
import { clearSessionHistory } from "@/hooks/assistant-session-storage";
import { authClient } from "@/lib/auth-client";

const SUGGESTION_CHIPS = [
  { label: "Find a client", icon: Search01Icon },
  { label: "Upcoming appointments", icon: Clock01Icon },
  { label: "Book an appointment", icon: Calendar02Icon },
];

function WelcomeScreen() {
  const aui = useAui();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/5">
        <Icon icon={AiChatIcon} className="size-5 text-primary" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold tracking-tight">
          Scheduling Assistant
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Search clients, check appointments, or book a visit.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
              "border-border/60 bg-background text-muted-foreground",
              "transition-all hover:border-border hover:bg-muted hover:text-foreground",
              "active:scale-[0.97]",
            )}
            onClick={() =>
              aui.thread().append({
                role: "user",
                content: [{ type: "text", text: chip.label }],
              })
            }
          >
            <Icon icon={chip.icon} className="size-3.5" />
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserMessageBubble() {
  return (
    <MessagePrimitive.Root className="group relative flex justify-end py-1.5">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-primary-foreground shadow-sm">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }) => (
              <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
            ),
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessageBubble() {
  return (
    <MessagePrimitive.Root className="group relative flex gap-3 py-1.5">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border/50">
        <Icon icon={AiChatIcon} className="size-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Empty: TypingIndicator,
            tools: { by_name: assistantToolRenderers, Fallback: ToolFallback },
          }}
        />
        {/* Fixed-height wrapper prevents layout shift when action bar mounts on hover */}
        <div className="h-7">
          <AssistantActionBar />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1.5">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
    </div>
  );
}

function AssistantActionBar() {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
    >
      <ActionBarPrimitive.Copy asChild>
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
          title="Copy"
        >
          <Icon icon={Copy01Icon} className="size-3.5" />
        </button>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
          title="Regenerate"
        >
          <Icon icon={RefreshIcon} className="size-3.5" />
        </button>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
}

function ScrollToBottomButton() {
  const isAtBottom = useThreadViewport((s) => s.isAtBottom);

  if (isAtBottom) return null;

  return (
    <div className="sticky bottom-0 flex justify-center">
      <ThreadPrimitive.ScrollToBottom asChild>
        <button
          type="button"
          className={cn(
            "mb-2 inline-flex size-8 items-center justify-center rounded-full",
            "border bg-background shadow-md",
            "text-muted-foreground transition-all hover:text-foreground",
          )}
        >
          <Icon icon={ArrowDown01Icon} className="size-4" />
        </button>
      </ThreadPrimitive.ScrollToBottom>
    </div>
  );
}

function ComposerArea() {
  return (
    <div className="border-t border-border/60 bg-background px-4 py-3">
      <ComposerPrimitive.Root
        className={cn(
          "flex items-end gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5",
          "transition-all focus-within:border-border focus-within:bg-background focus-within:shadow-sm",
        )}
      >
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="Ask anything..."
          className="min-h-[28px] max-h-[120px] flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:opacity-50"
        />
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <button
              type="button"
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
                "bg-primary text-primary-foreground shadow-sm",
                "transition-all hover:bg-primary/90 active:scale-95",
                "disabled:opacity-40 disabled:shadow-none",
              )}
            >
              <Icon icon={SentIcon} className="size-[18px]" />
            </button>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <button
              type="button"
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
                "border border-border bg-background",
                "text-muted-foreground transition-all hover:bg-muted active:scale-95",
              )}
            >
              <Icon icon={StopIcon} className="size-[18px]" />
            </button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </ComposerPrimitive.Root>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New chat button — resets the current thread + clears session storage
// ---------------------------------------------------------------------------

function NewChatButton() {
  const aui = useAui();
  const isEmpty = useAuiState((s) => s.thread.isEmpty);
  const { data: session } = authClient.useSession();

  if (isEmpty) return null;

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
        "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
      )}
      title="New chat"
      onClick={() => {
        const ids = {
          orgId: session?.session.activeOrganizationId ?? null,
          userId: session?.user.id ?? null,
        };
        clearSessionHistory(ids);
        clearProposalResults(ids);
        aui.thread().reset();
      }}
    >
      <Icon icon={NoteAddIcon} className="size-4" />
      New chat
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main layout
// ---------------------------------------------------------------------------

export function AssistantPane() {
  return (
    <AssistantRuntime>
      <ProposalProvider>
        <div className="flex items-center justify-end px-3 py-1.5">
          <NewChatButton />
        </div>
        <ThreadPrimitive.Root className="relative flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
            <AuiIf condition={(s) => s.thread.isEmpty}>
              <WelcomeScreen />
            </AuiIf>
            <div className="mx-auto max-w-2xl space-y-1 px-4 pt-4 pb-4">
              <ThreadPrimitive.Messages>
                {({ message }) => {
                  if (message.role === "user") return <UserMessageBubble />;
                  if (message.role === "assistant")
                    return <AssistantMessageBubble />;
                  return null;
                }}
              </ThreadPrimitive.Messages>
            </div>
            <ScrollToBottomButton />
          </ThreadPrimitive.Viewport>
          <ComposerArea />
        </ThreadPrimitive.Root>
      </ProposalProvider>
    </AssistantRuntime>
  );
}
