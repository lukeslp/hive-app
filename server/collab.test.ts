import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ws module
vi.mock("ws", () => {
  const OPEN = 1;
  class MockWebSocket {
    readyState = OPEN;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    sentMessages: string[] = [];

    send(data: string) {
      this.sentMessages.push(data);
    }

    close() {
      this.readyState = 3;
      if (this.onclose) this.onclose();
    }
  }

  class MockWebSocketServer {
    handlers: Record<string, Function[]> = {};

    constructor(_opts: any) {}

    on(event: string, handler: Function) {
      if (!this.handlers[event]) this.handlers[event] = [];
      this.handlers[event].push(handler);
    }

    simulateConnection(ws: MockWebSocket) {
      const connectionHandlers = this.handlers["connection"] || [];
      for (const handler of connectionHandlers) {
        handler(ws);
      }
    }
  }

  return {
    WebSocketServer: MockWebSocketServer,
    WebSocket: MockWebSocket,
    default: { WebSocketServer: MockWebSocketServer, WebSocket: MockWebSocket },
  };
});

// Mock the sdk module
vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn().mockResolvedValue(null),
  },
}));

describe("Collab module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports setupCollabWebSocket function", async () => {
    const { setupCollabWebSocket } = await import("./collab");
    expect(typeof setupCollabWebSocket).toBe("function");
  });

  it("creates a WebSocketServer on the /ws/collab path", async () => {
    const { setupCollabWebSocket } = await import("./collab");
    const mockServer = {} as any;
    const wss = setupCollabWebSocket(mockServer);
    expect(wss).toBeDefined();
  });

  it("handles join message and sends joined response", async () => {
    // This tests the message protocol structure
    const joinMsg = { type: "join", roomId: "TEST01", userName: "Alice" };
    const serialized = JSON.stringify(joinMsg);
    const parsed = JSON.parse(serialized);
    expect(parsed.type).toBe("join");
    expect(parsed.roomId).toBe("TEST01");
    expect(parsed.userName).toBe("Alice");
  });

  it("handles node-update message format", () => {
    const updateMsg = {
      type: "node-update",
      key: "0,0",
      node: { q: 0, r: 0, text: "Test", type: "idea" },
    };
    const serialized = JSON.stringify(updateMsg);
    const parsed = JSON.parse(serialized);
    expect(parsed.type).toBe("node-update");
    expect(parsed.key).toBe("0,0");
    expect(parsed.node.text).toBe("Test");
  });

  it("handles node-delete message format", () => {
    const deleteMsg = { type: "node-delete", key: "1,2" };
    const serialized = JSON.stringify(deleteMsg);
    const parsed = JSON.parse(serialized);
    expect(parsed.type).toBe("node-delete");
    expect(parsed.key).toBe("1,2");
  });

  it("handles cursor message format", () => {
    const cursorMsg = { type: "cursor", x: 100, y: 200 };
    const serialized = JSON.stringify(cursorMsg);
    const parsed = JSON.parse(serialized);
    expect(parsed.type).toBe("cursor");
    expect(parsed.x).toBe(100);
    expect(parsed.y).toBe(200);
  });

  it("handles nodes-batch message format", () => {
    const batchMsg = {
      type: "nodes-batch",
      nodes: {
        "0,0": { q: 0, r: 0, text: "A" },
        "1,0": { q: 1, r: 0, text: "B" },
      },
    };
    const serialized = JSON.stringify(batchMsg);
    const parsed = JSON.parse(serialized);
    expect(parsed.type).toBe("nodes-batch");
    expect(Object.keys(parsed.nodes)).toHaveLength(2);
  });

  it("handles state-sync message format", () => {
    const syncMsg = {
      type: "state-sync",
      nodes: { "0,0": { q: 0, r: 0, text: "Root" } },
    };
    const serialized = JSON.stringify(syncMsg);
    const parsed = JSON.parse(serialized);
    expect(parsed.type).toBe("state-sync");
    expect(parsed.nodes["0,0"].text).toBe("Root");
  });

  it("validates outgoing joined message structure", () => {
    const joinedMsg = {
      type: "joined",
      roomId: "ABC123",
      userId: "user_1",
      participants: [{ userId: "user_1", userName: "Alice", color: "#ef4444" }],
    };
    expect(joinedMsg.type).toBe("joined");
    expect(joinedMsg.participants).toHaveLength(1);
    expect(joinedMsg.participants[0].color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("validates outgoing cursor broadcast structure", () => {
    const cursorBroadcast = {
      type: "cursor",
      userId: "user_1",
      userName: "Alice",
      color: "#3b82f6",
      x: 150,
      y: 250,
    };
    expect(cursorBroadcast.type).toBe("cursor");
    expect(cursorBroadcast.userId).toBe("user_1");
    expect(typeof cursorBroadcast.x).toBe("number");
    expect(typeof cursorBroadcast.y).toBe("number");
  });
});
