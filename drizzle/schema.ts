import {
  boolean,
  index,
  int,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** OAuth provider subject id (openId) from the hosted OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Brainstorm sessions table.
 * Stores the full node graph, view state, and metadata for each saved session.
 */
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  /** Full JSON blob: { nodes, viewState, creativity, keyThemes } */
  data: text("data").notNull(),
  nodeCount: int("nodeCount").notNull().default(0),
  /** CDN URL to a small canvas snapshot used as thumbnail */
  thumbnailUrl: text("thumbnailUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/** Cloud-synced artifact metadata. Payloads are stored in artifactFiles. */
export const artifacts = mysqlTable(
  "artifacts",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: int("sessionId")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    schemaVersion: int("schemaVersion").notNull(),
    title: varchar("title", { length: 256 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    recipeId: varchar("recipeId", { length: 128 }).notNull(),
    scope: text("scope").notNull(),
    provenance: text("provenance").notNull(),
    manifestCreatedAt: varchar("manifestCreatedAt", { length: 40 }).notNull(),
    manifestUpdatedAt: varchar("manifestUpdatedAt", { length: 40 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("artifacts_user_session_idx").on(table.userId, table.sessionId),
  ]
);

export type Artifact = typeof artifacts.$inferSelect;
export type InsertArtifact = typeof artifacts.$inferInsert;

/**
 * Artifact file metadata and bounded inline cloud content. Image content is
 * null until the user opts in for that exact image file.
 */
export const artifactFiles = mysqlTable(
  "artifactFiles",
  {
    id: int("id").autoincrement().primaryKey(),
    artifactId: varchar("artifactId", { length: 128 })
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    fileId: varchar("fileId", { length: 128 }).notNull(),
    path: varchar("path", { length: 512 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }).notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    encoding: varchar("encoding", { length: 16 }),
    content: mediumtext("content"),
    contentSynced: boolean("contentSynced").notNull().default(false),
    fileCreatedAt: varchar("fileCreatedAt", { length: 40 }).notNull(),
    fileUpdatedAt: varchar("fileUpdatedAt", { length: 40 }).notNull(),
  },
  table => [
    index("artifact_files_artifact_idx").on(table.artifactId),
    uniqueIndex("artifact_files_identity_idx").on(
      table.artifactId,
      table.fileId
    ),
  ]
);

export type ArtifactFileRecord = typeof artifactFiles.$inferSelect;
export type InsertArtifactFileRecord = typeof artifactFiles.$inferInsert;
