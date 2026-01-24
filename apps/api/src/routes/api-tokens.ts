// oRPC routes for API token management
// - Only admins can manage API tokens
// - Token issuance, listing, revocation

import { z } from 'zod'
import { eq, and, gt, isNull } from 'drizzle-orm'
import { randomBytes, createHash } from 'crypto'
import { apiTokens } from '@scheduling/db/schema'
import {
  createApiTokenSchema,
  listApiTokensQuerySchema,
  updateApiTokenSchema,
} from '@scheduling/dto'
import { adminOnly } from './base.js'
import { withOrg } from '../lib/db.js'
import { ORPCError } from '../lib/orpc.js'

const idInput = z.object({ id: z.string().uuid() })

// Generate a secure random token
function generateToken(): string {
  // Generate 32 bytes (256 bits) of randomness
  const bytes = randomBytes(32)
  // Convert to base64url for URL-safe usage
  return bytes.toString('base64url')
}

// Hash a token using SHA-256
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Token prefix for identification (e.g., "sk_live_abc12345")
function getTokenPrefix(token: string): string {
  return `sk_live_${token.slice(0, 8)}`
}

// ============================================================================
// LIST API TOKENS
// ============================================================================

export const list = adminOnly
  .input(listApiTokensQuerySchema)
  .handler(async ({ input, context }) => {
    const { cursor, limit, includeRevoked } = input
    const { orgId } = context

    const results = await withOrg(orgId, async (tx) => {
      const conditions: ReturnType<typeof eq>[] = []

      if (cursor) {
        conditions.push(gt(apiTokens.id, cursor))
      }

      if (!includeRevoked) {
        conditions.push(isNull(apiTokens.revokedAt))
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined

      return tx
        .select({
          id: apiTokens.id,
          orgId: apiTokens.orgId,
          userId: apiTokens.userId,
          name: apiTokens.name,
          scope: apiTokens.scope,
          tokenPrefix: apiTokens.tokenPrefix,
          lastUsedAt: apiTokens.lastUsedAt,
          expiresAt: apiTokens.expiresAt,
          revokedAt: apiTokens.revokedAt,
          createdAt: apiTokens.createdAt,
          updatedAt: apiTokens.updatedAt,
        })
        .from(apiTokens)
        .where(whereClause)
        .limit(limit + 1)
        .orderBy(apiTokens.id)
    })

    const hasMore = results.length > limit
    const items = hasMore ? results.slice(0, limit) : results

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    }
  })

// ============================================================================
// GET SINGLE API TOKEN
// ============================================================================

export const get = adminOnly
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    const [token] = await withOrg(orgId, async (tx) => {
      return tx
        .select({
          id: apiTokens.id,
          orgId: apiTokens.orgId,
          userId: apiTokens.userId,
          name: apiTokens.name,
          scope: apiTokens.scope,
          tokenPrefix: apiTokens.tokenPrefix,
          lastUsedAt: apiTokens.lastUsedAt,
          expiresAt: apiTokens.expiresAt,
          revokedAt: apiTokens.revokedAt,
          createdAt: apiTokens.createdAt,
          updatedAt: apiTokens.updatedAt,
        })
        .from(apiTokens)
        .where(eq(apiTokens.id, id))
        .limit(1)
    })

    if (!token) {
      throw new ORPCError('NOT_FOUND', { message: 'API token not found' })
    }

    return token
  })

// ============================================================================
// CREATE API TOKEN
// ============================================================================

export const create = adminOnly
  .input(createApiTokenSchema)
  .handler(async ({ input, context }) => {
    const { name, scope, expiresAt } = input
    const { orgId, userId } = context

    // Generate the token
    const token = generateToken()
    const tokenHash = hashToken(token)
    const tokenPrefix = getTokenPrefix(token)

    const [created] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(apiTokens)
        .values({
          orgId,
          userId,
          name,
          tokenHash,
          tokenPrefix,
          scope,
          expiresAt: expiresAt ?? null,
        })
        .returning({
          id: apiTokens.id,
          name: apiTokens.name,
          scope: apiTokens.scope,
          tokenPrefix: apiTokens.tokenPrefix,
          expiresAt: apiTokens.expiresAt,
          createdAt: apiTokens.createdAt,
        })
    })

    // Return the full token only once on creation
    return {
      ...created!,
      token: `${tokenPrefix}${token}`, // Full token with prefix
    }
  })

// ============================================================================
// UPDATE API TOKEN
// ============================================================================

export const update = adminOnly
  .input(idInput.merge(z.object({ data: updateApiTokenSchema })))
  .handler(async ({ input, context }) => {
    const { id, data } = input
    const { orgId } = context

    // Verify token exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(apiTokens)
        .where(eq(apiTokens.id, id))
        .limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'API token not found' })
    }

    if (existing.revokedAt) {
      throw new ORPCError('BAD_REQUEST', { message: 'Cannot update a revoked token' })
    }

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(apiTokens)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(apiTokens.id, id))
        .returning({
          id: apiTokens.id,
          orgId: apiTokens.orgId,
          userId: apiTokens.userId,
          name: apiTokens.name,
          scope: apiTokens.scope,
          tokenPrefix: apiTokens.tokenPrefix,
          lastUsedAt: apiTokens.lastUsedAt,
          expiresAt: apiTokens.expiresAt,
          revokedAt: apiTokens.revokedAt,
          createdAt: apiTokens.createdAt,
          updatedAt: apiTokens.updatedAt,
        })
    })

    return updated!
  })

// ============================================================================
// REVOKE API TOKEN
// ============================================================================

export const revoke = adminOnly
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    // Verify token exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(apiTokens)
        .where(eq(apiTokens.id, id))
        .limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'API token not found' })
    }

    if (existing.revokedAt) {
      throw new ORPCError('BAD_REQUEST', { message: 'Token is already revoked' })
    }

    const [revoked] = await withOrg(orgId, async (tx) => {
      return tx
        .update(apiTokens)
        .set({
          revokedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(apiTokens.id, id))
        .returning({
          id: apiTokens.id,
          orgId: apiTokens.orgId,
          userId: apiTokens.userId,
          name: apiTokens.name,
          scope: apiTokens.scope,
          tokenPrefix: apiTokens.tokenPrefix,
          lastUsedAt: apiTokens.lastUsedAt,
          expiresAt: apiTokens.expiresAt,
          revokedAt: apiTokens.revokedAt,
          createdAt: apiTokens.createdAt,
          updatedAt: apiTokens.updatedAt,
        })
    })

    return revoked!
  })

// ============================================================================
// ROUTE EXPORTS
// ============================================================================

export const apiTokenRoutes = {
  list,
  get,
  create,
  update,
  revoke,
}
