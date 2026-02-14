# Workflow UI Migration Plan (Copy from `../notifications-workflow`)

## 1. Goal

Port the workflow editor UI from `../notifications-workflow` into `apps/admin-ui` with high behavior parity, while keeping scheduling-app backend as the canonical graph/runtime model.

Primary target:
- Replace current placeholder workflow pages in `admin-ui` with a working editor, trigger config, save/validate/publish flow, and run visibility.

---

## 2. Locked Decisions

1. Default trigger for new workflows:
- `type: "domain_event"`
- `domain: "appointment"`
- `startEvents: ["appointment.created"]`
- `restartEvents: []`
- `stopEvents: []`

2. Unknown/unregistered trigger behavior:
- Fail closed.
- No fallback-to-start behavior.
- Block save/publish and surface explicit error in UI/API.

3. Keep migration seam:
- Keep `apps/admin-ui/src/lib/workflows/reference-adapter.ts`.
- Keep `docs/plans/workflow-ui-adapter-contract.md`.

---

## 3. Non-Goals

- No Svix redesign.
- No workflow engine rewrite in this plan.
- No compatibility shims for removed/legacy UI behavior.

---

## 4. Current State

- `admin-ui` workflow routes are placeholders (`/workflows`, `/workflows/$workflowId`).
- Adapter scaffolding exists with tests:
  - `apps/admin-ui/src/lib/workflows/reference-adapter.ts`
  - `apps/admin-ui/src/lib/workflows/reference-adapter.test.ts`
- Backend already supports canonical workflow draft/validate/publish/run APIs.

---

## 5. Execution Strategy

Use a thin frontend facade:
- Reference UI components + interactions copied from `notifications-workflow`.
- Adapter converts Reference graph <-> Canonical DTO.
- API facade maps Reference-like operations to scheduling backend routes.

This keeps copy parity high while preserving backend contract.

---

## 6. Phases

## Phase 0: Contract and Guardrail Freeze

### Tasks
- Keep adapter contract doc as source of truth.
- Encode default trigger factory (`appointment.created`) in adapter/facade.
- Add fail-closed guard in adapter conversion:
  - Unknown trigger type -> typed conversion error.
- Add UI error state for conversion failures (blocking save/publish).

### Exit Criteria
- Adapter unit tests cover:
  - default trigger creation
  - unknown trigger fail-closed behavior
  - round-trip fixtures still passing

---

## Phase 1: Copy UI Shell

### Tasks
- Copy workflow editor shell components from `../notifications-workflow` into `apps/admin-ui/src/features/workflows/`.
- Copy required workflow-specific UI primitives used by editor panels.
- Wire routing:
  - `/workflows` list page
  - `/workflows/$workflowId` detail/editor page
- Remove placeholder “UI removed” content.

### Exit Criteria
- Routes render editor shell with no runtime errors.
- `pnpm typecheck` passes.

---

## Phase 2: Data Facade and Loading

### Tasks
- Create `admin-ui` workflow client facade:
  - list/get definition
  - get catalog
  - update draft
  - validate draft
  - publish draft
  - run draft
  - list runs and step logs
- Apply adapter on load:
  - canonical graph -> reference graph
  - canonical catalog -> reference catalog model
- Initialize empty workflows with locked default trigger.

### Exit Criteria
- Opening existing workflows renders correct graph/trigger config.
- New workflows open with `appointment.created` default trigger.

---

## Phase 3: Editing and Save/Publish

### Tasks
- Enable trigger editing (domain event + schedule).
- Enable node/edge editing (action/wait/condition).
- Save draft path:
  - reference graph -> canonical graph via adapter
  - fail-closed conversion errors surfaced in UI
- Validate/publish actions with revision conflict handling.

### Exit Criteria
- User can edit, save, validate, publish end-to-end.
- Unknown trigger types cannot be saved/published.

---

## Phase 4: Run/Debug Parity

### Tasks
- Wire run-draft action from editor.
- Add runs list/detail panels.
- Add step-log viewer.
- Apply status normalization for reference-style status display.

### Exit Criteria
- User can trigger draft run and inspect status/logs from UI.

---

## Phase 5: Hardening and Cleanup

### Tasks
- Add/expand tests:
  - adapter tests
  - route-level UI tests for save/publish failure states
  - optional integration test for fail-closed trigger behavior
- Run quality gates:
  - `pnpm lint`
  - `pnpm typecheck`
  - targeted workflow tests
- Update docs:
  - workflow UI architecture notes
  - known deliberate deviations from reference app

### Exit Criteria
- Lint + typecheck pass.
- Workflow editor stable for day-to-day internal use.

---

## 7. Work Breakdown (Implementation Order)

1. Phase 0 guardrails (default + fail-closed).
2. Phase 1 route/component shell copy.
3. Phase 2 facade + load mapping.
4. Phase 3 save/validate/publish flow.
5. Phase 4 runs/logs.
6. Phase 5 hardening.

---

## 8. Risks and Mitigations

1. Reference UI assumes webhook trigger semantics.
- Mitigation: enforce adapter mapping and fixture tests for domain-event semantics.

2. Hidden fallback paths allow unknown trigger types through.
- Mitigation: explicit fail-closed checks in adapter + compile/validate path + tests.

3. Drift between copied UI and backend DTO contract.
- Mitigation: keep adapter contract doc and round-trip fixtures as required gate.

---

## 9. Definition of Done

- Workflow pages in `admin-ui` are fully functional (no placeholder).
- New workflows default to `appointment.created`.
- Unknown triggers fail closed with clear user-visible errors.
- Save/validate/publish/run/log flows work end-to-end.
- Lint/typecheck/tests pass.
