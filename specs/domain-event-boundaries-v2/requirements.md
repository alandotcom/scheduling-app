
# Requirements Q&A

## Q1

Should we enforce appointment-only scope for **journeys only** (while keeping non-appointment domain events for integrations/webhooks), or should we remove non-appointment domain events platform-wide?

### A1

Enforce appointment-only scope for journeys, and keep non-appointment domain events for webhooks/integrations.

## Q2

For journey authoring UX/contracts, should we remove the domain selector entirely and hardcode journey triggers to appointment lifecycle events (`appointment.scheduled`, `appointment.rescheduled`, `appointment.canceled`) only?

### A2

Yes.

## Q3

How should we handle **already-saved** journeys that currently use non-appointment trigger domains: block publish only, block both save/publish edits, or auto-migrate them to appointment defaults?

### A3

Hard reset (dev environment; no backward-compatibility handling needed).

## Q4

For this hard reset, do you want us to define the behavior as: "invalidate existing journey trigger configs and require recreation/re-save via the new appointment-only contract" (instead of adding migration logic)?

### A4

Yes — no production DB and no real data; start fresh.

## Q5

Should we enforce boundary violations as hard validation failures at both DTO and API levels (for example, reject any journey trigger payload containing non-appointment domains/events), with no fallback coercion?

### A5

Yes.

## Q6

Should integration/webhook fanout behavior remain unchanged and continue supporting the full domain event taxonomy, as long as journey-specific contracts are appointment-only?

### A6

Yes.

## Q7

For journey triggers, should correlation be fixed to appointment identity (`appointmentId`) and the free-form correlation-path input be removed from the journey UI/contract?

### A7

Yes.

## Q8

Do you want the trigger event sets to be fixed defaults (`start=[appointment.scheduled]`, `restart=[appointment.rescheduled]`, `stop=[appointment.canceled]`) with no user customization in v1?

### A8

Yes — fixed defaults with no user customization. UX should not require users to configure this.

## Q9

Should we also remove trigger filter authoring from journey trigger UX in v1 (to keep setup fully intent-first), or keep filters as an advanced option?

### A9

Keep filters.

## Q10

For filters, should we keep them as an **advanced, optional** section (collapsed by default) while the trigger event lifecycle itself remains fixed and non-editable?

### A10

Yes.

## Q11

What should be the minimum acceptance signal for this effort: is it enough that non-appointment journey configs are impossible to author/save, or do you also want explicit regression tests proving rejection at DTO, API, and UI layers?

### A11

Non-appointment journey configs being impossible to author/save is sufficient.

## Q12

Are requirements clarification complete, or do you want to continue refining requirements (and/or return to additional research)?

### A12

Requirements clarification is complete.
