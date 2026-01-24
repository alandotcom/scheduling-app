# Implementation Details

This document expands on the detailed design with specific implementation patterns, code examples, and solutions for complex areas.

## Table of Contents

1. [oRPC Router Composition](#1-orpc-router-composition)
2. [BetterAuth + Drizzle Integration](#2-betterauth--drizzle-integration)
3. [RLS with Connection Pooling](#3-rls-with-connection-pooling)
4. [Availability Engine Algorithm](#4-availability-engine-algorithm)
5. [Error Handling Pattern](#5-error-handling-pattern)
6. [Pagination Pattern](#6-pagination-pattern)
7. [Testing Setup (Vitest + PGLite)](#7-testing-setup-vitest--pglite)
8. [Package Dependencies](#8-package-dependencies)
9. [Development Workflow](#9-development-workflow)
10. [Timezone Handling](#10-timezone-handling)
11. [Resource Allocation & Race Conditions](#11-resource-allocation--race-conditions)

---

## 1. oRPC Router Composition

### Router Structure

oRPC routers are plain objects with nested procedures. Each route file exports individual procedures, and they're composed into a single router object.

```typescript
// packages/dto/src/contracts/index.ts
// This file defines the router type that the client uses

import type { InferRouterInputs, InferRouterOutputs } from '@orpc/server'
import type { router } from 'apps/api/src/routes'

export type Router = typeof router
export type RouterInputs = InferRouterInputs<Router>
export type RouterOutputs = InferRouterOutputs<Router>
```

### Individual Route Files

```typescript
// apps/api/src/routes/locations.ts
import { z } from 'zod'
import { os } from '../lib/orpc'
import { db } from '../lib/db'
import { locations } from '@scheduling/db/schema'
import { LocationSchema, CreateLocationSchema, UpdateLocationSchema } from '@scheduling/dto'
import { eq } from 'drizzle-orm'

// Base procedure with auth context
const authed = os.use(async ({ context, next }) => {
  if (!context.userId || !context.orgId) {
    throw new ORPCError('UNAUTHORIZED')
  }
  return next({ context })
})

export const locationRoutes = {
  list: authed
    .route({ method: 'GET', path: '/v1/locations' })
    .input(z.object({
      cursor: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .output(z.object({
      items: z.array(LocationSchema),
      nextCursor: z.string().uuid().nullable(),
    }))
    .handler(async ({ input, context }) => {
      const items = await db.query.locations.findMany({
        where: input.cursor
          ? (locations, { gt }) => gt(locations.id, input.cursor)
          : undefined,
        limit: input.limit + 1,
        orderBy: (locations, { asc }) => asc(locations.id),
      })

      const hasMore = items.length > input.limit
      if (hasMore) items.pop()

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1].id : null,
      }
    }),

  get: authed
    .route({ method: 'GET', path: '/v1/locations/{id}' })
    .input(z.object({ id: z.string().uuid() }))
    .output(LocationSchema)
    .handler(async ({ input }) => {
      const location = await db.query.locations.findFirst({
        where: eq(locations.id, input.id),
      })
      if (!location) throw new ORPCError('NOT_FOUND')
      return location
    }),

  create: authed
    .route({ method: 'POST', path: '/v1/locations' })
    .input(CreateLocationSchema)
    .output(LocationSchema)
    .handler(async ({ input, context }) => {
      const [location] = await db.insert(locations).values({
        ...input,
        orgId: context.orgId,
      }).returning()
      return location
    }),

  update: authed
    .route({ method: 'PATCH', path: '/v1/locations/{id}' })
    .input(z.object({ id: z.string().uuid() }).merge(UpdateLocationSchema))
    .output(LocationSchema)
    .handler(async ({ input }) => {
      const { id, ...data } = input
      const [location] = await db.update(locations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(locations.id, id))
        .returning()
      if (!location) throw new ORPCError('NOT_FOUND')
      return location
    }),

  delete: authed
    .route({ method: 'DELETE', path: '/v1/locations/{id}' })
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input }) => {
      const result = await db.delete(locations).where(eq(locations.id, input.id))
      return { success: true }
    }),
}
```

### Composing the Full Router

```typescript
// apps/api/src/routes/index.ts
import { locationRoutes } from './locations'
import { calendarRoutes } from './calendars'
import { appointmentTypeRoutes } from './appointment-types'
import { resourceRoutes } from './resources'
import { appointmentRoutes } from './appointments'
import { availabilityRoutes } from './availability'
import { clientRoutes } from './clients'

export const router = {
  locations: locationRoutes,
  calendars: calendarRoutes,
  appointmentTypes: appointmentTypeRoutes,
  resources: resourceRoutes,
  appointments: appointmentRoutes,
  availability: availabilityRoutes,
  clients: clientRoutes,
}

// Export the router type for the client
export type Router = typeof router
```

### oRPC Instance Setup

```typescript
// apps/api/src/lib/orpc.ts
import { os, ORPCError } from '@orpc/server'

// Define the context type that will be available in all handlers
export interface Context {
  userId: string | null
  orgId: string | null
  sessionId: string | null
  role: 'admin' | 'staff' | null
}

// Create the base oRPC instance with context type
export const os = os.context<Context>()

// Re-export ORPCError for use in routes
export { ORPCError }
```

### Mounting in Hono

```typescript
// apps/api/src/index.ts
import { Hono } from 'hono'
import { RPCHandler } from '@orpc/server/fetch'
import { router } from './routes'
import { authMiddleware } from './middleware/auth'
import { rlsMiddleware } from './middleware/rls'
import { config } from './config'

const app = new Hono()

// Health check (no auth required)
app.get('/v1/health', (c) => c.json({ status: 'ok' }))

// Auth middleware populates context
app.use('/v1/*', authMiddleware)
app.use('/v1/*', rlsMiddleware)

// oRPC handler
const handler = new RPCHandler(router)

app.all('/v1/*', async (c) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: '/v1',
    context: {
      userId: c.get('userId'),
      orgId: c.get('orgId'),
      sessionId: c.get('sessionId'),
      role: c.get('role'),
    },
  })

  if (matched) {
    return c.newResponse(response.body, response)
  }

  return c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404)
})

export default {
  port: config.server.port,
  fetch: app.fetch,
}
```

### Client Setup

```typescript
// apps/admin-ui/src/lib/api.ts
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createORPCQueryUtils } from '@orpc/tanstack-query'
import type { Router } from '@scheduling/dto/contracts'

const link = new RPCLink({
  url: '/v1',
  headers: () => ({
    // Session cookie is sent automatically
  }),
})

export const client = createORPCClient<Router>(link)
export const orpc = createORPCQueryUtils(client)

// Usage in components:
// const { data } = orpc.locations.list.useQuery({ limit: 20 })
// const mutation = orpc.locations.create.useMutation()
```

---

## 2. BetterAuth + Drizzle Integration

### Required Tables

BetterAuth needs four core tables. We define them in the shared db package.

```typescript
// packages/db/src/schema/auth.ts
import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const id = uuid('id').primaryKey().default(sql`uuidv7()`)
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}

// Core user table (extends BetterAuth requirements)
export const users = pgTable('users', {
  id,
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  name: text('name'),
  image: text('image'),
  ...timestamps,
})

// Session table for BetterAuth
export const sessions = pgTable('sessions', {
  id,
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  ...timestamps,
})

// Account table for OAuth providers
export const accounts = pgTable('accounts', {
  id,
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  ...timestamps,
})

// Verification table for email confirmation, password reset
export const verifications = pgTable('verifications', {
  id,
  identifier: text('identifier').notNull(), // email or other identifier
  value: text('value').notNull(), // the verification token
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
})
```

### BetterAuth Configuration

```typescript
// apps/api/src/lib/auth.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db'
import { config } from '../config'
import * as schema from '@scheduling/db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  secret: config.auth.secret,
  baseURL: config.auth.baseUrl,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Enable in production
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
  },
})

export type Auth = typeof auth
```

### Auth Middleware for Hono

```typescript
// apps/api/src/middleware/auth.ts
import { createMiddleware } from 'hono/factory'
import { auth } from '../lib/auth'
import { db } from '../lib/db'
import { orgMemberships } from '@scheduling/db/schema'
import { eq } from 'drizzle-orm'

export const authMiddleware = createMiddleware(async (c, next) => {
  // Try session auth first
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (session?.user) {
    c.set('userId', session.user.id)
    c.set('sessionId', session.session.id)

    // Get org context from header or query param
    const orgId = c.req.header('X-Org-Id') || c.req.query('org_id')

    if (orgId) {
      // Verify user is member of this org
      const membership = await db.query.orgMemberships.findFirst({
        where: (m, { and, eq }) => and(
          eq(m.userId, session.user.id),
          eq(m.orgId, orgId)
        ),
      })

      if (membership) {
        c.set('orgId', orgId)
        c.set('role', membership.role)
      } else {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Not a member of this org' } }, 403)
      }
    } else {
      // Default to first org membership
      const membership = await db.query.orgMemberships.findFirst({
        where: eq(orgMemberships.userId, session.user.id),
      })
      if (membership) {
        c.set('orgId', membership.orgId)
        c.set('role', membership.role)
      }
    }

    return next()
  }

  // Try API token auth
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    // TODO: Validate API token and set context
    // This is implemented in Step 14
  }

  // For endpoints that allow unauthenticated access
  c.set('userId', null)
  c.set('orgId', null)
  c.set('sessionId', null)
  c.set('role', null)

  return next()
})
```

### Frontend Auth Integration

```typescript
// apps/admin-ui/src/lib/auth.ts
import { createAuthClient } from 'better-auth/client'

export const authClient = createAuthClient({
  baseURL: '/api/auth',
})

// React context for auth state
// apps/admin-ui/src/contexts/auth.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { authClient } from '../lib/auth'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      setUser(data?.user ?? null)
      setIsLoading(false)
    })
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await authClient.signIn.email({ email, password })
    if (error) throw error
    setUser(data.user)
  }

  const signOut = async () => {
    await authClient.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

---

## 3. RLS with Connection Pooling

### The Problem

When using connection pooling (e.g., via `pg` pool or Drizzle's pooled connections), `SET app.current_org_id = 'xxx'` persists on the connection and can leak to other requests if not properly reset.

### Solution: Transaction-Scoped Settings

Use `SET LOCAL` within a transaction, or wrap each request in a transaction:

```typescript
// packages/db/src/rls.ts
import { db } from './client'
import { sql } from 'drizzle-orm'

export async function withOrgContext<T>(
  orgId: string,
  fn: () => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL only affects the current transaction
    await tx.execute(sql`SET LOCAL app.current_org_id = ${orgId}`)
    return fn()
  })
}

// Alternative: Use set_config with is_local = true
export async function setOrgContext(orgId: string) {
  // The 'true' parameter makes this transaction-local
  await db.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`)
}
```

### Updated RLS Middleware

```typescript
// apps/api/src/middleware/rls.ts
import { createMiddleware } from 'hono/factory'
import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

export const rlsMiddleware = createMiddleware(async (c, next) => {
  const orgId = c.get('orgId')

  if (!orgId) {
    // No org context - RLS will block all rows (safe default)
    return next()
  }

  // For simple cases, we can use set_config at the start
  // This works if each request uses a single connection
  await db.execute(
    sql`SELECT set_config('app.current_org_id', ${orgId}, false)`
  )

  try {
    await next()
  } finally {
    // Reset the context after the request
    await db.execute(
      sql`SELECT set_config('app.current_org_id', '', false)`
    )
  }
})
```

### Better Approach: Per-Query RLS

For maximum safety with connection pooling, wrap database operations in transactions:

```typescript
// apps/api/src/lib/db.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { sql } from 'drizzle-orm'
import * as schema from '@scheduling/db/schema'
import { config } from '../config'

const pool = new Pool({ connectionString: config.db.url })

export const db = drizzle(pool, { schema })

// Helper to run queries with org context
export async function withOrg<T>(
  orgId: string,
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_org_id = ${orgId}`)
    return fn(tx)
  })
}

// Usage in route handlers:
// const items = await withOrg(context.orgId, (tx) =>
//   tx.query.appointments.findMany()
// )
```

### RLS Policies (Migration)

```sql
-- packages/db/src/migrations/0002_rls_policies.sql

-- Create helper function
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.current_org_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

-- Enable RLS on all org-scoped tables
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_time ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;

-- Create policies (example for appointments, repeat for others)
CREATE POLICY org_isolation ON appointments
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

CREATE POLICY org_isolation ON locations
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- ... repeat for all org-scoped tables

-- Bypass RLS for admin operations (migrations, seeding)
-- Create a separate role for this
CREATE ROLE app_admin BYPASSRLS;
```

---

## 4. Availability Engine Algorithm

### Core Data Structures

```typescript
// apps/api/src/services/availability-engine/types.ts

export interface AvailabilityQuery {
  appointmentTypeId: string
  calendarIds: string[]
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  timezone: string   // IANA timezone
}

export interface TimeSlot {
  start: Date
  end: Date
  available: boolean
  remainingCapacity: number
}

export interface AvailabilityRule {
  weekday: number  // 0-6, Sunday = 0
  startTime: string  // HH:MM
  endTime: string
  intervalMin: number | null
}

export interface AvailabilityOverride {
  date: string  // YYYY-MM-DD
  startTime: string | null
  endTime: string | null
  isBlocked: boolean
}

export interface BlockedTime {
  startAt: Date
  endAt: Date
  recurringRule: string | null  // RRULE
}

export interface SchedulingLimits {
  minNoticeHours: number | null
  maxNoticeDays: number | null
  maxPerSlot: number | null
  maxPerDay: number | null
  maxPerWeek: number | null
}
```

### Main Algorithm

```typescript
// apps/api/src/services/availability-engine/engine.ts

import { DateTime, Interval } from 'luxon'
import { db } from '../../lib/db'
import { RRule } from 'rrule'
import type {
  AvailabilityQuery,
  TimeSlot,
  AvailabilityRule,
  AvailabilityOverride,
  BlockedTime,
  SchedulingLimits,
} from './types'

export class AvailabilityEngine {

  async getAvailableDates(query: AvailabilityQuery): Promise<string[]> {
    const dates: string[] = []
    const { startDate, endDate, timezone } = query

    let current = DateTime.fromISO(startDate, { zone: timezone })
    const end = DateTime.fromISO(endDate, { zone: timezone })

    while (current <= end) {
      const slots = await this.getAvailableSlots({
        ...query,
        startDate: current.toISODate()!,
        endDate: current.toISODate()!,
      })

      if (slots.some(s => s.available)) {
        dates.push(current.toISODate()!)
      }

      current = current.plus({ days: 1 })
    }

    return dates
  }

  async getAvailableSlots(query: AvailabilityQuery): Promise<TimeSlot[]> {
    const { appointmentTypeId, calendarIds, startDate, endDate, timezone } = query

    // 1. Load appointment type details
    const appointmentType = await this.loadAppointmentType(appointmentTypeId)
    const { durationMin, paddingBeforeMin, paddingAfterMin, capacity } = appointmentType

    // 2. Load scheduling limits
    const limits = await this.loadSchedulingLimits(calendarIds)

    // 3. Load availability rules for all calendars
    const rules = await this.loadAvailabilityRules(calendarIds)

    // 4. Load overrides and blocked time
    const overrides = await this.loadOverrides(calendarIds, startDate, endDate)
    const blockedTimes = await this.loadBlockedTimes(calendarIds, startDate, endDate)

    // 5. Load existing appointments
    const existingAppointments = await this.loadExistingAppointments(
      calendarIds, startDate, endDate
    )

    // 6. Load resource constraints
    const resources = await this.loadResourceConstraints(appointmentTypeId)

    // 7. Generate candidate slots
    const candidateSlots = this.generateCandidateSlots(
      startDate, endDate, timezone, rules, overrides, durationMin
    )

    // 8. Apply filters
    const now = DateTime.now()
    const slots: TimeSlot[] = []

    for (const slot of candidateSlots) {
      let available = true
      let remainingCapacity = capacity

      // 8a. Check min/max notice
      if (limits.minNoticeHours) {
        const minNotice = now.plus({ hours: limits.minNoticeHours })
        if (slot.start < minNotice) {
          available = false
        }
      }

      if (limits.maxNoticeDays) {
        const maxNotice = now.plus({ days: limits.maxNoticeDays })
        if (slot.start > maxNotice) {
          available = false
        }
      }

      // 8b. Check blocked times (including recurring)
      for (const blocked of blockedTimes) {
        if (this.isBlockedAt(slot.start, slot.end, blocked)) {
          available = false
          break
        }
      }

      // 8c. Check existing appointments (with padding)
      const slotWithPadding = {
        start: DateTime.fromJSDate(slot.start).minus({ minutes: paddingBeforeMin }).toJSDate(),
        end: DateTime.fromJSDate(slot.end).plus({ minutes: paddingAfterMin }).toJSDate(),
      }

      let overlappingCount = 0
      for (const appt of existingAppointments) {
        if (this.intervalsOverlap(slotWithPadding, appt)) {
          overlappingCount++
        }
      }

      remainingCapacity = capacity - overlappingCount
      if (remainingCapacity <= 0) {
        available = false
      }

      // 8d. Check resource capacity
      if (available && resources.length > 0) {
        const resourceAvailable = await this.checkResourceCapacity(
          slot.start, slot.end, resources, existingAppointments
        )
        if (!resourceAvailable) {
          available = false
        }
      }

      // 8e. Check daily/weekly limits
      if (available && limits.maxPerDay) {
        const dailyCount = existingAppointments.filter(a =>
          DateTime.fromJSDate(a.startAt).hasSame(DateTime.fromJSDate(slot.start), 'day')
        ).length
        if (dailyCount >= limits.maxPerDay) {
          available = false
        }
      }

      slots.push({
        start: slot.start,
        end: slot.end,
        available,
        remainingCapacity: Math.max(0, remainingCapacity),
      })
    }

    return slots
  }

  async checkSlot(
    appointmentTypeId: string,
    calendarId: string,
    startTime: Date,
    timezone: string
  ): Promise<{ available: boolean; reason?: string }> {
    const appointmentType = await this.loadAppointmentType(appointmentTypeId)
    const endTime = DateTime.fromJSDate(startTime)
      .plus({ minutes: appointmentType.durationMin })
      .toJSDate()

    const slots = await this.getAvailableSlots({
      appointmentTypeId,
      calendarIds: [calendarId],
      startDate: DateTime.fromJSDate(startTime).toISODate()!,
      endDate: DateTime.fromJSDate(startTime).toISODate()!,
      timezone,
    })

    const matchingSlot = slots.find(s =>
      s.start.getTime() === startTime.getTime() &&
      s.end.getTime() === endTime.getTime()
    )

    if (!matchingSlot) {
      return { available: false, reason: 'INVALID_SLOT_TIME' }
    }

    if (!matchingSlot.available) {
      return { available: false, reason: 'SLOT_UNAVAILABLE' }
    }

    return { available: true }
  }

  private generateCandidateSlots(
    startDate: string,
    endDate: string,
    timezone: string,
    rules: AvailabilityRule[],
    overrides: AvailabilityOverride[],
    durationMin: number
  ): Array<{ start: Date; end: Date }> {
    const slots: Array<{ start: Date; end: Date }> = []

    let current = DateTime.fromISO(startDate, { zone: timezone }).startOf('day')
    const end = DateTime.fromISO(endDate, { zone: timezone }).endOf('day')

    while (current <= end) {
      const dateStr = current.toISODate()!
      const weekday = current.weekday % 7  // Luxon uses 1-7, we use 0-6

      // Check for override on this date
      const override = overrides.find(o => o.date === dateStr)

      if (override?.isBlocked) {
        // Entire day is blocked
        current = current.plus({ days: 1 })
        continue
      }

      // Get hours for this day (override or regular rule)
      let dayStart: string, dayEnd: string, interval: number

      if (override && override.startTime && override.endTime) {
        dayStart = override.startTime
        dayEnd = override.endTime
        interval = 15  // Default interval for overrides
      } else {
        const rule = rules.find(r => r.weekday === weekday)
        if (!rule) {
          current = current.plus({ days: 1 })
          continue
        }
        dayStart = rule.startTime
        dayEnd = rule.endTime
        interval = rule.intervalMin || 15
      }

      // Generate slots for this day
      const [startHour, startMin] = dayStart.split(':').map(Number)
      const [endHour, endMin] = dayEnd.split(':').map(Number)

      let slotStart = current.set({ hour: startHour, minute: startMin })
      const dayEndTime = current.set({ hour: endHour, minute: endMin })

      while (slotStart.plus({ minutes: durationMin }) <= dayEndTime) {
        const slotEnd = slotStart.plus({ minutes: durationMin })
        slots.push({
          start: slotStart.toJSDate(),
          end: slotEnd.toJSDate(),
        })
        slotStart = slotStart.plus({ minutes: interval })
      }

      current = current.plus({ days: 1 })
    }

    return slots
  }

  private isBlockedAt(start: Date, end: Date, blocked: BlockedTime): boolean {
    // Handle recurring blocked time
    if (blocked.recurringRule) {
      const rrule = RRule.fromString(blocked.recurringRule)
      const occurrences = rrule.between(
        DateTime.fromJSDate(start).minus({ days: 1 }).toJSDate(),
        DateTime.fromJSDate(end).plus({ days: 1 }).toJSDate(),
        true
      )

      for (const occurrence of occurrences) {
        const blockStart = DateTime.fromJSDate(occurrence)
        const blockEnd = blockStart.plus({
          milliseconds: blocked.endAt.getTime() - blocked.startAt.getTime()
        })

        if (this.intervalsOverlap(
          { start, end },
          { start: blockStart.toJSDate(), end: blockEnd.toJSDate() }
        )) {
          return true
        }
      }
      return false
    }

    // Simple blocked time
    return this.intervalsOverlap({ start, end }, blocked)
  }

  private intervalsOverlap(
    a: { start: Date; end: Date },
    b: { start: Date; end: Date }
  ): boolean {
    return a.start < b.end && b.start < a.end
  }

  private async checkResourceCapacity(
    start: Date,
    end: Date,
    resources: Array<{ resourceId: string; quantityRequired: number }>,
    existingAppointments: Array<{ startAt: Date; endAt: Date; resourceAllocations: any[] }>
  ): Promise<boolean> {
    for (const resource of resources) {
      const allocated = existingAppointments
        .filter(a => this.intervalsOverlap({ start, end }, { start: a.startAt, end: a.endAt }))
        .reduce((sum, a) => {
          const allocation = a.resourceAllocations?.find(r => r.resourceId === resource.resourceId)
          return sum + (allocation?.quantity || 0)
        }, 0)

      const resourceData = await db.query.resources.findFirst({
        where: (r, { eq }) => eq(r.id, resource.resourceId)
      })

      if (!resourceData || allocated + resource.quantityRequired > resourceData.quantity) {
        return false
      }
    }

    return true
  }

  // ... data loading methods
  private async loadAppointmentType(id: string) { /* ... */ }
  private async loadSchedulingLimits(calendarIds: string[]) { /* ... */ }
  private async loadAvailabilityRules(calendarIds: string[]) { /* ... */ }
  private async loadOverrides(calendarIds: string[], start: string, end: string) { /* ... */ }
  private async loadBlockedTimes(calendarIds: string[], start: string, end: string) { /* ... */ }
  private async loadExistingAppointments(calendarIds: string[], start: string, end: string) { /* ... */ }
  private async loadResourceConstraints(appointmentTypeId: string) { /* ... */ }
}
```

---

## 5. Error Handling Pattern

### Error Codes Taxonomy

```typescript
// packages/dto/src/errors.ts
export const ErrorCodes = {
  // Authentication (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Authorization (403)
  FORBIDDEN: 'FORBIDDEN',
  NOT_ORG_MEMBER: 'NOT_ORG_MEMBER',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Not Found (404)
  NOT_FOUND: 'NOT_FOUND',
  APPOINTMENT_NOT_FOUND: 'APPOINTMENT_NOT_FOUND',
  CALENDAR_NOT_FOUND: 'CALENDAR_NOT_FOUND',

  // Validation (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_TIMEZONE: 'INVALID_TIMEZONE',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',

  // Conflict (409)
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',

  // Business Logic (422)
  BOOKING_IN_PAST: 'BOOKING_IN_PAST',
  EXCEEDS_CAPACITY: 'EXCEEDS_CAPACITY',
  OUTSIDE_NOTICE_WINDOW: 'OUTSIDE_NOTICE_WINDOW',
  APPOINTMENT_ALREADY_CANCELLED: 'APPOINTMENT_ALREADY_CANCELLED',

  // Server (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]
```

### oRPC Error Handling

```typescript
// apps/api/src/lib/errors.ts
import { ORPCError } from '@orpc/server'
import { ErrorCodes, type ErrorCode } from '@scheduling/dto'

export class AppError extends ORPCError {
  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(code, { message, data: details })
  }
}

// Usage in handlers:
throw new AppError('SLOT_UNAVAILABLE', 'The requested time slot is no longer available', {
  requestedSlot: input.startTime,
  nextAvailable: nextSlot?.start,
})
```

### Global Error Handler

```typescript
// apps/api/src/middleware/error-handler.ts
import { createMiddleware } from 'hono/factory'
import { ORPCError } from '@orpc/server'
import { ZodError } from 'zod'

const errorStatusMap: Record<string, number> = {
  UNAUTHORIZED: 401,
  SESSION_EXPIRED: 401,
  INVALID_TOKEN: 401,
  FORBIDDEN: 403,
  NOT_ORG_MEMBER: 403,
  INSUFFICIENT_PERMISSIONS: 403,
  NOT_FOUND: 404,
  APPOINTMENT_NOT_FOUND: 404,
  CALENDAR_NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INVALID_TIMEZONE: 400,
  INVALID_DATE_RANGE: 400,
  SLOT_UNAVAILABLE: 409,
  RESOURCE_CONFLICT: 409,
  DUPLICATE_ENTRY: 409,
  BOOKING_IN_PAST: 422,
  EXCEEDS_CAPACITY: 422,
  OUTSIDE_NOTICE_WINDOW: 422,
  APPOINTMENT_ALREADY_CANCELLED: 422,
}

export const errorHandler = createMiddleware(async (c, next) => {
  try {
    await next()
  } catch (error) {
    if (error instanceof ORPCError) {
      const status = errorStatusMap[error.code] || 500
      return c.json({
        error: {
          code: error.code,
          message: error.message,
          details: error.data,
        }
      }, status)
    }

    if (error instanceof ZodError) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.flatten(),
        }
      }, 400)
    }

    console.error('Unhandled error:', error)
    return c.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      }
    }, 500)
  }
})
```

---

## 6. Pagination Pattern

### Cursor-Based Pagination

We use cursor-based pagination with UUID7 IDs (which are naturally sortable).

```typescript
// packages/dto/src/schemas/pagination.ts
import { z } from 'zod'

