# Workflow UI Migration Plan (Reset + Copy-First)

## 1. Goal

Copy the workflow editor UI from `../notifications-workflow` into `apps/admin-ui` with **literal UI/interaction parity first**, then adapt only the minimum seams needed for scheduling-app backend contracts.

Primary outcome:
- The editor looks and behaves like the reference before any scheduling-specific polish.

---

## 2. What We Learned (Important)

1. Approximation-first caused drift.
- Rebuilding a "similar" editor diverged from reference UX quickly.
- Users noticed major differences (toolbar controls, panel behavior, context menu flow, layout density).

2. Single-file implementation is the wrong shape.
- Reference is split across many focused files (`workflow-canvas`, `workflow-toolbar`, `workflow-sidebar-panel`, `node-config-panel`, `workflow-runs`, node components, flow elements).
- Keeping everything in one file burns context and slows iteration.

3. Parity must be judged by structure, not features alone.
- Having save/run/log actions is insufficient if interaction model and component composition differ.

4. Copy-first is mandatory.
- We should copy reference files directly, then adapt seams.
- No large custom rewrites before baseline parity is reached.

---

## 3. Locked Product Decisions

1. Default trigger for new workflows:
- `type: "domain_event"`
- `domain: "appointment"`
- `startEvents: ["appointment.created"]`
- `restartEvents: []`
- `stopEvents: []`

2. Unknown/unregistered trigger behavior:
- Fail closed.
- No fallback behavior.
- Block save/publish and show explicit error.

3. Keep migration seam:
- Keep `apps/admin-ui/src/lib/workflows/reference-adapter.ts`.
- Keep `docs/plans/workflow-ui-adapter-contract.md`.

4. Copy policy:
- Preserve reference file boundaries and component architecture.
- Do not collapse copied surfaces into one editor shell file.

5. Reset scope:
- Delete all current workflow UI WIP and restart from copied reference files.
- Keep backend progress (DTO/API seam work).

6. Parity scope:
- Exact parity target includes both desktop and mobile behavior.

7. Reference feature scope:
- Keep reference affordances (duplicate/public/read-only), then wire/disable only where backend capability is missing.

8. Deletion requirement:
- Add workflow delete support in backend/API and wire it from copied UI.

---

## 4. Non-Goals

- No workflow engine rewrite.
- No Svix redesign.
- No compatibility layer for legacy workflow UI.
- No visual redesign before parity.

---

## 5. Reference-Copy Scope (Must Mirror)

Copy these reference surfaces into scheduling-app equivalents:

1. Workflow surfaces:
- `workflow-canvas.tsx`
- `workflow-toolbar.tsx`
- `workflow-sidebar-panel.tsx`
- `node-config-panel.tsx`
- `workflow-context-menu.tsx`
- `workflow-runs.tsx`

2. Node components:
- `nodes/action-node.tsx`
- `nodes/trigger-node.tsx`
- `nodes/add-node.tsx`

3. Flow primitives:
- `flow-elements/canvas.tsx`
- `flow-elements/controls.tsx`
- `flow-elements/connection.tsx`
- `flow-elements/edge.tsx`
- `flow-elements/node.tsx`
- `flow-elements/panel.tsx`

4. Required UI primitives used by the copied files:
- `ui/button-group.tsx`
- `ui/dropdown-menu.tsx`
- any additional referenced primitives not already present

---

## 6. Seam Adapters (Apply After Copy)

Only adapt these seams to make copied UI work in scheduling-app:

1. Data/API seam:
- Map reference store actions to `orpc.workflows.*` routes.
- Keep backend canonical graph contract intact.

2. Graph seam:
- Canonical graph <-> reference graph through `reference-adapter.ts`.

3. Trigger seam:
- Enforce scheduling default trigger + fail-closed rules.

4. Run seam:
- Use scheduling run endpoints (`runDraft`, `listRuns`, `listRunSteps`, `cancelRun`).

5. Naming seam:
- Persist workflow name via draft update path.

---

## 7. Post-Copy Decisions (Now Resolved)

1. Run UX:
- Keep reference toolbar run behavior visually.
- On run action, open a modal.
- Modal contains:
  - entity type selector with all supported types
  - searchable appointment combobox for appointment selection
