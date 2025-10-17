import crypto from "node:crypto";

import type { Role } from "../types/signaling";

const TOKEN_VERSION = "v1";

function assertRoomSecret(secret?: string): string {
  if (!secret) {
    throw new Error("ROOM_SECRET is not configured");
  }
  return secret;
}

export function createRoleToken(roomId: string, role: Role, secret = process.env.ROOM_SECRET): string {
  const resolvedSecret = assertRoomSecret(secret);
  const hmac = crypto.createHmac("sha256", resolvedSecret);
  hmac.update(`${TOKEN_VERSION}:${roomId}:${role}`);
  return `${TOKEN_VERSION}.${hmac.digest("hex")}`;
}

export function verifyRoleToken(args: { roomId: string; role: Role; token?: string; secret?: string }): boolean {
  const { roomId, role, token, secret = process.env.ROOM_SECRET } = args;
  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [version] = parts;
  if (version !== TOKEN_VERSION) {
    return false;
  }

  try {
    const expected = createRoleToken(roomId, role, secret);
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch (error) {
    return false;
  }
}
