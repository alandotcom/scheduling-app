// Global command palette (Cmd+K / Ctrl+K)

import { useState, useCallback, useMemo, type ReactNode } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Command } from "cmdk";
import {
  Calendar03Icon,
  Clock01Icon,
  Add01Icon,
  Search01Icon,
  Layers01Icon,
  Location01Icon,
  Package01Icon,
  UserGroup02Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { formatShortcut } from "@/lib/shortcuts";
import { Icon } from "@/components/ui/icon";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

interface CommandAction {
  id: string;
  group: string;
  label: string;
  icon: React.ComponentProps<typeof Icon>["icon"];
  shortcut?: string;
  onSelect: () => void;
  onHighlight?: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: ["meta+k", "ctrl+k"],
        action: () => setOpen((isOpen) => !isOpen),
        description: "Toggle command menu",
        ignoreInputs: false,
      },
    ],
    scope: "all",
  });

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const preloadRoute = useCallback(
    (to: string) => {
      void router.preloadRoute({ to });
    },
    [router],
  );

  const actions = useMemo<CommandAction[]>(() => {
    const createActions: CommandAction[] = [
      {
        id: "create-appointment",
        group: "Create",
        label: "New Appointment",
        icon: Add01Icon,
        onSelect: () =>
          runCommand(
            () =>
              void navigate({
                to: "/appointments",
                search: { create: "1" },
              }),
          ),
        onHighlight: () => preloadRoute("/appointments"),
      },
      {
        id: "create-client",
        group: "Create",
        label: "New Client",
        icon: Add01Icon,
        onSelect: () =>
          runCommand(
            () =>
              void navigate({
                to: "/clients",
                search: { create: "1" },
              }),
          ),
        onHighlight: () => preloadRoute("/clients"),
      },
      {
        id: "create-calendar",
        group: "Create",
        label: "New Calendar",
        icon: Add01Icon,
        onSelect: () =>
          runCommand(
            () =>
              void navigate({
                to: "/calendars",
                search: { create: "1" },
              }),
          ),
        onHighlight: () => preloadRoute("/calendars"),
      },
      {
        id: "create-appointment-type",
        group: "Create",
        label: "New Appointment Type",
        icon: Add01Icon,
        onSelect: () =>
          runCommand(
            () =>
              void navigate({
                to: "/appointment-types",
                search: { create: "1" },
              }),
          ),
        onHighlight: () => preloadRoute("/appointment-types"),
      },
      {
        id: "create-resource",
        group: "Create",
        label: "New Resource",
        icon: Add01Icon,
        onSelect: () =>
          runCommand(
            () =>
              void navigate({
                to: "/resources",
                search: { create: "1" },
              }),
          ),
        onHighlight: () => preloadRoute("/resources"),
      },
      {
        id: "create-location",
        group: "Create",
        label: "New Location",
        icon: Add01Icon,
        onSelect: () =>
          runCommand(
            () =>
              void navigate({
                to: "/locations",
                search: { create: "1" },
              }),
          ),
        onHighlight: () => preloadRoute("/locations"),
      },
    ];

    const navActions: CommandAction[] = [
      {
        id: "go-appointments",
        group: "Navigate",
        label: "Go to Appointments",
        icon: Clock01Icon,
        shortcut: "g a",
        onSelect: () =>
          runCommand(() => void navigate({ to: "/appointments", search: {} })),
        onHighlight: () => preloadRoute("/appointments"),
      },
      {
        id: "go-clients",
        group: "Navigate",
        label: "Go to Clients",
        icon: UserGroup02Icon,
        shortcut: "g p",
        onSelect: () =>
          runCommand(() => void navigate({ to: "/clients", search: {} })),
        onHighlight: () => preloadRoute("/clients"),
      },
      {
        id: "go-calendars",
        group: "Navigate",
        label: "Go to Calendars",
        icon: Calendar03Icon,
        shortcut: "g c",
        onSelect: () =>
          runCommand(() => void navigate({ to: "/calendars", search: {} })),
        onHighlight: () => preloadRoute("/calendars"),
      },
      {
        id: "go-appointment-types",
        group: "Navigate",
        label: "Go to Appointment Types",
        icon: Layers01Icon,
        shortcut: "g t",
        onSelect: () =>
          runCommand(
            () => void navigate({ to: "/appointment-types", search: {} }),
          ),
        onHighlight: () => preloadRoute("/appointment-types"),
      },
      {
        id: "go-resources",
        group: "Navigate",
        label: "Go to Resources",
        icon: Package01Icon,
        shortcut: "g r",
        onSelect: () =>
          runCommand(() => void navigate({ to: "/resources", search: {} })),
        onHighlight: () => preloadRoute("/resources"),
      },
      {
        id: "go-locations",
        group: "Navigate",
        label: "Go to Locations",
        icon: Location01Icon,
        shortcut: "g l",
        onSelect: () =>
          runCommand(() => void navigate({ to: "/locations", search: {} })),
        onHighlight: () => preloadRoute("/locations"),
      },
      {
        id: "go-settings",
        group: "Navigate",
        label: "Go to Settings",
        icon: Settings01Icon,
        shortcut: "g s",
        onSelect: () =>
          runCommand(() => void navigate({ to: "/settings", search: {} })),
        onHighlight: () => preloadRoute("/settings"),
      },
    ];

    return [...createActions, ...navActions];
  }, [navigate, preloadRoute, runCommand]);

  const groups = useMemo(() => {
    const map = new Map<string, CommandAction[]>();
    for (const action of actions) {
      const existing = map.get(action.group);
      if (existing) {
        existing.push(action);
      } else {
        map.set(action.group, [action]);
      }
    }
    return Array.from(map.entries());
  }, [actions]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command Menu"
      className={cn(
        "fixed inset-0 z-50",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      )}
    >
      <div
        className="fixed inset-0 bg-black/35 md:backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />

      <div className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,58rem)] -translate-x-1/2 -translate-y-1/2 p-4">
        <div className="h-[min(80dvh,46rem)] overflow-hidden rounded-2xl border border-border/70 bg-background shadow-[0_20px_70px_-20px_rgba(0,0,0,0.45)]">
          <div className="flex items-center border-b border-border/70 px-5 py-3">
            <Icon
              icon={Search01Icon}
              className="mr-3 shrink-0 text-muted-foreground"
            />
            <Command.Input
              placeholder="Type a command or search..."
              className="h-11 w-full bg-transparent text-lg outline-none placeholder:text-muted-foreground/90 sm:text-[1.5rem]"
            />
            <ShortcutBadge
              shortcut="escape"
              className="ml-3 hidden sm:inline-flex"
            />
          </div>

          <Command.List
            className="h-[calc(min(80dvh,46rem)-4.75rem)] overflow-y-scroll px-3 pb-3 pt-2"
            style={{ scrollbarGutter: "stable" }}
          >
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {groups.map(([groupLabel, groupActions]) => (
              <Command.Group key={groupLabel} className="px-1 py-1">
                <CommandGroupHeading>{groupLabel}</CommandGroupHeading>
                {groupActions.map((action) => (
                  <CommandItem
                    key={action.id}
                    onSelect={action.onSelect}
                    onHighlight={action.onHighlight}
                    icon={action.icon}
                    shortcut={action.shortcut}
                  >
                    {action.label}
                  </CommandItem>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </div>
      </div>
    </Command.Dialog>
  );
}

function CommandGroupHeading({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-2 pt-4 text-[1.05rem] font-semibold tracking-tight text-foreground/75 first:pt-2">
      {children}
    </div>
  );
}

function splitShortcutSequence(shortcut: string) {
  return shortcut
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function CommandShortcut({ shortcut }: { shortcut: string }) {
  const steps = splitShortcutSequence(shortcut);

  if (steps.length <= 1) {
    return <ShortcutBadge shortcut={shortcut} />;
  }

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, index) => (
        <div
          key={`${shortcut}-${step}-${index}`}
          className="flex items-center gap-1.5"
        >
          <kbd className="inline-flex h-7 items-center rounded-md border border-border bg-muted px-2 font-mono text-[11px] font-medium text-muted-foreground">
            {formatShortcut(step)}
          </kbd>
          {index < steps.length - 1 ? (
            <span className="text-[11px] text-muted-foreground">then</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

interface CommandItemProps {
  children: ReactNode;
  icon: React.ComponentProps<typeof Icon>["icon"];
  shortcut?: string;
  onSelect: () => void;
  onHighlight?: () => void;
}

function CommandItem({
  children,
  icon,
  shortcut,
  onSelect,
  onHighlight,
}: CommandItemProps) {
  return (
    <Command.Item
      onSelect={onSelect}
      onMouseEnter={onHighlight}
      onFocus={onHighlight}
      className={cn(
        "relative flex min-h-14 cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-3 text-[1.05rem] outline-none transition-colors",
        "data-[selected=true]:bg-muted/70 data-[selected=true]:text-foreground",
      )}
    >
      <Icon icon={icon} className="text-muted-foreground/90" />
      <span className="flex-1">{children}</span>
      {shortcut ? <CommandShortcut shortcut={shortcut} /> : null}
    </Command.Item>
  );
}
