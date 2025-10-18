import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import type { WebSocket, WebSocketServer } from "ws";
import { WebSocketServer as WsServer } from "ws";

import type {
  ClientToServerMessage,
  FanStatus,
  Role,
  ServerToClientMessage
} from "../types/signaling";
import { DEFAULT_SIGNATURE_BACKGROUND } from "../types/signature";
import type { SignatureBackground, SignatureStroke } from "../types/signature";
import { verifyRoleToken } from "./tokens";

type RoomId = string;

type BaseConnection = {
  socket: WebSocket;
  roomId: RoomId;
  heartbeatAt: number;
};

type TalentConnection = BaseConnection & {
  role: "talent";
};

type SignConnection = BaseConnection & {
  role: "sign";
};

type FanConnection = BaseConnection & {
  role: "fan";
  id: string;
  status: FanStatus;
};

type RoomState = {
  id: RoomId;
  talent?: TalentConnection;
  sign?: SignConnection;
  fans: Map<string, FanConnection>;
  fanQueue: string[];
  activeFanId?: string;
  strokes: SignatureStroke[];
  lastCommit?: {
    imageBase64: string;
    width: number;
    height: number;
    createdAt: number;
  };
  background: SignatureBackground;
};

const HEARTBEAT_INTERVAL = 15_000;
const HEARTBEAT_TIMEOUT = 30_000;

export class SignalingHub {
  private readonly rooms = new Map<RoomId, RoomState>();
  private readonly wss: WebSocketServer;
  private readonly heartbeatInterval: NodeJS.Timeout;

  constructor() {
    this.wss = new WsServer({ noServer: true });
    this.heartbeatInterval = setInterval(this.heartbeat, HEARTBEAT_INTERVAL);
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
    const checkPeer = (peer?: BaseConnection) => {
      if (!peer) return;
      if (now - peer.heartbeatAt > HEARTBEAT_TIMEOUT) {
        peer.socket.terminate();
        return;
      }
      this.safeSend(peer.socket, { type: "ping" });
    };

    for (const room of this.rooms.values()) {
      checkPeer(room.talent);
      checkPeer(room.sign);
      for (const fan of room.fans.values()) {
        checkPeer(fan);
      }
    }
  };

  private handleConnection(socket: WebSocket, request: IncomingMessage) {
    let currentRoom: RoomState | undefined;
    let currentRole: Role | "fan" | undefined;
    let currentFanId: string | undefined;

    socket.on("message", (raw) => {
      let data: ClientToServerMessage | undefined;
      try {
        data = JSON.parse(raw.toString());
      } catch (error) {
        this.safeSend(socket, { type: "error", message: "Invalid JSON payload" });
        return;
      }

      if (!data) return;

      switch (data.type) {
        case "join": {
          this.handleJoin(socket, request, data)
            .then((result) => {
              currentRoom = result?.room;
              currentRole = result?.role;
              if (result?.fanId) {
                currentFanId = result.fanId;
              }
            })
            .catch((error) => {
              this.safeSend(socket, {
                type: "error",
                message: error instanceof Error ? error.message : "Join failed"
              });
              socket.close();
            });
          break;
        }
        case "leave": {
          if (currentRoom && currentRole === "fan" && currentFanId) {
            this.removeFan(currentRoom, currentFanId);
          }
          socket.close();
          break;
        }
        case "offer":
        case "answer":
        case "ice": {
          if (!currentRoom || !currentRole) {
            this.safeSend(socket, { type: "error", message: "Joinが必要です" });
            return;
          }
          this.forwardWebRtcMessage(currentRoom, currentRole, data, currentFanId);
          break;
        }
        case "canvas-event":
        case "canvas-commit": {
          if (!currentRoom || !currentRole) {
            this.safeSend(socket, { type: "error", message: "Joinが必要です" });
            return;
          }
          if (currentRole === "fan" && currentFanId !== currentRoom.activeFanId) {
            return;
          }
          if (data.type === "canvas-event") {
            this.broadcastCanvasEvent(currentRoom, currentRole, data.stroke);
          } else {
            this.broadcastCanvasCommit(currentRoom, currentRole, data);
          }
          break;
        }
        case "canvas-background": {
          if (!currentRoom || currentRole !== "sign") {
            return;
          }
          currentRoom.background = data.background ?? DEFAULT_SIGNATURE_BACKGROUND;
          this.broadcastCanvasBackground(currentRoom, currentRole, data.background ?? null);
          break;
        }
        case "canvas-request-state": {
          if (!currentRoom || !currentRole) {
            return;
          }
          this.pushCanvasState(currentRoom, currentRole, currentFanId);
          break;
        }
        case "queue-next": {
          if (!currentRoom || currentRole !== "talent") {
            return;
          }
          this.advanceQueue(currentRoom);
          break;
        }
        case "pong": {
          if (currentRoom && currentRole) {
            if (currentRole === "fan" && currentFanId) {
              const fan = currentRoom.fans.get(currentFanId);
              if (fan) fan.heartbeatAt = Date.now();
            } else if (currentRole === "talent" && currentRoom.talent) {
              currentRoom.talent.heartbeatAt = Date.now();
            } else if (currentRole === "sign" && currentRoom.sign) {
              currentRoom.sign.heartbeatAt = Date.now();
            }
          }
          break;
        }
        default:
          this.safeSend(socket, { type: "error", message: "未対応のメッセージタイプです" });
      }
    });

    socket.on("close", () => {
      if (currentRoom) {
        if (currentRole === "fan" && currentFanId) {
          this.removeFan(currentRoom, currentFanId);
        } else if (currentRole === "talent") {
          currentRoom.talent = undefined;
        } else if (currentRole === "sign") {
          currentRoom.sign = undefined;
        }
      }
    });
  }

