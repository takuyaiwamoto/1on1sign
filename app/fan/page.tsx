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
const DRAW_WIDTH = 32;

type FanStatus = "waiting" | "active" | "completed";

type FanPageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

export default function FanPage({ searchParams }: FanPageProps) {
  const roomIdParam = searchParams?.roomId;
  const tokenParam = searchParams?.token;
  const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  const [fanStatus, setFanStatus] = useState<FanStatus>("waiting");
  const [waitingAhead, setWaitingAhead] = useState(0);
  const [queueLength, setQueueLength] = useState(0);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const signalingRef = useRef<SignalingClient | null>(null);
  const webRtcRef = useRef<WebRtcClient | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SignatureRenderer | null>(null);
  const strokesRef = useRef<SignatureStroke[]>([]);
  const pointerIdRef = useRef<number | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const waitingCount = Math.max(queueLength - 1, 0);

  const createOffer = useCallback(async () => {
    const webRtc = webRtcRef.current;
    const signaling = signalingRef.current;
    if (!webRtc || !signaling) return;
    try {
      const offer = await webRtc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      if (offer.sdp) {
        signaling.send({ type: "offer", sdp: offer.sdp });
      }
    } catch (error) {
      console.error("Failed to create offer", error);
    }
  }, []);

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

  const stopStreaming = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setIsStreaming(false);
  }, []);

  const handleAnswer = useCallback(async (sdp: string) => {
    try {
      await webRtcRef.current?.applyRemoteDescription({ type: "answer", sdp });
    } catch (error) {
      console.error("Failed to apply answer", error);
    }
  }, []);

  const handleOffer = useCallback(async (sdp: string) => {
    try {
      await webRtcRef.current?.applyRemoteDescription({ type: "offer", sdp });
      const answer = await webRtcRef.current?.createAnswer();
      if (answer?.sdp) {
        signalingRef.current?.send({ type: "answer", sdp: answer.sdp });
      }
    } catch (error) {
      console.error("Failed to handle offer", error);
    }
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

  const appendStroke = useCallback(
    (stroke: SignatureStroke, broadcast: boolean) => {
      rendererRef.current?.draw(stroke);
      strokesRef.current = [...strokesRef.current, stroke].slice(-5000);
      if (broadcast) {
        signalingRef.current?.send({ type: "canvas-event", stroke });
      }
    },
    []
  );

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

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (fanStatus !== "active" || event.button !== 0) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    const { x, y } = getCanvasPoint(event);
    appendStroke({ type: "begin", x, y, color: DRAW_COLOR, width: DRAW_WIDTH }, true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (fanStatus !== "active" || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const { x, y } = getCanvasPoint(event);
    appendStroke({ type: "draw", x, y, color: DRAW_COLOR, width: DRAW_WIDTH }, true);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
    if (fanStatus !== "active" || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    const { x, y } = getCanvasPoint(event);
    appendStroke({ type: "end", x, y, color: DRAW_COLOR, width: DRAW_WIDTH }, true);
    canvas.releasePointerCapture(event.pointerId);
    pointerIdRef.current = null;
    scheduleCommit();
  };

  const resetCanvas = useCallback((background: SignatureBackground = DEFAULT_SIGNATURE_BACKGROUND) => {
    rendererRef.current?.setBackground(background).catch((error) => {
      console.error("Failed to set background", error);
    });
    rendererRef.current?.reset();
    strokesRef.current = [];
  }, []);

  const downloadPng = () => {
    if (fanStatus !== "active") return;
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

  const handleMessage = useCallback(
    async (message: ServerToClientMessage) => {
      switch (message.type) {
        case "joined":
          signalingRef.current?.send({ type: "canvas-request-state" });
          break;
        case "offer":
          await handleOffer(message.sdp);
          break;
        case "answer":
          await handleAnswer(message.sdp);
          break;
        case "ice":
          await webRtcRef.current?.addIceCandidate(message.candidate as IceCandidate);
          break;
        case "canvas-event":
          rendererRef.current?.draw(message.stroke);
          strokesRef.current = [...strokesRef.current, message.stroke].slice(-5000);
          break;
        case "canvas-commit":
          rendererRef.current?.drawImageBase64(message.imageBase64);
          strokesRef.current = [];
          break;
        case "canvas-state":
          await rendererRef.current?.setBackground(message.background ?? DEFAULT_SIGNATURE_BACKGROUND);
          if (message.imageBase64) {
            rendererRef.current?.drawImageBase64(message.imageBase64);
            strokesRef.current = [];
          } else {
            rendererRef.current?.renderAll(message.strokes);
            strokesRef.current = message.strokes;
          }
          break;
        case "canvas-background":
          await rendererRef.current?.setBackground(message.background ?? DEFAULT_SIGNATURE_BACKGROUND);
          break;
        case "canvas-reset":
          await rendererRef.current?.setBackground(message.background ?? DEFAULT_SIGNATURE_BACKGROUND);
          rendererRef.current?.reset();
          strokesRef.current = [];
          break;
        case "fan-status": {
          setQueueLength(message.queueLength);
          setWaitingAhead(message.ahead);
          if (message.status === "waiting") {
            setFanStatus("waiting");
            stopStreaming();
            setRemoteStream(null);
            resetCanvas(DEFAULT_SIGNATURE_BACKGROUND);
          } else if (message.status === "active") {
            setFanStatus("active");
            resetCanvas(DEFAULT_SIGNATURE_BACKGROUND);
          } else if (message.status === "completed") {
            setFanStatus("completed");
            stopStreaming();
            setRemoteStream(null);
            resetCanvas(DEFAULT_SIGNATURE_BACKGROUND);
          }
          break;
        }
        case "queue-info":
          // fan does not need global queue info beyond own status
          break;
        case "error":
          console.error("[fan] error", message.message);
          break;
        default:
          break;
      }
    },
    [handleAnswer, handleOffer, resetCanvas, stopStreaming]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    rendererRef.current = new SignatureRenderer(canvas);
    void rendererRef.current.setBackground(DEFAULT_SIGNATURE_BACKGROUND);
    return () => {
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!roomId || !token) {
      console.warn("roomId と token が必要です。");
      return;
    }

    const signaling = new SignalingClient({ roomId, role: "fan", token, autoReconnect: true });
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
    if (fanStatus === "active" && !isStreaming) {
      void startStreaming();
    }
    if (fanStatus === "completed") {
      stopStreaming();
    }
  }, [fanStatus, isStreaming, startStreaming, stopStreaming]);

  useEffect(() => {
    const client = new WebRtcClient({
      role: "fan",
      onIceCandidate: (candidate) => {
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
        if (state === "failed" || state === "disconnected") {
          setRemoteStream(null);
        }
      }
    });
    webRtcRef.current = client;
    return () => {
      client.close();
      webRtcRef.current = null;
    };
  }, [createOffer]);

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
      }
    };
  }, []);

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
          {fanStatus !== "active" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-6 text-center text-sm">
              {fanStatus === "waiting" ? (
                <>
                  <p className="text-base font-semibold">順番待ち中です</p>
                  <p className="mt-2 text-xs text-white/80">あと {waitingAhead} 人であなたの番です</p>
                </>
              ) : (
                <p className="text-base font-semibold">ありがとうございました！</p>
              )}
            </div>
          )}
          {fanStatus === "active" && (
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
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-white/30" />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 px-6 pb-10">
        <button
          type="button"
          onClick={startStreaming}
          disabled={fanStatus !== "active" || isStreaming}
          className="min-w-[120px] rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {fanStatus === "completed" ? "終了しました" : isStreaming ? "入室済み" : "入室する"}
        </button>
        <button
          type="button"
          onClick={downloadPng}
          disabled={fanStatus !== "active"}
          className="min-w-[120px] rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          PNGダウンロード
        </button>
      </div>
      {fanStatus === "waiting" && (
        <div className="pb-6 text-center text-xs text-white/70">
          残り {waitingCount} 人が待機中です
        </div>
      )}
    </main>
  );
}
