/**
 * Collaborative real-time editing via WebSocket
 *
 * Architecture:
 * - Each "room" is identified by a session share-id or a generated room code
 * - When a user joins a room, they receive the current state from the host
 * - All node changes are broadcast as deltas to other participants
 * - Presence (cursor positions, user names) is broadcast periodically
 * - The host's state is authoritative; peers merge incoming deltas
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { COOKIE_NAME } from "@shared/const";
import { sdk } from "./_core/sdk";

// ── Types ────────────────────────────────────────────────────────────────

interface Participant {
  ws: WebSocket;
  userId: string;
  userName: string;
  color: string;
  cursor?: { x: number; y: number };
  joinedAt: number;
}

interface Room {
  id: string;
  hostUserId: string;
  participants: Map<string, Participant>;
  /** Snapshot of the current node state (kept in-memory for late joiners) */
  currentState: Record<string, unknown> | null;
}

type IncomingMessage =
  | { type: "join"; roomId: string; token?: string; userName?: string }
  | { type: "state-sync"; nodes: Record<string, unknown> }
  | { type: "node-update"; key: string; node: unknown }
  | { type: "node-delete"; key: string }
  | { type: "nodes-batch"; nodes: Record<string, unknown> }
  | { type: "cursor"; x: number; y: number }
  | { type: "node-presence"; nodeKey: string | null }
  | { type: "ping" };

type OutgoingMessage =
  | { type: "joined"; roomId: string; userId: string; participants: Array<{ userId: string; userName: string; color: string }> }
  | { type: "participant-joined"; userId: string; userName: string; color: string }
  | { type: "participant-left"; userId: string }
  | { type: "state-sync"; nodes: Record<string, unknown> }
  | { type: "node-update"; key: string; node: unknown; fromUserId: string }
  | { type: "node-delete"; key: string; fromUserId: string }
  | { type: "nodes-batch"; nodes: Record<string, unknown>; fromUserId: string }
  | { type: "cursor"; userId: string; userName: string; color: string; x: number; y: number }
  | { type: "node-presence"; userId: string; userName: string; color: string; nodeKey: string | null }
  | { type: "pong" }
  | { type: "error"; message: string };

// ── Palette for participant cursors ──────────────────────────────────────

const CURSOR_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#14b8a6", "#f43f5e", "#a855f7", "#6366f1",
];

let colorIndex = 0;
function nextColor(): string {
  const color = CURSOR_COLORS[colorIndex % CURSOR_COLORS.length];
  colorIndex++;
  return color;
}

// ── Room management ─────────────────────────────────────────────────────

const rooms = new Map<string, Room>();

function getOrCreateRoom(roomId: string, hostUserId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      hostUserId,
      participants: new Map(),
      currentState: null,
    };
    rooms.set(roomId, room);
  }
  return room;
}

function cleanupRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (room && room.participants.size === 0) {
    rooms.delete(roomId);
  }
}

function broadcast(room: Room, message: OutgoingMessage, excludeUserId?: string) {
  const data = JSON.stringify(message);
  for (const [uid, participant] of Array.from(room.participants.entries())) {
    if (uid === excludeUserId) continue;
    if (participant.ws.readyState === WebSocket.OPEN) {
      participant.ws.send(data);
    }
  }
}

