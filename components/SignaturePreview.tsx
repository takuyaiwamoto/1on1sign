import { useEffect, useRef } from "react";

import { SignatureRenderer } from "@/lib/signature";
import type { SignatureBackground, SignatureStroke } from "@/types/signature";
import { DEFAULT_SIGNATURE_BACKGROUND } from "@/types/signature";

type SignaturePreviewProps = {
  strokes: SignatureStroke[];
  imageBase64?: string;
  width?: number;
  height?: number;
  title?: string;
  background?: SignatureBackground | null;
};

export function SignaturePreview({
  strokes,
  imageBase64,
  width = 1440,
  height = 2560,
  title,
  background
}: SignaturePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SignatureRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    rendererRef.current = new SignatureRenderer(canvas);
    return () => {
      rendererRef.current = null;
    };
  }, [width, height]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    let cancelled = false;
    const apply = async () => {
      await renderer.setBackground(background ?? DEFAULT_SIGNATURE_BACKGROUND);
      if (cancelled) return;
      if (imageBase64) {
        renderer.drawImageBase64(imageBase64);
      } else {
        renderer.renderAll(strokes);
      }
    };
    void apply();
    return () => {
      cancelled = true;
    };
  }, [strokes, imageBase64, background]);

  const showTitle = Boolean(title);

  return (
    <div className={`flex w-full flex-col ${showTitle ? "gap-2" : "gap-0"}`}>
      {showTitle ? <div className="text-sm font-medium text-slate-600">{title}</div> : null}
      <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
        <div className="relative mx-auto h-full max-h-[400px] w-full max-w-[225px]">
          <canvas
            ref={canvasRef}
            className="h-full w-full object-contain"
            style={{ aspectRatio: `${width} / ${height}` }}
          />
        </div>
      </div>
    </div>
  );
}
