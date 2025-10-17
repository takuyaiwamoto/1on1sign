"use client";

import type { PointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { VideoPanel } from "@/components/VideoPanel";
import { SignalingClient } from "@/lib/signaling";
import { SignatureRenderer } from "@/lib/signature";
import { WebRtcClient } from "@/lib/webrtc";
import type { SignatureBackground, SignatureStroke } from "@/types/signature";
import { DEFAULT_SIGNATURE_BACKGROUND } from "@/types/signature";
import type { IceCandidate, ServerToClientMessage } from "@/types/signaling";

type FanPageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true },
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    facingMode: "user"
  }
};

const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 2560;
const DRAW_COLOR = "#111827";
const DRAW_WIDTH = 20;

export default function FanPage({ searchParams }: FanPageProps) {
  const roomIdParam = searchParams?.roomId;
  const tokenParam = searchParams?.token;
  const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const signalingRef = useRef<SignalingClient | null>(null);
  const webRtcRef = useRef<WebRtcClient | null>(null);
  const negotiationInProgress = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SignatureRenderer | null>(null);
  const strokesRef = useRef<SignatureStroke[]>([]);
  const pointerIdRef = useRef<number | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundRef = useRef<SignatureBackground>(DEFAULT_SIGNATURE_BACKGROUND);

  const createOffer = useCallback(async () => {
    if (negotiationInProgress.current) return;
    const webRtc = webRtcRef.current;
    const signaling = signalingRef.current;
    if (!webRtc || !signaling) return;
    negotiationInProgress.current = true;
    try {
      const offer = await webRtc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      if (offer.sdp) {
        signaling.send({ type: "offer", sdp: offer.sdp });
      }
    } catch (error) {
      console.error("Failed to create offer (fan)", error);
    } finally {
      negotiationInProgress.current = false;
    }
  }, []);

  const applyBackground = useCallback(
    async (background: SignatureBackground | null) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const next = background ?? DEFAULT_SIGNATURE_BACKGROUND;
      backgroundRef.current = next;
      try {
        await renderer.setBackground(next);
        if (strokesRef.current.length > 0) {
          renderer.renderAll(strokesRef.current);
        }
      } catch (error) {
        console.error("[fan] failed to apply background", error);
      }
    },
    []
  );

  const handleAnswer = useCallback(async (sdp: string) => {
    try {
      const webRtc = webRtcRef.current;
      if (!webRtc) return;
      await webRtc.applyRemoteDescription({ type: "answer", sdp });
    } catch (error) {
      console.error("Failed to apply answer (fan)", error);
    }
  }, []);

  const handleOffer = useCallback(async (sdp: string) => {
    try {
      const webRtc = webRtcRef.current;
      if (!webRtc) return;
      await webRtc.applyRemoteDescription({ type: "offer", sdp });
      const answer = await webRtc.createAnswer();
      if (answer.sdp) {
        signalingRef.current?.send({
          type: "answer",
          sdp: answer.sdp
        });
      }
    } catch (error) {
      console.error("Failed to handle offer", error);
    }
  }, []);

  const handleMessage = useCallback(
    async (message: ServerToClientMessage) => {
      switch (message.type) {
        case "joined":
          signalingRef.current?.send({ type: "canvas-request-state" });
          break;
        case "peer-update":
          if (message.event === "joined" && message.role === "talent" && isStreaming) {
            void createOffer();
          }
          break;
        case "offer":
          await handleOffer(message.sdp);
          break;
        case "answer":
          await handleAnswer(message.sdp);
          break;
        case "ice":
          await webRtcRef.current?.addIceCandidate(message.candidate);
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
          await applyBackground(message.background ?? DEFAULT_SIGNATURE_BACKGROUND);
          break;
        case "canvas-state":
          await applyBackground(message.background ?? DEFAULT_SIGNATURE_BACKGROUND);
          if (message.imageBase64) {
            rendererRef.current?.drawImageBase64(message.imageBase64);
            strokesRef.current = [];
          } else {
            rendererRef.current?.renderAll(message.strokes);
            strokesRef.current = message.strokes;
          }
          break;
        case "error":
          console.error("[fan] signaling error", message.message);
          break;
        default:
          break;
      }
    },
    [applyBackground, createOffer, handleAnswer, handleOffer, isStreaming]
  );

  useEffect(() => {
    if (!roomId || !token) {
      console.warn("roomId と token が必要です。");
      return;
    }

    const signaling = new SignalingClient({
      roomId,
      role: "fan",
      token,
      autoReconnect: true
    });
    signalingRef.current = signaling;
    signaling.connect();

    const unsubscribeStatus = signaling.on("status", (status) => {
      console.info("[fan] signaling status", status);
    });
    const unsubscribeMessage = signaling.on("message", (message) => handleMessage(message));
    const unsubscribeError = signaling.on("error", (error) => {
      console.error("[fan] signaling client error", error);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      unsubscribeError();
      signaling.close();
      signalingRef.current = null;
    };
  }, [handleMessage, roomId, token]);

  useEffect(() => {
    const client = new WebRtcClient({
      role: "fan",
      onIceCandidate: (candidate: IceCandidate) => {
        signalingRef.current?.send({ type: "ice", candidate });
      },
      onNegotiationNeeded: () => {
        void createOffer();
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
      },
      onConnectionStateChange: (state) => {
        console.info("[fan] peer connection state", state);
      }
    });
    webRtcRef.current = client;
    return () => {
      client.close();
      webRtcRef.current = null;
    };
  }, [createOffer]);

  const startStreaming = useCallback(async () => {
    if (isStreaming) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
      localStreamRef.current = stream;
      setIsStreaming(true);
      await webRtcRef.current?.setLocalStream(stream);
      void createOffer();
    } catch (error) {
      console.error("Failed to start local media", error);
      alert("カメラ・マイクの取得に失敗しました。ブラウザ設定を確認してください。");
    }
  }, [createOffer, isStreaming]);

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
      }
    };
  }, []);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const buffer = document.createElement("canvas");
    buffer.width = CANVAS_WIDTH;
    buffer.height = CANVAS_HEIGHT;
    const ctx = buffer.getContext("2d");
    const src = canvas.getContext("2d");
    if (!ctx || !src) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, buffer.width, buffer.height);
    ctx.drawImage(canvas, 0, 0);
    const dataUrl = buffer.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `signature-${roomId ?? "room"}-${Date.now()}.png`;
    link.click();
  };

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

  const scheduleCommit = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      signalingRef.current?.send({
        type: "canvas-commit",
        imageBase64: canvas.toDataURL("image/png"),
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT
      });
      commitTimerRef.current = null;
    }, 500);
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    const { x, y } = getCanvasPoint(event);
    appendStroke({ type: "begin", x, y, color: DRAW_COLOR, width: DRAW_WIDTH }, true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const { x, y } = getCanvasPoint(event);
    appendStroke({ type: "draw", x, y, color: DRAW_COLOR, width: DRAW_WIDTH }, true);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    const { x, y } = getCanvasPoint(event);
    appendStroke({ type: "end", x, y, color: DRAW_COLOR, width: DRAW_WIDTH }, true);
    canvas.releasePointerCapture(event.pointerId);
    pointerIdRef.current = null;
    scheduleCommit();
  };

  if (!roomId || !token) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
        <div className="rounded-xl border border-white/20 bg-white/5 px-6 py-4 text-center text-sm">
          roomId と token をクエリパラメータに指定してください。
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <div className="flex-1 px-0 pb-3">
        <div className="relative h-[calc(100vh-120px)] w-full overflow-hidden bg-black">
          <VideoPanel
            stream={remoteStream}
            muted={false}
            className="absolute inset-0 h-full w-full rounded-none border-0 bg-black shadow-none"
          />
          <div className="absolute bottom-2 right-2 w-[120%] max-w-[480px] translate-y-8 drop-shadow-2xl">
            <div className="relative h-full w-full" style={{ aspectRatio: "9 / 16" }}>
              <canvas
                ref={canvasRef}
                className="relative z-10 h-full w-full rounded-2xl border border-white bg-white/90"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onPointerLeave={handlePointerEnd}
              />
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-white/40" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 px-6 pb-10">
        <button
          type="button"
          onClick={startStreaming}
          disabled={isStreaming}
          className="min-w-[110px] rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isStreaming ? "入室済み" : "入室する"}
        </button>
        <button
          type="button"
          onClick={downloadPng}
          className="min-w-[110px] rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-white/20"
        >
          PNGダウンロード
        </button>
      </div>
    </main>
  );
}
