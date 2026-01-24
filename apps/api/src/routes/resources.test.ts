// Tests for resource routes - validates router registration
// Actual handler tests should be done through HTTP API integration tests

import { describe, test, expect } from 'bun:test'

describe('Resource Routes Module', () => {
  test('resource routes module exists and exports correctly', async () => {
    // Dynamically import to avoid circular dependency issues
    const { resourceRoutes } = await import('./resources.js')

    // Verify all routes exist
    expect(resourceRoutes).toBeDefined()
    expect(resourceRoutes.list).toBeDefined()
    expect(resourceRoutes.get).toBeDefined()
    expect(resourceRoutes.create).toBeDefined()
    expect(resourceRoutes.update).toBeDefined()
    expect(resourceRoutes.remove).toBeDefined()
  })

  test('main router includes resource routes', async () => {
    // This verifies the router is properly composed
    const { router } = await import('./index.js')

    expect(router).toBeDefined()
    expect(router.resources).toBeDefined()
    expect(router.resources.list).toBeDefined()
    expect(router.resources.get).toBeDefined()
    expect(router.resources.create).toBeDefined()
    expect(router.resources.update).toBeDefined()
    expect(router.resources.remove).toBeDefined()
  })
})
