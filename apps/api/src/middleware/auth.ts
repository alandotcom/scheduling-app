// Auth middleware - validates session and populates context

import { createMiddleware } from 'hono/factory'
import { auth } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { orgMemberships } from '@scheduling/db/schema'
import { eq, and } from 'drizzle-orm'

declare module 'hono' {
  interface ContextVariableMap {
    userId: string | null
    orgId: string | null
    sessionId: string | null
    role: 'admin' | 'staff' | null
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  // Try session auth first
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (session?.user) {
    c.set('userId', session.user.id)
    c.set('sessionId', session.session.id)

    // Get org context from header or query param
    const orgId = c.req.header('X-Org-Id') ?? c.req.query('org_id')

    if (orgId) {
      // Verify user is member of this org
      const membership = await db.query.orgMemberships.findFirst({
        where: and(
          eq(orgMemberships.userId, session.user.id),
          eq(orgMemberships.orgId, orgId)
        ),
      })

      if (membership) {
        c.set('orgId', orgId)
        c.set('role', membership.role as 'admin' | 'staff')
      } else {
        return c.json(
          { error: { code: 'FORBIDDEN', message: 'Not a member of this org' } },
          403
        )
      }
    } else {
      // Default to first org membership
      const membership = await db.query.orgMemberships.findFirst({
        where: eq(orgMemberships.userId, session.user.id),
      })
      if (membership) {
        c.set('orgId', membership.orgId)
        c.set('role', membership.role as 'admin' | 'staff')
      } else {
        c.set('orgId', null)
        c.set('role', null)
      }
    }

    return next()
  }

  // Try API token auth (placeholder for Step 14)
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    // TODO: Validate API token and set context (Step 14)
  }

  // For endpoints that allow unauthenticated access
  c.set('userId', null)
  c.set('orgId', null)
  c.set('sessionId', null)
  c.set('role', null)

  return next()
})
