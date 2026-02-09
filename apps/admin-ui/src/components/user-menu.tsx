import { useMemo, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import {
  Add01Icon,
  Logout01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import { EntityModal } from "@/components/entity-modal";
import { Button } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import { cn } from "@/lib/utils";

export interface UserMenuOrganization {
  id: string;
  name: string;
  slug?: string | null;
}

interface UserMenuProps {
  userName?: string | null;
  userEmail?: string | null;
  organizations: UserMenuOrganization[];
  activeOrganizationId: string | null;
  onSwitchOrganization: (organizationId: string) => Promise<void>;
  onCreateOrganization: (input: {
    name: string;
    slug?: string;
  }) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function UserMenu({
  userName,
  userEmail,
  organizations,
  activeOrganizationId,
  onSwitchOrganization,
  onCreateOrganization,
  onSignOut,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);

  const initials = useMemo(
    () => userName?.[0] ?? userEmail?.[0]?.toUpperCase() ?? "U",
    [userEmail, userName],
  );

  useSubmitShortcut({
    enabled: createOpen && !creatingOrg,
    onSubmit: () => createFormRef.current?.requestSubmit(),
  });

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: createOpen,
    fields: [
      { id: "org-name", key: "n", description: "Focus organization name" },
      { id: "org-slug", key: "s", description: "Focus organization slug" },
    ],
  });

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Open user menu">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                {initials}
              </span>
            </Button>
          }
        />
        <Popover.Portal>
          <Popover.Positioner sideOffset={8} align="end">
            <Popover.Popup
              className={cn(
                "z-50 w-72 rounded-lg border border-border bg-background p-2 shadow-lg",
                "data-open:animate-in data-closed:animate-out",
                "data-closed:fade-out-0 data-open:fade-in-0",
                "data-closed:zoom-out-95 data-open:zoom-in-95 duration-100",
              )}
            >
              <div className="border-b border-border px-2 py-2">
                <div className="truncate text-sm font-medium">
                  {userName ?? userEmail}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {userEmail}
                </div>
              </div>

              <div className="px-1 py-2">
                <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Switch organization
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {organizations.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      No organizations yet.
                    </p>
                  ) : (
                    organizations.map((organization) => {
                      const isActive = organization.id === activeOrganizationId;
                      return (
                        <button
                          key={organization.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                            "transition-colors hover:bg-muted",
                            isActive && "bg-muted",
                          )}
                          disabled={switchingOrgId !== null}
                          onClick={async () => {
                            setSwitchError(null);
                            setSwitchingOrgId(organization.id);
                            try {
                              await onSwitchOrganization(organization.id);
                              setOpen(false);
                            } catch (error) {
                              setSwitchError(
                                error instanceof Error
                                  ? error.message
                                  : "Failed to switch organization.",
                              );
                            } finally {
                              setSwitchingOrgId(null);
                            }
                          }}
                        >
                          <span className="truncate">{organization.name}</span>
                          {isActive ? (
                            <Icon
                              icon={Tick02Icon}
                              className="size-4 text-primary"
                            />
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
                {switchError ? (
                  <p className="mt-1 px-1 text-xs text-destructive">
                    {switchError}
                  </p>
                ) : null}
              </div>

              <div className="border-t border-border px-1 pt-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  onClick={() => {
                    setCreateError(null);
                    setSwitchError(null);
                    setCreateOpen(true);
                  }}
                >
                  <Icon icon={Add01Icon} className="size-4" />
                  Create organization
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                  onClick={async () => {
                    await onSignOut();
                    setOpen(false);
                  }}
                >
                  <Icon icon={Logout01Icon} className="size-4" />
                  Sign out
                </button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <EntityModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create Organization"
        description="Create a new workspace and switch into it immediately."
      >
        <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <form
            ref={createFormRef}
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const trimmedName = name.trim();
              const trimmedSlug = slug.trim();
              if (!trimmedName) {
                setCreateError("Organization name is required.");
                return;
              }
              setCreateError(null);
              setCreatingOrg(true);
              try {
                await onCreateOrganization({
                  name: trimmedName,
                  slug: trimmedSlug || undefined,
                });
                setName("");
                setSlug("");
                setCreateOpen(false);
                setOpen(false);
              } catch (error) {
                setCreateError(
                  error instanceof Error
                    ? error.message
                    : "Failed to create organization.",
                );
              } finally {
                setCreatingOrg(false);
              }
            }}
          >
            <div
              className="space-y-1.5 relative"
              ref={registerField("org-name")}
            >
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme Scheduling"
                autoFocus
              />
              <FieldShortcutHint shortcut="n" visible={hintsVisible} />
            </div>

            <div
              className="space-y-1.5 relative"
              ref={registerField("org-slug")}
            >
              <Label htmlFor="org-slug">Slug (optional)</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="acme-scheduling"
              />
              <FieldShortcutHint shortcut="s" visible={hintsVisible} />
            </div>

            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingOrg}>
                {creatingOrg ? "Creating..." : "Create"}
                <ShortcutBadge
                  shortcut="meta+enter"
                  className="ml-2 hidden sm:inline-flex"
                />
              </Button>
            </div>
          </form>
        </div>
      </EntityModal>
    </>
  );
}
