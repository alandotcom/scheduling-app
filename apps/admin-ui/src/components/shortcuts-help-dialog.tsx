import { useMemo, useState } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { EntityModal } from "@/components/entity-modal";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { formatShortcut } from "@/lib/shortcuts";

interface ShortcutRow {
  shortcut: string;
  description: string;
  searchTerms?: string[];
}

interface ShortcutSection {
  title: string;
  rows: ShortcutRow[];
}

interface ShortcutsHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "General",
    rows: [
      { shortcut: "meta+k", description: "Open command menu" },
      { shortcut: "meta+enter", description: "Save or submit" },
      { shortcut: "escape", description: "Back" },
      { shortcut: "meta+/", description: "View keyboard shortcuts" },
      { shortcut: "c", description: "Create new item" },
    ],
  },
  {
    title: "Navigation",
    rows: [
      { shortcut: "g d", description: "Go to dashboard" },
      { shortcut: "g a", description: "Go to appointments" },
      { shortcut: "g p", description: "Go to clients" },
      { shortcut: "g c", description: "Go to calendars" },
      { shortcut: "g t", description: "Go to appointment types" },
      { shortcut: "g r", description: "Go to resources" },
      { shortcut: "g l", description: "Go to locations" },

      { shortcut: "g s", description: "Go to settings" },
      { shortcut: "meta+f", description: "Focus filter/search" },
      { shortcut: "meta+l", description: "Focus list panel" },
      { shortcut: "meta+d", description: "Focus detail panel" },
    ],
  },
  {
    title: "Lists",
    rows: [
      {
        shortcut: "j",
        description: "Move down",
        searchTerms: ["arrowdown", "next"],
      },
      {
        shortcut: "k",
        description: "Move up",
        searchTerms: ["arrowup", "prev"],
      },
      { shortcut: "enter", description: "Open selected row" },
      { shortcut: "escape", description: "Close selected detail" },
    ],
  },
];

function splitShortcutSequence(shortcut: string) {
  return shortcut
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function ShortcutKeys({ shortcut }: { shortcut: string }) {
  const steps = splitShortcutSequence(shortcut);

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, index) => (
        <div
          key={`${shortcut}-${step}-${index}`}
          className="flex items-center gap-1.5"
        >
          <kbd className="inline-flex h-6 items-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground">
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

function ShortcutSectionView({
  title,
  rows,
}: {
  title: string;
  rows: ShortcutRow[];
}) {
  return (
    <section className="space-y-3">
      <h3 className="px-1 text-sm font-semibold tracking-tight">{title}</h3>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div
            key={`${title}-${row.shortcut}-${row.description}`}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
          >
            <span className="text-sm text-muted-foreground">
              {row.description}
            </span>
            <ShortcutKeys shortcut={row.shortcut} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ShortcutsHelpDialog({
  open,
  onOpenChange,
}: ShortcutsHelpDialogProps) {
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return SHORTCUT_SECTIONS;

    return SHORTCUT_SECTIONS.map((section) => {
      const rows = section.rows.filter((row) => {
        const haystack = [
          section.title,
          row.description,
          row.shortcut,
          ...(row.searchTerms ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      });
      return { ...section, rows };
    }).filter((section) => section.rows.length > 0);
  }, [normalizedQuery]);

  return (
    <EntityModal
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard Shortcuts"
      className="sm:h-[min(92dvh,54rem)] sm:min-h-[36rem] sm:max-w-2xl"
    >
      <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="space-y-5">
          <div className="relative">
            <Icon
              icon={Search01Icon}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shortcuts"
              className="pl-10"
              autoFocus
            />
          </div>

          {filteredSections.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              No shortcuts match your search.
            </p>
          ) : (
            <div className="space-y-6">
              {filteredSections.map((section) => (
                <ShortcutSectionView
                  key={section.title}
                  title={section.title}
                  rows={section.rows}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </EntityModal>
  );
}
