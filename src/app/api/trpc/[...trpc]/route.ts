import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import type { NextRequest } from 'next/server'
import { appRouter } from '@/server/router'

function handler(request: NextRequest) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: async () => {
      // const session = await getServerSession()

      // return { session }
      return {}
    },
  })
}

export { handler as GET, handler as POST }
