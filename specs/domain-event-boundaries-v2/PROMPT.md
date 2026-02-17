# Objective

Implement the journey domain-event boundary cutover so journeys are strictly appointment-only, while preserving full multi-domain event support for webhooks/integrations.

# Spec Reference

- Primary spec package: `specs/domain-event-boundaries-v2/`
- Required docs: `requirements.md`, `design.md`, `plan.md`, `research/03-gap-matrix.md`, `research/04-remediation-checklist.md`

# Key Requirements

1. Enforce appointment-only journey trigger scope at DTO + API boundaries.
2. Keep global domain-event taxonomy unchanged for integration/webhook fanout.
3. Journey trigger UX must be intent-first:
   - no domain selector
   - fixed lifecycle mapping only
   - no user-editable correlation path
   - filters remain available as advanced optional controls (collapsed by default)
4. Hard reset/fresh-start posture:
   - no backward-compat shims
   - no migration path for old cross-domain journey configs
5. Non-appointment journey configs must be impossible to author/save.

# Implementation Guidance

1. Introduce/standardize journey-specific trigger contract (appointment lifecycle only) separate from broad `DomainEventType`.
2. Update journey graph validation to require the journey-specific trigger schema.
3. Ensure create/update journey endpoints hard-reject non-appointment trigger payloads with structured validation errors.
4. Update admin journey trigger UI/editor state/defaults to emit only canonical fixed lifecycle trigger config.
5. Preserve integration fanout + webhook behavior for non-appointment events.
6. Update stale docs referencing legacy/generic workflow trigger behavior.

# Acceptance Criteria (Given-When-Then)

1. Given a journey payload with trigger `domain="client"`, when create/update is submitted, then validation fails and nothing is persisted.
2. Given a journey payload with non-canonical trigger event sets, when create/update is submitted, then validation fails.
3. Given a journey payload containing custom correlation path, when create/update is submitted, then validation fails.
4. Given a user opens journey trigger configuration, when viewing controls, then domain selector and editable lifecycle event pickers are absent.
5. Given a user edits trigger filters, when expanding advanced options, then filters are available and editable.
6. Given non-appointment events are emitted by platform services, when integration/webhook fanout runs, then behavior remains unchanged.
7. Given appointment lifecycle events are emitted, when journey runtime ingests events, then start/restart/stop behavior continues to function correctly.

# Delivery Constraints

- Follow `specs/domain-event-boundaries-v2/plan.md` incrementally.
- Keep code consistent with existing project patterns.
- Do not add compatibility layers or feature flags for old behavior.
- Run required quality gates before completion (`format`, `lint`, `typecheck`, `test`).
