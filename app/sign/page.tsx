"use client";

import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SignToolbar } from "@/components/SignToolbar";
import { SignalingClient } from "@/lib/signaling";
import { SignatureRenderer } from "@/lib/signature";
import type { SignatureBackground, SignatureStroke } from "@/types/signature";
import { DEFAULT_SIGNATURE_BACKGROUND } from "@/types/signature";
import type { ServerToClientMessage } from "@/types/signaling";

type SignPageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

type BackgroundOption = {
  id: string;
  label: string;
  background: SignatureBackground;
  preview: string;
};

const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 2560;
const DEFAULT_COLOR = "#111827";
const DEFAULT_WIDTH = 6;

const getBackgroundKey = (background: SignatureBackground) => `${background.kind}:${background.value}`;

export default function SignPage({ searchParams }: SignPageProps) {
  const roomIdParam = searchParams?.roomId;
  const tokenParam = searchParams?.token;
  const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  const [color, setColor] = useState(DEFAULT_COLOR);
  const [penWidth, setPenWidth] = useState(DEFAULT_WIDTH);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [background, setBackground] = useState<SignatureBackground>(DEFAULT_SIGNATURE_BACKGROUND);
  const [backgroundOptions, setBackgroundOptions] = useState<BackgroundOption[]>([
    {
      id: getBackgroundKey(DEFAULT_SIGNATURE_BACKGROUND),
      label: "ホワイト",
      background: DEFAULT_SIGNATURE_BACKGROUND,
      preview: DEFAULT_SIGNATURE_BACKGROUND.value
    }
  ]);
  const [selectedBackgroundKey, setSelectedBackgroundKey] = useState(getBackgroundKey(DEFAULT_SIGNATURE_BACKGROUND));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SignatureRenderer | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const strokesRef = useRef<SignatureStroke[]>([]);
  const backgroundRef = useRef<SignatureBackground>(DEFAULT_SIGNATURE_BACKGROUND);

  const toolbarDisabled = useMemo(() => !isConnected, [isConnected]);

  const appendStroke = useCallback((stroke: SignatureStroke, broadcast: boolean) => {
    rendererRef.current?.draw(stroke);
    strokesRef.current = [...strokesRef.current, stroke].slice(-5000);
    if (broadcast) {
      signalingRef.current?.send({ type: "canvas-event", stroke });
    }
  }, []);

  const getCanvasPoint = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    return { x, y };
  }, []);

  const applyBackground = useCallback(
    async (nextBackground: SignatureBackground, options?: { broadcast?: boolean; addOption?: boolean }) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const key = getBackgroundKey(nextBackground);
      backgroundRef.current = nextBackground;
      setBackground(nextBackground);
      setSelectedBackgroundKey(key);

      if (options?.addOption) {
        setBackgroundOptions((prev) => {
          if (prev.some((option) => option.id === key)) return prev;
          return [
            ...prev,
            {
              id: key,
              label: nextBackground.kind === "color" ? "カラー" : nextBackground.value.split("/").pop() ?? "画像",
              background: nextBackground,
              preview: nextBackground.kind === "color" ? nextBackground.value : nextBackground.value
            }
          ];
        });
      }

      try {
        await renderer.setBackground(nextBackground);
        if (strokesRef.current.length > 0) {
          renderer.renderAll(strokesRef.current);
        }
      } catch (error) {
        console.error("[sign] failed to set background", error);
      }

      if (options?.broadcast) {
        signalingRef.current?.send({ type: "canvas-background", background: nextBackground });
      }
    },
    []
  );

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !isConnected) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    setIsDrawing(true);
    const { x, y } = getCanvasPoint(event);
    appendStroke({ type: "begin", x, y, color, width: penWidth }, true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const { x, y } = getCanvasPoint(event);
    appendStroke({ type: "draw", x, y, color, width: penWidth }, true);
  };

  const finishStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    const { x, y } = getCanvasPoint(event);
    appendStroke({ type: "end", x, y, color, width: penWidth }, true);
    canvas.releasePointerCapture(event.pointerId);
    pointerIdRef.current = null;
    setIsDrawing(false);
  };

  const commitSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    signalingRef.current?.send({
      type: "canvas-commit",
      imageBase64: dataUrl,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT
    });
  }, []);

  const clearCanvas = useCallback(() => {
    rendererRef.current?.reset();
    strokesRef.current = [];
    setIsDrawing(false);
    commitSignature();
  }, [commitSignature]);

  const handleMessage = useCallback(
    async (message: ServerToClientMessage) => {
      switch (message.type) {
        case "joined":
          setIsConnected(true);
          signalingRef.current?.send({ type: "canvas-request-state" });
          break;
        case "canvas-event":
          rendererRef.current?.draw(message.stroke);
          strokesRef.current = [...strokesRef.current, message.stroke].slice(-5000);
          break;
        case "canvas-commit":
          rendererRef.current?.drawImageBase64(message.imageBase64);
          strokesRef.current = [];
          break;
        case "canvas-background":
          await applyBackground(message.background ?? DEFAULT_SIGNATURE_BACKGROUND, { addOption: true });
          break;
        case "canvas-state":
          await applyBackground(message.background ?? DEFAULT_SIGNATURE_BACKGROUND, { addOption: true });
          if (message.imageBase64) {
            rendererRef.current?.drawImageBase64(message.imageBase64);
            strokesRef.current = [];
          } else {
            rendererRef.current?.renderAll(message.strokes);
            strokesRef.current = message.strokes;
          }
          break;
        default:
          break;
      }
    },
    [applyBackground]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    rendererRef.current = new SignatureRenderer(canvas);
    void rendererRef.current.setBackground(backgroundRef.current);
    return () => {
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const loadBackgrounds = async () => {
      try {
        const response = await fetch("/api/backgrounds");
        if (!response.ok) return;
        const data = (await response.json()) as {
          backgrounds?: Array<{ name: string; dataUrl: string }>;
        };
        if (!Array.isArray(data.backgrounds)) return;
        const backgroundList = data.backgrounds;
        setBackgroundOptions((prev) => {
          const existing = new Set(prev.map((option) => option.id));
          const additions: BackgroundOption[] = backgroundList
            .map((item) => {
              const bg: SignatureBackground = { kind: "image", value: item.dataUrl };
              return {
                id: getBackgroundKey(bg),
                label: item.name,
                background: bg,
                preview: item.dataUrl
              };
            })
            .filter((option) => !existing.has(option.id));
          if (additions.length === 0) {
            return prev;
          }
          return [...prev, ...additions];
        });
      } catch (error) {
        console.error("[sign] 背景リストの取得に失敗しました", error);
      }
    };
    loadBackgrounds();
  }, []);

  useEffect(() => {
    if (!roomId || !token) {
      return;
    }

    const signaling = new SignalingClient({
      roomId,
      role: "sign",
      token,
      autoReconnect: true
    });
    signalingRef.current = signaling;
    signaling.connect();

    const unsubscribeMessage = signaling.on("message", (message) => handleMessage(message));
    const unsubscribeError = signaling.on("error", (error) => {
      console.error("[sign] signaling error", error);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeError();
      signaling.close();
      signalingRef.current = null;
    };
  }, [handleMessage, roomId, token]);

  const handleBackgroundSelect = useCallback(
    (option: BackgroundOption) => {
      if (option.id === selectedBackgroundKey) return;
      void applyBackground(option.background, { broadcast: true });
    },
    [applyBackground, selectedBackgroundKey]
  );

  if (!roomId || !token) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-600">
          roomId と token をクエリパラメータに指定してください。
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-white pb-10">
      <header className="px-6 pt-6">
        <h1 className="text-xl font-semibold text-slate-800">サイン作成</h1>
      </header>
      <div className="flex flex-col gap-6 px-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex aspect-[9/16] w-full max-w-[420px] items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 shadow-inner">
            <canvas
              ref={canvasRef}
              className="h-full w-full select-none touch-none rounded-3xl bg-transparent"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
              onPointerLeave={finishStroke}
            />
          </div>
          <div className="flex w-full gap-3 overflow-x-auto pb-1">
            {backgroundOptions.map((option) => {
              const selected = option.id === selectedBackgroundKey;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleBackgroundSelect(option)}
                  className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl border ${
                    selected ? "border-indigo-500 ring-2 ring-indigo-300" : "border-slate-200"
                  } bg-white shadow transition hover:-translate-y-0.5`}
                  title={option.label}
                >
                  {option.background.kind === "color" ? (
                    <span className="block h-full w-full" style={{ backgroundColor: option.background.value }} />
                  ) : (
                    <img src={option.preview} alt={option.label} className="h-full w-full object-cover" />
                  )}
                </button>
              );
            })}
          </div>
          <SignToolbar
            color={color}
            width={penWidth}
            onColorChange={setColor}
            onWidthChange={setPenWidth}
            onClear={clearCanvas}
            onSubmit={commitSignature}
            disabled={toolbarDisabled}
          />
        </div>
      </div>
    </main>
  );
}
