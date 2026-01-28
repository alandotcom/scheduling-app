---
name: ui-review
description: UI Design Engineer review for uncommitted changes. Reviews against design system, tests interactions via agent-browser, and validates UX patterns. Use after modifying React components, styles, or UI flows.
allowed-tools: Bash(agent-browser:*), Read, Grep, Glob
---

# UI Design Engineer Review

A senior design engineer review that applies rigorous UX standards to uncommitted UI changes, then verifies interactions via agent-browser.

## Philosophy

UI entropy accumulates silently:

- Design system drift: components diverge from established patterns
- Interaction inconsistency: similar actions behave differently across pages
- Accessibility degradation: focus states and aria attributes erode
- Mouse travel inflation: actions creep away from their triggers
- Information density loss: clicks replace inline data

This review catches drift before it becomes debt. The goal is deletion and consolidation, not additions.

**Review principles:**
1. Question every new abstraction (does it already exist?)
2. Verify interactions match documented patterns
3. Measure mouse travel (actions should be local)
4. Check keyboard accessibility (every action reachable)
5. Validate URL state (selection and tabs in query params)

## Design Standards Reference

This skill enforces standards from two authoritative documents:

### apps/admin-ui/UI-UX-DIRECTIVES.md

Core component standards and interaction patterns:
- Information density over clicks (badges, inline data)
- Keyboard-first design (shortcuts documented)
- Stay in context (drawers not pages)
- Right-click everything (context menus)
- Compact layout (reduced whitespace)
- Filter patterns (collapsible popovers)

### apps/admin-ui/UX-NAV-REDESIGN.md

Split-pane architecture and navigation model:
- Split-pane list/detail layout
- Selection drives detail panel
- Query params for state persistence (`?selected=`, `&tab=`)
- Bulk actions with eligibility checks
- Schedule view integration
- Journey maps with click targets

## Review Scope

Examine all uncommitted changes affecting:

1. **Components** - New or modified React components
2. **Styles** - Tailwind classes, CSS changes
3. **Routes** - Navigation, URL handling
4. **Interactions** - Click handlers, keyboard shortcuts
5. **State** - Query params, selection management

## Review Workflow

### Step 1: Gather Changed Files

```bash
# Get uncommitted UI changes
git diff --name-only HEAD -- 'apps/admin-ui/**'
git diff --cached --name-only -- 'apps/admin-ui/**'
```

Focus on:
- `apps/admin-ui/src/routes/**` - Page components
- `apps/admin-ui/src/components/**` - Shared components
- `apps/admin-ui/src/hooks/**` - Interaction logic

### Step 2: Read Design Standards

Before reviewing, read the relevant sections from:
- `apps/admin-ui/UI-UX-DIRECTIVES.md`
- `apps/admin-ui/UX-NAV-REDESIGN.md`

Match the changed code area to the applicable standards.

### Step 3: Diff-Anchored Review

For each changed file:

1. Read the current file content
2. Compare against design standards
3. Check for:
   - Clickable rows with proper hover states
   - Context menu implementation
   - Keyboard shortcut coverage
   - URL state management
   - Information density (badges, inline data)
   - Action locality (buttons near triggers)

### Step 4: Agent-Browser Verification

Start the dev server and verify interactions:

```bash
# Ensure dev server is running
# If not already running:
pnpm dev &

# Open the affected page
agent-browser open http://localhost:5173

# Login with test credentials
agent-browser snapshot -i
agent-browser fill @email "admin@example.com"
agent-browser fill @password "password123"
agent-browser click @login
agent-browser wait --url "**/appointments" --load networkidle
```

### Step 5: Verify Interactions

Navigate to affected pages and verify:

```bash
# Navigate to the changed page
agent-browser snapshot -i

# Test row click behavior
agent-browser click @row  # Should open detail panel

# Test keyboard navigation
agent-browser press j     # Move selection down
agent-browser press k     # Move selection up
agent-browser press Enter # Open detail

# Test context menu
agent-browser click @row --button right
agent-browser snapshot -i

# Verify URL state
# Check that selection is reflected in URL params
agent-browser snapshot -i

# Capture evidence
agent-browser screenshot review-evidence.png
```

### Step 6: Report Findings

Structure findings as:

```
## UI Review Findings

### Critical (must fix)
- [File:line] Issue description
  - Expected: [from design doc]
  - Actual: [observed behavior]

### Important (should fix)
- [File:line] Issue description

### Minor (consider fixing)
- [File:line] Issue description

### Verified Working
- [Feature] confirmed working via agent-browser
```

## Checklist Items

### Split-Pane Compliance
- [ ] List view on left, detail panel on right
- [ ] Selection updates detail without page navigation
- [ ] Detail panel shows relevant tabs
- [ ] Empty state handled when nothing selected

### Interaction Patterns
- [ ] Rows are clickable with `cursor-pointer hover:bg-muted/50`
- [ ] Context menu on right-click with all actions
- [ ] Keyboard shortcuts work (j/k for nav, Enter for select)
- [ ] Actions appear near their triggers

### URL State
- [ ] Selection stored in `?selected=` param
- [ ] Tab state stored in `&tab=` param
- [ ] Browser back restores previous state
- [ ] Deep links work correctly

### Information Density
- [ ] Relationship counts shown as badges
- [ ] Status shown with meaningful badges
- [ ] Timestamps include duration
- [ ] Contact info visible in list

### Accessibility
- [ ] Focus states visible on all interactive elements
- [ ] `aria-selected` on selected rows
- [ ] `aria-describedby` on form inputs with errors
- [ ] Keyboard navigation complete

### Component Standards
- [ ] Icons use `Icon` wrapper with Hugeicons
- [ ] Badges use semantic variants (success, destructive)
- [ ] Buttons follow size/variant patterns
- [ ] Forms use `react-hook-form` with `zodResolver`

## Common Issues

### Design System Drift
```tsx
// BAD: Custom hover state
className="hover:bg-gray-100"

// GOOD: Use design token
className="hover:bg-muted/50"
```

### Missing Context Menu
```tsx
// BAD: No right-click support
<TableRow onClick={handleClick}>

// GOOD: Wrapped with context menu
<ContextMenu items={getContextMenuItems(item)}>
  <TableRow onClick={handleClick}>
```

### Actions Too Far from Trigger
```tsx
// BAD: Actions in header toolbar
<PageHeader>
  <Button onClick={() => deleteItem(selected)}>Delete</Button>
</PageHeader>

// GOOD: Actions in row or detail panel
<TableRow>
  <DropdownMenu>
    <DropdownMenuItem onClick={() => deleteItem(item.id)}>Delete</DropdownMenuItem>
  </DropdownMenu>
</TableRow>
```

### Missing URL State
```tsx
// BAD: Local state only
const [selected, setSelected] = useState(null)

// GOOD: Synced to URL
const { selected } = Route.useSearch()
const navigate = useNavigate()
// Update via navigate({ search: { selected: id } })
```

## Cleanup

After review:

```bash
agent-browser close
```
