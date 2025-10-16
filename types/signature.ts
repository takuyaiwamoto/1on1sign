export const CANVAS_WIDTH = 1440;
export const CANVAS_HEIGHT = 2560;

export type StrokeCommandType = 'begin' | 'draw' | 'end';

export interface StrokeCommand {
  kind: 'stroke';
  strokeId: string;
  type: StrokeCommandType;
  x: number;
  y: number;
  color: string;
  width: number;
}

export interface ClearCommand {
  kind: 'clear';
}

export type SignatureStreamMessage = StrokeCommand | ClearCommand;

export interface FinalSignatureMessage {
  kind: 'final-sign';
  image: string; // base64 data URL
}
