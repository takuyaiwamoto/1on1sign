import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";

import type { WebSocket, WebSocketServer } from "ws";
import { WebSocketServer as WsServer } from "ws";

import type {
  ClientToServerMessage,
  Role,
  ServerToClientMessage
} from "../types/signaling";
import type { SignatureBackground, SignatureStroke } from "../types/signature";
import { DEFAULT_SIGNATURE_BACKGROUND } from "../types/signature";
import { verifyRoleToken } from "./tokens";

type RoomId = string;

type RoomState = {
  id: RoomId;
  peers: Map<Role, PeerConnection>;
  strokes: SignatureStroke[];
  lastCommit?: {
    imageBase64: string;
    width: number;
    height: number;
    createdAt: number;
  };
  background: SignatureBackground | null;
};

type PeerConnection = {
  role: Role;
  socket: WebSocket;
  roomId: RoomId;
  heartbeatAt: number;
};

const WEBRTC_ROLES: Role[] = ["fan", "talent"];
const MAX_STROKE_HISTORY = 5000;

export class SignalingHub {
  private readonly rooms = new Map<RoomId, RoomState>();
  private readonly wss: WebSocketServer;
  private readonly heartbeatInterval: NodeJS.Timeout;

  constructor() {
    this.wss = new WsServer({ noServer: true });
    this.heartbeatInterval = setInterval(this.heartbeat, 15_000);
  }

  get server() {
    return this.wss;
  }