export const PaginationInputSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

export const createPaginatedOutputSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().uuid().nullable(),
    totalCount: z.number().int().optional(), // Only included if requested
  })

export type PaginationInput = z.infer<typeof PaginationInputSchema>
```

### Paginated Query Helper

```typescript
// packages/db/src/utils/pagination.ts
import { gt, sql, type SQL } from 'drizzle-orm'
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core'

export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
  totalCount?: number
}

export async function paginate<T extends { id: string }>(
  query: () => Promise<T[]>,
  options: {
    cursor?: string
    limit: number
    includeTotalCount?: boolean
    countQuery?: () => Promise<number>
  }
): Promise<PaginatedResult<T>> {
  const { cursor, limit, includeTotalCount, countQuery } = options

  // Fetch one extra to determine if there are more
  const items = await query()

  const hasMore = items.length > limit
  if (hasMore) {
    items.pop()
  }

  const result: PaginatedResult<T> = {
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  }

  if (includeTotalCount && countQuery) {
    result.totalCount = await countQuery()
  }

  return result
}
```

### Usage in Route

```typescript
// apps/api/src/routes/appointments.ts
export const appointmentRoutes = {
  list: authed
    .route({ method: 'GET', path: '/v1/appointments' })
    .input(PaginationInputSchema.extend({
      calendarId: z.string().uuid().optional(),
      status: z.enum(['scheduled', 'confirmed', 'cancelled', 'no_show']).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }))
    .output(createPaginatedOutputSchema(AppointmentSchema))
    .handler(async ({ input }) => {
      const { cursor, limit, calendarId, status, startDate, endDate } = input

      const items = await db.query.appointments.findMany({
        where: (appt, { and, gt, eq, gte, lte }) => and(
          cursor ? gt(appt.id, cursor) : undefined,
          calendarId ? eq(appt.calendarId, calendarId) : undefined,
          status ? eq(appt.status, status) : undefined,
          startDate ? gte(appt.startAt, new Date(startDate)) : undefined,
          endDate ? lte(appt.startAt, new Date(endDate)) : undefined,
        ),
        limit: limit + 1,
        orderBy: (appt, { asc }) => asc(appt.id),
        with: {
          calendar: true,
          appointmentType: true,
          client: true,
        },
      })

      const hasMore = items.length > limit
      if (hasMore) items.pop()

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1].id : null,
      }
    }),
}
```

---

## 7. Testing Setup (Vitest + PGLite)

### Vitest Configuration

```typescript
// vitest.config.ts (root)
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@scheduling/db': resolve(__dirname, './packages/db/src'),
      '@scheduling/dto': resolve(__dirname, './packages/dto/src'),
    },
  },
})
```

### Test Database Setup

```typescript
// packages/db/src/test-utils.ts
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from './schema'

