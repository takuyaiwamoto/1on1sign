import type { ClientToServerMessage, Role, ServerToClientMessage } from "@/types/signaling";

type SignalingStatus = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

type EventMap = {
  open: void;
  close: { code: number; reason: string };
  error: Error;
  message: ServerToClientMessage;
  status: SignalingStatus;
  reconnect: { attempt: number };
};

type Listener<T> = (payload: T) => void;

export type SignalingOptions = {
  roomId: string;
  role: Role;
  token: string;
  wsUrl?: string;
  autoReconnect?: boolean;
};

function resolveWebSocketUrl(preferred?: string) {
  if (preferred) {
    return preferred.replace(/^http/, "ws");
  }
  const location = window.location;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

type ListenerSet<K extends keyof EventMap> = Set<Listener<EventMap[K]>>;

export class SignalingClient {
  private ws?: WebSocket;
  private readonly queue: ClientToServerMessage[] = [];
  private readonly events = new Map<keyof EventMap, Set<Listener<unknown>>>();
  private reconnectAttempts = 0;
  private status: SignalingStatus = "idle";
  private shouldReconnect: boolean;
  private closedManually = false;

  constructor(private readonly options: SignalingOptions) {
    if (!options.roomId || !options.token) {
      throw new Error("roomId と token が必要です");
    }
    this.shouldReconnect = options.autoReconnect ?? true;
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>) {
    const listeners = (this.events.get(event) as ListenerSet<K> | undefined) ?? new Set<Listener<EventMap[K]>>();
    listeners.add(listener);
    this.events.set(event, listeners as Set<Listener<unknown>>);
    return () => this.off(event, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>) {
    const listeners = this.events.get(event) as ListenerSet<K> | undefined;
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.events.delete(event);
    }
  }

  getStatus() {
    return this.status;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closedManually = false;
    this.updateStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");
    const url = resolveWebSocketUrl(this.options.wsUrl ?? process.env.NEXT_PUBLIC_WS_URL);
    this.ws = new WebSocket(url);
    this.setupSocket();
  }

  close() {
    this.closedManually = true;
    this.shouldReconnect = false;
    this.updateStatus("closed");
    this.ws?.close();
  }

  send(message: ClientToServerMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queue.push(message);
      return false;
    }
    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.queue.push(message);
      return false;
    }
  }

  private setupSocket() {
    if (!this.ws) return;
    this.ws.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      this.updateStatus("connected");
      this.emit("open", undefined);
      this.sendImmediately({
        type: "join",
        roomId: this.options.roomId,
        role: this.options.role,
        token: this.options.token
      });
      while (this.queue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
        const item = this.queue.shift();
        if (item) {
          this.sendImmediately(item);
        }
      }
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data) as ServerToClientMessage;
        if (payload.type === "ping") {
          this.send({ type: "pong" });
          return;
        }
        this.emit("message", payload);
      } catch (error) {
        this.emit("error", error instanceof Error ? error : new Error("Failed to parse message"));
      }
    });

    this.ws.addEventListener("close", (event) => {
      this.emit("close", { code: event.code, reason: event.reason });
      if (this.closedManually || !this.shouldReconnect) {
        this.updateStatus("closed");
        return;
      }
      this.reconnectAttempts += 1;
      this.updateStatus("reconnecting");
      this.emit("reconnect", { attempt: this.reconnectAttempts });
      const timeout = Math.min(10_000, Math.pow(2, this.reconnectAttempts) * 500);
      window.setTimeout(() => this.connect(), timeout);
    });

    this.ws.addEventListener("error", () => {
      this.emit("error", new Error("WebSocket エラーが発生しました"));
    });
  }

  private sendImmediately(message: ClientToServerMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queue.push(message);
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
    const listeners = this.events.get(event) as ListenerSet<K> | undefined;
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        console.error("signaling listener error", error);
      }
    }
  }

  private updateStatus(status: SignalingStatus) {
    this.status = status;
    this.emit("status", status);
  }
}
