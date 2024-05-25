import { v4 as uuid } from 'uuid'
import { db } from '../db/db'
import { apps } from '../db/schema'
import { createAppSchema } from '../db/validate-schema'
import { protectedProcedure, router } from '../trpc'

export const appsRouter = router({
  createApp: protectedProcedure.input(createAppSchema.pick({ name: true, description: true })).mutation(async ({ ctx, input }) => {
    const result = await db.insert(apps).values({
      id: uuid(),
      name: input.name,
      description: input.description,
      userId: ctx.session.user?.id,
    }).returning()
    return result[0]
  }),
})