  upgrade(request: IncomingMessage, socket: any, head: Buffer) {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit("connection", ws, request);
    });
  }

  dispose() {
    clearInterval(this.heartbeatInterval);
    this.wss.clients.forEach((client) => client.close());
    this.rooms.clear();
  }

  initialize() {
    this.wss.on("connection", (socket, request) => {
      console.log("[signaling] client connected", request.socket.remoteAddress);
      this.handleConnection(socket as WebSocket, request);
    });
  }

  private heartbeat = () => {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      for (const peer of room.peers.values()) {
        if (now - peer.heartbeatAt > 30_000) {
          peer.socket.terminate();
          continue;
        }
        try {
          peer.socket.send(JSON.stringify({ type: "ping" } satisfies ServerToClientMessage));
        } catch (error) {
          peer.socket.terminate();
        }
      }
    }
  };

  private handleConnection(socket: WebSocket, request: IncomingMessage) {
    let currentRoom: RoomState | undefined;
    let currentPeer: PeerConnection | undefined;

    socket.on("message", (raw) => {
      let data: ClientToServerMessage | undefined;
      try {
        data = JSON.parse(raw.toString());
      } catch (error) {
        socket.send(JSON.stringify({ type: "error", message: "Invalid JSON payload" } as ServerToClientMessage));
        return;
      }

      if (!data) {
        return;
      }

      switch (data.type) {
        case "join":
          this.handleJoin(socket, data, request)
            .then((result) => {
              currentRoom = result?.room;
              currentPeer = result?.peer;
            })
            .catch((error) => {
              socket.send(
                JSON.stringify({
                  type: "error",
                  message: error instanceof Error ? error.message : "Join failed"
                } satisfies ServerToClientMessage)
              );
              socket.close();
            });
          break;
        case "leave":
          if (currentRoom && currentPeer) {
            this.removePeer(currentRoom, currentPeer.role);
          }
          socket.close();
          break;
        case "offer":
        case "answer":
        case "ice":
          if (!currentRoom || !currentPeer) {
            this.sendError(socket, "Joinが必要です");
            return;
          }
          this.forwardWebRtcMessage(currentRoom, currentPeer.role, data);
          break;
        case "canvas-event":
          if (!currentRoom || !currentPeer) {
            this.sendError(socket, "Joinが必要です");
            return;
          }
          this.broadcastCanvasEvent(currentRoom, currentPeer.role, data.stroke);
          break;
        case "canvas-commit":
          if (!currentRoom || !currentPeer) {
            this.sendError(socket, "Joinが必要です");
            return;
          }
          this.broadcastCanvasCommit(currentRoom, currentPeer.role, data);
          break;
        case "canvas-background":
          if (!currentRoom || !currentPeer) {
            this.sendError(socket, "Joinが必要です");
            return;
          }
          this.applyBackground(currentRoom, currentPeer.role, data.background ?? DEFAULT_SIGNATURE_BACKGROUND);
          break;
        case "canvas-request-state":
          if (!currentRoom || !currentPeer) {
            this.sendError(socket, "Joinが必要です");
            return;
          }
          this.pushCanvasState(currentRoom, currentPeer.role);
          break;
        case "pong":
          if (currentPeer) {
            currentPeer.heartbeatAt = Date.now();
          }
          break;
        default:
          this.sendError(socket, "未対応のメッセージタイプです");
      }
    });

    socket.on("close", () => {
      if (currentRoom && currentPeer) {
        this.removePeer(currentRoom, currentPeer.role);
      }
    });
  }

  private sendError(socket: WebSocket, message: string) {
    try {
      socket.send(JSON.stringify({ type: "error", message } satisfies ServerToClientMessage));
    } catch (error) {
      socket.close();
    }
  }

  private async handleJoin(
    socket: WebSocket,
    data: Extract<ClientToServerMessage, { type: "join" }>,
    request: IncomingMessage
  ) {
    const { roomId, role, token } = data;
    const valid = verifyRoleToken({ roomId, role, token });
    if (!valid) {
      console.warn("[signaling] invalid token", { roomId, role });
      throw new Error("認証に失敗しました");
    }

    const room = this.rooms.get(roomId) ?? this.createRoom(roomId);

    const existingPeer = room.peers.get(role);
    if (existingPeer && existingPeer.socket !== socket) {
      existingPeer.socket.close();
    }

    const peer: PeerConnection = {
      role,
      roomId,
      socket,
      heartbeatAt: Date.now()
    };

    room.peers.set(role, peer);

    socket.send(
      JSON.stringify({
        type: "joined",
        roomId,
        role,
        peers: Array.from(room.peers.keys())
      } satisfies ServerToClientMessage)
    );

    this.broadcastToRoom(room, role, {
      type: "peer-update",
      role,
      event: "joined"
    });

    this.pushCanvasState(room, role);

    return { room, peer };
  }

  private forwardWebRtcMessage(
    room: RoomState,
    fromRole: Role,
    message: Extract<ClientToServerMessage, { type: "offer" | "answer" | "ice" }>
  ) {
    if (!WEBRTC_ROLES.includes(fromRole)) {
      return;
    }

    const targetRole = WEBRTC_ROLES.find((role) => role !== fromRole);
    if (!targetRole) {
      return;
    }

    const target = room.peers.get(targetRole);
    if (!target) {
      return;
    }

    const payload: ServerToClientMessage =
      message.type === "ice"
        ? { type: "ice", candidate: message.candidate, from: fromRole }
        : { type: message.type, sdp: message.sdp, from: fromRole };
    target.socket.send(JSON.stringify(payload));
  }

  private broadcastCanvasEvent(room: RoomState, fromRole: Role, stroke: SignatureStroke) {
    room.strokes.push(stroke);
    if (room.strokes.length > MAX_STROKE_HISTORY) {
      room.strokes.splice(0, room.strokes.length - MAX_STROKE_HISTORY);
    }

    this.broadcastToRoom(room, fromRole, {
      type: "canvas-event",
      stroke,
      from: fromRole
    });
  }

  private broadcastCanvasCommit(
    room: RoomState,
    fromRole: Role,
    data: Extract<ClientToServerMessage, { type: "canvas-commit" }>
  ) {
    room.lastCommit = {
      imageBase64: data.imageBase64,
      width: data.width,
      height: data.height,
      createdAt: Date.now()
    };
    room.strokes = [];

    this.broadcastToRoom(room, fromRole, {
      type: "canvas-commit",
      imageBase64: data.imageBase64,
      width: data.width,
      height: data.height,
      createdAt: room.lastCommit.createdAt,
      from: fromRole
    });
  }

  private applyBackground(room: RoomState, fromRole: Role, background: SignatureBackground | null) {
    room.background = background;
    this.broadcastToRoom(room, fromRole, {
      type: "canvas-background",
      background,
      from: fromRole
    });
  }

  private pushCanvasState(room: RoomState, toRole: Role) {
    const peer = room.peers.get(toRole);
    if (!peer) {
      return;
    }
    const payload: ServerToClientMessage = {
      type: "canvas-state",
      strokes: room.strokes,
      width: 1440,
      height: 2560,
      background: room.background ?? DEFAULT_SIGNATURE_BACKGROUND,
      ...(room.lastCommit
        ? {
            imageBase64: room.lastCommit.imageBase64
          }
        : {})
    };
    peer.socket.send(JSON.stringify(payload));
  }

  private broadcastToRoom(room: RoomState, excludeRole: Role, message: ServerToClientMessage) {
    for (const peer of room.peers.values()) {
      if (peer.role === excludeRole) {
        continue;
      }
      try {
        peer.socket.send(JSON.stringify(message));
      } catch (error) {
        peer.socket.terminate();
      }
    }
  }

  private removePeer(room: RoomState, role: Role) {
    if (!room.peers.has(role)) {
      return;
    }
    room.peers.delete(role);
    this.broadcastToRoom(room, role, {
      type: "peer-update",
      role,
      event: "left"
    });

    if (room.peers.size === 0) {
      this.rooms.delete(room.id);
    }
  }

  private createRoom(roomId: RoomId): RoomState {
    const room: RoomState = {
      id: roomId,
      peers: new Map(),
      strokes: [],
      background: DEFAULT_SIGNATURE_BACKGROUND
    };
    this.rooms.set(roomId, room);
    return room;
  }
}

export function createRoomId(seed: string) {
  return createHash("sha1").update(seed).digest("hex").slice(0, 10);
}
