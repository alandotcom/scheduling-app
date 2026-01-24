// TanStack Query setup with oRPC integration

import { QueryClient } from '@tanstack/react-query'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { api } from './api'

// Create a query client with default options
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  })
}

// Create oRPC query utilities for TanStack Query integration
export const orpc = createTanstackQueryUtils(api)
