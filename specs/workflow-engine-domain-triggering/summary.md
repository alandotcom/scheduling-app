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

## Implementation Status
The plan is complete through Step 12. Workflow engine and editor parity is now implemented with required adaptations for this repo:

- Canonical domain-event trigger ingress (`packages/dto/src/schemas/domain-event.ts`) drives workflow orchestration.
- Workflow management and execution APIs are exposed through oRPC with admin-only mutations and authenticated read access.
- Workflow persistence is org-scoped with RLS enforcement across all workflow tables.
- Admin UI includes workflow list, editor, trigger configuration, autosave, and runs/logs/events/status panels.

## Operational Notes
- Architecture and runtime behavior are documented in `docs/ARCHITECTURE.md`.
- Workflow-specific usage and smoke-validation guidance are documented in `docs/guides/workflow-engine-domain-events.md`.
