import { eq, and, desc, count, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  sessions,
  InsertSession,
  artifacts,
  artifactFiles,
} from "../drizzle/schema";
import type { ArtifactManifest } from "../shared/macArtifacts";
import type { PreparedArtifactFile } from "./artifactPolicy";
import { MAX_ARTIFACTS_PER_SESSION } from "./artifactPolicy";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export class ArtifactQuotaError extends Error {
  constructor() {
    super("Cloud session artifact quota reached");
    this.name = "ArtifactQuotaError";
  }
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ── Session persistence ──────────────────────────────────────────────────

export async function listSessions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: sessions.id,
      name: sessions.name,
      nodeCount: sessions.nodeCount,
      thumbnailUrl: sessions.thumbnailUrl,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.updatedAt));
}

export async function getSession(sessionId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSession(input: {
  userId: number;
  name: string;
  data: string;
  nodeCount: number;
  thumbnailUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(sessions).values({
    userId: input.userId,
    name: input.name,
    data: input.data,
    nodeCount: input.nodeCount,
    thumbnailUrl: input.thumbnailUrl ?? null,
  });
  return { id: Number(result[0].insertId) };
}

export async function updateSession(
  sessionId: number,
  userId: number,
  input: {
    name?: string;
    data?: string;
    nodeCount?: number;
    thumbnailUrl?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Record<string, unknown> = {};
  if (input.name !== undefined) updateSet.name = input.name;
  if (input.data !== undefined) updateSet.data = input.data;
  if (input.nodeCount !== undefined) updateSet.nodeCount = input.nodeCount;
  if (input.thumbnailUrl !== undefined)
    updateSet.thumbnailUrl = input.thumbnailUrl;
  if (Object.keys(updateSet).length === 0) return;
  await db
    .update(sessions)
    .set(updateSet)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

export async function deleteSessionById(sessionId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.transaction(async tx => {
    const owned = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .limit(1);
    if (!owned[0]) return;
    const childArtifacts = await tx
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(
        and(eq(artifacts.sessionId, sessionId), eq(artifacts.userId, userId))
      );
    const artifactIds = childArtifacts.map(item => item.id);
    if (artifactIds.length > 0) {
      await tx
        .delete(artifactFiles)
        .where(inArray(artifactFiles.artifactId, artifactIds));
      await tx.delete(artifacts).where(inArray(artifacts.id, artifactIds));
    }
    await tx.delete(sessions).where(eq(sessions.id, sessionId));
  });
}

// ── Artifact sync ───────────────────────────────────────────────────────

export async function getArtifactOwnership(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ userId: artifacts.userId, sessionId: artifacts.sessionId })
    .from(artifacts)
    .where(eq(artifacts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function countArtifactsForSession(
  sessionId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ value: count() })
    .from(artifacts)
    .where(
      and(eq(artifacts.sessionId, sessionId), eq(artifacts.userId, userId))
    );
  return rows[0]?.value ?? 0;
}

export async function listArtifacts(sessionId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: artifacts.id,
      title: artifacts.title,
      kind: artifacts.kind,
      recipeId: artifacts.recipeId,
      createdAt: artifacts.createdAt,
      updatedAt: artifacts.updatedAt,
    })
    .from(artifacts)
    .where(
      and(eq(artifacts.sessionId, sessionId), eq(artifacts.userId, userId))
    )
    .orderBy(desc(artifacts.updatedAt));
}

export async function getArtifact(id: string, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, id), eq(artifacts.userId, userId)))
    .limit(1);
  const artifact = rows[0];
  if (!artifact) return null;
  const files = await db
    .select()
    .from(artifactFiles)
    .where(eq(artifactFiles.artifactId, artifact.id));
  return {
    id: artifact.id,
    sessionId: artifact.sessionId,
    schemaVersion: artifact.schemaVersion,
    title: artifact.title,
    kind: artifact.kind,
    recipeId: artifact.recipeId,
    scope: JSON.parse(artifact.scope),
    provenance: JSON.parse(artifact.provenance),
    createdAt: artifact.manifestCreatedAt,
    updatedAt: artifact.manifestUpdatedAt,
    files: files.map(file => ({
      id: file.fileId,
      path: file.path,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      checksum: { algorithm: "sha256" as const, value: file.checksum },
      encoding: file.encoding,
      content: file.contentSynced ? file.content : null,
      contentSynced: file.contentSynced,
      createdAt: file.fileCreatedAt,
      updatedAt: file.fileUpdatedAt,
    })),
  };
}

export async function upsertArtifact(input: {
  userId: number;
  sessionId: number;
  artifact: ArtifactManifest;
  files: PreparedArtifactFile[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.transaction(async tx => {
    const session = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId))
      )
      .limit(1)
      .for("update");
    if (!session[0]) throw new Error("Session ownership changed during sync");

    const existing = await tx
      .select({ userId: artifacts.userId, sessionId: artifacts.sessionId })
      .from(artifacts)
      .where(eq(artifacts.id, input.artifact.id))
      .limit(1);
    if (
      existing[0] &&
      (existing[0].userId !== input.userId ||
        existing[0].sessionId !== input.sessionId)
    ) {
      throw new Error("Artifact ownership changed during sync");
    }

    if (!existing[0]) {
      const totals = await tx
        .select({ value: count() })
        .from(artifacts)
        .where(
          and(
            eq(artifacts.sessionId, input.sessionId),
            eq(artifacts.userId, input.userId)
          )
        );
      if ((totals[0]?.value ?? 0) >= MAX_ARTIFACTS_PER_SESSION) {
        throw new ArtifactQuotaError();
      }
    }

    const values = {
      id: input.artifact.id,
      userId: input.userId,
      sessionId: input.sessionId,
      schemaVersion: input.artifact.schemaVersion,
      title: input.artifact.title,
      kind: input.artifact.kind,
      recipeId: input.artifact.recipeId,
      scope: JSON.stringify(input.artifact.scope),
      provenance: JSON.stringify(input.artifact.provenance),
      manifestCreatedAt: input.artifact.createdAt,
      manifestUpdatedAt: input.artifact.updatedAt,
    };
    if (existing[0]) {
      await tx
        .update(artifacts)
        .set(values)
        .where(
          and(
            eq(artifacts.id, input.artifact.id),
            eq(artifacts.userId, input.userId)
          )
        );
      await tx
        .delete(artifactFiles)
        .where(eq(artifactFiles.artifactId, input.artifact.id));
    } else {
      await tx.insert(artifacts).values(values);
    }
    await tx.insert(artifactFiles).values(
      input.files.map(file => ({
        artifactId: input.artifact.id,
        fileId: file.fileId,
        path: file.path,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum,
        encoding: file.encoding,
        content: file.content,
        contentSynced: file.contentSynced,
        fileCreatedAt: file.createdAt,
        fileUpdatedAt: file.updatedAt,
      }))
    );
  });
}

export async function deleteArtifact(id: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async tx => {
    const owned = await tx
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.userId, userId)))
      .limit(1);
    if (!owned[0]) return false;
    await tx.delete(artifactFiles).where(eq(artifactFiles.artifactId, id));
    await tx.delete(artifacts).where(eq(artifacts.id, id));
    return true;
  });
}
