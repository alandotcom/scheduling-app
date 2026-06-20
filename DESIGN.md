---
name: Scheduling Admin
description: A calm, keyboard-first admin surface for a multi-tenant appointment scheduling platform.
colors:
  ink: "oklch(0.145 0.015 250)"
  canvas: "oklch(0.98 0.002 250)"
  surface: "oklch(1 0 0)"
  primary-slate: "oklch(0.205 0.015 265)"
  muted-surface: "oklch(0.96 0.003 250)"
  muted-ink: "oklch(0.52 0.01 250)"
  border: "oklch(0.922 0.004 250)"
  focus-blue: "oklch(0.708 0.165 254)"
  destructive-red: "oklch(0.577 0.245 27.325)"
  sidebar-slate: "oklch(0.145 0.015 250)"
  status-scheduled: "oklch(0.623 0.214 259)"
  status-confirmed: "oklch(0.696 0.17 162.48)"
  status-no-show: "oklch(0.769 0.188 70.08)"
  status-cancelled: "oklch(0.554 0.022 257.42)"
typography:
  display:
    fontFamily: "Noto Sans Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Noto Sans Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.0125em"
  body:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.0125em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary-slate}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  badge-default:
    backgroundColor: "oklch(0.205 0.015 265 / 0.1)"
    textColor: "{colors.primary-slate}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
    height: "24px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: Scheduling Admin

## 1. Overview

**Creative North Star: "The Quiet Control Room"**

This is a command surface for people running a scheduling operation. Everything they need is legible at a glance, the chrome stays out of the way, and the fastest path through any task is the keyboard. The aesthetic is a calm room full of well-labelled instruments rather than a dashboard showing off. The same screen has to serve a non-technical owner-operator who opens it once a week and a front-desk power user who lives in it for hours, so nothing is allowed to feel either intimidating or sluggish.

The palette is neutral-led: a cool near-white canvas, white content surfaces, near-black ink, and a single deep-slate primary. Color enters only where it carries meaning (a blue focus ring, the appointment-status hues, the workflow-node accents). The brand direction is a "warmer pulse": the accent that marks primary actions and the current selection is allowed slightly more presence over time, without ever tipping into decoration. The dark slate sidebar grounds the layout and lets the bright work area carry the day's content.

This system explicitly rejects four failure modes named in PRODUCT.md. It is not a generic SaaS template (no hero-metric tiles, no gradient accents, no identical card grids). It is not a cluttered legacy scheduler (density is earned, never reflexive). It is not an over-designed consumer app (no heavy gradients, no oversized radii, no decorative motion). And it is not sterile enterprise gray (contrast and a restrained warm accent keep it alive).

**Key Characteristics:**
- Neutral slate foundation with meaning-bearing color only.
- Dark sidebar over a bright, dense-capable content area.
- Fixed rem type scale (no fluid clamps); one heading face, one text face.
- Thin borders plus very soft shadows; flat at rest, a small lift on hover.
- Keyboard-first affordances treated as a first-class part of the visual language (focus rings, shortcut hints, command palette).

## 2. Colors

A cool neutral system anchored by deep slate, with chromatic color reserved for state, status, and primary action.

### Primary
- **Deep Slate** (`oklch(0.205 0.015 265)`): The primary action color. It fills the default button, marks the current selection, and supplies the dark sidebar foundation at its near-black end. Almost achromatic by design, so a small chromatic accent reads as intentional against it.

### Secondary
- **Focus Blue** (`oklch(0.708 0.165 254)`): The interaction accent. It carries the focus ring on every interactive element and reads as the system's lightest touch of brand warmth. This is the accent earmarked to gain a little more presence under the "warmer pulse" direction.

### Tertiary
- **Scheduled Blue** (`oklch(0.623 0.214 259)`): Appointment status, "scheduled".
- **Confirmed Emerald** (`oklch(0.696 0.17 162.48)`): Appointment status "confirmed"; also the success-badge hue and the working-availability overlay.
- **No-Show Amber** (`oklch(0.769 0.188 70.08)`): Appointment status "no_show"; also the warning-badge hue.
- **Cancelled Slate** (`oklch(0.554 0.022 257.42)`): Appointment status "cancelled". Deliberately near-neutral so a cancelled item recedes.

