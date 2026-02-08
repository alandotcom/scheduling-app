# Admin UI — CLAUDE.md

## Commands

```bash
pnpm dev:admin                                    # Dev server (port 5173)
pnpm --filter @scheduling/admin-ui run test       # Run tests (Bun + HappyDOM)
pnpm --filter @scheduling/admin-ui run build      # Production build
pnpm --filter @scheduling/admin-ui run typecheck  # Type-check
pnpm format                                       # Format with Biome (run from root)
```

Before starting the dev server, check for stale processes: `ps aux | grep -E "vite" | grep -v grep`

## Tech Stack

- **Framework:** React 19 + Vite 7
- **Routing/Data:** TanStack Router (file-based) + TanStack Query
- **API:** oRPC client (`@orpc/client`) — typed against `Router` from `@scheduling/api`
- **Auth:** BetterAuth React client with organization plugin
- **Styling:** Tailwind v4 + BaseUI (headless) + shadcn/ui + CVA
- **Forms:** React Hook Form + Zod (`@scheduling/dto` shared schemas)
- **Icons:** HugeIcons (`@hugeicons/react`)
- **Dates:** Luxon
- **Toasts:** Sonner
- **Testing:** Bun test + HappyDOM + MSW + React Testing Library

## Directory Structure

```
src/
  routes/              # File-based routes (TanStack Router)
    __root.tsx         # Root layout
    _authenticated.tsx # Auth guard layout
    _authenticated/    # Protected routes
      index.tsx        # Dashboard
      appointments/    # Has sub-routes and -components/
      calendars/
      clients.tsx
      locations.tsx
      resources.tsx
      settings.tsx
      appointment-types/
  components/
    ui/                # Primitive UI: button, input, select, badge, skeleton, etc.
    *.tsx              # Feature components: drawers, modals, split-pane, workbench
  hooks/               # Custom hooks (use-*.ts, kebab-case)
  lib/                 # Utilities: api.ts, query.ts, auth-client.ts, utils.ts, date-utils.ts
  test-utils/          # renderWithQuery, renderWithProviders, MSW handlers/fixtures
```

**Path alias:** `@/*` maps to `src/*` — use `import { cn } from "@/lib/utils"`.

## Routing

- TanStack Router plugin auto-generates `routeTree.gen.ts` — never edit manually
- `_authenticated.tsx` layout wraps all protected routes (redirects to `/login` if no session)
- Route-specific components live in `-components/` subdirs (e.g., `appointments/-components/`)
- URL search params drive entity selection: `?selected=<id>`, `?tab=<name>`, `?view=<mode>`

## API Integration (oRPC)

Client setup in `src/lib/api.ts` — creates a typed `RouterClient<Router>`:

```typescript
import { api } from "@/lib/api";        // Direct client
import { orpc } from "@/lib/query";      // TanStack Query integration
```

**Queries:**
```typescript
const { data } = useQuery(orpc.appointments.list.queryOptions({ input: { limit: 50 } }));
```

**Mutations:**
```typescript
const mutation = useMutation(
  orpc.appointments.create.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
      toast.success("Created");
    },
  }),
);
```

`useCrudMutations` in `src/hooks/use-crud-mutations.ts` wraps create/update/delete with auto-invalidation. Domain-specific mutation hooks (e.g., `useAppointmentTypeMutations`) add toast messages and extra operations.

## State Management

No global store. State sources:

| Source | Used for |
|--------|----------|
| TanStack Query | Server state (all API data) |
| URL search params | Selection (`?selected=`), tab, view mode, filters |
| `authClient.useSession()` | Auth/session state |
| Local `useState` | Form visibility, editing state, UI toggles |

Active org is in the session. Switching orgs clears the query cache.

## UI Patterns

**Icons:**
```tsx
import { Calendar02Icon } from "@hugeicons/core-free-icons";
<Icon icon={Calendar02Icon} className="size-5" />
```

**Class merging:** `cn()` from `@/lib/utils` (clsx + tailwind-merge).

**Toasts:** `toast.success("Saved")` / `toast.error("Failed")` from `sonner`.

**Loading:** `<Skeleton />` and `<TableSkeleton />` from `@/components/ui/skeleton`.

## Modal & Drawer Patterns

URL-driven detail modals use two hooks together:

1. **`useUrlDrivenModal({ selectedId, hasResolvedEntity })`** — derives `isOpen` from URL state, provides `closeNow()` that sets local dismissed state before URL clears
2. **`useClosingSnapshot(entity)`** — preserves last entity data during close animation to avoid blank content flash

Pattern: close local state first (`closeNow()`), then navigate to clear `?selected=`. Use the snapshot as `displayEntity` for modal content.

```typescript
const { isOpen, closeNow } = useUrlDrivenModal({ selectedId, hasResolvedEntity: !!entity });
const displayEntity = useClosingSnapshot(entity);
```

## Form Patterns

- React Hook Form + `zodResolver` + shared schemas from `@scheduling/dto`
- Use `mode: "onBlur"` for validation timing
- `useResetFormOnOpen({ open, entityKey, values, reset })` — resets form when modal opens or selected entity changes
- `useCrudState<T>()` — manages create/edit/delete UI state (which form is open, which item is being edited/deleted)

## Custom Hooks Reference

| Hook | Purpose |
|------|---------|
| `useUrlDrivenModal` | Derive modal open state from URL selection |
| `useClosingSnapshot` | Preserve entity data during close animation |
| `useResetFormOnOpen` | Reset form when modal opens or entity changes |
| `useCrudMutations` | Generic create/update/delete with auto-invalidation |
| `useCrudState` | Manage create/edit/delete UI state |
| `useKeyboardShortcuts` | Register keyboard shortcuts (supports sequences like `g d`) |
| `useNavigationShortcuts` | Pre-built `g <key>` navigation (dashboard, appointments, etc.) |
| `useListNavigation` | j/k/Enter for list navigation |
| `useFocusZones` | Cmd+L/D/F to focus list/detail/filter panels |
| `useValidateSelection` | Clear URL selection if entity no longer exists |
| `useScheduleAppointments` | Fetch appointments for weekly schedule view |
| `useAppointmentTypeMutations` | CRUD + calendar/resource linking for appointment types |

## Testing

- Co-located test files: `*.test.tsx` / `*.test.ts` next to source
- `renderWithQuery(ui)` — wraps in QueryClientProvider (for component tests)
- `renderWithProviders(component, { initialUrl })` — wraps in QueryClient + TanStack Router (for integration tests)
- MSW handlers in `src/test-utils/msw-handlers.ts` with fixture factories (`createAppointmentFixture`, etc.) and mock data setters (`setMockAppointments`, etc.)
- Call `resetMockData()` between tests

```bash
pnpm --filter @scheduling/admin-ui run test              # All tests
pnpm --filter @scheduling/admin-ui run test --grep "name" # Filter by name
```

## File Naming Conventions

- **Components:** PascalCase (`Icon.tsx`, `FilterPopover.tsx`)
- **Hooks:** kebab-case with `use-` prefix (`use-crud-mutations.ts`)
- **Utils/lib:** kebab-case (`date-utils.ts`, `query-cancellation.ts`)
- **Routes:** kebab-case, `index.tsx` for directory routes
- **Tests:** `*.test.tsx` / `*.test.ts` co-located with source
