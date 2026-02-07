// Global command palette (Cmd+K)

import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { Icon } from "@/components/ui/icon";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

interface CommandPaletteProps {
  onCreateAppointment?: () => void;
}

export function CommandPalette({ onCreateAppointment }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: ["meta+k", "ctrl+k"],
        action: () => setOpen((isOpen) => !isOpen),
        description: "Toggle command menu",
        ignoreInputs: false,
      },
    ],
  });

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

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
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 p-4">
        <div className="overflow-hidden rounded-xl border border-border/50 bg-background shadow-2xl">
          {/* Search input */}
          <div className="flex items-center border-b border-border/50 px-4">
            <Icon icon={Search01Icon} className="mr-3 text-muted-foreground" />
            <Command.Input
              placeholder="Type a command or search..."
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="pointer-events-none hidden h-6 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
              ESC
            </kbd>
          </div>

          {/* Command list */}
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Quick Actions */}
            {onCreateAppointment && (
              <Command.Group className="px-2 py-1.5">
                <CommandGroupHeading>Quick Actions</CommandGroupHeading>
                <CommandItem
                  onSelect={() => runCommand(onCreateAppointment)}
                  icon={Add01Icon}
                  shortcut="⌘N"
                >
                  Create Appointment
                </CommandItem>
              </Command.Group>
            )}

            {/* Work */}
            <Command.Group className="px-2 py-1.5">
              <CommandGroupHeading>Work</CommandGroupHeading>
              <CommandItem
                onSelect={() =>
                  runCommand(
                    () => void navigate({ to: "/appointments", search: {} }),
                  )
                }
                icon={Clock01Icon}
                shortcut="g a"
              >
                Go to Appointments
              </CommandItem>
            </Command.Group>

            {/* People */}
            <Command.Group className="px-2 py-1.5">
              <CommandGroupHeading>People</CommandGroupHeading>
              <CommandItem
                onSelect={() =>
                  runCommand(
                    () => void navigate({ to: "/clients", search: {} }),
                  )
                }
                icon={UserGroup02Icon}
                shortcut="g u"
              >
                Go to Clients
              </CommandItem>
            </Command.Group>

            {/* Setup */}
            <Command.Group className="px-2 py-1.5">
              <CommandGroupHeading>Setup</CommandGroupHeading>
              <CommandItem
                onSelect={() =>
                  runCommand(
                    () => void navigate({ to: "/calendars", search: {} }),
                  )
                }
                icon={Calendar03Icon}
                shortcut="g c"
              >
                Go to Calendars
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runCommand(
                    () =>
                      void navigate({ to: "/appointment-types", search: {} }),
                  )
                }
                icon={Layers01Icon}
                shortcut="g t"
              >
                Go to Appointment Types
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runCommand(
                    () => void navigate({ to: "/resources", search: {} }),
                  )
                }
                icon={Package01Icon}
                shortcut="g r"
              >
                Go to Resources
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runCommand(
                    () => void navigate({ to: "/locations", search: {} }),
                  )
                }
                icon={Location01Icon}
                shortcut="g l"
              >
                Go to Locations
              </CommandItem>
            </Command.Group>

            {/* System */}
            <Command.Group className="px-2 py-1.5">
              <CommandGroupHeading>System</CommandGroupHeading>
              <CommandItem
                onSelect={() =>
                  runCommand(
                    () => void navigate({ to: "/settings", search: {} }),
                  )
                }
                icon={Settings01Icon}
                shortcut="g s"
              >
                Go to Settings
              </CommandItem>
            </Command.Group>
          </Command.List>
        </div>
      </div>
    </Command.Dialog>
  );
}

function CommandGroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

interface CommandItemProps {
  children: React.ReactNode;
  icon: React.ComponentProps<typeof Icon>["icon"];
  shortcut?: string;
  onSelect: () => void;
}

function CommandItem({ children, icon, shortcut, onSelect }: CommandItemProps) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="relative flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      <Icon icon={icon} className="text-muted-foreground" />
      <span className="flex-1">{children}</span>
      {shortcut && (
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
