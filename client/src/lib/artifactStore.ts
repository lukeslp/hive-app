/**
 * File Purpose: local artifact storage for web and Capacitor, filling the role
 *   the Mac app gives ArtifactRepository (Application Support on disk).
 * I/O: IndexedDB only. Cloud sync is a separate, already-wired path
 *   (HexmindApp passes `cloudSync` independently of `services`).
 *
 * IndexedDB rather than localStorage: artifactPolicy allows 8MB per image and
 * 12MB synced per artifact, while localStorage caps around 5MB for the whole
 * origin and stores strings only. A single generated image would blow it.
 *
 * Every operation degrades to a no-op result rather than throwing when
 * IndexedDB is unavailable (private windows, older WKWebView). Losing local
 * history is survivable; losing the artifact the user just waited on is not,
 * so `save` returns the manifest either way and reports what happened.
 */
import type { ArtifactManifest } from "@shared/macArtifacts";

const DB_NAME = "idea-tiles-artifacts";
const DB_VERSION = 1;
const STORE = "artifacts";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>(resolve => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("sourceBoardId", "sourceBoardId", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

type StoredArtifact = {
  id: string;
  sourceBoardId: string;
  updatedAt: string;
  manifest: ArtifactManifest;
};

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  return openDatabase().then(
    db =>
      new Promise<T | null>(resolve => {
        if (!db) {
          resolve(null);
          return;
        }
        let request: IDBRequest<T>;
        try {
          request = work(db.transaction(STORE, mode).objectStore(STORE));
        } catch {
          resolve(null);
          return;
        }
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      })
  );
}

/** Returns true when the artifact reached IndexedDB. */
export async function putArtifact(
  manifest: ArtifactManifest
): Promise<boolean> {
  const record: StoredArtifact = {
    id: manifest.id,
    sourceBoardId: manifest.provenance.sourceBoardId,
    updatedAt: manifest.updatedAt,
    manifest,
  };
  const result = await runTransaction("readwrite", store => store.put(record));
  return result !== null;
}

export async function getArtifact(
  id: string
): Promise<ArtifactManifest | null> {
  const record = await runTransaction<StoredArtifact | undefined>(
    "readonly",
    store => store.get(id) as IDBRequest<StoredArtifact | undefined>
  );
  return record?.manifest ?? null;
}

export async function listArtifacts(
  sourceBoardId?: string
): Promise<ArtifactManifest[]> {
  const records = await runTransaction<StoredArtifact[]>(
    "readonly",
    store => store.getAll() as IDBRequest<StoredArtifact[]>
  );
  const all = records ?? [];
  const filtered = sourceBoardId
    ? all.filter(record => record.sourceBoardId === sourceBoardId)
    : all;
  return filtered
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(record => record.manifest);
}

export async function deleteArtifact(id: string): Promise<boolean> {
  const result = await runTransaction("readwrite", store => store.delete(id));
  return result !== null;
}

/** Test seam: drops the cached connection so a fresh fake can be installed. */
export function resetArtifactStoreForTests(): void {
  dbPromise = null;
}
