import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientToServerMessage,
  Role,
  ServerToClientMessage
} from '../types/signaling';

type MessageHandler = (message: ServerToClientMessage) => void;

interface UseSignalingOptions {
  roomId: string;
  token: string;
  role: Role;
  onMessage: MessageHandler;
  reconnect?: boolean;
  enabled?: boolean;
}

interface SignalingState {
  status: 'connecting' | 'open' | 'closed' | 'error';
  error?: string;
}

const BACKOFF_STEPS = [1000, 2000, 4000, 8000];

function getWebSocketUrl(roomId: string, token: string, role: Role): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const base =
    process.env.NEXT_PUBLIC_WS_URL ??
    window.location.origin.replace('http', 'ws');

  const url = new URL(base.endsWith('/ws') ? base : `${base.replace(/\/$/, '')}/ws`);
  url.searchParams.set('roomId', roomId);
  url.searchParams.set('token', token);
  url.searchParams.set('role', role);

  return url.toString();
}

export function useSignaling({
  roomId,
  token,
  role,
  onMessage,
  reconnect = true,
  enabled = true
}: UseSignalingOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<SignalingState>({ status: 'connecting' });
  const backoffIndexRef = useRef(0);
  const shouldReconnectRef = useRef(reconnect);
  const pendingQueueRef = useRef<ClientToServerMessage[]>([]);

  const log = useCallback((...parts: unknown[]) => {
    if (process.env.NODE_ENV !== 'production' || typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.info('[signaling]', role, ...parts);
    }
  }, [role]);

  useEffect(() => {
    shouldReconnectRef.current = reconnect;
  }, [reconnect]);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'closed' });
      return;
    }

    if (!roomId || !token) {
      setState({ status: 'error', error: 'roomId and token are required' });
      return;
    }

    let isUnmounted = false;

    const connect = () => {
      if (isUnmounted) return;

      const wsUrl = getWebSocketUrl(roomId, token, role);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setState({ status: 'connecting' });
      log('connecting', wsUrl);

      ws.onopen = () => {
        backoffIndexRef.current = 0;
        setState({ status: 'open' });
        log('open');
        const joinMessage: ClientToServerMessage = {
          kind: 'join',
          roomId,
          role,
          token
        };
        ws.send(JSON.stringify(joinMessage));
        if (pendingQueueRef.current.length > 0) {
          pendingQueueRef.current.forEach((message) => {
            try {
              ws.send(JSON.stringify(message));
            } catch (error) {
              console.warn('[signaling] flush failed', error);
            }
          });
          pendingQueueRef.current = [];
        }
      };

      ws.onmessage = (event) => {
        try {
          const parsed: ServerToClientMessage = JSON.parse(event.data);
          log('recv', parsed.kind);
          onMessage(parsed);
        } catch (error) {
          console.error('[signaling] parse failed', error);
        }
      };

      ws.onerror = (event) => {
        log('error', event);
        setState({ status: 'error', error: 'WebSocket error' });
      };

      ws.onclose = () => {
        log('closed');
        wsRef.current = null;
        setState({ status: 'closed' });

        if (!isUnmounted && shouldReconnectRef.current) {
          const timeout =
            BACKOFF_STEPS[Math.min(backoffIndexRef.current, BACKOFF_STEPS.length - 1)];
          backoffIndexRef.current += 1;
          setTimeout(connect, timeout);
        }
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      shouldReconnectRef.current = false;
      wsRef.current?.close();
    };
  }, [roomId, token, role, onMessage, enabled, log]);

  const send = (message: ClientToServerMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[signaling] queue', message.kind);
      pendingQueueRef.current = [...pendingQueueRef.current, message];
      return;
    }
    log('send', message.kind);
    wsRef.current.send(JSON.stringify(message));
  };

  return { send, status: state.status, error: state.error };
}
