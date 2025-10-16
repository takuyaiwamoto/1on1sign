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

export function createOrReplaceRoom(roomId?: string): RoomRecord {
  const id = roomId && roomId.trim().length > 0 ? roomId : randomUUID();
  const tokens: Record<Role, string> = {
    fan: computeToken(id, 'fan'),
    talent: computeToken(id, 'talent'),
    sign: computeToken(id, 'sign')
  };

  const registry = getRegistry();
  registry.set(id, {
    roomId: id,
    tokens,
    createdAt: Date.now()
  });

  return { roomId: id, tokens };
}

export function getRoom(roomId: string): RoomRecord | undefined {
  const registry = getRegistry();
  const record = registry.get(roomId);
  if (!record) {
    return undefined;
  }
  return { roomId: record.roomId, tokens: record.tokens };
}

export function verifyToken(roomId: string, role: Role, token: string): boolean {
  const registry = getRegistry();
  if (!registry.has(roomId)) {
    return false;
  }
  const expected = computeToken(roomId, role);
  return expected === token;
}

export function getTokens(roomId: string): Record<Role, string> | null {
  const registry = getRegistry();
  const record = registry.get(roomId);
  if (!record) return null;
  return record.tokens;
}
