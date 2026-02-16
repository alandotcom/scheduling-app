## Requirements Q&A

### Q1
What is the primary success outcome for this rebuild from the user/admin perspective (for example: faster setup, fewer misfires, clearer run visibility, reduced configuration complexity, or a specific measurable KPI)?

### A1
All listed outcomes are acceptable, with reduced configuration complexity being a major priority.

### Q2
For v1, should journeys be attachable to specific appointment types/calendars/locations, or should each journey apply to all appointments in a workspace unless manually filtered by future step logic?

### A2
Journeys should support trigger-level filtering so a journey can target one calendar, one appointment type, or combinations. The intent is to avoid global-only behavior and allow scoped journeys directly in trigger configuration.

### Q3
For v1 trigger filters, what matching logic should be supported: simple AND across selected fields only (for example appointmentType IN X AND calendar IN Y), or should we also support OR groups/not-conditions from day one?

### A3
Include OR and NOT conditions in v1 filter logic.

### Q4
Should filters be evaluated only at journey start (`appointment.scheduled`) or also re-evaluated on `appointment.rescheduled` to decide whether future steps should continue, be canceled, or be newly activated?

### A4
Filters should be evaluated consistently, including on `appointment.rescheduled`.

### Q5
When a reschedule changes filter match state, what should happen in each case:
- previously matched -> now not matched
- previously not matched -> now matched
Should pending deliveries be canceled and/or newly planned accordingly?

### A5
Lock behavior as follows:
- previously matched -> now not matched: cancel all pending unsent deliveries immediately
- previously not matched -> now matched: plan deliveries from the reschedule event using updated appointment timing
- still matched: recompute schedule, cancel obsolete pending deliveries, and create replacements
- recomputed send time already in the past: mark skipped/suppressed as `past_due` (no immediate catch-up send)

### Q6
For filter conditions, which appointment attributes must be available in v1 (for example calendarId, appointmentTypeId, locationId, providerId, status, client tags, timezone, service category)?

### A6
All appointment and client attributes should be available for filtering in v1.

### Q7
Should v1 filters include both built-in comparison operators (`=`, `!=`, `in`, `not in`, `contains`, `startsWith`, date/time comparisons) and null checks (`is set`, `is not set`) across those attributes?

### A7
Yes.

### Q8
Should trigger filters support nested groups with explicit parentheses-style precedence (for example `(A OR B) AND (NOT C)`) in the UI and persisted definition format?

### A8
Yes, but nesting is limited to a single level. Deep recursive nesting is out of scope for v1.

### Q9
For usability and reduced complexity, do you want to cap v1 filter size (for example max conditions and max groups per trigger), or allow effectively unlimited rules?

### A9
Yes, v1 filters should be capped.

### Q10
What caps do you want for v1 (recommended default: max 12 conditions total and max 4 groups, with one nesting level)?

### A10
Use the recommended defaults: max 12 conditions total and max 4 groups, with one nesting level.

### Q11
For message limits, should limits be configured per workspace and channel only (Email, Slack), or also optionally per journey in v1?

### A11
Decision deferred pending research. We should evaluate using `cel-js` for trigger expression filters versus building a custom expression parser before finalizing related filter/runtime configuration decisions.

### Q11b
Independently of expression parser choice, should message limits in v1 be configured per workspace+channel only (Email, Slack), or also optionally per journey?

### A11b
Per workspace and channel only.

### Q12
When a send is suppressed due to limit, what must admins see in the UI for observability (for example: reason, channel, journey name, appointment/client, timestamp, counter snapshot, and whether it counted toward the limit)?

### A12
Required UI observability for suppressed sends:
- suppression reason (`limit_reached`) and channel
- journey name and step name
- appointment identifier and client display name
- scheduled send time and suppression timestamp
- active limit policy at decision time (window type, cap)
- counter snapshot (`used_before`, `used_after`, `remaining`)
- delivery status badge (`suppressed`)
- quick links to appointment and journey run details

### Q13
For channel send failures unrelated to limits (for example Resend/Slack API error), should v1 do immediate fail-only logging, fixed retry attempts, or provider-dependent retry behavior?

### A13
Use a mixed approach in v1:
- failure logging is required
- retries should exist
- retry behavior can vary by provider
- Resend idempotency keys should be used for safe retry behavior

### Q14
For v1, do you want retry policy to be admin-configurable in UI, or fixed internal defaults per provider (with no UI controls yet)?

### A14
No UI controls yet. Use internal fixed defaults per provider in v1.

### Q15
For Wait step timing in v1, which anchors should be supported: relative to appointment start only, or both appointment start and appointment end?

### A15
Support both appointment start and appointment end anchors.

### Q16
Should Wait support both "before" and "after" offsets for each anchor, and what smallest time unit is required in v1 (minutes, hours, days)?

### A16
Use the current parseable duration-expression approach for v1 (for example values like `1d`, `1s`, `1w`, and other supported parseable durations), rather than limiting to a fixed minimum unit list.

