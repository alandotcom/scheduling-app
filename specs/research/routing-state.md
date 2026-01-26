# Routing + URL State (TanStack Router)

Goal: use query params for selection (`selected`), tabs (`tab`), and view/date (`view`, `date`) while keeping navigation type-safe.

## Relevant Patterns from TanStack Router
- **Validate and type search params** via `validateSearch` (often with Zod or zod-adapter).
- **Read search params** inside a route component with `Route.useSearch()`.
- **Update search params** with `useNavigate` or `<Link search={...}>`, using a functional updater to merge with previous search state.
- **Preserve search params** during navigation by passing a functional `search` or `search={true}` where supported.

## How This Maps to the Redesign
- Define search schema for each list route (appointments, calendars, etc.) that includes `selected`, `tab`, and optional `view/date`.
- Use `Route.useSearch()` for selection state instead of component-only state.
- Update selection by calling `navigate({ search: (prev) => ({ ...prev, selected: id }) })`.
- Clear selection by removing `selected` from search.

## External References (Official Docs)
- TanStack Router: Validate search params
  - https://tanstack.com/router/latest/docs/framework/react/how-to/validate-search-params
- TanStack Router: useSearch hook
  - https://tanstack.com/router/latest/docs/framework/react/api/router/useSearchHook
- TanStack Router: Search params guide
  - https://tanstack.com/router/latest/docs/framework/react/guide/search-params
- TanStack Router: Navigate with search params
  - https://tanstack.com/router/latest/docs/framework/react/how-to/navigate-with-search-params
