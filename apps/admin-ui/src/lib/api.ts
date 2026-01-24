// oRPC client setup for connecting to the API server

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

// Create the RPC link with fetch configuration
const link = new RPCLink({
  url: '/v1',
  headers: () => ({
    // Auth headers will be handled by cookies/session
  }),
  fetch: (request, init) => {
    return globalThis.fetch(request, {
      ...init,
      credentials: 'include', // Include cookies for session auth
    })
  },
})

// Create the oRPC client
// Types will be inferred when the API routes are properly typed
// and exported from a shared package
export const api = createORPCClient(link)