  private async handleJoin(
    socket: WebSocket,
    request: IncomingMessage,
    data: Extract<ClientToServerMessage, { type: "join" }>
  ) {
    const { roomId, role, token } = data;
    const valid = verifyRoleToken({ roomId, role, token });
    if (!valid) {
      throw new Error("認証に失敗しました");
    }

    const room = this.rooms.get(roomId) ?? this.createRoom(roomId);
    let fanId: string | undefined;

    if (role === "fan") {
      fanId = this.handleFanJoin(room, socket, roomId);
    } else if (role === "talent") {
      this.handleTalentJoin(room, socket, roomId);
    } else if (role === "sign") {
      this.handleSignJoin(room, socket, roomId);
    }

    const peers = this.collectPeers(room);
    this.safeSend(socket, {
      type: "joined",
      roomId,
      role,
      peers
    });

    if (role !== "fan") {
      this.broadcastQueueInfo(room);
    }

    return { room, role, fanId } as const;
  }

  private handleFanJoin(room: RoomState, socket: WebSocket, roomId: RoomId) {
    const fanId = randomUUID();
    const fan: FanConnection = {
      id: fanId,
      role: "fan",
      socket,
      roomId,
      heartbeatAt: Date.now(),
      status: "waiting"
    };
    room.fans.set(fanId, fan);
    room.fanQueue.push(fanId);
    if (!room.activeFanId) {
      room.activeFanId = fanId;
    }
    this.updateFanQueueState(room);
    return fanId;
  }

  private handleTalentJoin(room: RoomState, socket: WebSocket, roomId: RoomId) {
    room.talent = {
      role: "talent",
      socket,
      roomId,
      heartbeatAt: Date.now()
    };
    this.broadcastQueueInfo(room);
    this.pushCanvasState(room, "talent");
  }

  private handleSignJoin(room: RoomState, socket: WebSocket, roomId: RoomId) {
    room.sign = {
      role: "sign",
      socket,
      roomId,
      heartbeatAt: Date.now()
    };
    this.pushCanvasState(room, "sign");
  }