let testClient: PGlite | null = null
let testDb: ReturnType<typeof drizzle> | null = null

export async function createTestDb() {
  if (testDb) return testDb

  testClient = new PGlite()
  testDb = drizzle(testClient, { schema })

  // Apply schema using drizzle-kit push
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const { pushSchema } = require('drizzle-kit/api') as typeof import('drizzle-kit/api')

  const { apply } = await pushSchema(schema, testDb as any)
  await apply()

  return testDb
}

export async function resetTestDb() {
  if (!testDb) return

  // Truncate all tables
  const tables = Object.keys(schema).filter(k => k !== 'default')
  for (const table of tables) {
    await testDb.execute(`TRUNCATE TABLE ${table} CASCADE`)
  }
}

export async function closeTestDb() {
  if (testClient) {
    await testClient.close()
    testClient = null
    testDb = null
  }
}

// Test fixtures
export async function seedTestOrg(db: typeof testDb) {
  const [org] = await db!.insert(schema.orgs).values({
    name: 'Test Org',
  }).returning()

  const [user] = await db!.insert(schema.users).values({
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: true,
  }).returning()

  await db!.insert(schema.orgMemberships).values({
    orgId: org.id,
    userId: user.id,
    role: 'admin',
  })

  return { org, user }
}
```

### Example Test

```typescript
// packages/db/src/__tests__/appointments.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestDb, resetTestDb, closeTestDb, seedTestOrg } from '../test-utils'
import { appointments, calendars, locations, appointmentTypes } from '../schema'
import { eq } from 'drizzle-orm'