### Neutral
- **Ink** (`oklch(0.145 0.015 250)`): Primary text on light surfaces; also the sidebar background.
- **Canvas** (`oklch(0.98 0.002 250)`): The cool near-white app background behind content.
- **Surface** (`oklch(1 0 0)`): Pure-white cards, popovers, and panels that sit on the canvas.
- **Muted Surface** (`oklch(0.96 0.003 250)`): Secondary fills, hover backgrounds, toolbar and table-zebra tints.
- **Muted Ink** (`oklch(0.52 0.01 250)`): Secondary text, captions, placeholder copy. Verified at 4.5:1 against Surface and Canvas; do not lighten it for "elegance".
- **Border** (`oklch(0.922 0.004 250)`): Hairline dividers, input strokes, card outlines.
- **Destructive Red** (`oklch(0.577 0.245 27.325)`): Delete and error affordances only.

### Named Rules
**The Meaning-Only Color Rule.** Chromatic color appears only when it carries information: a focus ring, an appointment status, a workflow node type, a destructive action. It is never spent on decoration. On any given screen the saturated accents stay near or below 10% of the surface.

**The Recede-on-Cancel Rule.** State that no longer needs attention (a cancelled appointment, a disabled control) drops toward neutral rather than staying loud. Cancelled is intentionally the dullest status hue in the set.

## 3. Typography

**Display Font:** Noto Sans Variable (with system-ui, sans-serif fallback)
**Body Font:** Inter Variable (with system-ui, sans-serif fallback)

**Character:** Two close-cousin grotesques sharing one quiet, neutral voice. Noto Sans handles every heading (`h1`–`h4`) with tight tracking; Inter carries body, labels, data, and controls. The pairing is deliberately low-contrast so headings feel like a firmer version of the same voice rather than a separate one. Both load as variable fonts.

### Hierarchy
- **Display** (`h1`, Noto Sans 600, 1.5rem / `text-2xl`, line-height ~1.25, tracking -0.025em): Page titles in the scaffold header.
- **Headline** (`h2`, Noto Sans 600, 1.25rem / `text-xl`, line-height ~1.4): Section headings within a page.
- **Title** (`h3` / card title, Noto Sans 600 or Inter 500, 1.125rem / `text-lg`, tracking tight): Card and panel titles.
- **Body** (Inter 400, 0.875rem / `text-sm`, line-height 1.5): The workhorse size for table cells, panel content, and most UI copy. Prose blocks cap at 65–75ch; data tables may run denser.
- **Label** (Inter 500, 0.75rem / `text-xs`, tracking +0.0125em): Badges, chips, metadata, table column headers. Sentence or title case.

### Named Rules
**The One-Voice Rule.** No display or decorative face enters the UI. Labels, buttons, inputs, and data all use Inter; headings use Noto Sans. A serif or a novelty face anywhere in the admin surface is a defect.

**The Fixed-Scale Rule.** Heading sizes are fixed rem steps, never `clamp()`. A title that shrinks inside a narrow split-pane or sidebar looks worse, not better.

## 4. Elevation

The system is flat by default with very soft, functional elevation. Depth comes first from tonal layering (dark sidebar, cool canvas, white surface) and from hairline borders; shadows are a quiet secondary cue, not a decorative one. Cards rest at a barely-there shadow and lift one small step on hover to signal interactivity. There are no deep, dark, or wide-blur drop shadows anywhere.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` — Tailwind v4 `shadow-sm`): Resting elevation on cards, popovers, and menus.
- **Hover Lift** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` — Tailwind v4 `shadow-md`): The single-step lift on interactive cards at hover.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest and depth is carried by border and tone. A shadow is a response to state (hover, an open menu, a focused field), not a permanent costume. If a card needs a heavy shadow to separate from its background, the background tone is wrong.

**The No-Ghost-Card Rule.** Never pair a 1px border with a soft wide drop shadow on the same element as decoration. Pick one: the hairline border, or a defined small shadow.

## 5. Components

Components are refined and restrained: quiet at rest, precise in their states, built on the same radius and border vocabulary so they read as one kit. Every interactive component ships its full state set (default, hover, focus-visible, active, disabled, plus loading/error where relevant). Focus is built on Base UI primitives, so keyboard focus is always visible.