  private removeFan(room: RoomState, fanId: string) {
    const fan = room.fans.get(fanId);
    if (!fan) return;
    room.fans.delete(fanId);
    room.fanQueue = room.fanQueue.filter((id) => id !== fanId);
    if (room.activeFanId === fanId) {
      room.activeFanId = undefined;
      this.activateNextFan(room);
    } else {
      this.updateFanQueueState(room);
    }
  }

  private advanceQueue(room: RoomState) {
    if (room.activeFanId) {
      this.completeFan(room, room.activeFanId);
    } else {
      this.activateNextFan(room);
    }
  }

  private completeFan(room: RoomState, fanId: string) {
    const fan = room.fans.get(fanId);
    if (!fan) return;
    this.safeSend(fan.socket, {
      type: "fan-status",
      status: "completed",
      ahead: 0,
      queueLength: room.fanQueue.length
    });
    setTimeout(() => fan.socket.close(1000, "completed"), 500);
    room.fans.delete(fanId);
    room.fanQueue = room.fanQueue.filter((id) => id !== fanId);
    if (room.activeFanId === fanId) {
      room.activeFanId = undefined;
    }
    this.activateNextFan(room);
  }

  private activateNextFan(room: RoomState) {
    room.fanQueue = room.fanQueue.filter((id) => room.fans.has(id));
    const nextId = room.fanQueue[0];
    const previousActive = room.activeFanId;
    room.activeFanId = nextId;
    if (previousActive !== nextId) {
      room.strokes = [];
      room.lastCommit = undefined;
      room.background = DEFAULT_SIGNATURE_BACKGROUND;
      this.sendCanvasReset(room);
    }
    this.updateFanQueueState(room);
  }

  private updateFanQueueState(room: RoomState) {
    room.fanQueue = room.fanQueue.filter((id) => room.fans.has(id));
    if (!room.activeFanId && room.fanQueue.length > 0) {
      room.activeFanId = room.fanQueue[0];
    }
    const queueLength = room.fanQueue.length;
    room.fanQueue.forEach((fanId, index) => {
      const fan = room.fans.get(fanId);
      if (!fan) return;
      const status: FanStatus = index === 0 ? "active" : "waiting";
      fan.status = status;
      this.safeSend(fan.socket, {
        type: "fan-status",
        status,
        ahead: index,
        queueLength
      });
    });
    this.broadcastQueueInfo(room);
  }

  private broadcastQueueInfo(room: RoomState) {
    const waitingCount = room.fanQueue.length > 0 ? room.fanQueue.length - 1 : 0;
    const hasActiveFan = Boolean(room.activeFanId);
    const message: ServerToClientMessage = {
      type: "queue-info",
      waitingCount,
      hasActiveFan
    };
    if (room.talent) {
      this.safeSend(room.talent.socket, message);
    }
    if (room.sign) {
      this.safeSend(room.sign.socket, message);
    }
  }

  private sendCanvasReset(room: RoomState) {
    const message: ServerToClientMessage = {
      type: "canvas-reset",
      background: DEFAULT_SIGNATURE_BACKGROUND
    };
    if (room.sign) {
      this.safeSend(room.sign.socket, message);
    }
    if (room.talent) {
      this.safeSend(room.talent.socket, message);
    }
    const activeFan = room.activeFanId ? room.fans.get(room.activeFanId) : undefined;
    if (activeFan) {
      this.safeSend(activeFan.socket, message);
    }
  }

  private broadcastCanvasEvent(room: RoomState, fromRole: Role, stroke: SignatureStroke) {
    room.strokes.push(stroke);
    if (room.strokes.length > 5000) {
      room.strokes.splice(0, room.strokes.length - 5000);
    }
    const message: ServerToClientMessage = {
      type: "canvas-event",
      stroke,
      from: fromRole
    };
    if (fromRole !== "talent" && room.talent) {
      this.safeSend(room.talent.socket, message);
    }
    if (fromRole !== "sign" && room.sign) {
      this.safeSend(room.sign.socket, message);
    }
    const activeFan = room.activeFanId ? room.fans.get(room.activeFanId) : undefined;
    if (fromRole !== "fan" && activeFan) {
      this.safeSend(activeFan.socket, message);
    }
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
    const message: ServerToClientMessage = {
      type: "canvas-commit",
      imageBase64: data.imageBase64,
      width: data.width,
      height: data.height,
      createdAt: room.lastCommit.createdAt,
      from: fromRole
    };
    if (fromRole !== "talent" && room.talent) {
      this.safeSend(room.talent.socket, message);
    }
    if (fromRole !== "sign" && room.sign) {
      this.safeSend(room.sign.socket, message);
    }
    const activeFan = room.activeFanId ? room.fans.get(room.activeFanId) : undefined;
    if (fromRole !== "fan" && activeFan) {
      this.safeSend(activeFan.socket, message);
    }
  }

