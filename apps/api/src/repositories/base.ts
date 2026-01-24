// Base repository utilities and types

import { sql } from 'drizzle-orm'
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql'
import type * as schema from '@scheduling/db/schema'

export type Database = BunSQLDatabase<typeof schema>

// Pagination input for cursor-based pagination
export interface PaginationInput {
  cursor?: string | null | undefined
  limit: number
}

// Paginated result type
export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

// Helper to apply cursor pagination to results
export function paginate<T extends { id: string }>(
  results: T[],
  limit: number
): PaginatedResult<T> {
  const hasMore = results.length > limit
  const items = hasMore ? results.slice(0, limit) : results
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    hasMore,
  }
}

// Set org context for RLS within a transaction
export async function setOrgContext(tx: Database, orgId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`)
}
