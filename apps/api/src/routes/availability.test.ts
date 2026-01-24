// Tests for availability routes - validates router registration
// Actual handler tests should be done through HTTP API integration tests

import { describe, test, expect } from 'bun:test'

describe('Availability Routes Module', () => {
  test('availability routes module exists and exports correctly', async () => {
    // Dynamically import to avoid circular dependency issues
    const { availabilityRoutes } = await import('./availability.js')

    // Verify all route groups exist
    expect(availabilityRoutes).toBeDefined()
    expect(availabilityRoutes.rules).toBeDefined()
    expect(availabilityRoutes.overrides).toBeDefined()
    expect(availabilityRoutes.blockedTime).toBeDefined()
    expect(availabilityRoutes.schedulingLimits).toBeDefined()

    // Verify rules routes
    expect(availabilityRoutes.rules.list).toBeDefined()
    expect(availabilityRoutes.rules.get).toBeDefined()
    expect(availabilityRoutes.rules.create).toBeDefined()
    expect(availabilityRoutes.rules.update).toBeDefined()
    expect(availabilityRoutes.rules.delete).toBeDefined()
    expect(availabilityRoutes.rules.setWeekly).toBeDefined()

    // Verify overrides routes
    expect(availabilityRoutes.overrides.list).toBeDefined()
    expect(availabilityRoutes.overrides.get).toBeDefined()
    expect(availabilityRoutes.overrides.create).toBeDefined()
    expect(availabilityRoutes.overrides.update).toBeDefined()
    expect(availabilityRoutes.overrides.delete).toBeDefined()

    // Verify blocked time routes
    expect(availabilityRoutes.blockedTime.list).toBeDefined()
    expect(availabilityRoutes.blockedTime.get).toBeDefined()
    expect(availabilityRoutes.blockedTime.create).toBeDefined()
    expect(availabilityRoutes.blockedTime.update).toBeDefined()
    expect(availabilityRoutes.blockedTime.delete).toBeDefined()

    // Verify scheduling limits routes
    expect(availabilityRoutes.schedulingLimits.list).toBeDefined()
    expect(availabilityRoutes.schedulingLimits.get).toBeDefined()
    expect(availabilityRoutes.schedulingLimits.create).toBeDefined()
    expect(availabilityRoutes.schedulingLimits.update).toBeDefined()
    expect(availabilityRoutes.schedulingLimits.delete).toBeDefined()
  })

  test('main router includes availability routes', async () => {
    // This verifies the router is properly composed
    const { router } = await import('./index.js')

    expect(router).toBeDefined()
    expect(router.availability).toBeDefined()
    expect(router.availability.rules).toBeDefined()
    expect(router.availability.overrides).toBeDefined()
    expect(router.availability.blockedTime).toBeDefined()
    expect(router.availability.schedulingLimits).toBeDefined()
  })
})