describe('Appointments', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let org: any
  let calendar: any
  let appointmentType: any

  beforeAll(async () => {
    db = await createTestDb()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await resetTestDb()
    const seed = await seedTestOrg(db)
    org = seed.org

    // Create test data
    const [location] = await db.insert(locations).values({
      orgId: org.id,
      name: 'Main Office',
      timezone: 'America/New_York',
    }).returning()

    ;[calendar] = await db.insert(calendars).values({
      orgId: org.id,
      locationId: location.id,
      name: 'Room 1',
      timezone: 'America/New_York',
    }).returning()

    ;[appointmentType] = await db.insert(appointmentTypes).values({
      orgId: org.id,
      name: 'Consultation',
      durationMin: 60,
    }).returning()
  })

  it('creates an appointment', async () => {
    const [appointment] = await db.insert(appointments).values({
      orgId: org.id,
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      startAt: new Date('2024-03-15T10:00:00Z'),
      endAt: new Date('2024-03-15T11:00:00Z'),
      timezone: 'America/New_York',
      status: 'scheduled',
    }).returning()

    expect(appointment.id).toBeDefined()
    expect(appointment.status).toBe('scheduled')
  })

  it('enforces RLS with org context', async () => {
    // This test verifies RLS is working
    // In a real test, you'd set up RLS context and verify isolation
  })
})
```

### Vitest Setup File

```typescript
// vitest.setup.ts
import { afterAll } from 'vitest'
import { closeTestDb } from './packages/db/src/test-utils'

