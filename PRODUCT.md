# Product

## Register

product

## Users

The day-to-day users span three overlapping roles, and the interface has to hold all of them at once:

- **Owner-operators** running their own small service business (a therapist, coach, or clinician). Often non-technical. They drop in between client sessions, want to confirm what's happening today, and should never feel lost.
- **Front-desk and scheduling staff** at multi-provider clinics who live in the app for hours. They book, reschedule, and triage all day and care most about speed, keyboard flow, and seeing a lot at once without hunting.
- **Ops and admins** who configure the system: calendars, availability rules, appointment types, resources, workflows, integrations. They value control and predictability, and they need to trust that a change does exactly what they expect.

The same screen is frequently used by all three. A regular should never feel slowed down, and a first-timer should never feel stranded.

## Product Purpose

A multi-tenant appointment scheduling platform (Acuity-style) for service businesses. The admin UI is where staff manage the whole operation: clients, appointments, calendars, appointment types, availability and blocked time, resources, custom fields, webhooks, integrations, and automated client journeys (the workflow/journey engine).

Success is when the tool gets out of the way. A booking takes seconds, the day's schedule is legible at a glance, and configuring something complex (a multi-step workflow, a new availability pattern) feels controlled rather than risky. The product wins by being the calm, fast surface a busy practice reaches for without thinking about it.

**Secondary surface (brand-leaning):** there is also a client-facing public booking experience. That surface carries more brand identity than the admin app and should be treated as a `brand` register when worked on directly, even though this file's default register is `product`.

## Brand Personality

Keyboard-first efficiency wearing a friendly, unobtrusive face. The app should feel fast and capable for someone who lives in it, while staying genuinely welcoming to a non-power-user who opens it once a week. Power and approachability are not in tension here; the design's job is to deliver both from the same surface.

Three-word personality: **efficient, approachable, unobtrusive.**

Emotional goal: quiet confidence. The user should feel the app is handled and trustworthy, never anxious about whether an action did what they meant. A first-time user shouldn't feel intimidated by it, and someone using it forty times a day shouldn't feel held back.

## Anti-references

This should look like none of the following (all four were called out explicitly):

- **Generic SaaS template / Bootstrap dashboard.** Cookie-cutter card grids, hero-metric tiles, gradient accents, no point of view. The opposite of earned craft.
- **Cluttered legacy scheduler.** The busy, dated, everything-on-screen feel of old scheduling-admin tools. Density is fine; clutter is not.
- **Over-designed consumer app.** Heavy gradients, oversized rounded cards, decorative motion, emoji, playful flourish. Personality should come from restraint, not ornament.
- **Sterile enterprise gray.** Joyless, low-contrast, hard-to-scan gray-on-gray (Jira-style). Calm is the goal, not lifelessness.

The needle to thread runs between all four: more crafted than a template, calmer than a legacy scheduler, more restrained than a consumer app, and warmer than enterprise gray.

## Design Principles

1. **Keyboard-first, mouse-friendly.** Every primary action has a fast keyboard path, and the exact same action is always one obvious click away. Shortcuts reward the regular without ever being required of the newcomer.
2. **The tool disappears into the task.** Restraint is the default and the vocabulary stays the same from screen to screen. Familiarity is a feature; surprise is rationed to specific moments and never spread across whole pages.
3. **Calm density.** Show what the task needs and nothing past it. A schedule or table can run dense; a settings panel should breathe. The craft is in staying readable while dense, which is precisely where both "cluttered" and "sterile" fail.
4. **Welcoming by default.** Empty states teach the interface instead of apologizing for being empty, and guidance stays present but quiet. A first-timer can find their footing without the daily user ever feeling patronized.
5. **Quiet craft over decoration.** Polish lives in spacing, in complete interaction states, and in motion that reports what just happened. It does not live in gradients, giant radii, or flourish. A detail that doesn't serve the task is noise.

## Accessibility & Inclusion

- **WCAG 2.2 AA baseline** is the explicit floor: 4.5:1 body-text contrast, visible focus on every interactive element, full keyboard operability, and target sizes that meet AA. The existing code already shows this intent (WCAG-minimum touch targets, reduced-motion-aware patterns); hold that bar everywhere and treat regressions as bugs.
- Keyboard operability is doubly load-bearing here because it is also the core of the personality, so focus order and focus visibility get first-class attention, not an afterthought pass.
- Honor `prefers-reduced-motion` for any animation that ships.
