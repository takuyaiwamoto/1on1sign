export type Role = 'writer' | 'receiver';

export type StrokeTool = 'pen' | 'eraser';

export interface StrokePoint {
  x: number;
  y: number;
  p: number;
  t: number;
}

export interface Stroke {
  id: string;
  userId: string;
  tool: StrokeTool;
  color: string;
  width: number;
  points: StrokePoint[];
}

export type StrokeEventType = 'stroke:start' | 'stroke:move' | 'stroke:end' | 'undo' | 'redo' | 'clear';

export interface StrokeEvent {
  type: StrokeEventType;
  stroke: Stroke;
}

export interface Toast {
  id: string;
  message: string;
  tone?: 'info' | 'error' | 'success';
  ttl?: number;
}
