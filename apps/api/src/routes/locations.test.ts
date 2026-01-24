// Tests for location routes - validates router registration
// Actual handler tests should be done through HTTP API integration tests

import { describe, test, expect } from 'bun:test'

describe('Location Routes Module', () => {
  test('location routes module exists and exports correctly', async () => {
    // Dynamically import to avoid circular dependency issues
    const { locationRoutes } = await import('./locations.js')

    // Verify all routes exist
    expect(locationRoutes).toBeDefined()
    expect(locationRoutes.list).toBeDefined()
    expect(locationRoutes.get).toBeDefined()
    expect(locationRoutes.create).toBeDefined()
    expect(locationRoutes.update).toBeDefined()
    expect(locationRoutes.remove).toBeDefined()
  })

  test('main router includes location routes', async () => {
    // This verifies the router is properly composed
    const { router } = await import('./index.js')

    expect(router).toBeDefined()
    expect(router.locations).toBeDefined()
    expect(router.locations.list).toBeDefined()
    expect(router.locations.get).toBeDefined()
    expect(router.locations.create).toBeDefined()
    expect(router.locations.update).toBeDefined()
    expect(router.locations.remove).toBeDefined()
  })
})
