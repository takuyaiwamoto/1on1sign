import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { createRoleToken } from "@/server/tokens";
import type { Role } from "@/types/signaling";

type CreateRoomRequest = {
  roomId?: string;
};

const ROLES: Role[] = ["fan", "talent", "sign"];

export const runtime = "nodejs";

function resolveBaseUrl(request: NextRequest) {
  const envUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }
  const origin = request.headers.get("origin") ?? request.nextUrl.origin;
  return origin.replace(/\/$/, "");
}

function resolveWsUrl(baseUrl: string) {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envUrl) {
    return envUrl;
  }
  return baseUrl.replace(/^http/, "ws") + "/ws";
}

export async function POST(request: NextRequest) {
  const header = request.headers.get("authorization");
  const secret = process.env.ROOM_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ROOM_SECRET is not configured" }, { status: 500 });
  }

  if (!header || !header.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = header.split(" ")[1];
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateRoomRequest;
  const roomId = (body.roomId ?? crypto.randomUUID()).replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();

  if (!roomId) {
    return NextResponse.json({ error: "Invalid roomId" }, { status: 400 });
  }

  const baseUrl = resolveBaseUrl(request);
  const wsUrl = resolveWsUrl(baseUrl);

  const roleTokens = Object.fromEntries(
    ROLES.map((role) => {
      const roleToken = createRoleToken(roomId, role);
      return [role, roleToken];
    })
  ) as Record<Role, string>;

  const buildUrl = (role: Role, extraParams: Record<string, string | undefined> = {}) => {
    const url = new URL(`${baseUrl}/${role}`);
    url.searchParams.set("roomId", roomId);
    url.searchParams.set("token", roleTokens[role]);
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  };

  const responsePayload = {
    roomId,
    webSocketUrl: wsUrl,
    endpoints: {
      fan: {
        url: buildUrl("fan"),
        token: roleTokens.fan
      },
      talent: {
        url: buildUrl("talent", { signToken: roleTokens.sign }),
        token: roleTokens.talent
      },
      sign: {
        url: buildUrl("sign"),
        token: roleTokens.sign
      }
    }
  };

  return NextResponse.json(responsePayload, { status: 201 });
}
