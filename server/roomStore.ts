import { createHmac, randomUUID } from 'crypto';
import type { Role } from '../types/signaling';

interface RoomRecord {
  roomId: string;
  tokens: Record<Role, string>;
}

type RoomRegistry = Map<string, RoomRecord & { createdAt: number }>;

interface GlobalRoomStore {
  __ROOM_REGISTRY__?: RoomRegistry;
}

function getRegistry(): RoomRegistry {
  const globalStore = globalThis as typeof globalThis & GlobalRoomStore;
  if (!globalStore.__ROOM_REGISTRY__) {
    globalStore.__ROOM_REGISTRY__ = new Map();
  }
  return globalStore.__ROOM_REGISTRY__;
}

function assertSecret(): string {
  const secret = process.env.ROOM_SECRET;
  if (!secret) {
    throw new Error('ROOM_SECRET must be configured on the server before creating rooms.');
  }
  return secret;
}

function computeToken(roomId: string, role: Role): string {
  const secret = assertSecret();
  return createHmac('sha256', secret).update(`${roomId}:${role}`).digest('hex');
}

function ensureRoom(roomId: string): RoomRecord & { createdAt: number } {
  const registry = getRegistry();
  const existing = registry.get(roomId);
  if (existing) {
    return existing;
  }

  const tokens: Record<Role, string> = {
    fan: computeToken(roomId, 'fan'),
    talent: computeToken(roomId, 'talent'),
    sign: computeToken(roomId, 'sign')
  };

  const record = {
    roomId,
    tokens,
    createdAt: Date.now()
  };
  registry.set(roomId, record);
  return record;
}

export function createOrReplaceRoom(roomId?: string): RoomRecord {
  const id = roomId && roomId.trim().length > 0 ? roomId : randomUUID();
  const record = ensureRoom(id);
  return { roomId: record.roomId, tokens: record.tokens };
}

export function getRoom(roomId: string): RoomRecord | undefined {
  const record = getRegistry().get(roomId);
  if (!record) return undefined;
  return { roomId: record.roomId, tokens: record.tokens };
}

export function verifyToken(roomId: string, role: Role, token: string): boolean {
  const expected = computeToken(roomId, role);
  if (expected !== token) {
    return false;
  }
  ensureRoom(roomId);
  return true;
}

export function getTokens(roomId: string): Record<Role, string> | null {
  const record = ensureRoom(roomId);
  return record.tokens;
}