- Non-appointment selection is present but run is disabled with TODO message until per-type search is implemented.

2. Workflow deletion UX:
- Add backend delete route now and wire delete action in copied UI.

3. Trigger config scope:
- Keep full reference trigger config UX and map through adapter rules.

4. Reference feature inclusion:
- Keep reference duplicate/public/read-only features in copied UI.
- Any unsupported backend capability must be explicitly documented as a temporary TODO/deviation.

---

## 8. Execution Plan (Restarted)

### Phase A: Clean Restart Baseline

Tasks:
1. Branch + baseline prep
- Create/reset a dedicated migration branch from the agreed base commit.
- Capture current `git status` snapshot in commit message/notes for traceability.

2. Keep/remove scope enforcement
- Keep backend files only (API/DTO/adapter/docs) that are explicitly in-scope.
- Remove all workflow UI exploratory changes that are not literal copies.
- Ensure no newly added ad-hoc UI primitives remain unless copied from reference.

3. Baseline sanity check
- Verify `apps/admin-ui/src/features/workflows/*` is back to clean baseline state.
- Verify backend seam work still exists (name-in-update and planned delete work path).
- Commit a "restart baseline" checkpoint before copy begins.

Exit criteria:
- Clean working tree with explicit baseline commit for restart.

### Phase B: Literal File Copy

Tasks:
1. Copy reference workflow surface files as-is
- `workflow-canvas.tsx`
- `workflow-toolbar.tsx`
- `workflow-sidebar-panel.tsx`
- `node-config-panel.tsx`
- `workflow-context-menu.tsx`
- `workflow-runs.tsx`

2. Copy reference node files as-is
- `nodes/action-node.tsx`
- `nodes/trigger-node.tsx`
- `nodes/add-node.tsx`

3. Copy reference flow-element files as-is
- `flow-elements/canvas.tsx`
- `flow-elements/controls.tsx`
- `flow-elements/connection.tsx`
- `flow-elements/edge.tsx`
- `flow-elements/node.tsx`
- `flow-elements/panel.tsx`

4. Copy dependent workflow config components used by node config panel
- `config/action-grid.tsx`
- `config/action-config.tsx`
- `config/action-config-renderer.tsx`
- `config/condition-config.tsx`
- `config/trigger-config.tsx`
- `config/schema-builder.tsx`

5. Copy required UI primitives from reference where missing
- `ui/button-group.tsx`
- `ui/dropdown-menu.tsx`
- any additional primitives directly imported by copied files

6. Preserve architecture boundaries
- Keep copied file boundaries and component names.
- Do not collapse into `workflow-editor-shell.tsx`.
- Keep container/orchestration thin in route shell.

7. Dependency/import alignment
- Install any missing package dependencies required by copied files.
- Rewrite path aliases only where required for local monorepo structure.
- Resolve all import errors without refactoring copied component logic.

Exit criteria:
- Copied components compile with stubbed seams if needed.

### Phase C: Wiring Through Seams

Tasks:
1. Data/store seam
- Implement scheduling-specific workflow store/actions used by copied components.
- Map copied store actions to `orpc.workflows.*` operations.
- Keep reference interaction model (toolbar/context menu/sidebar) intact.

2. Graph adapter seam
- Convert canonical graph -> reference graph on load.
- Convert reference graph -> canonical graph on save.
- Surface adapter conversion errors in UI (blocking save/publish).

3. Trigger seam
- Enforce default `appointment.created` trigger on create/new workflow.
- Keep unknown trigger behavior fail-closed.
- Verify trigger panel reflects adapter mapping exactly.

4. Draft lifecycle seam
- Wire create/list/get/update/validate/publish draft flows.
- Handle revision conflicts in save/publish.
- Keep copied save affordances (status dots/buttons/toolbar behavior).

5. Run/debug seam
- Wire `runDraft`, `listRuns`, `getRun` (if needed), `listRunSteps`, `cancelRun`.
- Keep copied runs tab behavior and status rendering.

