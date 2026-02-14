# Iteration Checkpoint

## Requirements Status
- Requirements clarification is complete and confirmed.
- Confirmed scope:
  - Copy workflow engine + UI capabilities from `../notifications-workflow`.
  - Replace webhook-trigger ingress with domain-event-trigger ingress.
  - Use canonical domain events from `packages/dto/src/schemas/domain-event.ts`.
  - Keep behavior/surfaces equivalent where technically possible.
  - Adapt to oRPC and org-scoped RLS.
- Access model:
  - Admin-only write operations.
  - Read-only visibility for authenticated org members.

## Research Status
Completed research docs:
- `01-reference-inventory.md`
- `02-event-trigger-model.md`
- `03-db-schema-rls-mapping.md`
- `04-api-surface-mapping.md`
- `05-ui-parity-and-authz.md`
- `06-risks-and-compatibility.md`

## Key Conclusions
- Target repo already has domain-event DTOs and emitters, making domain-trigger ingress feasible without new event model.
- Workflow DB/API/runtime are net-new in target and require full import + adaptation.
- Highest-risk implementation area is correlation key derivation per domain event payload.
- RLS adaptation should include `org_id` on all workflow tables with per-org policies and `withOrg(...)` usage.

## Open Decisions Before Design (if any)
- Keep or simplify reference `current workflow` autosave semantics.
- Keep or simplify `visibility/isOwner` semantics under org-role authz.

