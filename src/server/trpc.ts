import { TRPCError, initTRPC } from '@trpc/server'
import { Session } from 'next-auth'
import { getServerSession } from '@/server/auth'

const t = initTRPC.context().create()

const { router, procedure } = t

export const withLoggerProcedure = procedure.use(async ({ next }) => {
  // const start = Date.now()

  const result = await next()

  return result
})

export const withSessionMiddleware = t.middleware(async ({ next }) => {
  const session = await getServerSession()

  return next({
    ctx: {
      session,
    },
  })
})

export const protectedProcedure = withLoggerProcedure
  .use(withSessionMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'FORBIDDEN',
      })
    }

    return next({
      ctx: {
        session: ctx.session!,
      },
    })
  })

export { router }