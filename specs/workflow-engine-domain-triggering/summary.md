# Summary

## Artifact Inventory
- `specs/workflow-engine-domain-triggering/rough-idea.md`
- `specs/workflow-engine-domain-triggering/requirements.md`
- `specs/workflow-engine-domain-triggering/research/00-research-plan.md`
- `specs/workflow-engine-domain-triggering/research/01-reference-inventory.md`
- `specs/workflow-engine-domain-triggering/research/02-event-trigger-model.md`
- `specs/workflow-engine-domain-triggering/research/03-db-schema-rls-mapping.md`
- `specs/workflow-engine-domain-triggering/research/04-api-surface-mapping.md`
- `specs/workflow-engine-domain-triggering/research/05-ui-parity-and-authz.md`
- `specs/workflow-engine-domain-triggering/research/06-risks-and-compatibility.md`
- `specs/workflow-engine-domain-triggering/research/07-iteration-checkpoint.md`
- `specs/workflow-engine-domain-triggering/design.md`
- `specs/workflow-engine-domain-triggering/plan.md`

## Brief Overview
This spec package defines how to port the workflow engine and editor UI from `../notifications-workflow` into this repo with parity-focused behavior, while adapting trigger ingress from webhook events to canonical domain events and adapting persistence/API to org-scoped RLS + oRPC.

Confirmed scope includes:
- all workflow capabilities at launch (engine + UI)
- admin-only write operations, read-only member visibility
- reuse of existing domain-event stream and payloads
- no workflow seed data by default
- active-dev DB approach (update initial schema directly)

## Recommended Next Steps
1. Execute Step 1 from `plan.md`: add workflow DTO schemas/contracts and tests.
2. Execute Step 2 from `plan.md`: add workflow DB tables + RLS + migration snapshot updates.
3. Execute Step 3-4 from `plan.md`: workflow repositories/services and oRPC CRUD routes, then wire list UI.
4. Continue through runtime/orchestration and full editor port steps (5-12).