afterAll(async () => {
  await closeTestDb()
})
```

---

## 8. Package Dependencies

### Dependency Graph

```
@scheduling/dto
  └── zod (peer)

@scheduling/db
  ├── drizzle-orm
  ├── @electric-sql/pglite (dev - for testing)
  └── @scheduling/dto (for types)

apps/api
  ├── hono
  ├── @orpc/server
  ├── better-auth
  ├── bullmq
  ├── luxon
  ├── rrule
  ├── @scheduling/db
  └── @scheduling/dto

apps/admin-ui
  ├── react
  ├── @tanstack/react-router
  ├── @tanstack/react-query
  ├── @orpc/client
  ├── @orpc/tanstack-query
  ├── better-auth/client
  └── @scheduling/dto
```

### Package.json Files

```json
// packages/dto/package.json
{
  "name": "@scheduling/dto",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./contracts": "./src/contracts/index.ts"
  },
  "peerDependencies": {
    "zod": "^3.23.0"
  }
}
```

```json
// packages/db/package.json
{
  "name": "@scheduling/db",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./test-utils": "./src/test-utils.ts"
  },
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "push": "drizzle-kit push",
    "studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@scheduling/dto": "workspace:*",
    "drizzle-orm": "^0.36.0"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.2.0",
    "drizzle-kit": "^0.28.0"
  }
}
```

### Build Order

When running `pnpm install`, pnpm automatically handles the dependency order:

1. `@scheduling/dto` (no internal dependencies)
2. `@scheduling/db` (depends on dto)
3. `apps/api` (depends on db, dto)
4. `apps/admin-ui` (depends on dto)

---

## 9. Development Workflow

### Root package.json Scripts

```json
// package.json (root)
{
  "name": "scheduling-app",
  "private": true,
  "scripts": {
    "dev": "concurrently -n api,ui -c blue,green \"pnpm --filter apps/api dev\" \"pnpm --filter apps/admin-ui dev\"",
    "dev:api": "pnpm --filter apps/api dev",
    "dev:ui": "pnpm --filter apps/admin-ui dev",
    "build": "pnpm -r build",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "oxlint .",
    "format": "oxfmt .",
    "db:generate": "pnpm --filter @scheduling/db generate",
    "db:migrate": "pnpm --filter @scheduling/db migrate",
    "db:push": "pnpm --filter @scheduling/db push",
    "db:studio": "pnpm --filter @scheduling/db studio",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down"
  },
  "devDependencies": {
    "concurrently": "^8.2.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

### API Dev Server

```typescript
// apps/api/package.json
{
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun dist/index.js"
  }
}
```

### Admin UI Dev Server

```json
// apps/admin-ui/package.json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### Development Flow

```bash
# 1. Start infrastructure (first time or after restart)
pnpm docker:up

# 2. Install dependencies (if needed)
pnpm install

# 3. Run migrations
pnpm db:migrate

# 4. Start development servers
pnpm dev

# The API runs at http://localhost:3000
# The Admin UI runs at http://localhost:5173 (Vite default)
# Vite proxies /v1/* to the API server
```

### Vite Proxy Configuration

```typescript
// apps/admin-ui/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'

export default defineConfig({
  plugins: [react(), TanStackRouterVite()],
  server: {
    proxy: {
      '/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

---

## 10. Timezone Handling

### Data Model

- **Locations** have a default timezone (e.g., `America/New_York`)
- **Calendars** inherit from location but can override
- **Appointments** store the timezone they were booked in
- **All timestamps** in the database are stored as `timestamptz` (UTC)

### Flow: Availability → Booking → Display

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client/UI     │     │   API Server    │     │    Database     │
│  (local time)   │     │   (UTC)         │     │   (UTC)         │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  GET /availability    │                       │
         │  ?timezone=America/   │                       │
         │   New_York            │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │                       │  Query rules with     │
         │                       │  calendar timezone    │
         │                       │──────────────────────>│
         │                       │<──────────────────────│
         │                       │                       │
         │                       │  Generate slots in    │
         │                       │  requested timezone   │
         │                       │                       │
         │  Slots in local time  │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │  POST /appointments   │                       │
         │  { start: ISO8601,    │                       │
         │    timezone: "..." }  │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │                       │  Store as UTC +       │
         │                       │  timezone field       │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │                       │
         │  GET /appointments    │                       │
         │──────────────────────>│                       │
         │                       │  Return UTC times     │
         │                       │  + stored timezone    │
         │<──────────────────────│                       │
         │                       │                       │
         │  Convert to display   │                       │
         │  timezone locally     │                       │
```

### Implementation

```typescript
// apps/api/src/services/availability-engine/timezone.ts
import { DateTime } from 'luxon'

export function parseToUTC(dateTimeStr: string, timezone: string): Date {
  return DateTime.fromISO(dateTimeStr, { zone: timezone }).toUTC().toJSDate()
}

export function formatInTimezone(utcDate: Date, timezone: string): string {
  return DateTime.fromJSDate(utcDate, { zone: 'UTC' })
    .setZone(timezone)
    .toISO()!
}

export function getCalendarTimezone(calendar: { timezone: string }, location: { timezone: string }): string {
  return calendar.timezone || location.timezone
}
```

### Appointment Creation

```typescript
// apps/api/src/routes/appointments.ts
create: authed
  .route({ method: 'POST', path: '/v1/appointments' })
  .input(CreateAppointmentSchema)
  .output(AppointmentSchema)
  .handler(async ({ input, context }) => {
    const { calendarId, appointmentTypeId, startTime, timezone, clientId, notes } = input

    // Parse start time to UTC
    const startAt = parseToUTC(startTime, timezone)

    // Calculate end time
    const appointmentType = await db.query.appointmentTypes.findFirst({
      where: eq(appointmentTypes.id, appointmentTypeId),
    })
    const endAt = DateTime.fromJSDate(startAt)
      .plus({ minutes: appointmentType!.durationMin })
      .toJSDate()

    // Check availability
    const engine = new AvailabilityEngine()
    const { available, reason } = await engine.checkSlot(
      appointmentTypeId, calendarId, startAt, timezone
    )

    if (!available) {
      throw new AppError('SLOT_UNAVAILABLE', `Cannot book: ${reason}`)
    }

    // Create appointment (stores UTC times + timezone)
    const [appointment] = await db.insert(appointments).values({
      orgId: context.orgId,
      calendarId,
      appointmentTypeId,
      clientId,
      startAt,  // UTC
      endAt,    // UTC
      timezone, // Original booking timezone
      status: 'scheduled',
      notes,
    }).returning()

    return appointment
  }),
```

---

## 11. Resource Allocation & Race Conditions

### The Problem

When two users try to book the last available slot simultaneously, we need to prevent double-booking.

### Solution: Optimistic Locking with Database Constraints

```typescript
// apps/api/src/services/booking.ts
import { db } from '../lib/db'
import { appointments, appointmentResources } from '@scheduling/db/schema'
import { sql } from 'drizzle-orm'

export async function createBookingWithLocking(
  orgId: string,
  calendarId: string,
  appointmentTypeId: string,
  startAt: Date,
  endAt: Date,
  timezone: string,
  clientId: string | null,
  resources: Array<{ resourceId: string; quantity: number }>,
  notes: string | null
) {
  return db.transaction(async (tx) => {
    // 1. Lock the calendar row to prevent concurrent bookings
    await tx.execute(sql`
      SELECT id FROM calendars
      WHERE id = ${calendarId}
      FOR UPDATE
    `)

    // 2. Check for overlapping appointments (with padding)
    const appointmentType = await tx.query.appointmentTypes.findFirst({
      where: (at, { eq }) => eq(at.id, appointmentTypeId),
    })

    const paddedStart = new Date(startAt.getTime() - (appointmentType!.paddingBeforeMin || 0) * 60000)
    const paddedEnd = new Date(endAt.getTime() + (appointmentType!.paddingAfterMin || 0) * 60000)

    const overlapping = await tx.query.appointments.findFirst({
      where: (appt, { and, eq, lt, gt, ne }) => and(
        eq(appt.calendarId, calendarId),
        ne(appt.status, 'cancelled'),
        lt(appt.startAt, paddedEnd),
        gt(appt.endAt, paddedStart)
      ),
    })

    // Check capacity
    const overlappingCount = overlapping ? 1 : 0  // Simplified; real impl counts all overlapping
    if (overlappingCount >= appointmentType!.capacity) {
      throw new AppError('SLOT_UNAVAILABLE', 'This time slot is no longer available')
    }

    // 3. Check resource availability
    for (const resource of resources) {
      const allocated = await tx.execute(sql`
        SELECT COALESCE(SUM(ar.quantity), 0) as total
        FROM appointment_resources ar
        JOIN appointments a ON a.id = ar.appointment_id
        WHERE ar.resource_id = ${resource.resourceId}
          AND a.status != 'cancelled'
          AND a.start_at < ${paddedEnd}
          AND a.end_at > ${paddedStart}
      `)

      const resourceData = await tx.query.resources.findFirst({
        where: (r, { eq }) => eq(r.id, resource.resourceId),
      })

      const currentlyAllocated = Number(allocated[0]?.total || 0)
      if (currentlyAllocated + resource.quantity > resourceData!.quantity) {
        throw new AppError('RESOURCE_CONFLICT', `Resource ${resourceData!.name} is not available`)
      }
    }

    // 4. Create the appointment
    const [appointment] = await tx.insert(appointments).values({
      orgId,
      calendarId,
      appointmentTypeId,
      clientId,
      startAt,
      endAt,
      timezone,
      status: 'scheduled',
      notes,
    }).returning()

    // 5. Allocate resources
    if (resources.length > 0) {
      await tx.insert(appointmentResources).values(
        resources.map(r => ({
          appointmentId: appointment.id,
          resourceId: r.resourceId,
          quantity: r.quantity,
        }))
      )
    }

    return appointment
  }, {
    isolationLevel: 'serializable', // Strongest isolation
  })
}
```

### Database-Level Constraints

```sql
-- packages/db/src/migrations/0003_booking_constraints.sql

-- Prevent overlapping appointments beyond capacity
-- This is a complex constraint that might be better handled in application code
-- But we can add a simpler check:

CREATE OR REPLACE FUNCTION check_appointment_overlap()
RETURNS TRIGGER AS $$
DECLARE
  overlap_count INTEGER;
  max_capacity INTEGER;
BEGIN
  -- Get capacity for this appointment type
  SELECT capacity INTO max_capacity
  FROM appointment_types
  WHERE id = NEW.appointment_type_id;

  -- Count overlapping non-cancelled appointments
  SELECT COUNT(*) INTO overlap_count
  FROM appointments
  WHERE calendar_id = NEW.calendar_id
    AND id != NEW.id
    AND status != 'cancelled'
    AND start_at < NEW.end_at
    AND end_at > NEW.start_at;

  IF overlap_count >= max_capacity THEN
    RAISE EXCEPTION 'Appointment capacity exceeded for this time slot';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_appointment_capacity
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_appointment_overlap();
```

### Retry Logic for Conflicts

```typescript
// apps/api/src/routes/appointments.ts
create: authed
  .route({ method: 'POST', path: '/v1/appointments' })
  .input(CreateAppointmentSchema)
  .output(AppointmentSchema)
  .handler(async ({ input, context }) => {
    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await createBookingWithLocking(
          context.orgId,
          input.calendarId,
          input.appointmentTypeId,
          parseToUTC(input.startTime, input.timezone),
          // ... other params
        )
      } catch (error) {
        if (error instanceof AppError &&
            (error.code === 'SLOT_UNAVAILABLE' || error.code === 'RESOURCE_CONFLICT')) {
          throw error  // Don't retry business logic errors
        }

        // Retry on serialization failures
        if (error.code === '40001') {  // PostgreSQL serialization failure
          lastError = error
          await new Promise(r => setTimeout(r, 50 * (attempt + 1)))  // Exponential backoff
          continue
        }

        throw error
      }
    }

    throw lastError || new AppError('INTERNAL_ERROR', 'Failed to create appointment after retries')
  }),
```
