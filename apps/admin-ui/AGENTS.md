
- BaseUI https://base-ui.com/llms.txt
- Tailwind v4
- Shadcnui with Tailwind v4 and BaseUI  https://ui.shadcn.com/llms.txt
- Never use `toast.success()` (green popups) for any action. Prefer inline confirmation states for routine actions and reserve toasts (`toast.error()`) for errors only.
- When working on workflow canvas code that relies on React Flow (`@xyflow/react`), use the React Flow skills first (`react-flow`, `react-flow-advanced`, `react-flow-architecture`, `react-flow-code-review`).
- Client country selector casing: the trigger/options can inherit `text-transform: uppercase` from ancestor containers. Apply `normal-case` on selector trigger/value/item text so country names stay human-readable (e.g. `United States`, not uppercase).
