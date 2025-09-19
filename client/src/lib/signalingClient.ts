import { Role } from './types';

type Listener<T> = (payload: T) => void;

type MessageMap = {
  open: void;
  close: { code: number; reason: string };
  error: Event;
  joined: { clientId: string; roomId: string; role: Role; peers: Array<{ clientId: string; role: Role }> };
  'peer-joined': { clientId: string; role: Role };
  'peer-left': { clientId: string };
  signal: { clientId: string; data: unknown };
  message: unknown;
  raw: MessageEvent;
};

export interface SignalingOptions {
  url: string;
  roomId: string;
  role: Role;
  clientId: string;
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<keyof MessageMap, Set<Listener<any>>>();
  private closedByUser = false;

  constructor(private options: SignalingOptions) {}

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closedByUser = false;
    this.ws = new WebSocket(this.options.url);
    this.ws.addEventListener('open', () => {
      this.emit('open', undefined);
      this.send({ type: 'join', payload: { roomId: this.options.roomId, role: this.options.role, clientId: this.options.clientId } });
    });
    this.ws.addEventListener('message', (event) => {
      this.emit('raw', event);
      try {
        const data = JSON.parse(event.data as string);
        if (data?.type) {
          this.emit(data.type, data.payload);
        }
        this.emit('message', data);
      } catch (error) {
        console.error('Failed to parse signaling message', error);
      }
    });
    this.ws.addEventListener('close', (event) => {
      this.emit('close', { code: event.code, reason: event.reason });
      if (!this.closedByUser) {
        setTimeout(() => this.connect(), 1000);
      }
    });
    this.ws.addEventListener('error', (event) => {
      this.emit('error', event);
    });
  }

  on<K extends keyof MessageMap>(type: K, listener: Listener<MessageMap[K]>) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener as Listener<any>);
    return () => this.listeners.get(type)?.delete(listener as Listener<any>);
  }

  send(message: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendSignal(targetId: string | undefined, data: unknown) {
    this.send({
      type: 'signal',
      payload: {
        roomId: this.options.roomId,
        clientId: this.options.clientId,
        targetId,
        data
      }
    });
  }

  leave() {
    this.closedByUser = true;
    this.send({ type: 'leave', payload: { roomId: this.options.roomId, clientId: this.options.clientId } });
    this.ws?.close(1000, 'client-leave');
    this.ws = null;
  }

  private emit<K extends keyof MessageMap>(type: K, payload: MessageMap[K]) {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    listeners.forEach((listener) => listener(payload));
  }
}
