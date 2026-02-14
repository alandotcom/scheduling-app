# Rough Idea

We are going to copy the workflow engine + UI exactly from `../notifications-workflow`.

The only change is how workflows get triggered:
- Use a domain type trigger (for example, `appointment.created`)
- Replace/update events (for example, `appointment.deleted`)

Constraints and adaptations:
- The reference app uses Hono RPC; this repo uses oRPC.
- Surface areas should remain the same, but implementation details may differ.
- Copy the DB schema as closely as possible.
- Adapt schema and policies to this repo's org-scoped RLS model.
