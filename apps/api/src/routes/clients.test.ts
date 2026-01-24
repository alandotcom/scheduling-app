// Tests for client routes - validates router registration
// Actual handler tests should be done through HTTP API integration tests

import { describe, test, expect } from 'bun:test'

describe('Client Routes Module', () => {
  test('client routes module exists and exports correctly', async () => {
    // Dynamically import to avoid circular dependency issues
    const { clientRoutes } = await import('./clients.js')

    // Verify all routes exist
    expect(clientRoutes).toBeDefined()
    expect(clientRoutes.list).toBeDefined()
    expect(clientRoutes.get).toBeDefined()
    expect(clientRoutes.create).toBeDefined()
    expect(clientRoutes.update).toBeDefined()
    expect(clientRoutes.remove).toBeDefined()
  })

  test('main router includes client routes', async () => {
    // This verifies the router is properly composed
    const { router } = await import('./index.js')

    expect(router).toBeDefined()
    expect(router.clients).toBeDefined()
    expect(router.clients.list).toBeDefined()
    expect(router.clients.get).toBeDefined()
    expect(router.clients.create).toBeDefined()
    expect(router.clients.update).toBeDefined()
    expect(router.clients.remove).toBeDefined()
  })
})
