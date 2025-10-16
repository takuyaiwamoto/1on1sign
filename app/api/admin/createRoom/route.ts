import { NextResponse } from 'next/server';
import { createOrReplaceRoom } from '../../../../server/roomStore';

interface CreateRoomRequestBody {
  roomId?: string;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getOriginHost(request: Request): string | null {
  const hdrs = request.headers;
  const origin = hdrs.get('origin');
  if (origin) return origin;
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  const protocol = hdrs.get('x-forwarded-proto') ?? 'https';
  if (host) {
    return `${protocol}://${host}`;
  }
  return process.env.NEXT_PUBLIC_BASE_URL ?? null;
}

export async function POST(request: Request) {
  if (!process.env.ROOM_SECRET) {
    return NextResponse.json(
      { error: 'ROOM_SECRET is not configured on the server' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const [, token] = authHeader.split(' ');

  if (token !== process.env.ROOM_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateRoomRequestBody;
  const record = createOrReplaceRoom(body.roomId);
  const originHost = getOriginHost(request);

  if (!originHost) {
    return NextResponse.json(
      { error: 'Unable to resolve deployment origin. Set NEXT_PUBLIC_BASE_URL.' },
      { status: 500 }
    );
  }

  const roomQuery = `room=${encodeURIComponent(record.roomId)}`;
  const fanUrl = `${originHost}/fan?${roomQuery}&token=${encodeURIComponent(record.tokens.fan)}`;
  const talentUrl = `${originHost}/talent?${roomQuery}&token=${encodeURIComponent(
    record.tokens.talent
  )}&signToken=${encodeURIComponent(record.tokens.sign)}`;
  const signUrl = `${originHost}/sign?${roomQuery}&token=${encodeURIComponent(record.tokens.sign)}`;

  return NextResponse.json({
    roomId: record.roomId,
    fanUrl,
    talentUrl,
    signUrl
  });
}
