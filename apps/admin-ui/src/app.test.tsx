// Smoke test for the admin UI

import { describe, it, expect } from 'vitest'

describe('Admin UI', () => {
  it('should have required dependencies', () => {
    // Basic smoke test to verify the test setup works
    expect(true).toBe(true)
  })

  it('should export createQueryClient', async () => {
    const { createQueryClient } = await import('./lib/query')
    expect(typeof createQueryClient).toBe('function')
  })

  it('should export cn utility', async () => {
    const { cn } = await import('./lib/utils')
    expect(typeof cn).toBe('function')
    expect(cn('foo', 'bar')).toBe('foo bar')
  })
})
