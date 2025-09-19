import { useCallback, useEffect, useRef } from 'react';
import { StrokeEvent } from '../lib/types';

interface QueuedEvent {
  event: StrokeEvent;
  receivedAt: number;
}

export function useStrokeBuffer(bufferMs: number, onConsume: (event: StrokeEvent) => void) {
  const queueRef = useRef<QueuedEvent[]>([]);

  const enqueue = useCallback((event: StrokeEvent) => {
    queueRef.current.push({ event, receivedAt: performance.now() });
  }, []);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const now = performance.now();
      const ready: QueuedEvent[] = [];
      const remaining: QueuedEvent[] = [];
      for (const item of queueRef.current) {
        if (now - item.receivedAt >= bufferMs) {
          ready.push(item);
        } else {
          remaining.push(item);
        }
      }
      queueRef.current = remaining;
      for (const item of ready) {
        onConsume(item.event);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [bufferMs, onConsume]);

  const clear = useCallback(() => {
    queueRef.current = [];
  }, []);

  return { enqueue, clear };
}
