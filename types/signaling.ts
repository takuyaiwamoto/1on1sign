import type { SignatureBackground, SignatureStroke } from "./signature";

export type FanStatus = "waiting" | "active" | "completed";

export type IceCandidate = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type Role = "fan" | "talent" | "sign";

export type PeerNotificationKind = "joined" | "left";

export type ClientToServerMessage =
  | {
      type: "join";
      roomId: string;
      role: Role;
      token: string;
    }
  | {
      type: "leave";
    }
  | {
      type: "offer";
      sdp: string;
    }
  | {
      type: "answer";
      sdp: string;
    }
  | {
      type: "ice";
      candidate: IceCandidate;
    }
  | {
      type: "canvas-event";
      stroke: SignatureStroke;
    }
  | {
      type: "canvas-commit";
      imageBase64: string;
      width: number;
      height: number;
    }
  | {
      type: "canvas-background";
      background: SignatureBackground | null;
    }
  | {
      type: "canvas-request-state";
    }
  | {
      type: "queue-next";
    }
  | {
      type: "pong";
    };

export type ServerToClientMessage =
  | {
      type: "joined";
      roomId: string;
      role: Role;
      peers: Role[];
    }
  | {
      type: "peer-update";
      role: Role;
      event: PeerNotificationKind;
    }
  | {
      type: "offer";
      sdp: string;
      from: Role;
    }
  | {
      type: "answer";
      sdp: string;
      from: Role;
    }
  | {
      type: "ice";
      candidate: IceCandidate;
      from: Role;
    }
  | {
      type: "canvas-event";
      stroke: SignatureStroke;
      from: Role;
    }
  | {
      type: "canvas-commit";
      imageBase64: string;
      width: number;
      height: number;
      from: Role;
      createdAt: number;
    }
  | {
      type: "canvas-background";
      background: SignatureBackground | null;
      from: Role;
    }
  | {
      type: "fan-status";
      status: FanStatus;
      ahead: number;
      queueLength: number;
    }
  | {
      type: "queue-info";
      waitingCount: number;
      hasActiveFan: boolean;
    }
  | {
      type: "canvas-reset";
      background: SignatureBackground;
    }
  | {
      type: "canvas-state";
      strokes: SignatureStroke[];
      imageBase64?: string;
      width: number;
      height: number;
      background?: SignatureBackground | null;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "ping";
    };

export type RoomPeer = {
  role: Role;
  token: string;
};
