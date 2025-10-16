import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { SignatureRenderer } from '../lib/signature';

interface SignaturePreviewProps {
  className?: string;
  finalImage?: string | null;
  onRendererReady?: (renderer: SignatureRenderer | null, canvas: HTMLCanvasElement | null) => void;
}

export function SignaturePreview({
  className,
  finalImage,
  onRendererReady
}: SignaturePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SignatureRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new SignatureRenderer(canvas);
    rendererRef.current = renderer;
    onRendererReady?.(renderer, canvas);

    return () => {
      rendererRef.current?.unmount();
      rendererRef.current = null;
      onRendererReady?.(null, canvas);
    };
  }, [onRendererReady]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !finalImage) {
      return;
    }

    renderer.drawImage(finalImage).catch((error) => {
      console.error('Failed to draw final signature image', error);
    });
  }, [finalImage]);

  return (
    <div
      className={clsx(
        'relative aspect-[9/16] w-full max-w-xs overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm',
        className
      )}
    >
      <canvas ref={canvasRef} className="h-full w-full touch-none" />
    </div>
  );
}
