import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  countArtifactsForSession,
  deleteArtifact,
  getArtifact,
  getArtifactOwnership,
  getSession,
  listArtifacts,
  upsertArtifact,
  ArtifactQuotaError,
} from "../db";
import {
  artifactSyncInputSchema,
  MAX_ARTIFACTS_PER_SESSION,
  prepareArtifactSync,
} from "../artifactPolicy";
import { protectedProcedure, router } from "../_core/trpc";

const artifactIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:,-]*$/);

export const artifactsRouter = router({
  list: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }).strict())
    .query(async ({ ctx, input }) => {
      if (!(await getSession(input.sessionId, ctx.user.id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }
      return listArtifacts(input.sessionId, ctx.user.id);
    }),

  get: protectedProcedure
    .input(z.object({ id: artifactIdSchema }).strict())
    .query(async ({ ctx, input }) => getArtifact(input.id, ctx.user.id)),

  upsert: protectedProcedure
    .input(artifactSyncInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!(await getSession(input.sessionId, ctx.user.id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }
      const ownership = await getArtifactOwnership(input.artifact.id);
      if (ownership && ownership.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Artifact belongs to another account",
        });
      }
      if (ownership && ownership.sessionId !== input.sessionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Artifacts cannot move between cloud sessions",
        });
      }
      if (
        !ownership &&
        (await countArtifactsForSession(input.sessionId, ctx.user.id)) >=
          MAX_ARTIFACTS_PER_SESSION
      ) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "This session has reached its artifact limit",
        });
      }

      const prepared = prepareArtifactSync(input);
      try {
        await upsertArtifact({
          userId: ctx.user.id,
          sessionId: input.sessionId,
          artifact: prepared.artifact,
          files: prepared.files,
        });
      } catch (error) {
        if (error instanceof ArtifactQuotaError) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: error.message,
          });
        }
        throw error;
      }
      return {
        id: prepared.artifact.id,
        syncedImageFileIds: prepared.syncedImageFileIds,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: artifactIdSchema }).strict())
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteArtifact(input.id, ctx.user.id);
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Artifact not found",
        });
      }
      return { success: true } as const;
    }),
});