6. Run modal requirement (resolved)
- Trigger run from copied toolbar flow.
- Open run modal with:
  - entity type selector (all supported types)
  - searchable appointment combobox for appointment runs
- For non-appointment types:
  - disable run action
  - show TODO explanation in modal.

7. Naming seam
- Persist workflow name edits through draft update flow.

8. Delete workflow requirement
- Add backend delete workflow route.
- Add DTO schema + input/output types.
- Add API route implementation with org scoping + not-found behavior.
- Wire delete action from copied UI dropdown/menu.

Exit criteria:
- Core editor flows work without changing reference interaction model.

### Phase D: Post-Copy Decisions

Tasks:
1. Apply resolved decisions from Section 7 exactly.
2. Create explicit deviation log (if any) with:
- what differs from reference
- why it differs
- follow-up plan/date.
3. Confirm no unapproved deviations exist in toolbar/panel/context-menu/mobile behavior.

Exit criteria:
- Approved deviation list exists and is implemented.

### Phase E: Hardening

Tasks:
1. Backend/API tests
- Add/extend tests for delete workflow route.
- Add/extend tests for draft naming update.
- Validate existing run/cancel/list step-log route coverage remains green.

2. Adapter tests
- Keep/add tests for default trigger factory and fail-closed unknown trigger behavior.
- Keep round-trip adapter fixtures green.

3. UI tests (route/component level)
- Save/validate/publish success and failure states.
- Run modal behavior:
  - appointment search select -> run enabled
  - non-appointment type -> run disabled + TODO message
- Runs list + step log panel rendering states.

4. Parity QA checks (manual)
- Desktop comparison against reference screens.
- Mobile comparison against reference screens.
- Context-menu add-step, toolbar controls, sidebar tabs, node config workflow.

5. Quality gates
- `pnpm lint`
- `pnpm typecheck`
- relevant targeted tests for workflows.

Exit criteria:
- Quality gates pass and behavior is stable.

---

## 9. Master Task Checklist

### 10.1 Restart
- [ ] A1 Create restart baseline branch/commit.
- [ ] A2 Remove all workflow UI exploratory files/changes.
- [ ] A3 Keep backend seam work only.
- [ ] A4 Verify clean baseline commit exists.

### 10.2 Copy
- [ ] B1 Copy workflow surface files.
- [ ] B2 Copy node files.
- [ ] B3 Copy flow-element files.
- [ ] B4 Copy workflow config files.
- [ ] B5 Copy missing UI primitives from reference.
- [ ] B6 Resolve imports/dependencies.
- [ ] B7 Ensure copied structure is file-split like reference.

### 10.3 Seam Wiring
- [ ] C1 Connect copied store/actions to `orpc` workflow APIs.
- [ ] C2 Wire adapter load/save conversions.
- [ ] C3 Enforce default trigger + fail-closed trigger errors.
- [ ] C4 Wire create/list/get/update/validate/publish.
- [ ] C5 Wire run/runs/step logs/cancel.
- [ ] C6 Implement run modal with appointment search + non-appointment TODO disabled state.
- [ ] C7 Persist workflow name on save.
- [ ] C8 Add delete workflow backend route + wire delete UI action.

### 10.4 Decision Application
- [ ] D1 Apply resolved Section 7 decisions without drift.
- [ ] D2 Record any temporary deviations explicitly.

### 10.5 Hardening
- [ ] E1 Add backend tests for delete + naming update.
- [ ] E2 Keep adapter tests green and expand if needed.
- [ ] E3 Add UI tests for run modal + draft lifecycle + run/log panels.
- [ ] E4 Perform desktop + mobile parity QA.
- [ ] E5 Run lint/typecheck/tests and fix all failures.

---

## 10. Definition of Done

1. UI parity:
- Editor layout, toolbar, context-menu add-step flow, and sidebar tab model match reference architecture.

2. Scheduling requirements:
- New workflows default to `appointment.created`.
- Unknown triggers fail closed.

3. End-to-end functionality:
- Save, validate, publish, run, runs list, cancel, and step logs work.

4. Documentation:
- Any intentional deviations from reference are listed in this plan.

5. Quality:
- `pnpm lint` and `pnpm typecheck` pass.
