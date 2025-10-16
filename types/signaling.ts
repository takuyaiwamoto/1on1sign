import type { SignatureStreamMessage } from './signature';

export type Role = 'fan' | 'talent' | 'sign';
export type SessionDescriptionType = 'offer' | 'answer' | 'pranswer' | 'rollback';

export interface SessionDescription {
  type: SessionDescriptionType;
  sdp?: string;
}

export interface JoinMessage {
  kind: 'join';
  roomId: string;
  token: string;
  role: Role;
}

export interface LeaveMessage {
  kind: 'leave';
  roomId: string;
  role: Role;
}

export interface OfferMessage {
  kind: 'offer';
  roomId: string;
  description: SessionDescription;
  target: Role;
}

export interface AnswerMessage {
  kind: 'answer';
  roomId: string;
  description: SessionDescription;
  target: Role;
}

export interface IceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface IceCandidateMessage {
  kind: 'ice-candidate';
  roomId: string;
  candidate: IceCandidateInit;
  target: Role;
}

export interface SignatureEventMessage {
  kind: 'signature-event';
  roomId: string;
  event: SignatureStreamMessage;
}

export interface FinalSignUploadMessage {
  kind: 'final-sign';
  roomId: string;
  image: string;
}

export type ClientToServerMessage =
  | JoinMessage
  | LeaveMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | SignatureEventMessage
  | FinalSignUploadMessage;

export interface JoinedEvent {
  kind: 'joined';
  role: Role;
  peers: Role[];
}

export interface PeerJoinedEvent {
  kind: 'peer-joined';
  role: Role;
}

export interface PeerLeftEvent {
  kind: 'peer-left';
  role: Role;
}

export interface OfferEvent {
  kind: 'offer';
  source: Role;
  description: SessionDescription;
}

export interface AnswerEvent {
  kind: 'answer';
  source: Role;
  description: SessionDescription;
}

export interface IceCandidateEvent {
  kind: 'ice-candidate';
  source: Role;
  candidate: IceCandidateInit;
}

export interface SignatureEventBroadcast {
  kind: 'signature-event';
  source: Role;
  event: SignatureStreamMessage;
}

export interface FinalSignBroadcast {
  kind: 'final-sign';
  source: Role;
  image: string;
}

export interface ErrorEvent {
  kind: 'error';
  message: string;
  code?: string;
}

export type ServerToClientMessage =
  | JoinedEvent
  | PeerJoinedEvent
  | PeerLeftEvent
  | OfferEvent
  | AnswerEvent
  | IceCandidateEvent
  | SignatureEventBroadcast
  | FinalSignBroadcast
  | ErrorEvent;
