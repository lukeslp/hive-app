import { z } from "zod";
import { router } from "../_core/trpc";
import { protectedProcedure } from "../_core/trpc";
import {
  listSessions,
  getSession,
  createSession,
  updateSession,
  deleteSessionById,
} from "../db";
import { storagePut } from "../storage";
import { MAX_WORKSPACE_TRANSPORT_BYTES } from "@shared/workspaceDocument";

export const sessionDataSchema = z.unknown().superRefine((value, context) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    context.addIssue({
      code: "custom",
      message: "Session data must be an object",
    });
    return;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "Session data must be JSON serializable",
    });
    return;
  }
  if (
    new TextEncoder().encode(serialized).byteLength >
    MAX_WORKSPACE_TRANSPORT_BYTES
  ) {
    context.addIssue({
      code: "custom",
      message: "Session data exceeds the transport limit",
    });
  }
});

export const sessionsRouter = router({
  /** List all sessions for the current user (metadata only, no data blob) */
  list: protectedProcedure.query(async ({ ctx }) => {
    return listSessions(ctx.user.id);
  }),

  /** Get a single session with full data */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const session = await getSession(input.id, ctx.user.id);
      if (!session) return null;
      return {
        id: session.id,
        name: session.name,
        nodeCount: session.nodeCount,
        thumbnailUrl: session.thumbnailUrl,
        data: JSON.parse(session.data),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      };
    }),

  /** Create a new session */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        data: sessionDataSchema,
        nodeCount: z.number().int().min(0),
        thumbnailDataUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let thumbnailUrl: string | undefined;

      // Upload thumbnail to S3 if provided
      if (input.thumbnailDataUrl) {
        try {
          thumbnailUrl = await uploadThumbnail(
            ctx.user.id,
            `new-${Date.now()}`,
            input.thumbnailDataUrl
          );
        } catch {
          // Non-critical — proceed without thumbnail
        }
      }

      const result = await createSession({
        userId: ctx.user.id,
        name: input.name,
        data: JSON.stringify(input.data),
        nodeCount: input.nodeCount,
        thumbnailUrl,
      });
      return result;
    }),

  /** Update an existing session (name and/or data) */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        data: sessionDataSchema.optional(),
        nodeCount: z.number().int().min(0).optional(),
        thumbnailDataUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let thumbnailUrl: string | undefined;

      if (input.thumbnailDataUrl) {
        try {
          thumbnailUrl = await uploadThumbnail(
            ctx.user.id,
            String(input.id),
            input.thumbnailDataUrl
          );
        } catch {
          // Non-critical
        }
      }

      await updateSession(input.id, ctx.user.id, {
        name: input.name,
        data: input.data ? JSON.stringify(input.data) : undefined,
        nodeCount: input.nodeCount,
        thumbnailUrl,
      });
      return { success: true };
    }),

  /** Delete a session */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteSessionById(input.id, ctx.user.id);
      return { success: true };
    }),
});

/**
 * Upload a base64 data URL thumbnail to S3.
 * Returns the CDN URL on success.
 */
async function uploadThumbnail(
  userId: number,
  sessionKey: string,
  dataUrl: string
): Promise<string> {
  // Parse data URL: data:image/png;base64,iVBOR...
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");

  const ext = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, "base64");

  const suffix = Math.random().toString(36).slice(2, 8);
  const key = `thumbnails/${userId}/session-${sessionKey}-${suffix}.${ext}`;

  const { url } = await storagePut(key, buffer, `image/${ext}`);
  return url;
}