  private broadcastCanvasBackground(
    room: RoomState,
    fromRole: Role,
    background: SignatureBackground | null
  ) {
    const message: ServerToClientMessage = {
      type: "canvas-background",
      background,
      from: fromRole
    };
    if (fromRole !== "talent" && room.talent) {
      this.safeSend(room.talent.socket, message);
    }
    if (fromRole !== "sign" && room.sign) {
      this.safeSend(room.sign.socket, message);
    }
    const activeFan = room.activeFanId ? room.fans.get(room.activeFanId) : undefined;
    if (fromRole !== "fan" && activeFan) {
      this.safeSend(activeFan.socket, message);
    }
  }

  private pushCanvasState(room: RoomState, toRole: Role, fanId?: string) {
    const payload: ServerToClientMessage = {
      type: "canvas-state",
      strokes: room.strokes,
      imageBase64: room.lastCommit?.imageBase64,
      width: room.lastCommit?.width ?? 1440,
      height: room.lastCommit?.height ?? 2560,
      background: room.background ?? DEFAULT_SIGNATURE_BACKGROUND
    };

    if (toRole === "talent" && room.talent) {
      this.safeSend(room.talent.socket, payload);
    } else if (toRole === "sign" && room.sign) {
      this.safeSend(room.sign.socket, payload);
    } else if (toRole === "fan" && fanId) {
      const fan = room.fans.get(fanId);
      if (fan) this.safeSend(fan.socket, payload);
    }
  }

  private forwardWebRtcMessage(
    room: RoomState,
    fromRole: Role,
    message: Extract<ClientToServerMessage, { type: "offer" | "answer" | "ice" }>,
    fanId?: string
  ) {
    if (fromRole === "talent") {
      const activeFan = room.activeFanId ? room.fans.get(room.activeFanId) : undefined;
      if (!activeFan) return;
      const payload: ServerToClientMessage =
        message.type === "ice"
          ? { type: "ice", candidate: message.candidate, from: "talent" }
          : { type: message.type, sdp: message.sdp, from: "talent" };
      this.safeSend(activeFan.socket, payload);
    } else if (fromRole === "fan" && fanId) {
      if (room.activeFanId !== fanId || !room.talent) return;
      const payload: ServerToClientMessage =
        message.type === "ice"
          ? { type: "ice", candidate: message.candidate, from: "fan" }
          : { type: message.type, sdp: message.sdp, from: "fan" };
      this.safeSend(room.talent.socket, payload);
    }
  }

  private createRoom(roomId: RoomId): RoomState {
    const room: RoomState = {
      id: roomId,
      fans: new Map(),
      fanQueue: [],
      strokes: [],
      background: DEFAULT_SIGNATURE_BACKGROUND
    };
    this.rooms.set(roomId, room);
    return room;
  }

  private collectPeers(room: RoomState) {
    const peers = new Set<Role>();
    if (room.fans.size > 0) peers.add("fan");
    if (room.talent) peers.add("talent");
    if (room.sign) peers.add("sign");
    return Array.from(peers);
  }

  private safeSend(socket: WebSocket, message: ServerToClientMessage) {
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      console.error("[signaling] failed to send", error);
    }
  }
}

export function createRoomId(seed: string) {
  return createHash("sha1").update(seed).digest("hex").slice(0, 10);
}
