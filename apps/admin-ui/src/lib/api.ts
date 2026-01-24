// oRPC client setup for connecting to the API server

import type { Router } from '@scheduling/api/router-type'
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

// Create the RPC link with fetch configuration
const link = new RPCLink({
  url: '/v1',
  fetch: (request, init) => {
    return globalThis.fetch(request, {
      ...init,
      credentials: 'include', // Include cookies for session auth
    })
  },
})

// Create the typed oRPC client
export const api: RouterClient<Router> = createORPCClient(link)
