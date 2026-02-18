// Global command palette (Cmd+K / Ctrl+K)

import { useState, useCallback, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
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
import {
  type CreateIntentKey,
  useTriggerCreateIntent,
} from "@/hooks/use-create-intent";
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

function normalizePathname(pathname: string) {
  if (pathname.length <= 1) return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const triggerCreateIntent = useTriggerCreateIntent();

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

  const openApiDocs = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open("/api/v1/docs", "_blank", "noopener,noreferrer");
  }, []);

  const preloadRoute = useCallback(
    (to: string) => {
      void router.preloadRoute({ to });
    },
    [router],
  );

  const runCreateCommand = useCallback(
    (to: string, intent: CreateIntentKey) => {
      runCommand(() => {
        if (normalizePathname(location.pathname) === normalizePathname(to)) {
          triggerCreateIntent(intent);
          return;
        }

        void Promise.resolve(navigate({ to, search: {} }))
          .then(() => {
            if (
              normalizePathname(router.state.location.pathname) !==
              normalizePathname(to)
            ) {
              return;
            }
            triggerCreateIntent(intent);
          })
          .catch(() => {
            // Navigation was interrupted; do not retain create intent.
          });
      });
    },
    [
      location.pathname,
      navigate,
      router.state.location.pathname,
      runCommand,
      triggerCreateIntent,
    ],
  );

  const actions = useMemo<CommandAction[]>(() => {
    const createActions: CommandAction[] = [
      {
        id: "create-appointment",
        group: "Create",
        label: "New Appointment",
        icon: Add01Icon,
        onSelect: () => runCreateCommand("/appointments", "appointments"),
        onHighlight: () => preloadRoute("/appointments"),
      },
      {
        id: "create-client",
        group: "Create",
        label: "New Client",
        icon: Add01Icon,
        onSelect: () => runCreateCommand("/clients", "clients"),
        onHighlight: () => preloadRoute("/clients"),
      },
      {
        id: "create-calendar",
        group: "Create",
        label: "New Calendar",
        icon: Add01Icon,
        onSelect: () => runCreateCommand("/calendars", "calendars"),
        onHighlight: () => preloadRoute("/calendars"),
      },
      {
        id: "create-appointment-type",
        group: "Create",
        label: "New Appointment Type",
        icon: Add01Icon,
        onSelect: () =>
          runCreateCommand("/appointment-types", "appointment-types"),
        onHighlight: () => preloadRoute("/appointment-types"),
      },
      {
        id: "create-resource",
        group: "Create",
        label: "New Resource",
        icon: Add01Icon,
        onSelect: () => runCreateCommand("/resources", "resources"),
        onHighlight: () => preloadRoute("/resources"),
      },
      {
        id: "create-location",
        group: "Create",
        label: "New Location",
        icon: Add01Icon,
        onSelect: () => runCreateCommand("/locations", "locations"),
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

    const settingsActions: CommandAction[] = [
      {
        id: "go-settings-organization",
        group: "Navigate",
        label: "Settings > Organization",
        icon: Settings01Icon,
        onSelect: () =>
          runCommand(
            () =>
              void navigate({
                to: "/settings",
                search: { section: "organization" },
              }),
          ),
        onHighlight: () => preloadRoute("/settings"),
      },
      {
        id: "go-settings-users",
        group: "Navigate",
        label: "Settings > Users",
        icon: Settings01Icon,
        onSelect: () =>
          runCommand(
            () =>
              void navigate({
                to: "/settings",
                search: { section: "users" },
              }),
          ),
        onHighlight: () => preloadRoute("/settings"),
      },
      {
        id: "go-settings-developers",
        group: "Navigate",
        label: "Settings > Developers",
        icon: Settings01Icon,
        onSelect: () =>
          runCommand(
            () =>
              void navigate({
                to: "/settings",
                search: { section: "developers" },
              }),
          ),
        onHighlight: () => preloadRoute("/settings"),
      },
      {
        id: "go-settings-webhooks",
        group: "Navigate",
        label: "Settings > Webhooks",
        icon: Settings01Icon,
        onSelect: () =>
          runCommand(
            () =>
              void navigate({
                to: "/settings",
                search: { section: "webhooks" },
              }),
          ),
        onHighlight: () => preloadRoute("/settings"),
      },
    ];

    const docsActions: CommandAction[] = [
      {
        id: "open-api-docs",
        group: "Help",
        label: "API Docs",
        icon: Settings01Icon,
        onSelect: () => runCommand(openApiDocs),
      },
    ];

    return [
      ...createActions,
      ...navActions,
      ...settingsActions,
      ...docsActions,
    ];
  }, [navigate, openApiDocs, preloadRoute, runCommand, runCreateCommand]);

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
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/35 md:backdrop-blur-[2px]",
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "duration-200",
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(94vw,58rem)] -translate-x-1/2 -translate-y-1/2 p-4",
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "data-closed:zoom-out-95 data-open:zoom-in-95",
            "duration-200",
          )}
        >
          <Command
            label="Command Menu"
            className="h-[min(80dvh,46rem)] overflow-hidden rounded-2xl border border-border/70 bg-background shadow-[0_20px_70px_-20px_rgba(0,0,0,0.45)]"
          >
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
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
