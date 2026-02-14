# Workflow UI Adapter Contract (Reference UI <-> Scheduling Backend)

## Scope

This document freezes the Phase 0 adapter contract for copying the workflow UI from `../notifications-workflow` while keeping scheduling backend canonical workflow DTOs unchanged.

- UI source model: React Flow graph with trigger node config (`Webhook` or `Schedule`).
- Backend source of truth: canonical `workflowGraph` (`trigger` + typed `nodes` + typed `edges`).
- Intentional trigger divergence from reference naming:
  - Reference `Webhook` trigger maps to backend `domain_event` trigger.
  - Reference `Schedule` trigger maps to backend `schedule` trigger.

## Mapping Table: Reference UI -> Canonical Backend

### Trigger mapping

| Reference trigger config key | Canonical key | Notes |
| --- | --- | --- |
| `triggerType = "Webhook"` | `trigger.type = "domain_event"` | Adapter-only semantic rename |
| `domain` | `trigger.domain` | Fallback: infer from first event prefix |
| `webhookCreateEvents` (CSV) | `trigger.startEvents` | Parsed CSV, trimmed, deduped |
| `webhookUpdateEvents` (CSV) | `trigger.restartEvents` | Parsed CSV, trimmed, deduped |
| `webhookDeleteEvents` (CSV) | `trigger.stopEvents` | Parsed CSV, trimmed, deduped |
| `triggerType = "Schedule"` | `trigger.type = "schedule"` | Direct mapping |
| `scheduleExpression` or `scheduleCron` | `trigger.expression` | `scheduleExpression` preferred |
| `scheduleTimezone` | `trigger.timezone` | Defaults to `America/New_York` |

### Node mapping

| Reference node | Canonical node | Notes |
| --- | --- | --- |
| `type = "trigger"` | Top-level `trigger` only | Trigger node is UI-only in canonical model |
| Action node `actionType = "Wait"` | `kind = "wait"` | `waitDuration`/`duration` -> `wait.duration` |
| Action node `actionType = "Condition"` | `kind = "condition"` | Uses `config.guard` |
| Action node any other `actionType` | `kind = "action"` | `actionId` from `config.actionId` or `actionType` |
| `config.input` | `node.input` | If absent, inferred from config minus reserved keys |
| `config.guard` | `node.guard` | Only on canonical `action` nodes |

### Edge mapping

| Reference edge | Canonical edge | Notes |
| --- | --- | --- |
| `data.branch` (`next|timeout|true|false`) | `edge.branch` | Direct mapping |
| Condition edge with no branch metadata | `edge.branch = "true"` | Preserves reference condition behavior |
| Non-condition edge no branch | branch omitted | Default graph flow |

## Mapping Table: Canonical Backend -> Reference UI

### Trigger mapping

| Canonical key | Reference trigger config key | Notes |
| --- | --- | --- |
| `trigger.type = "domain_event"` | `triggerType = "Webhook"` | Adapter-only semantic rename |
| `trigger.domain` | `domain` | Stored in trigger config |
| `startEvents` | `webhookCreateEvents` CSV | Joined with `", "` |
| `restartEvents` | `webhookUpdateEvents` CSV | Joined with `", "` |
| `stopEvents` | `webhookDeleteEvents` CSV | Joined with `", "` |
| `trigger.type = "schedule"` | `triggerType = "Schedule"` | Direct mapping |
| `expression` | `scheduleExpression` + `scheduleCron` | Same value in both |
| `timezone` | `scheduleTimezone` | Direct mapping |

Defaults injected for webhook-mode UI:

- `webhookEventPath = "event"`
- `webhookCorrelationPath = "data.id"`

### Node/edge mapping

- Canonical `action`/`wait`/`condition` nodes are represented as reference `type = "action"` nodes with adapter-managed `config.actionType`.
- Canonical `condition` edges with `branch = "true"` are emitted without branch metadata (reference implicit true path).
- Canonical `condition` edges with `branch = "false"` are emitted with `data.branch = "false"`.

## Mapping Table: Canonical Catalog -> Reference Selector Model

| Canonical catalog input | Reference selector output |
| --- | --- |
| Domain trigger entries (`type = "domain_event"`) | `Webhook` trigger type with per-domain default start/restart/stop sets |
| Schedule trigger entry (`type = "schedule"`) | `Schedule` trigger type with default timezone |
| Action entries | Reference action list items (`id`, `label`, `description`, `category`, `configFields`, `outputFields`) |

## Run Status Adapter

Canonical run statuses are adapted for reference UI display:

- `pending -> pending`
- `running -> running`
- `completed -> success`
- `failed -> error`
- `cancelled -> cancelled`
- `unknown -> error`

## Golden Fixture Coverage

Fixture tests cover round-trip stability for:

1. Domain-event workflow with start/restart/stop event sets.
2. Schedule workflow with wait + action chain.
3. Condition + wait branching workflow (`true` implicit branch + explicit `false` branch).

Round-trip invariant enforced in tests:

- `reference -> canonical -> reference -> canonical` must preserve canonical graph semantics.

## Backend Extension Decisions (Phase 0 outcome)

Adapter-only (no backend extension required now):

- Trigger semantic rename (`Webhook` -> `domain_event`).
- Trigger event-set routing semantics (start/restart/stop).
- Catalog reshaping for reference selector UI.
- Run status presentation mapping.

Potential future extension (not required for current Phase 0):

- Richer wait/condition UI config parity beyond adapter-managed canonical fields.