### Q17
For timezone behavior, should wait calculations always use the appointment timezone snapshot at trigger time, or should they follow the appointment timezone as it changes on reschedule updates?

### A17
Use the appointment's current date/time/timezone as source of truth on each re-evaluation. Future waits should be recalculated on reschedule using the updated zoned appointment datetime.

### Q18
When a journey definition is edited and republished, should already-running journey instances continue on their original version, or should pending future deliveries migrate to the new version?

### A18
Use version-pinned runs in v1: existing runs continue on their original published version, and only new runs use the latest published version. Also include the ability to cancel running instances individually or in bulk.

### Q19
For bulk cancel, what scope should v1 support: cancel all runs for a specific journey version, cancel all runs for the journey regardless of version, and/or cancel runs by filter (for example date range or status)?

### A19
User asked for the simplest v1 option.

### A19-final
Lock simplest v1 bulk-cancel scope:
- bulk cancel all active runs for one selected journey (across versions)
- keep individual run cancel
- no advanced filtered bulk-cancel in v1

### Q20
Should v1 support journey pause/resume (prevent new runs while preserving existing active runs), or only draft/published states?

### A20
Include pause/resume in v1.

### Q21
When paused, should existing pending deliveries continue to execute, or should pause also suppress/cancel future unsent deliveries for currently active runs?

### A21
Pause should suppress/cancel future unsent deliveries.

### Q22
On resume, should suppressed-by-pause deliveries be permanently dropped, or should eligible future ones be re-planned from current appointment state/time?

### A22
Option B: re-plan eligible future deliveries from current appointment state/time on resume.

### Q23
On resume, should re-planning run immediately for all active runs of that journey, or happen lazily only when the next appointment lifecycle event arrives?

### A23
Immediately.

### Q24
For cancel behavior, should a canceled appointment always terminate the run permanently, even if the same appointment is later uncanceled or moved back to a non-canceled status?

### Note (from user)
Investigate Inngest native pausing capabilities during Research phase: https://www.inngest.com/docs/guides/pause-functions

### A24
Cancellation is terminal. Appointments cannot be uncanceled; a new appointment must be scheduled instead.

### Q25
For Send Message, should v1 support message templating with dynamic variables from appointment and client data (for both Email and Slack), or static text only?

### A25
Yes, support dynamic templating variables from appointment and client data in v1.

### Q26
Should v1 use the existing template/placeholder syntax already used elsewhere in the app (if present), or should we introduce a new expression-based template syntax for journeys?

### A26
Reuse the existing template/placeholder syntax.

### Q27
Should multiple active journeys be allowed to trigger for the same appointment at the same time, with each journey running independently?

### A27
Yes.

### Q28
If two journeys would send the same channel message to the same recipient at nearly the same time, should v1 attempt cross-journey deduplication, or allow both sends and rely on admins to configure journeys cleanly?

### A28
Prefer warning-based protection: detect likely overlapping triggers and warn admins during journey configuration/publish.

### Q29
For v1 execution behavior, should overlapping journeys still both send (warning only), or should publish be blocked until overlap is resolved?

### A29
Warning only.

### Q30
Do you want auditability fields in v1 for journey definition lifecycle (createdBy, updatedBy, publishedBy, pausedBy, resumedBy, canceledBy with timestamps)?

### A30
No additional lifecycle actor audit fields are required in v1.

### Q31
For permissions in v1, who can create/edit/publish/pause/cancel journeys: org admins only, or any authenticated org member?

### A31
Org admins only.

### Q32
For Logger step in v1, should logs be visible only in internal run timelines, or also exportable/searchable in a broader logs view?

### A32
Logs should be visible in journey runs and also go to the real logger/console output. No separate export/search logs view is required in v1.

### Q33
For run retention in v1, how long should journey run and delivery history be kept (for example 30 days, 90 days, 1 year, or indefinite)?

### A33
Indefinite for now. This is a TODO for future retention policy work.

### Q34
For workspace message limits, what window types should v1 support: per minute, per hour, per day, and per week (all), or only a subset?

### A34
Support all: minute, hour, day, and week windows.

### Q35
Should workspace limits be applied separately by channel only, or by channel plus recipient type (for example email vs Slack destination) in v1?

### A35
Limits should focus on client notifications. Slack messages are not important for limiting in v1.

### Q36
To lock this precisely: should v1 enforce limits for client-facing channels only (Email now, SMS later) and skip limit enforcement for Slack entirely?

### A36
Keep notification/message limits out of scope for this rebuild. No limits feature in v1 (backend or UI).

### Note
This supersedes earlier limit-scope decisions and shifts message limits to future work.

### Q37
Should we still keep suppression-style delivery statuses in v1 for non-limit reasons (for example `past_due`, paused journey), or simplify statuses to sent/failed/canceled/skipped only?

### A37
Use the simplified status set in v1: `sent`, `failed`, `canceled`, `skipped`.

### Q38
If an appointment is deleted after a journey run started, should v1 treat deletion the same as cancel and terminate pending deliveries?

