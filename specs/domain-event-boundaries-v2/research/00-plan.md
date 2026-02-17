# Research Plan

## Goal

Determine why implementation remains incomplete relative to `PLAN.md`, with focus on domain-event boundary enforcement (appointment-only journey scope).

## Inputs

- `PLAN.md`
- `specs/workflow-engine-rebuild-appointment-journeys/` artifacts from the last implementation cycle
- Current active code paths in API, DTO, Inngest, and admin UI

## Research Questions

1. Does current runtime execution enforce appointment-only triggers?
2. Do authoring contracts (DTO + API validation + UI) also enforce appointment-only boundaries?
3. Which parts of the old cycle report completion but do not actually enforce boundary constraints?
4. What is the smallest set of guardrails needed to prevent cross-domain trigger drift?

## Approach

1. Compare intended scope from `PLAN.md` vs claimed completion in prior cycle (`progress.md`, `summary.md`).
2. Audit active code paths for:
   - trigger taxonomy definitions
   - journey trigger schema constraints
   - planner/runtime subscriptions
   - UI trigger configuration affordances
3. Produce a gap matrix (implemented, partially implemented, missing).
4. Propose next-step options for requirements/design refinement.

## Status

- In progress
- User-directed starting point: Preliminary research
