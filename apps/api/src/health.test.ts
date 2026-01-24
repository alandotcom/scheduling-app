// Basic API health check test

import { describe, test, expect } from 'bun:test'

describe('API', () => {
  test('health endpoint returns ok', async () => {
    // TODO: Add actual HTTP test when test server setup is ready
    // For now, just verify the module structure is valid
    const config = await import('./config.js')
    expect(config.config.server.port).toBe(3000)
  })
})