### A38
Yes. Treat deletion as terminal and cancel pending deliveries.

### Q39
For UI publishing safeguards, should v1 require a dry-run preview for at least one sample appointment before publish, or keep preview optional with warnings only?

### A39
Option B: allow publish immediately and show warnings only.

### Q40
Should v1 support test-send for Send Message steps (Email/Slack) from the builder, or defer test-send and rely on runtime execution only?

### A40
Support full workflow testing in v1: run the workflow end-to-end with real data and execute actions for real.

### Q41
For this full test mode, should sends go to the real configured recipients/destinations, or should v1 provide an override mode that reroutes all sends to admin-specified test destinations?

### A41
Include an override mode for testing that reroutes sends to admin-specified test destinations.

### Q42
Should test runs be clearly separated from production runs in storage and UI (for example `mode = test|live`) so metrics and observability do not mix?

### A42
Yes. Show test runs clearly and mark them as test runs.

### Q43
For test mode with Wait steps, should waits run as configured, or should v1 support a test acceleration option (for example skip waits) for faster end-to-end validation?

### A43
Run waits exactly as configured.

### Q44
Should test runs require an explicit "test mode" toggle per run, or allow publishing a separate test-only journey state?

### A44
Use a separate test-only state for v1.

### Q45
How should a test run be started: pick an existing appointment by ID from the UI, or create a temporary test appointment as part of the test flow?

### A45
Choose an existing appointment.

### Q46
Should test-mode destination overrides be required before starting a test run (to prevent accidental real sends), or optional?

### A46
Required.

### Q47
For Slack in test mode, should override require a specific test Slack destination (for example test webhook/channel) and block run start if missing?

### A47
No. Slack does not require an override.

### Q48
To keep test safety clear, should required overrides apply to client-facing channels only (Email now), while Slack can send normally in test runs?

### A48
Required overrides apply to Email and SMS only.

### Q49
Should SMS remain out of scope as a delivery channel for this rebuild, with this override rule recorded only for future SMS support?

### A49
Yes. SMS delivery is out of scope for this rebuild because the integration is not implemented yet. Keep the override requirement as future behavior.

### Q50
For journey list and runs UX, do you want separate tabs/filters for Draft, Published, Paused, and Test-only states in v1?

### A50
Yes.

### Q51
Should a Test-only journey state run only when manually started from the UI, or should it also react automatically to real appointment lifecycle events?

### A51
Also auto-trigger from real appointment lifecycle events.

### Q52
When a journey is newly published, should it only apply to future lifecycle events, or should v1 support backfilling currently scheduled appointments as new runs?

### A52
Future events only.

### Q53
Should v1 include a separate one-time bulk enrollment action (manual backfill tool) for selected appointments, or keep all backfill behavior out of scope?

### A53
Backfill is out of scope.

### Q54
For webhook behavior in this rebuild, should webhooks remain independent from journey pause/test states (that is, canonical events continue to emit as usual)?

### A54
Yes. Webhooks are independent from journey states.

### Q55
For appointment lifecycle taxonomy, should webhook subscribers receive only `appointment.scheduled`, `appointment.rescheduled`, and `appointment.canceled` with no legacy aliases?

### A55
Correct. No legacy aliases.

### Q56
Should the API reject create/update requests for any non-linear journey structure (for example branches/conditions) with a clear validation error in v1?

### A56
Yes.

### Q57
For v1, confirm the allowed step types are exactly Trigger, Wait, Send Message, and Logger (with Switch, Condition, and HTTP Request removed).

### A57
Yes.

### Q58
Should journey names be unique per workspace in v1, or can multiple journeys share the same name?

### A58
Unique per workspace.

### Q59
Should deleting a journey definition be allowed only when there are no active runs, or should delete perform automatic bulk cancel of active runs?

### A59
Auto-cancel active runs and delete.

### Q60
Should delete be hard delete in v1, or soft delete with recoverability?

### A60
Hard delete.

### Q61
Should runs history for deleted journeys remain queryable in v1, or can it be removed with the journey?

### A61
Keep runs history queryable.

### Q62
Should run history show the journey version snapshot used at execution time even if the source journey is later edited or deleted?

### A62
Yes.

### Q63
For test-only journeys that auto-trigger, should they process all qualifying appointments continuously, or should there be an automatic expiration window for test state?

### A63
Continue indefinitely until manually changed. Keep it simple.

### Q64
Should there be a prominent UI badge/warning whenever a journey is in Test-only state to reduce accidental long-term test usage?

### A64
Yes.

### Q65
For overlap warnings between journeys, should detection run only at publish time, or also during draft editing in near-real-time?

### A65
Publish time only.

### Q66
Should overlap warnings be best-effort heuristic only in v1 (no strict correctness guarantee), with no publish block?

### A66
Yes.

### Q67
Are you done with requirements clarification and ready to move to Research for deferred items (`cel-js` for filter expressions and Inngest pause functionality)?

### A67
Yes. Move to Research.
