# UI Review Design Checklist

Quick reference for pass/fail criteria during UI review.

## Split-Pane Layout

| Item | Pass | Fail |
|------|------|------|
| List/detail layout | Two-column with resizable split | Full-page navigation or modal-only |
| Selection → detail | Click row updates detail panel | Click row navigates away |
| Detail tabs | Tabs within panel (Details, History, etc.) | Separate routes like `/item/$id/tab` |
| Empty state | "Select an item" hint when nothing selected | Broken layout or error |

## Interaction Model

| Item | Pass | Fail |
|------|------|------|
| Row hover | `hover:bg-muted/50 cursor-pointer` | No visual feedback |
| Row click | Opens detail panel | Navigates to new page |
| Context menu | Right-click shows action menu | No context menu |
| Keyboard nav | j/k moves, Enter selects, Esc clears | No keyboard support |

## URL State

| Item | Pass | Fail |
|------|------|------|
| Selection | `?selected=item_123` in URL | State only in React |
| Tab | `&tab=availability` in URL | Tab state lost on refresh |
| Back button | Restores previous selection | Breaks navigation |
| Deep link | `/items?selected=123` opens with selection | Ignores params |

## Information Density

| Item | Pass | Fail |
|------|------|------|
| Relationship counts | Badge: "3 calendars" | Hidden in detail only |
| Status | Badge with text: "Confirmed" | Colored dot only |
| Timestamps | "Feb 13, 10:30 AM (15 min)" | Date only |
| Contact info | Email/phone visible in row | Click to reveal |

## Actions & Mouse Travel

| Item | Pass | Fail |
|------|------|------|
| Primary action | In row or detail header | In page header toolbar |
| Secondary actions | Dropdown in row | Scattered across page |
| Delete action | Detail footer or context menu | Prominent button |
| Bulk actions | Toolbar appears on selection | Modal or separate page |

## Accessibility

| Item | Pass | Fail |
|------|------|------|
| Focus ring | Visible on all interactive elements | Hidden or missing |
| Selected state | `aria-selected="true"` on rows | No ARIA attributes |
| Form errors | `aria-describedby` + `aria-invalid` | Visual only |
| Shortcuts | Documented and working | Undocumented or broken |

## Component Standards

| Item | Pass | Fail |
|------|------|------|
| Icons | `<Icon icon={SomeIcon} />` wrapper | Direct SVG or other library |
| Badge variants | `success`, `destructive`, `secondary` | Custom colors |
| Button sizes | `default`, `sm`, `xs`, `icon`, `icon-sm` | Custom sizing |
| Forms | `react-hook-form` + `zodResolver` | Uncontrolled or manual validation |

## Schedule View (if applicable)

| Item | Pass | Fail |
|------|------|------|
| Event click | Opens detail panel | Modal or navigation |
| Drag reschedule | Confirm only on conflict | Always confirm |
| Availability | Blocked time visually distinct | No shading |
| Now line | Visible with timezone | Missing |

## Severity Guide

- **Critical**: Breaks core interaction model (navigation, selection, keyboard)
- **Important**: Deviates from documented patterns
- **Minor**: Style inconsistency or missing polish
