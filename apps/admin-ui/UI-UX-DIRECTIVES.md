# Admin UI/UX Directives

This document captures all UI/UX requirements, patterns, and outstanding work for the scheduling admin UI.

---

## ⚠️ CRITICAL: Drawer Pattern is Fundamentally Broken

**The current drawer-based workflow is terrible UX.** Users must:
1. Click something on the left side of the screen (table row)
2. Move mouse all the way to the right (drawer opens)
3. Interact with drawer
4. Move mouse all the way back to the left
5. Repeat endlessly

This creates exhausting cross-screen mouse movement and is disorienting.

**This entire interaction model needs to be replaced.** Possible alternatives:
- **Inline row expansion** - Click row, details expand below it (like Notion, Linear)
- **Inline editing** - Edit directly in table cells
- **Popovers near trigger** - Small popover appears near where you clicked
- **Split pane** - Fixed master/detail layout (like email clients)
- **Actions stay local** - Buttons and actions appear within/near the row

**TODO:** Redesign the entire interaction model to minimize mouse movement and keep actions close to their triggers.

---

## Table of Contents

1. [Core Design Principles](#core-design-principles)
2. [Interaction Patterns](#interaction-patterns)
3. [Component Standards](#component-standards)
4. [Page-by-Page Requirements](#page-by-page-requirements)
5. [Implementation Status](#implementation-status)
6. [Outstanding Work](#outstanding-work)
7. [Known Bugs](#known-bugs)
8. [Success Metrics](#success-metrics)

---

## Core Design Principles

### 1. Information Density Over Clicks

**Problem:** Users can't see what they need to make decisions. Every piece of useful information is hidden behind clicks.

**Solution:** Show relevant data inline. Use badges, counts, and preview text to surface key information without requiring navigation.

| Pattern | Bad | Good |
|---------|-----|------|
| Relationship counts | Click icon to see | Badge showing "3 calendars" |
| Status | Just a colored dot | Badge with status text |
| Timestamps | Just date | "Feb 13, 10:30 AM (15 min)" |
| Contact info | Hidden in detail view | Email/phone visible in list |

### 2. Keyboard-First Design

Every action should be accessible via keyboard. Power users should never need to touch a mouse.

| Key | Action |
|-----|--------|
| `Cmd+K` | Open command palette |
| `Cmd+N` | Create new (context-aware) |
| `g a` | Go to appointments |
| `g c` | Go to calendars |
| `g t` | Go to appointment types |
| `g l` | Go to locations |
| `g r` | Go to resources |
| `g p` | Go to clients (people) |
| `j` / `↓` | Move down in list |
| `k` / `↑` | Move up in list |
| `Enter` | Open selected item |
| `Esc` | Close drawer/modal/palette |
| `x` | Toggle select (for bulk) |
| `Shift+Click` | Multi-select range |

### 3. Stay in Context

Users should never lose their place. Editing happens in drawers, not separate pages.

**Rules:**
- Click a row → Opens drawer (stays on same URL or uses query param)
- Browser back → Closes drawer, returns to list
- Deep routes (e.g., `/calendars/$id/availability`) → Should be drawer tabs instead
- Modal for creation, drawer for viewing/editing

### 4. Right-Click Everything

Every interactive row should have a context menu with all available actions.

**Context menu structure:**
```
View Details
[Separator if entity-specific actions follow]
Entity-specific actions...
[Separator]
Edit
Delete (destructive style)
```

### 5. Compact Layout

Reduce whitespace. Information density matters.

| Element | Old | New |
|---------|-----|-----|
| Page padding | `p-10` (40px) | `p-6` (24px) |
| Section margins | `mt-10` | `mt-6` |
| Card padding | `p-6` to `p-10` | `p-5` to `p-6` |
| Content max-width | None (full width) | `max-w-7xl` or `1400px` |

### 6. Filter Patterns

Filters should not dominate the page. Use collapsible popovers.

**Pattern:**
```
[Filters ▾] [Active filter badges that can be dismissed]

Click "Filters" to expand:
┌────────────────────────┐
│ Calendar: [All ▾]      │
│ Type: [All ▾]          │
│ Status: [All ▾]        │
│ Date: [From] - [To]    │
│ [Apply] [Clear]        │
└────────────────────────┘
```

---

## Interaction Patterns

### Table Rows

All table rows must be:
1. **Clickable** - Click opens drawer
2. **Hoverable** - `hover:bg-muted/50 transition-colors cursor-pointer`
3. **Context-menu enabled** - Right-click shows actions

```tsx
<ContextMenu items={getContextMenuItems(item)}>
  <TableRow
    className="cursor-pointer hover:bg-muted/50 transition-colors"
    onClick={() => openDrawer(item)}
  >
    {/* cells */}
  </TableRow>
</ContextMenu>
```

### Drawers

Drawers slide in from the right and contain:
1. **Header** with title and close button
2. **Tabs** (if multiple sections)
3. **Body** with scrollable content
4. **Footer** with destructive actions (delete)

**Width options:** `sm` (320px), `md` (400px), `lg` (500px), `xl` (600px)

**URL integration:** Use query params for drawer state:
- List: `/calendars`
- Drawer open: `/calendars?selected=cal-123`
- Tab in drawer: `/calendars?selected=cal-123&tab=availability`

### Modals

Use modals for:
- Creating new entities
- Confirmation dialogs
- Complex multi-step flows (like booking)

### Forms

**Inline vs Drawer:**
- Simple create forms → Inline card on page (current pattern)
- Edit forms → Inside drawer
- Complex forms → Modal

**Validation:**
- Use `react-hook-form` with `zodResolver`
- Show errors below inputs
- Use `aria-describedby` and `aria-invalid` for accessibility

### Delete Confirmation

Always use `DeleteConfirmDialog` component:
```tsx
<DeleteConfirmDialog
  open={!!deletingItemId}
  onOpenChange={closeDelete}
  onConfirm={handleDelete}
  title="Delete [Entity]"
  description="Are you sure? This action cannot be undone."
  isPending={deleteMutation.isPending}
/>
```

---

## Component Standards

### Icons

Use Hugeicons with the `Icon` wrapper component:
```tsx
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";

<Icon icon={Add01Icon} className="size-4" />

// For buttons with icons:
<Button>
  <Icon icon={Add01Icon} data-icon="inline-start" />
  Add Item
</Button>
```

### Badges

Use semantic variants:
- `default` - Neutral information
- `secondary` - Less emphasis
- `success` - Confirmed, completed, active
- `destructive` - Cancelled, error, no-show
- `outline` - Subtle emphasis

### Buttons

**Sizes:** `default`, `sm`, `xs`, `icon`, `icon-sm`

**Variants:** `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`

**Patterns:**
```tsx
// Primary action
<Button>Save</Button>

// Secondary action
<Button variant="outline">Cancel</Button>

// Destructive action (in footer)
<Button variant="destructive" size="sm">Delete</Button>

// Icon-only button
<Button variant="ghost" size="icon-sm">
  <Icon icon={PencilEdit01Icon} />
</Button>

// Link-style button
<Button variant="ghost" size="sm" asChild>
  <Link to="/somewhere">View all</Link>
</Button>
```

### Select Components

Handle empty/none values properly:
```tsx
<Select
  value={selectedValue ?? "none"}
  onValueChange={(v) => v && setValue(v === "none" ? undefined : v)}
>
  <SelectTrigger>
    <SelectValue placeholder="Select...">
      {selectedItem?.name ?? "None selected"}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="none">None</SelectItem>
    {items.map((item) => (
      <SelectItem key={item.id} value={item.id}>
        {item.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Toast Notifications

Use `sonner` for all notifications:
```tsx
import { toast } from "sonner";

toast.success("Item created successfully");
toast.error(error.message || "Failed to create item");
```

---

## Page-by-Page Requirements

### Dashboard (`/`)

**Current State:** ✅ Implemented with real data

**Requirements:**
- [x] Stats cards with live counts
- [x] Today's schedule list with clickable appointments
- [x] "Needs Attention" section with alerts
- [x] Quick "New Appointment" button
- [ ] Calendar heat map showing busy days
- [ ] Quick actions for common tasks
- [ ] Upcoming appointments preview (next 7 days)

**Stats to show:**
- Today's appointment count
- This week's appointment count
- Total clients
- Active calendars
- Pending confirmations (alert)
- No-shows this week (alert)

### Appointments (`/appointments`)

**Current State:** ✅ Mostly implemented

**Requirements:**
- [x] Clickable rows opening drawer
- [x] Context menu with all actions
- [x] Booking modal with availability calendar
- [x] Appointment drawer with details
- [x] Status change actions (confirm, cancel, no-show)
- [ ] Reschedule flow (API exists, UI incomplete)
- [ ] Bulk selection with checkboxes
- [ ] Bulk actions toolbar (cancel multiple, export)
- [ ] Show duration in time column: "10:30 AM (15 min)"
- [ ] Show end time or duration badge
- [ ] Notes preview/indicator in list
- [ ] Filter popover instead of inline filters

**Drawer tabs:**
- Details (status, time, type, calendar, client)
- Notes (inline edit)
- History (status changes, modifications)

**Missing columns/info:**
- Duration
- End time (optional)
- Notes indicator
- Timezone display

### Calendars (`/calendars`)

**Current State:** ✅ Mostly implemented

**Requirements:**
- [x] Clickable rows opening drawer
- [x] Context menu
- [x] Drawer with Details, Availability, Appointments tabs
- [ ] Show appointment count badge in list
- [ ] Show next appointment preview in list
- [ ] Availability indicator (green = set up, red = needs config)
- [ ] Weekly hours editor directly in drawer (not just summary)
- [ ] Date override management in drawer
- [ ] Blocked time management in drawer

**Current problem:** Availability editing still requires navigating to `/calendars/$id/availability`. Should be fully editable in drawer.

**List columns to add:**
- "12 appointments this week" badge
- Next appointment preview
- Availability status indicator

### Appointment Types (`/appointment-types`)

**Current State:** ✅ Mostly implemented

**Requirements:**
- [x] Clickable rows opening drawer
- [x] Context menu
- [x] Drawer with Details, Calendars, Resources tabs
- [ ] Show linked calendar count in list
- [ ] Show required resource count in list
- [ ] Show total bookings badge
- [ ] Calendar linking UI in drawer (checkboxes)
- [ ] Resource requirement UI in drawer

**List columns to add:**
- "3 calendars" badge
- "1 resource" badge
- "47 appointments" badge

### Locations (`/locations`)

**Current State:** ✅ Implemented

**Requirements:**
- [x] Clickable rows opening drawer
- [x] Context menu
- [x] Drawer with Details, Calendars, Resources tabs
- [ ] Show related counts in list

**List columns to add:**
- "2 calendars" badge
- "3 resources" badge

### Resources (`/resources`)

**Current State:** ✅ Implemented

**Requirements:**
- [x] Clickable rows opening drawer
- [x] Context menu
- [x] Drawer with edit form
- [ ] Show appointment types that require this resource
- [ ] Show current availability (booked vs free today)
- [ ] Utilization metrics

**Note:** Removed "Appointment Types" tab from drawer because the API doesn't return `requiredResources` in the appointment types list. Would need a dedicated API endpoint.

### Clients (`/clients`)

**Current State:** ✅ Implemented

**Requirements:**
- [x] Full CRUD implementation
- [x] Search by name/email
- [x] Clickable rows opening drawer
- [x] Context menu with "Book Appointment" action
- [x] Drawer with Details and Appointment History tabs
- [ ] Show appointment count in list
- [ ] Show last visit date in list
- [ ] Pre-fill client when booking from client page

**List columns to add:**
- Appointment count badge
- Last visit date

---

## Implementation Status

### Completed ✅

1. **Foundation**
   - Command palette (Cmd+K)
   - Drawer component with tabs
   - Context menu component
   - Filter popover component
   - Keyboard navigation hooks
   - Navigation shortcuts

2. **Appointments**
   - Appointment booking modal
   - Appointment drawer
   - Clickable rows + context menus
   - Status change actions

3. **Calendars**
   - Calendar drawer with tabs
   - Clickable rows + context menus
   - Availability summary display

4. **Appointment Types**
   - Drawer with tabs
   - Clickable rows + context menus

5. **Locations**
   - Drawer with relationship tabs
   - Clickable rows + context menus

6. **Resources**
   - Drawer with edit form
   - Clickable rows + context menus

7. **Clients**
   - Full CRUD implementation
   - Search functionality
   - Drawer with appointment history
   - Clickable rows + context menus

8. **Dashboard**
   - Real data display
   - Stats cards
   - Today's schedule
   - Needs attention alerts

### Partially Complete 🟡

1. **Availability Editing** - Summary shown in drawer, but full editing still on separate page
2. **Appointment Reschedule** - API exists, UI flow not fully implemented
3. **Bulk Operations** - No bulk selection or bulk actions yet

### Not Started ❌

1. **List Relationship Badges** - Showing counts like "3 calendars" in table rows
2. **Calendar Heat Map** - Visual calendar showing busy/free days
3. **Advanced Filters** - Full filter popover implementation
4. **Bulk Selection** - Checkbox column for multi-select
5. **Bulk Actions** - Cancel multiple, export, etc.
6. **Notes Inline Edit** - Edit notes directly in drawer
7. **Appointment History Tab** - Show status change log
8. **Resource Utilization** - Show availability metrics

---

## Outstanding Work

### High Priority

1. **Finish Appointment Drawer**
   - Add reschedule button that opens date/time picker
   - Add inline notes editing
   - Add history/audit log tab

2. **Add Relationship Badges to Lists**
   ```tsx
   // In table row
   <TableCell>
     <Badge variant="secondary">3 calendars</Badge>
   </TableCell>
   ```

3. **Implement Bulk Selection**
   - Add checkbox column to appointments table
   - Add "Select all" in header
   - Show bulk action toolbar when items selected

4. **Move Availability Editing to Drawer**
   - Weekly hours editor component
   - Date override list with add/edit/delete
   - Blocked time list with add/edit/delete

### Medium Priority

5. **Filter Popover Pattern**
   - Create `FilterPopover` component
   - Replace inline filters on appointments page
   - Add filter presets (Today, This Week, Pending)

6. **URL-based Drawer State**
   - Update routes to use query params
   - Support direct links to drawer open state
   - Handle browser back/forward correctly

7. **Keyboard Navigation**
   - j/k to move in lists
   - Enter to open selected
   - x to toggle selection
   - Implement focus management

8. **Notes Preview in Lists**
   - Show truncated notes or icon indicator
   - Tooltip on hover with full notes

### Lower Priority

9. **Calendar Heat Map Widget**
   - Month view showing appointment density
   - Click date to filter appointments

10. **Resource Utilization Metrics**
    - Show booked vs available
    - Daily utilization percentage

11. **Client Pre-fill in Booking**
    - Pass client ID to appointment modal
    - Pre-fill client search

12. **Export Functionality**
    - Export appointments to CSV
    - Export client list

---

## Known Bugs

### Critical

1. **None identified currently**

### Major

1. **Form Reset on Drawer Open**
   - Drawers use `useState` for form reset, should use `useEffect`
   - Form values may not update when switching between items

2. **Availability Page Still Separate**
   - Should be merged into calendar drawer
   - Current `/calendars/$id/availability` route should be deprecated

### Minor

1. **Select Value Display**
   - Some selects show raw value instead of label when controlled
   - Need to always provide explicit `SelectValue` children

2. **Drawer Tab State**
   - Tab state resets when drawer closes and reopens
   - Should remember last tab or reset to "details"

3. **Client Search Debounce**
   - Search triggers on every keystroke
   - Should debounce input

---

## Success Metrics

| Metric | Before | Target | Current |
|--------|--------|--------|---------|
| Clicks to book appointment | 7-9 | 3 | ~4 |
| Clicks to view appointment details | ∞ | 1 | 1 ✅ |
| Clicks to reschedule | ∞ | 4 | ∞ (not implemented) |
| Clicks to confirm appointment | ∞ | 2 | 2 ✅ |
| Clicks to edit calendar availability | 4+ | 2 | 3 |
| Clicks to see calendar's appointments | ∞ | 2 | 2 ✅ |
| Clicks to see type's relationships | 2 | 1 | 1 ✅ |
| Keyboard shortcut coverage | 0% | 90% | ~30% |
| Context menu coverage | 0% | 100% | 100% ✅ |
| Browser back works correctly | No | Yes | Partial |

---

## File Reference

### Components Created

| File | Purpose |
|------|---------|
| `components/command-palette.tsx` | Cmd+K interface |
| `components/drawer.tsx` | Reusable slide-out panel with tabs |
| `components/context-menu.tsx` | Right-click menu wrapper |
| `components/filter-popover.tsx` | Collapsible filter UI |
| `components/appointment-modal.tsx` | Booking with availability calendar |
| `components/appointment-drawer.tsx` | Appointment detail/edit |
| `components/calendar-drawer.tsx` | Calendar with tabs |
| `components/location-drawer.tsx` | Location with relationships |
| `components/resource-drawer.tsx` | Resource edit |
| `components/client-drawer.tsx` | Client with history |
| `hooks/use-keyboard-shortcuts.ts` | Navigation shortcuts |

### Routes Modified

| Route | Changes |
|-------|---------|
| `_authenticated/index.tsx` | Real dashboard data |
| `_authenticated/appointments/index.tsx` | Clickable rows, drawer, modal |
| `_authenticated/calendars/index.tsx` | Clickable rows, drawer |
| `_authenticated/appointment-types/index.tsx` | Clickable rows, drawer |
| `_authenticated/locations.tsx` | Clickable rows, drawer |
| `_authenticated/resources.tsx` | Clickable rows, drawer |
| `_authenticated/clients.tsx` | Full implementation |

### Routes to Deprecate

| Route | Replacement |
|-------|-------------|
| `_authenticated/appointments/new.tsx` | `appointment-modal.tsx` |
| `_authenticated/calendars/$calendarId/availability.tsx` | Should merge into `calendar-drawer.tsx` |
| `_authenticated/appointment-types/$typeId/calendars.tsx` | Should merge into drawer |
| `_authenticated/appointment-types/$typeId/resources.tsx` | Should merge into drawer |

---

## Appendix: Design System Notes

### Colors

Use semantic color tokens:
- `text-foreground` - Primary text
- `text-muted-foreground` - Secondary text
- `text-destructive` - Error text
- `bg-card` - Card backgrounds
- `bg-muted` - Subtle backgrounds
- `border-border` - Default borders
- `border-border/50` - Lighter borders

### Typography

- Page title: `text-2xl font-semibold tracking-tight`
- Section title: `text-lg font-semibold tracking-tight`
- Card title: `text-lg font-semibold`
- Label: `text-sm font-medium text-muted-foreground`
- Body: Default (no classes needed)
- Small: `text-sm text-muted-foreground`

### Spacing Scale

Use Tailwind's spacing scale:
- `gap-1` (4px) - Tight inline spacing
- `gap-2` (8px) - Default inline spacing
- `gap-3` (12px) - Comfortable inline spacing
- `gap-4` (16px) - Section spacing
- `gap-6` (24px) - Large section spacing

### Border Radius

- Cards: `rounded-xl`
- Buttons: `rounded-md` (default)
- Inputs: `rounded-md`
- Badges: `rounded-full`

### Shadows

- Cards: `shadow-sm`
- Hover: `hover:shadow-md`
- Modals: `shadow-xl`
- Dropdowns: `shadow-lg`
