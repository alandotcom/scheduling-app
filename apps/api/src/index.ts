// @scheduling/api - Hono + oRPC API server with BetterAuth

import { Hono } from 'hono'
import { RPCHandler } from '@orpc/server/fetch'
import { router } from './routes/index.js'
import { auth } from './lib/auth.js'
import { authMiddleware } from './middleware/auth.js'
import { rlsMiddleware } from './middleware/rls.js'
import { errorHandler } from './middleware/error-handler.js'
import { config } from './config.js'

const app = new Hono()

// Global error handler
app.use('*', errorHandler)

// Health check (no auth required)
app.get('/v1/health', (c) => c.json({ status: 'ok' }))

// BetterAuth routes
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw)
})

// Auth and RLS middleware for API routes
app.use('/v1/*', authMiddleware)
app.use('/v1/*', rlsMiddleware)

// oRPC handler
const rpcHandler = new RPCHandler(router)

app.all('/v1/*', async (c) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
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

  return c.json(
    { error: { code: 'NOT_FOUND', message: 'Route not found' } },
    404
  )
})

// Export for Bun server
export default {
  port: config.server.port,
  fetch: app.fetch,
}

console.log(`Server running on port ${config.server.port}`)
