# Mobile-First Container/Presentation Pattern

This document defines the admin UI refactor baseline for mobile-first behavior
and route-container architecture.

## Goals

- Mobile-first rendering by default.
- Route files own data fetching, mutations, URL search state, and navigation.
- Presentation components are data-agnostic and receive model + callbacks.
- CRUD list screens render mobile cards on small viewports and desktop tables on
  larger viewports.

## Route Responsibilities (Container)

Route container components should own:

- `useQuery`, `useMutation`, query invalidation, and prefetch integration.
- URL search-param parsing/validation and navigation updates.
- Derived view model data and action handlers.
- Keyboard shortcuts and focus-zone coordination.

Route containers should pass:

- Render-ready values (`model`) to presentation components.
- User-intent callbacks (`actions`) to presentation components.

## Presentation Responsibilities

Presentation components should:

- Avoid direct data hooks (`useQuery`, `useMutation`, ORPC calls).
- Render with mobile-first layouts first, then enhance at breakpoints.
- Keep only local ephemeral UI state (disclosure, local UI toggles).

## Shared UI Primitives

Use these components for list states and responsive list rendering:

- `apps/admin-ui/src/components/entity-list.tsx`
  - `EntityListLoadingState`
  - `EntityListEmptyState`
  - `EntityMobileCardList`
  - `EntityMobileCard`
  - `EntityDesktopTable`
  - `EntityCardField`

Use these components for route-level page scaffolding:

- `apps/admin-ui/src/components/layout/page-scaffold.tsx`
  - `PageScaffold`

## CRUD List Pattern

For each CRUD index route:

1. Keep data and mutations in the route container.
2. Move list/table rendering into `<feature>-list-presentation.tsx`.
3. Render:
   - mobile cards (`EntityMobileCardList`) for small viewports
   - desktop table (`EntityDesktopTable`) for `md+`
4. Keep row actions available in both mobile and desktop renderings.

## QA Checklist

Before marking a route migration complete:

1. Validate mobile card list interactions (open/edit/delete) on small viewport.
2. Validate desktop table interactions remain unchanged.
3. Confirm no horizontal overflow for main list content on mobile.
4. Confirm search-param driven modals/details still open/close correctly.
5. Confirm loading/empty/error states are accessible and visible.
