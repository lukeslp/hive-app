/**
 * useCollaboration - Real-time collaborative editing via WebSocket
 *
 * Manages WebSocket connection to the collab server, syncs node changes
 * between participants, and tracks remote cursors/presence.
 * Includes connection timeout detection and error feedback.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { getCollaborationWebSocketUrl } from "@/lib/platform";
import type { HexNode } from "@/types/hivemind";
import type { UseHistoryReturn } from "@/hooks/useHistory";

// ── Types ────────────────────────────────────────────────────────────────

export interface RemoteCursor {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  lastUpdate: number;
}

export interface CollabParticipant {
  userId: string;
  userName: string;
  color: string;
}

export interface NodePresence {
  userId: string;
  userName: string;
  color: string;
  nodeKey: string;
  lastUpdate: number;
}

interface CollabState {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  roomId: string | null;
  myUserId: string | null;
  participants: CollabParticipant[];
  remoteCursors: RemoteCursor[];
  nodePresence: NodePresence[];
}

/** Connection timeout in ms — if WS doesn't connect within this window, show error */
const CONNECTION_TIMEOUT = 8000;

// ── Hook ─────────────────────────────────────────────────────────────────

export function useCollaboration(
  nodes: Record<string, HexNode>,
  commitNodes: UseHistoryReturn<Record<string, HexNode>>["push"]
) {
  const [state, setState] = useState<CollabState>({
    isConnected: false,
    isConnecting: false,
    connectionError: null,
    roomId: null,
    myUserId: null,
    participants: [],
    remoteCursors: [],
    nodePresence: [],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const nodesRef = useRef(nodes);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cursorThrottle = useRef<number>(0);
  const isHostRef = useRef(false);
  /** Suppress echo: when we receive a remote update, we set nodes via commitNodes,
   *  which triggers the useEffect that would re-broadcast. This flag prevents that. */
  const suppressBroadcast = useRef(false);
  /** Track the pending roomId before WS confirms it */
  const pendingRoomIdRef = useRef<string | null>(null);

  // Keep nodesRef in sync
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // ── Build WebSocket URL ────────────────────────────────────────────────
  const getWsUrl = useCallback(() => {
    return getCollaborationWebSocketUrl();
  }, []);

  // ── Clear connection timeout ──────────────────────────────────────────
  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  // ── Connect to a room ─────────────────────────────────────────────────
  const joinRoom = useCallback(
    (roomId: string, userName?: string) => {
      // Clear any previous error
      setState(prev => ({ ...prev, connectionError: null }));

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Already connected, just join the room
        wsRef.current.send(JSON.stringify({ type: "join", roomId, userName }));
        return;
      }

      setState(prev => ({
        ...prev,
        isConnecting: true,
        connectionError: null,
      }));
      pendingRoomIdRef.current = roomId;

      // Set connection timeout
      clearConnectionTimeout();
      connectionTimeoutRef.current = setTimeout(() => {
        // Connection timed out
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        setState(prev => ({
          ...prev,
          isConnecting: false,
          connectionError:
            "Connection timed out. The server may not support WebSocket connections in this environment.",
        }));
        pendingRoomIdRef.current = null;
        toast.error("Could not connect to collaboration server");
      }, CONNECTION_TIMEOUT);

      let ws: WebSocket;
      try {
        ws = new WebSocket(getWsUrl());
      } catch (err) {
        clearConnectionTimeout();
        setState(prev => ({
          ...prev,
          isConnecting: false,
          connectionError:
            "Failed to create WebSocket connection. Collaboration may not be available in this environment.",
        }));
        pendingRoomIdRef.current = null;
        toast.error("WebSocket not available");
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join", roomId, userName }));
      };

      ws.onmessage = event => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case "joined": {
            clearConnectionTimeout();
            isHostRef.current = msg.participants.length <= 1;
            setState(prev => ({
              ...prev,
              isConnected: true,
              isConnecting: false,
              connectionError: null,
              roomId: msg.roomId,
              myUserId: msg.userId,
              participants: msg.participants,
            }));
            pendingRoomIdRef.current = null;
            toast.success(
              `Live session started! ${msg.participants.length} participant${msg.participants.length > 1 ? "s" : ""}`
            );

            // If we're the host (first person), sync our state to the room
            if (isHostRef.current && Object.keys(nodesRef.current).length > 0) {
              ws.send(
                JSON.stringify({ type: "state-sync", nodes: nodesRef.current })
              );
            }
            break;
          }

          case "participant-joined": {
            setState(prev => ({
              ...prev,
              participants: [
                ...prev.participants,
                {
                  userId: msg.userId,
                  userName: msg.userName,
                  color: msg.color,
                },
              ],
            }));
            toast.info(`${msg.userName} joined the board`);

            // If we're the host, send current state for the new joiner
            if (isHostRef.current && Object.keys(nodesRef.current).length > 0) {
              ws.send(
                JSON.stringify({ type: "state-sync", nodes: nodesRef.current })
              );
            }
            break;
          }

          case "participant-left": {
            setState(prev => {
              const leaving = prev.participants.find(
                p => p.userId === msg.userId
              );
              if (leaving) {
                toast.info(`${leaving.userName} left the board`);
              }
              return {
                ...prev,
                participants: prev.participants.filter(
                  p => p.userId !== msg.userId
                ),
                remoteCursors: prev.remoteCursors.filter(
                  c => c.userId !== msg.userId
                ),
              };
            });
            break;
          }

          case "state-sync": {
            // Full state replacement from host
            suppressBroadcast.current = true;
            commitNodes(msg.nodes as Record<string, HexNode>);
            setTimeout(() => {
              suppressBroadcast.current = false;
            }, 100);
            break;
          }

          case "node-update": {
            suppressBroadcast.current = true;
            commitNodes(prev => ({
              ...prev,
              [msg.key]: msg.node as HexNode,
            }));
            setTimeout(() => {
              suppressBroadcast.current = false;
            }, 100);
            break;
          }

          case "node-delete": {
            suppressBroadcast.current = true;
            commitNodes(prev => {
              if (!(msg.key in prev)) return prev;
              const next = { ...prev };
              delete next[msg.key];
              return next;
            });
            setTimeout(() => {
              suppressBroadcast.current = false;
            }, 100);
            break;
          }

          case "nodes-batch": {
            suppressBroadcast.current = true;
            commitNodes(msg.nodes as Record<string, HexNode>);
            setTimeout(() => {
              suppressBroadcast.current = false;
            }, 100);
            break;
          }

          case "cursor": {
            setState(prev => {
              const existing = prev.remoteCursors.findIndex(
                c => c.userId === msg.userId
              );
              const cursor: RemoteCursor = {
                userId: msg.userId,
                userName: msg.userName,
                color: msg.color,
                x: msg.x,
                y: msg.y,
                lastUpdate: Date.now(),
              };
              const cursors = [...prev.remoteCursors];
              if (existing >= 0) {
                cursors[existing] = cursor;
              } else {
                cursors.push(cursor);
              }
              return { ...prev, remoteCursors: cursors };
            });
            break;
          }

          case "node-presence": {
            setState(prev => {
              const existing = prev.nodePresence.findIndex(
                p => p.userId === msg.userId
              );
              const presence: NodePresence = {
                userId: msg.userId,
                userName: msg.userName,
                color: msg.color,
                nodeKey: msg.nodeKey,
                lastUpdate: Date.now(),
              };
              const list = [...prev.nodePresence];
              if (existing >= 0) {
                if (msg.nodeKey === null) {
                  list.splice(existing, 1);
                } else {
                  list[existing] = presence;
                }
              } else if (msg.nodeKey !== null) {
                list.push(presence);
              }
              return { ...prev, nodePresence: list };
            });
            break;
          }

          case "error": {
            toast.error(msg.message);
            break;
          }
        }
      };

      ws.onclose = () => {
        clearConnectionTimeout();
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          participants: [],
          remoteCursors: [],
        }));
      };

      ws.onerror = () => {
        clearConnectionTimeout();
        setState(prev => ({
          ...prev,
          isConnecting: false,
          connectionError:
            "Connection failed. WebSocket may not be available in this environment.",
        }));
        pendingRoomIdRef.current = null;
        toast.error("Collaboration connection failed");
      };
    },
    [getWsUrl, commitNodes, clearConnectionTimeout]
  );

  // ── Leave room ────────────────────────────────────────────────────────
  const leaveRoom = useCallback(() => {
    clearConnectionTimeout();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    isHostRef.current = false;
    pendingRoomIdRef.current = null;
    setState({
      isConnected: false,
      isConnecting: false,
      connectionError: null,
      roomId: null,
      myUserId: null,
      participants: [],
      remoteCursors: [],
      nodePresence: [],
    });
    toast.info("Left collaborative session");
  }, [clearConnectionTimeout]);

  // ── Create a new room ─────────────────────────────────────────────────
  const createRoom = useCallback(
    (userName?: string) => {
      const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
      isHostRef.current = true;
      joinRoom(roomId, userName);
      return roomId;
    },
    [joinRoom]
  );

  // ── Broadcast node changes ────────────────────────────────────────────
  const broadcastNodeUpdate = useCallback((key: string, node: HexNode) => {
    if (suppressBroadcast.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "node-update", key, node }));
    }
  }, []);

  const broadcastNodeDelete = useCallback((key: string) => {
    if (suppressBroadcast.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "node-delete", key }));
    }
  }, []);

  const broadcastFullState = useCallback(
    (allNodes: Record<string, HexNode>) => {
      if (suppressBroadcast.current) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "nodes-batch", nodes: allNodes })
        );
      }
    },
    []
  );

  // ── Broadcast cursor position (throttled) ─────────────────────────────
  const broadcastCursor = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - cursorThrottle.current < 50) return; // 20fps max
    cursorThrottle.current = now;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cursor", x, y }));
    }
  }, []);

  // ── Auto-broadcast when nodes change ──────────────────────────────────
  const prevNodesRef = useRef<Record<string, HexNode>>({});
  useEffect(() => {
    if (!state.isConnected || suppressBroadcast.current) return;

    const prev = prevNodesRef.current;
    const curr = nodes;

    // Detect individual changes
    const changedKeys: string[] = [];
    const deletedKeys: string[] = [];

    // Find changed/added nodes
    for (const key of Object.keys(curr)) {
      if (
        !prev[key] ||
        JSON.stringify(prev[key]) !== JSON.stringify(curr[key])
      ) {
        changedKeys.push(key);
      }
    }

    // Find deleted nodes
    for (const key of Object.keys(prev)) {
      if (!curr[key]) {
        deletedKeys.push(key);
      }
    }

    // Broadcast changes
    if (changedKeys.length > 5 || deletedKeys.length > 5) {
      // Too many changes — send full state
      broadcastFullState(curr);
    } else {
      for (const key of changedKeys) {
        broadcastNodeUpdate(key, curr[key]);
      }
      for (const key of deletedKeys) {
        broadcastNodeDelete(key);
      }
    }

    prevNodesRef.current = { ...curr };
  }, [
    nodes,
    state.isConnected,
    broadcastNodeUpdate,
    broadcastNodeDelete,
    broadcastFullState,
  ]);

  // ── Broadcast node presence (hover/select) ────────────────────────────
  const broadcastNodePresence = useCallback((nodeKey: string | null) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "node-presence", nodeKey }));
    }
  }, []);

  // ── Cleanup stale cursors and presence ────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setState(prev => ({
        ...prev,
        remoteCursors: prev.remoteCursors.filter(
          c => now - c.lastUpdate < 10_000
        ),
        nodePresence: prev.nodePresence.filter(
          p => now - p.lastUpdate < 10_000
        ),
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearConnectionTimeout();
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [clearConnectionTimeout]);

  return {
    ...state,
    /** The pending roomId (available immediately after createRoom, before WS confirms) */
    pendingRoomId: pendingRoomIdRef.current,
    joinRoom,
    leaveRoom,
    createRoom,
    broadcastCursor,
    broadcastNodePresence,
    broadcastNodeUpdate,
    broadcastNodeDelete,
    broadcastFullState,
  };
}
