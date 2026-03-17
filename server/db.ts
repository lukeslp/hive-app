import { eq, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, sessions, InsertSession } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

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
      values.role = 'admin';
      updateSet.role = 'admin';
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

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

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

export async function createSession(input: { userId: number; name: string; data: string; nodeCount: number; thumbnailUrl?: string }) {
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

export async function updateSession(sessionId: number, userId: number, input: { name?: string; data?: string; nodeCount?: number; thumbnailUrl?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Record<string, unknown> = {};
  if (input.name !== undefined) updateSet.name = input.name;
  if (input.data !== undefined) updateSet.data = input.data;
  if (input.nodeCount !== undefined) updateSet.nodeCount = input.nodeCount;
  if (input.thumbnailUrl !== undefined) updateSet.thumbnailUrl = input.thumbnailUrl;
  if (Object.keys(updateSet).length === 0) return;
  await db.update(sessions).set(updateSet).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

export async function deleteSessionById(sessionId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}
