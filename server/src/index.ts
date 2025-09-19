import 'dotenv/config';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { nanoid } from 'nanoid';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '0.0.0.0';
const BASE_URL = process.env.PUBLIC_BASE_URL ?? `https://localhost:${PORT}`;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

function readIceServers(): IceServer[] {
  try {
    if (process.env.ICE_SERVERS) {
      return JSON.parse(process.env.ICE_SERVERS) as IceServer[];
    }
  } catch (error) {
    console.error('Failed to parse ICE_SERVERS env var', error);
  }

  const stunUrl = process.env.STUN_URL || 'stun:stun.l.google.com:19302';
  const turnUrl = process.env.TURN_URL;
  const turnUser = process.env.TURN_USERNAME;
  const turnPass = process.env.TURN_PASSWORD;

  const servers: IceServer[] = [{ urls: stunUrl }];
  if (turnUrl && turnUser && turnPass) {
    servers.push({ urls: turnUrl.split(',').map((url) => url.trim()).filter(Boolean), username: turnUser, credential: turnPass });
  }
  return servers;
}

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/config', (_req, res) => {
  res.json({
    iceServers: readIceServers(),
    baseUrl: BASE_URL,
    signaling: {
      secure: Boolean(process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH)
    }
  });
});

app.post('/api/rooms', (_req, res) => {
  const roomId = nanoid(8);
  const url = new URL(BASE_URL);
  url.searchParams.set('room', roomId);
  res.status(201).json({ roomId, shareUrl: url.toString() });
});

type ClientRole = 'writer' | 'receiver';

type ServerError = { type: 'error'; payload: { reason: string } };

type PeerSummary = { clientId: string; role: ClientRole };

interface ClientInfo {
  id: string;
  socket: WebSocket;
  roomId: string;
  role: ClientRole;
  joinedAt: number;
}

const rooms = new Map<string, Map<string, ClientInfo>>();

function getPeers(roomId: string, exceptId?: string) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.values()).filter((peer) => peer.id !== exceptId);
}

function broadcast(roomId: string, message: unknown, exceptId?: string) {
  const peers = getPeers(roomId, exceptId);
  const payload = JSON.stringify(message);
  peers.forEach((peer) => {
    if (peer.socket.readyState === WebSocket.OPEN) {
      peer.socket.send(payload);
    }
  });
}

function removeClient(clientId: string) {
  for (const [roomId, clients] of rooms.entries()) {
    if (clients.has(clientId)) {
      clients.delete(clientId);
      broadcast(roomId, { type: 'peer-left', payload: { clientId } });
      if (clients.size === 0) {
        rooms.delete(roomId);
      }
      break;
    }
  }
}

interface BaseMessage<T extends string, P = unknown> {
  type: T;
  payload: P;
}

type ClientMessage =
  | BaseMessage<'join', { roomId: string; role: ClientRole; clientId: string }>
  | BaseMessage<'signal', { roomId: string; targetId?: string; data: unknown; clientId: string }>
  | BaseMessage<'leave', { roomId: string; clientId: string }>;

type ServerMessage =
  | BaseMessage<'joined', { clientId: string; roomId: string; role: ClientRole; peers: PeerSummary[] }>
  | BaseMessage<'peer-joined', PeerSummary>
  | BaseMessage<'peer-left', { clientId: string }>
  | BaseMessage<'signal', { clientId: string; data: unknown }>
  | ServerError;

function createServer() {
  const keyPath = process.env.SSL_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH;

  if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const credentials = {
      key: fs.readFileSync(path.resolve(keyPath)),
      cert: fs.readFileSync(path.resolve(certPath))
    };
    console.log('Starting signaling server with TLS certificates.');
    return https.createServer(credentials, app);
  }
  console.warn('Starting signaling server without TLS certificates. Use a reverse proxy or set SSL_KEY_PATH and SSL_CERT_PATH for wss.');
  return http.createServer(app);
}

const server = createServer();

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket: WebSocket) => {
  let clientId: string | null = null;
  socket.on('message', (raw: RawData) => {
    try {
      const message = JSON.parse(raw.toString()) as ClientMessage;
      if (message.type === 'join') {
        const { roomId, role, clientId: incomingId } = message.payload;
        clientId = incomingId;
        const clients = rooms.get(roomId) ?? new Map<string, ClientInfo>();
        const duplicateRole = Array.from(clients.values()).find((peer) => peer.role === role);
        if (duplicateRole) {
          const error: ServerError = {
            type: 'error',
            payload: { reason: `Role ${role} already connected` }
          };
          socket.send(JSON.stringify(error));
          socket.close(4001, 'role-already-connected');
          return;
        }
        clients.set(clientId, {
          id: clientId,
          socket,
          roomId,
          role,
          joinedAt: Date.now()
        });
        rooms.set(roomId, clients);
        const peers = getPeers(roomId, clientId).map<PeerSummary>((peer) => ({ clientId: peer.id, role: peer.role }));
        const response: ServerMessage = {
          type: 'joined',
          payload: { clientId, roomId, role, peers }
        };
        socket.send(JSON.stringify(response));
        broadcast(roomId, { type: 'peer-joined', payload: { clientId, role } }, clientId);
      }

      if (message.type === 'signal') {
        const { roomId, clientId: fromId, data, targetId } = message.payload;
        if (!rooms.has(roomId)) return;
        if (targetId) {
          const room = rooms.get(roomId);
          const target = room?.get(targetId);
          if (target && target.socket.readyState === WebSocket.OPEN) {
            const payload: ServerMessage = { type: 'signal', payload: { clientId: fromId, data } };
            target.socket.send(JSON.stringify(payload));
          }
        } else {
          broadcast(roomId, { type: 'signal', payload: { clientId: fromId, data } }, fromId);
        }
      }

      if (message.type === 'leave') {
        removeClient(message.payload.clientId);
      }
    } catch (error) {
      console.error('Failed to handle message', error);
    }
  });

  socket.on('close', () => {
    if (clientId) {
      removeClient(clientId);
    }
  });

  socket.on('error', (error: Error) => {
    console.error('WebSocket error', error);
    if (clientId) {
      removeClient(clientId);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Signaling server listening on ${HOST}:${PORT}`);
});