function send(ws: WebSocket, message: OutgoingMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// ── WebSocket server setup ──────────────────────────────────────────────

export function setupCollabWebSocket(_httpServer: Server) {
  // Use noServer mode so we can manually handle upgrade events
  // This prevents conflicts with Vite's HMR WebSocket
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket) => {
    let currentRoomId: string | null = null;
    let currentUserId: string | null = null;

    ws.on("message", async (raw: Buffer) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      switch (msg.type) {
        case "ping": {
          send(ws, { type: "pong" });
          break;
        }

        case "join": {
          const { roomId, token, userName } = msg;
          if (!roomId) {
            send(ws, { type: "error", message: "roomId required" });
            return;
          }

          // Try to authenticate via cookie/token
          let userId = `anon_${Math.random().toString(36).slice(2, 8)}`;
          let displayName = userName || "Anonymous";

          if (token) {
            try {
              // Create a mock request to use SDK auth
              const mockReq = {
                headers: { cookie: `${COOKIE_NAME}=${token}` },
              } as any;
              const user = await sdk.authenticateRequest(mockReq);
              if (user) {
                userId = String(user.id);
                displayName = user.name || displayName;
              }
            } catch {
              // Continue as anonymous
            }
          }

          // Leave any previous room
          if (currentRoomId && currentUserId) {
            const prevRoom = rooms.get(currentRoomId);
            if (prevRoom) {
              prevRoom.participants.delete(currentUserId);
              broadcast(prevRoom, { type: "participant-left", userId: currentUserId });
              cleanupRoom(currentRoomId);
            }
          }

          const room = getOrCreateRoom(roomId, userId);
          const color = nextColor();
          const participant: Participant = {
            ws,
            userId,
            userName: displayName,
            color,
            joinedAt: Date.now(),
          };

          room.participants.set(userId, participant);
          currentRoomId = roomId;
          currentUserId = userId;

          // Send join confirmation with participant list
          const participantList = Array.from(room.participants.values()).map((p) => ({
            userId: p.userId,
            userName: p.userName,
            color: p.color,
          }));

          send(ws, { type: "joined", roomId, userId, participants: participantList });

          // Notify others
          broadcast(room, { type: "participant-joined", userId, userName: displayName, color }, userId);

          // Send current state to new joiner (if host has synced state)
          if (room.currentState) {
            send(ws, { type: "state-sync", nodes: room.currentState });
          }

          break;
        }

        case "state-sync": {
          if (!currentRoomId || !currentUserId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          // Only the host (or first user) can set the authoritative state
          room.currentState = msg.nodes;
          // Broadcast to all other participants
          broadcast(room, { type: "state-sync", nodes: msg.nodes }, currentUserId);
          break;
        }

        case "node-update": {
          if (!currentRoomId || !currentUserId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          // Update in-memory state
          if (room.currentState) {
            room.currentState[msg.key] = msg.node;
          }

          broadcast(room, {
            type: "node-update",
            key: msg.key,
            node: msg.node,
            fromUserId: currentUserId,
          }, currentUserId);
          break;
        }

        case "node-delete": {
          if (!currentRoomId || !currentUserId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          if (room.currentState) {
            delete room.currentState[msg.key];
          }

          broadcast(room, {
            type: "node-delete",
            key: msg.key,
            fromUserId: currentUserId,
          }, currentUserId);
          break;
        }

        case "nodes-batch": {
          if (!currentRoomId || !currentUserId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          // Full state replacement
          room.currentState = msg.nodes;

          broadcast(room, {
            type: "nodes-batch",
            nodes: msg.nodes,
            fromUserId: currentUserId,
          }, currentUserId);
          break;
        }

        case "cursor": {
          if (!currentRoomId || !currentUserId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const participant = room.participants.get(currentUserId);
          if (participant) {
            participant.cursor = { x: msg.x, y: msg.y };
            broadcast(room, {
              type: "cursor",
              userId: currentUserId,
              userName: participant.userName,
              color: participant.color,
              x: msg.x,
              y: msg.y,
            }, currentUserId);
          }
          break;
        }

        case "node-presence": {
          if (!currentRoomId || !currentUserId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const participant = room.participants.get(currentUserId);
          if (participant) {
            broadcast(room, {
              type: "node-presence",
              userId: currentUserId,
              userName: participant.userName,
              color: participant.color,
              nodeKey: msg.nodeKey,
            }, currentUserId);
          }
          break;
        }
      }
    });

    ws.on("close", () => {
      if (currentRoomId && currentUserId) {
        const room = rooms.get(currentRoomId);
        if (room) {
          room.participants.delete(currentUserId);
          broadcast(room, { type: "participant-left", userId: currentUserId });
          cleanupRoom(currentRoomId);
        }
      }
    });

    ws.on("error", () => {
      // Clean up on error
      if (currentRoomId && currentUserId) {
        const room = rooms.get(currentRoomId);
        if (room) {
          room.participants.delete(currentUserId);
          broadcast(room, { type: "participant-left", userId: currentUserId });
          cleanupRoom(currentRoomId);
        }
      }
    });
  });

  return wss;
}
