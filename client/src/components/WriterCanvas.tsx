import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { PointerEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Stroke, StrokeEvent, StrokeTool } from '../lib/types';
import { resizeCanvas, renderStrokes } from '../lib/canvas';
import { StrokeStore } from '../store/strokeStore';

export interface WriterCanvasHandle {
  undo: () => StrokeEvent | null;
  redo: () => StrokeEvent | null;
  clear: () => StrokeEvent | null;
}

interface WriterCanvasProps {
  tool: StrokeTool;
  color: string;
  lineWidth: number;
  disabled?: boolean;
  onStrokeEvent: (event: StrokeEvent) => void;
}

export const WriterCanvas = forwardRef<WriterCanvasHandle, WriterCanvasProps>(
  ({ tool, color, lineWidth, disabled, onStrokeEvent }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const sizeRef = useRef({ width: 0, height: 0 });
    const storeRef = useRef(new StrokeStore());
    const strokeRef = useRef<Stroke | null>(null);

    const redraw = useCallback(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      renderStrokes(ctx, storeRef.current.snapshot.strokes, sizeRef.current);
    }, []);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const resize = () => {
        const { width, height } = resizeCanvas(canvas);
        sizeRef.current = { width, height };
        ctxRef.current = canvas.getContext('2d');
        redraw();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [redraw]);

    const emit = useCallback(
      (event: StrokeEvent) => {
        storeRef.current.apply(event);
        onStrokeEvent(event);
        redraw();
      },
      [onStrokeEvent, redraw]
    );

    const pointerDown = useCallback(
      (event: PointerEvent<HTMLCanvasElement>) => {
        if (disabled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.setPointerCapture(event.pointerId);
        const rect = canvas.getBoundingClientRect();
        const point = normalizePoint(event, rect);
        const stroke: Stroke = {
          id: uuidv4(),
          userId: 'writer',
          tool,
          color,
          width: lineWidth,
          points: [point]
        };
        strokeRef.current = stroke;
        emit({ type: 'stroke:start', stroke });
      },
      [color, disabled, emit, lineWidth, tool]
    );

    const pointerMove = useCallback(
      (event: PointerEvent<HTMLCanvasElement>) => {
        if (disabled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (!strokeRef.current) return;
        const rect = canvas.getBoundingClientRect();
        const point = normalizePoint(event, rect);
        strokeRef.current = {
          ...strokeRef.current,
          points: [...strokeRef.current.points, point]
        };
        emit({ type: 'stroke:move', stroke: strokeRef.current });
      },
      [disabled, emit]
    );

    const pointerUp = useCallback(
      (event: PointerEvent<HTMLCanvasElement>) => {
        if (!strokeRef.current) return;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.releasePointerCapture(event.pointerId);
        }
        emit({ type: 'stroke:end', stroke: strokeRef.current });
        strokeRef.current = null;
      },
      [emit]
    );

    const undo = useCallback(() => {
      const snapshot = storeRef.current.snapshot;
      const last = snapshot.strokes[snapshot.strokes.length - 1];
      if (!last) return null;
      const event: StrokeEvent = { type: 'undo', stroke: last };
      storeRef.current.apply(event);
      redraw();
      return event;
    }, [redraw]);

    const redo = useCallback(() => {
      const snapshot = storeRef.current.snapshot;
      const last = snapshot.undone[snapshot.undone.length - 1];
      if (!last) return null;
      const event: StrokeEvent = { type: 'redo', stroke: last };
      storeRef.current.apply(event);
      redraw();
      return event;
    }, [redraw]);

    const clear = useCallback(() => {
      if (storeRef.current.snapshot.strokes.length === 0) return null;
      const event: StrokeEvent = {
        type: 'clear',
        stroke: {
          id: uuidv4(),
          userId: 'writer',
          tool: 'pen',
          color: '#000000',
          width: 1,
          points: []
        }
      };
      storeRef.current.apply(event);
      redraw();
      return event;
    }, [redraw]);

    useImperativeHandle(ref, () => ({ undo, redo, clear }), [undo, redo, clear]);

    return (
      <canvas
        ref={canvasRef}
        className="w-full h-full bg-white rounded-xl touch-none select-none"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerLeave={() => {
          if (strokeRef.current) {
            emit({ type: 'stroke:end', stroke: strokeRef.current });
            strokeRef.current = null;
          }
        }}
      />
    );
  }
);

WriterCanvas.displayName = 'WriterCanvas';

function normalizePoint(event: PointerEvent<HTMLCanvasElement>, rect: DOMRect) {
  const pressure = event.pressure || 0.5;
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    p: pressure,
    t: Date.now()
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