### Buttons
- **Shape:** Gently rounded (`rounded-lg`, 10px); icon-only and compact sizes step down toward 8px.
- **Sizes:** `xs` (28px), `sm` (32px), default (36px / `h-9`), `lg` (40px), plus square icon variants.
- **Primary:** Deep-slate fill with near-white text. Hover lightens the fill (~80% opacity).
- **Outline:** White (or transparent) fill, hairline border, ink text; hover fills with muted surface.
- **Secondary:** Muted-surface fill, ink text; hover deepens slightly.
- **Ghost:** No border or fill at rest; hover gains a muted-surface wash. The default for low-emphasis and toolbar actions.
- **Destructive:** Tinted destructive background (10% red) with red text, not a solid red fill. Reserved for delete and other irreversible actions.
- **Focus:** A 3px focus-blue ring at ~50% opacity with a matching border shift, on every variant.

### Badges
- **Shape:** Full pill (`rounded-full`), 24px tall, label-size text with slight positive tracking.
- **Default:** 10% primary tint, slate text, 20% primary border.
- **Semantic:** `success` (emerald), `warning` (amber), `destructive` (red), each as a low tint with a darker text of the same hue and a faint matching border. `secondary`, `outline`, and `ghost` round out the set.
- **Use:** Status and metadata, never as a button. Appointment-status badges map to the status palette above.

### Cards / Containers
- **Corner Style:** `rounded-xl` (14px). Cards never round past 16px.
- **Background:** White surface on the cool canvas.
- **Shadow Strategy:** Rest shadow at all times, Hover Lift on hover (see Elevation).
- **Border:** Hairline `border` at all times.
- **Internal Padding:** 24px default (`py-6` / `px-6`); compact `sm` cards use 16px. Footers sit on a faint muted wash with a top border.
- **Nesting:** Never nest a card inside a card.

### Inputs / Fields
- **Style:** 40px tall (`h-10`), `rounded-lg`, hairline input border, transparent fill, body-size text (16px on mobile to prevent iOS zoom, 14px from `md` up).
- **Focus:** Border shifts to focus-blue and a 3px focus-blue ring (~50%) appears.
- **Error:** `aria-invalid` drives a destructive ring and border; placeholder uses muted-ink at full 4.5:1 contrast.
- **Disabled:** Muted fill, reduced opacity, `not-allowed` cursor.

### Navigation
- **Sidebar:** Dark slate (`sidebar` token), light slate text, collapsible. The active item lifts to a lighter slate accent fill; hover is a subtle slate wash. This is the one persistently dark surface in the app.
- **Command Palette (Cmd+K):** A centered dialog built on cmdk for navigation and create actions, the keyboard-first entry point to everything.
- **Mobile:** The sidebar collapses behind a sheet; structural responsiveness, not fluid type.

### Signature Component: Workflow Canvas
The journey/workflow editor (React Flow) is the one place color is allowed to lead, because node type IS the information. Trigger, action, and condition nodes each own a hue family (blue, cyan, green) for border, fill, and handle. Edges carry their own default/active/traversed states, and edge labels are full-pill chips tinted to match edge state. Even here the palette stays low-chroma and the rules above on borders and shadows still hold.

## 6. Do's and Don'ts

### Do:
- **Do** keep color meaning-bearing: focus, status, node type, destructive action. Hold saturated accents near or below 10% of any screen.
- **Do** use `rounded-lg` (10px) for buttons and inputs, `rounded-xl` (14px) for cards, and full pills for badges and tags.
- **Do** render every interactive component with a visible `:focus-visible` ring; keyboard parity is part of the brand.
- **Do** keep depth flat-by-default, carried by tone and hairline borders, with shadows reserved for hover and open states.
- **Do** use Inter for all labels, controls, and data, and Noto Sans for headings only.
- **Do** keep transitions in the 150–250ms range with an ease-out curve, and give every animation a `prefers-reduced-motion` fallback.
- **Do** let cancelled and disabled states recede toward neutral.

### Don't:
- **Don't** ship the generic SaaS template look: no hero-metric tiles, no gradient accents, no endless identical icon-heading-text card grids.
- **Don't** drift into a cluttered legacy scheduler; density must be earned by the task, never reflexive.
- **Don't** over-design like a consumer app: no heavy gradients, no card radii past 16px, no decorative motion, no emoji as UI.
- **Don't** fall into sterile enterprise gray; muted text stays at 4.5:1 and the warm accent stays present. Never lighten muted-ink for "elegance".
- **Don't** use `background-clip: text` gradient text, or a `border-left`/`border-right` greater than 1px as a colored accent stripe.
- **Don't** pair a 1px border with a soft wide drop shadow on the same element (the ghost-card tell).
- **Don't** introduce a display or serif face, a custom scrollbar, or a reinvented form control for flavor.
- **Don't** reach for a modal as the first thought; exhaust inline and progressive alternatives first.
