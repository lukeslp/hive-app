/**
 * Local database (IndexedDB via Dexie) for offline session storage.
 * Mirrors the cloud session schema so the same UI can render both.
 */

import Dexie, { type EntityTable } from "dexie";

export interface LocalSession {
  id?: number;
  name: string;
  data: {
    nodes: Record<string, unknown>;
    viewState: { x: number; y: number; zoom: number };
    creativity: number;
    keyThemes?: string[];
  };
  nodeCount: number;
  thumbnailUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const db = new Dexie("HexpandDB") as Dexie & {
  sessions: EntityTable<LocalSession, "id">;
};

db.version(1).stores({
  sessions: "++id, name, updatedAt",
});

export const localDb = {
  async listSessions(): Promise<LocalSession[]> {
    return db.sessions.orderBy("updatedAt").reverse().toArray();
  },

  async getSession(id: number): Promise<LocalSession | undefined> {
    return db.sessions.get(id);
  },

  async createSession(
    session: Omit<LocalSession, "id" | "createdAt" | "updatedAt">
  ): Promise<number> {
    const now = new Date();
    const id = await db.sessions.add({
      ...session,
      createdAt: now,
      updatedAt: now,
    });
    return id as number;
  },

  async updateSession(
    id: number,
    updates: Partial<Omit<LocalSession, "id" | "createdAt">>
  ): Promise<void> {
    await db.sessions.update(id, { ...updates, updatedAt: new Date() });
  },

  async deleteSession(id: number): Promise<void> {
    await db.sessions.delete(id);
  },
};
