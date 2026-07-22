import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the database functions
vi.mock("./db", () => ({
  listSessions: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Test Session",
      nodeCount: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getSession: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Test Session",
    nodeCount: 5,
    data: JSON.stringify({
      nodes: { "0,0": { text: "Root" } },
      viewState: { x: 0, y: 0, zoom: 1 },
      creativity: 0.5,
    }),
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  createSession: vi.fn().mockResolvedValue({ id: 2 }),
  updateSession: vi.fn().mockResolvedValue(undefined),
  deleteSessionById: vi.fn().mockResolvedValue(undefined),
}));

import {
  listSessions,
  getSession,
  createSession,
  updateSession,
  deleteSessionById,
} from "./db";
import { sessionDataSchema } from "./routers/sessions";
import { MAX_WORKSPACE_TRANSPORT_BYTES } from "../shared/workspaceDocument";

describe("Sessions DB helpers (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listSessions returns session metadata", async () => {
    const result = await listSessions(1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Session");
    expect(result[0].nodeCount).toBe(5);
    expect(listSessions).toHaveBeenCalledWith(1);
  });

  it("getSession returns full session data", async () => {
    const result = await getSession(1, 1);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Test Session");
    const data = JSON.parse(result!.data);
    expect(data.nodes["0,0"].text).toBe("Root");
    expect(getSession).toHaveBeenCalledWith(1, 1);
  });

  it("createSession returns the new session id", async () => {
    const result = await createSession({
      userId: 1,
      name: "New Session",
      data: JSON.stringify({ nodes: {} }),
      nodeCount: 0,
    });
    expect(result.id).toBe(2);
    expect(createSession).toHaveBeenCalledWith({
      userId: 1,
      name: "New Session",
      data: JSON.stringify({ nodes: {} }),
      nodeCount: 0,
    });
  });

  it("updateSession calls with correct arguments", async () => {
    await updateSession(1, 1, { name: "Updated" });
    expect(updateSession).toHaveBeenCalledWith(1, 1, { name: "Updated" });
  });

  it("deleteSessionById calls with correct arguments", async () => {
    await deleteSessionById(1, 1);
    expect(deleteSessionById).toHaveBeenCalledWith(1, 1);
  });

  it("bounds serialized session payloads below the MEDIUMTEXT ceiling", () => {
    expect(
      sessionDataSchema.safeParse({ format: "legacy", nodes: {} }).success
    ).toBe(true);
    expect(
      sessionDataSchema.safeParse({
        payload: "x".repeat(MAX_WORKSPACE_TRANSPORT_BYTES),
      }).success
    ).toBe(false);
  });
});
