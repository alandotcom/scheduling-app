# ADR 0001: Org-scoped transaction seam

- Status: Accepted
- Date: 2026-06-19

## Context

Every org-scoped table is protected by Postgres RLS. The policy is `org_id = current_org_id()`, where `current_org_id()` reads `nullif(current_setting('app.current_org_id', true), '')::uuid` and returns NULL when unset.

The org context was established in two places and threaded through every data-access call:

- `withOrg(orgId, fn)` opened a transaction and ran `set_config('app.current_org_id', orgId, true)`.
- `setOrgContext(tx, orgId)` ran the identical `set_config` again, and every repository method took an `orgId` parameter and called it as its first line.

So a single fact, the current org, was restated at two seams and carried through ~10 repositories (6–28 `setOrgContext` calls each) and ~9 services. Several read methods also added a redundant `where org_id = orgId` on top of the RLS policy. This is a locality problem: the org seam was smeared across every signature instead of living in one place.

Because `current_org_id()` returns NULL when unset, an unscoped query can never read another tenant's rows. Reads return zero rows and writes raise a `WITH CHECK` violation. The failure mode is empty data, not a cross-tenant leak.

## Decision

The org context is a property of the transaction, established once at a single seam.

1. `withOrg(orgId, fn)` sets the context once and yields a branded `OrgScopedTx` (a phantom-typed `DbClient`).
2. Repository methods that touch RLS tables require `OrgScopedTx`. They drop the `orgId` parameter, the `setOrgContext` call, and the redundant `where org_id = …` filters. Reads rely on the RLS policy.
3. Org-scoped tables default `org_id` to `current_org_id()`. Writes omit `org_id`; the existing `WITH CHECK (org_id = current_org_id())` still guarantees correctness.
4. Calling a repository without org context is a compile error, because a plain `DbClient` is not assignable to `OrgScopedTx`.

Blast radius is bounded: `OrgScopedTx` extends `DbClient`, so helpers typed to accept `DbClient` (journey artifacts, audit) keep working unchanged. Only repositories opt into requiring the brand.

Tests are unaffected in shape. Factories use raw `db.insert(...)` after `setTestOrgContext(db, orgId)` sets session-level context; the one test that calls a repository directly already wraps it in `withOrg`.

## Alternatives considered

- **Trust the seam (no brand).** Repos take a plain `DbClient`; drop `orgId` and `setOrgContext`. Smallest change, but a repo called without context silently returns zero rows with no compile-time guard. Rejected: multi-tenancy is security-critical and the silent-empty-read footgun is worth closing.
- **Org-bound repository facade (`db.forOrg(orgId)`).** A unit-of-work exposing pre-bound repositories. Most encapsulated, but a new layer over every repository and every call site. Rejected as premature abstraction for the current stage.

## Consequences

- Locality: the org seam lives in `withOrg`. RLS context is set once per transaction.
- Leverage: repository interfaces shrink by one parameter; a forgotten context becomes a type error rather than a leak or an empty result.
- Repositories must be invoked within `withOrg` (or, in tests, after `setTestOrgContext`). This is the existing pattern, now enforced by the type system.
- `org_id` defaults to `current_org_id()` on org-scoped tables, set in the initial migration and schema. Inserts no longer pass `org_id`.
- This convention is project-wide. New org-scoped tables get the `org_id` default; new repositories require `OrgScopedTx`.
