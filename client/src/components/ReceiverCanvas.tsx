import { useEffect, useRef } from 'react';
import phoneFrame from '../assets/phone-frame.svg';
import { Stroke } from '../lib/types';
import { renderStrokes, resizeCanvas } from '../lib/canvas';

interface ReceiverCanvasProps {
  strokes: Stroke[];
  backgroundColor?: string;
}

export function ReceiverCanvas({ strokes, backgroundColor = '#fef3c7' }: ReceiverCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const { width, height } = resizeCanvas(canvas);
      sizeRef.current = { width, height };
      ctxRef.current = canvas.getContext('2d');
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const draw = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, sizeRef.current.width, sizeRef.current.height);
    ctx.restore();
    renderStrokes(ctx, strokes, sizeRef.current);
  };

  useEffect(() => {
    draw();
  }, [strokes]);

  return (
    <div className="relative w-full">
      <div className="relative w-full mx-auto aspect-[3/2]">
        <img src={phoneFrame} alt="スマホ枠" className="absolute inset-0 w-full h-full pointer-events-none select-none" />
        <div className="absolute inset-[12%] rounded-3xl overflow-hidden shadow-inner">
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
