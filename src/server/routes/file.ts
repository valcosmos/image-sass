import process from 'node:process'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import z from 'zod'
import type {
  PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuid } from 'uuid'
import { files } from '../db/schema'
import { db } from '../db/db'
import { protectedProcedure, router } from '../trpc'
import { filesCanOrderByColumns } from '../db/validate-schema'

const bucket = process.env.BUCKET
const apiEndpoint = process.env.API_END_POINT
const region = process.env.REGION

const fileOrderByColumnSchema = z.object({ field: filesCanOrderByColumns.keyof(), order: z.enum(['desc', 'asc']) }).optional()

export type FileOrderByColumn = z.infer<typeof fileOrderByColumnSchema>

export const fileRoutes = router({
  createPresignedUrl: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        size: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const date = new Date()

      const isoString = date.toISOString()

      const dateString = isoString.split('T')[0]

      const params: PutObjectCommandInput = {
        Bucket: bucket,
        Key: `${dateString}/${input.filename.replaceAll(' ', '_')}`,
        ContentType: input.contentType,
        ContentLength: input.size,
      }

      const s3Client = new S3Client({
        endpoint: apiEndpoint,
        region,
        credentials: {
          accessKeyId: process.env.COS_APP_ID as string,
          secretAccessKey: process.env.COS_APP_SECRET as string,
        },
      })

      const command = new PutObjectCommand(params)
      const url = await getSignedUrl(s3Client, command, {
        expiresIn: 60,
      })

      return {
        url,
        method: 'PUT' as const,
      }
    }),
  saveFile: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        path: z.string(),
        type: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { session } = ctx

      const url = new URL(input.path)

      const photo = await db
        .insert(files)
        .values({
          ...input,
          id: uuid(),
          path: url.pathname,
          url: url.toString(),
          userId: session.user?.id,
          contentType: input.type,
        })
        .returning()

      return photo[0]
    }),

  listFiles: protectedProcedure.query(async () => {
    const result = await db.query.files.findMany({
      orderBy: [desc(files.createdAt)],
    })

    return result
  }),
  infinityQueryFiles: protectedProcedure.input(z.object({
    cursor: z.object({ id: z.string(), createdAt: z.string() }).optional(),
    limit: z.number().default(10),
    orderBy: fileOrderByColumnSchema,
  })).query(async ({ input }) => {
    const { cursor, limit, orderBy = { field: 'createdAt', order: 'desc' } } = input
    // const result = await db.query.files.findMany({})

    const deleteFilter = isNull(files.deletedAt)

    const statement = db
      .select()
      .from(files)
      .limit(limit)
      // .where(cursor ? lt(files.createdAt, new Date(cursor)) : undefined)
      .where(cursor ? and(sql`("files"."created_at", "files"."id")<(${new Date(cursor.createdAt).toISOString()}, ${cursor.id})`, deleteFilter) : deleteFilter)
      // .orderBy(desc(files.createdAt))

    statement.orderBy(orderBy.order === 'desc' ? desc(files[orderBy.field]) : asc(files[orderBy.field]))
    const result = await statement
    return {
      items: result,
      // nextCursor: result.length > 0 ? result[result.length - 1].createdAt : null,
      nextCursor: result.length > 0
        ? { createdAt: result[result.length - 1].createdAt!, id: result[result.length - 1].id }
        : null,
    }
  }),

  deleteFile: protectedProcedure.input(z.string()).mutation(async ({ input }) => {
    return db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, input))
  }),
})
