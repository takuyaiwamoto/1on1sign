import { randomUUID } from 'crypto';
import type { Role } from '../types/signaling';

interface RoomRecord {
  roomId: string;
  tokens: Record<Role, string>;
}

const roomStore = new Map<string, RoomRecord>();

function generateToken(): string {
  return randomUUID().replace(/-/g, '');
}

export function createOrReplaceRoom(roomId?: string): RoomRecord {
  const id = roomId && roomId.trim().length > 0 ? roomId : randomUUID();
  const record: RoomRecord = {
    roomId: id,
    tokens: {
      fan: generateToken(),
      talent: generateToken(),
      sign: generateToken()
    }
  };
  roomStore.set(id, record);
  return record;
}

export function getRoom(roomId: string): RoomRecord | undefined {
  return roomStore.get(roomId);
}

export function verifyToken(roomId: string, role: Role, token: string): boolean {
  const record = roomStore.get(roomId);
  if (!record) return false;
  return record.tokens[role] === token;
}

export function getTokens(roomId: string): Record<Role, string> | null {
  const record = roomStore.get(roomId);
  if (!record) return null;
  return record.tokens;
}
