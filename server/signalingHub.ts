import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import type { ClientToServerMessage, Role, ServerToClientMessage } from '../types/signaling';
import { getRoom, verifyToken } from './roomStore';

interface ConnectionContext {
  roomId: string;
  role: Role;
  token: string;
}

interface RoomConnections {
  connections: Map<WebSocket, ConnectionContext>;
  roles: Map<Role, WebSocket>;
}

const rooms = new Map<string, RoomConnections>();

function getRoomConnections(roomId: string): RoomConnections {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      connections: new Map(),
      roles: new Map()
    };
    rooms.set(roomId, room);
  }
  return room;
}

function sendMessage(ws: WebSocket, message: ServerToClientMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcast(room: RoomConnections, sourceWs: WebSocket, message: ServerToClientMessage) {
  for (const [client] of room.connections) {
    if (client !== sourceWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}

function forwardToRole(room: RoomConnections, role: Role, payload: ServerToClientMessage) {
  const target = room.roles.get(role);
  if (target && target.readyState === WebSocket.OPEN) {
    target.send(JSON.stringify(payload));
  }
}

function parseUrlInfo(requestUrl: string | undefined): Partial<ConnectionContext> {
  if (!requestUrl) return {};
  try {
    const url = new URL(requestUrl, 'http://localhost');
    return {
      roomId: url.searchParams.get('roomId') ?? undefined,
      token: url.searchParams.get('token') ?? undefined,
      role: (url.searchParams.get('role') as Role | null) ?? undefined
    };
  } catch {
    return {};
  }
}

function validateJoin(roomId: string, role: Role, token: string): boolean {
  if (!getRoom(roomId)) {
    return false;
  }
  return verifyToken(roomId, role, token);
}

export function attachSignalingHub(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (!request.url?.startsWith('/ws')) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
    const queryContext = parseUrlInfo(request.url);
    let connection: ConnectionContext | null = null;

    ws.on('message', (chunk) => {
      let message: ClientToServerMessage;
      try {
        message = JSON.parse(chunk.toString());
      } catch (error) {
        console.error('Invalid message payload', error);
        sendMessage(ws, {
          kind: 'error',
          message: 'invalid_payload'
        });
        return;
      }

      if (message.kind === 'join') {
        const { roomId, role, token } = message;

        if (!validateJoin(roomId, role, token)) {
          sendMessage(ws, {
            kind: 'error',
            message: 'authentication_failed'
          });
          ws.close();
          return;
        }

        const room = getRoomConnections(roomId);

        const existing = room.roles.get(role);
        if (existing && existing !== ws) {
          sendMessage(existing, {
            kind: 'error',
            message: 'another_connection_detected'
          });
          existing.close();
        }

        connection = { roomId, role, token };
        room.connections.set(ws, connection);
        room.roles.set(role, ws);

        const peers = Array.from(room.roles.keys()).filter((peer) => peer !== role);
        sendMessage(ws, {
          kind: 'joined',
          role,
          peers
        });

        broadcast(room, ws, {
          kind: 'peer-joined',
          role
        });
        return;
      }

      if (!connection) {
        sendMessage(ws, {
          kind: 'error',
          message: 'unauthorized'
        });
        return;
      }

      const room = getRoomConnections(connection.roomId);

      switch (message.kind) {
        case 'leave':
          handleDisconnect(ws, room);
          ws.close();
          break;
        case 'offer':
          forwardToRole(room, message.target, {
            kind: 'offer',
            source: connection.role,
            description: message.description
          });
          break;
        case 'answer':
          forwardToRole(room, message.target, {
            kind: 'answer',
            source: connection.role,
            description: message.description
          });
          break;
        case 'ice-candidate':
          forwardToRole(room, message.target, {
            kind: 'ice-candidate',
            source: connection.role,
            candidate: message.candidate
          });
          break;
        case 'signature-event':
          broadcast(room, ws, {
            kind: 'signature-event',
            source: connection.role,
            event: message.event
          });
          break;
        case 'final-sign':
          broadcast(room, ws, {
            kind: 'final-sign',
            source: connection.role,
            image: message.image
          });
          break;
        default:
          break;
      }
    });

    ws.on('close', () => {
      if (!connection) return;
      const room = getRoomConnections(connection.roomId);
      handleDisconnect(ws, room);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error', error);
    });
  });
}

function handleDisconnect(ws: WebSocket, room: RoomConnections) {
  const context = room.connections.get(ws);
  if (!context) return;

  room.connections.delete(ws);
  if (room.roles.get(context.role) === ws) {
    room.roles.delete(context.role);
  }

  broadcast(room, ws, {
    kind: 'peer-left',
    role: context.role
  });
}
