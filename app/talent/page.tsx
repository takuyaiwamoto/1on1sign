"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ControlsBar } from "@/components/ControlsBar";
import { SignaturePreview } from "@/components/SignaturePreview";
import { VideoPanel } from "@/components/VideoPanel";
import { SignalingClient } from "@/lib/signaling";
import { WebRtcClient } from "@/lib/webrtc";
import type { SignatureBackground, SignatureStroke } from "@/types/signature";
import { DEFAULT_SIGNATURE_BACKGROUND } from "@/types/signature";
import type { IceCandidate, Role, ServerToClientMessage } from "@/types/signaling";

type TalentPageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

type CanvasState = {
  strokes: SignatureStroke[];
  imageBase64?: string;
  width: number;
  height: number;
  background: SignatureBackground;
};

const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true },
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: "user"
  }
};

export default function TalentPage({ searchParams }: TalentPageProps) {
  const roomIdParam = searchParams?.roomId;
  const tokenParam = searchParams?.token;
  const signTokenParam = searchParams?.signToken;
  const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const signToken = Array.isArray(signTokenParam) ? signTokenParam[0] : signTokenParam;

  const [signalingStatus, setSignalingStatus] = useState("未接続");
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [errors, setErrors] = useState<string[]>([]);
  const [canvasState, setCanvasState] = useState<CanvasState>({
    strokes: [],
    width: 1440,
    height: 2560,
    background: DEFAULT_SIGNATURE_BACKGROUND
  });
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [peers, setPeers] = useState<Role[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);
  const [hasActiveFan, setHasActiveFan] = useState(false);

  const signalingRef = useRef<SignalingClient | null>(null);
  const webRtcRef = useRef<WebRtcClient | null>(null);
  const negotiationInProgress = useRef(false);

  const openSignUrl = useMemo(() => {
    if (!roomId || !signToken) return "";
    return `/sign?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(signToken)}`;
  }, [roomId, signToken]);

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
      console.error("Failed to create offer", error);
      setErrors((prev) => [...prev, "Offer の生成に失敗しました。"]);
    } finally {
      negotiationInProgress.current = false;
    }
  }, []);

  const handleRemoteOffer = useCallback(async (sdp: string) => {
    const webRtc = webRtcRef.current;
    const signaling = signalingRef.current;
    if (!webRtc || !signaling) return;
    try {
      await webRtc.applyRemoteDescription({ type: "offer", sdp });
      const answer = await webRtc.createAnswer();
      if (answer.sdp) {
        signaling.send({ type: "answer", sdp: answer.sdp });
      }
    } catch (error) {
      console.error("Failed to answer offer", error);
      setErrors((prev) => [...prev, "リモートOffer処理に失敗しました。"]);
    }
  }, []);

  const handleRemoteAnswer = useCallback(async (sdp: string) => {
    const webRtc = webRtcRef.current;
    if (!webRtc) return;
    try {
      await webRtc.applyRemoteDescription({ type: "answer", sdp });
    } catch (error) {
      console.error("Failed to apply answer", error);
      setErrors((prev) => [...prev, "Answer の適用に失敗しました。"]);
    }
  }, []);

  const handleMessage = useCallback(
    async (message: ServerToClientMessage) => {
      switch (message.type) {
        case "joined":
          setPeers(message.peers);
          signalingRef.current?.send({ type: "canvas-request-state" });
          break;
        case "peer-update":
          setPeers((prev) => {
            if (message.event === "joined") {
              const next = new Set(prev);
              next.add(message.role);
              if (message.role === "fan" && isStreaming) {
                // Attempt offer when fan joins.
                createOffer().catch((error) => {
                  console.error("offer failed", error);
                });
              }
              return Array.from(next);
            }
            return prev.filter((role) => role !== message.role);
          });
          break;
        case "offer":
          await handleRemoteOffer(message.sdp);
          break;
        case "answer":
          await handleRemoteAnswer(message.sdp);
          break;
        case "ice":
          await webRtcRef.current?.addIceCandidate(message.candidate);
          break;
        case "canvas-event":
          setCanvasState((prev) => ({
            ...prev,
            strokes: [...prev.strokes, message.stroke].slice(-5000),
            imageBase64: undefined
          }));
          break;
        case "canvas-commit":
          setCanvasState((prev) => ({
            ...prev,
            imageBase64: message.imageBase64,
            strokes: [],
            width: message.width,
            height: message.height
          }));
          break;
        case "canvas-background":
          setCanvasState((prev) => ({
            ...prev,
            background: message.background ?? DEFAULT_SIGNATURE_BACKGROUND
          }));
          break;
        case "canvas-state":
          setCanvasState({
            strokes: message.strokes,
            imageBase64: message.imageBase64,
            width: message.width,
            height: message.height,
            background: message.background ?? DEFAULT_SIGNATURE_BACKGROUND
          });
          break;
        case "queue-info":
          setWaitingCount(message.waitingCount);
          setHasActiveFan(message.hasActiveFan);
          break;
        case "error":
          setErrors((prev) => [...prev, message.message]);
          break;
        default:
          break;
      }
    },
    [createOffer, handleRemoteAnswer, handleRemoteOffer, isStreaming]
  );

  const startStreaming = useCallback(async () => {
    if (isStreaming) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
      setLocalStream(stream);
      setIsStreaming(true);
      setIsMuted(false);
      setIsCameraOn(true);
      await webRtcRef.current?.setLocalStream(stream);
      await createOffer();
    } catch (error) {
      console.error("Failed to get media stream", error);
      setErrors((prev) => [...prev, "カメラ・マイクの取得に失敗しました。ブラウザ設定を確認してください。"]);
    }
  }, [createOffer, isStreaming]);

  const handleQueueNext = useCallback(() => {
    signalingRef.current?.send({ type: "queue-next" });
  }, []);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const nextMuted = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }, [isMuted, localStream]);

  const toggleCamera = useCallback(() => {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) return;
    const nextCameraOn = !isCameraOn;
    videoTracks.forEach((track) => {
      track.enabled = nextCameraOn;
    });
    setIsCameraOn(nextCameraOn);
  }, [isCameraOn, localStream]);

  const hangUp = useCallback(() => {
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setIsStreaming(false);
    setIsMuted(false);
    setIsCameraOn(false);
    webRtcRef.current?.close();
  }, [localStream]);

  const openSignPage = useCallback(() => {
    if (!openSignUrl) {
      setErrors((prev) => [...prev, "サイン画面のURLを生成できませんでした。"]);
      return;
    }
    window.open(openSignUrl, "_blank", "noopener");
  }, [openSignUrl]);

  useEffect(() => {
    if (!roomId || !token) {
      setErrors((prev) => [...prev, "roomId と token が必要です。"]);
      return;
    }

    const signaling = new SignalingClient({
      roomId,
      role: "talent",
      token,
      autoReconnect: true
    });
    signalingRef.current = signaling;
    signaling.connect();

    const unsubscribeStatus = signaling.on("status", (status) => {
      switch (status) {
        case "connected":
          setSignalingStatus("接続済み");
          break;
        case "reconnecting":
          setSignalingStatus("再接続中");
          break;
        case "connecting":
          setSignalingStatus("接続中");
          break;
        case "closed":
          setSignalingStatus("切断");
          break;
        default:
          setSignalingStatus("待機中");
          break;
      }
    });

    const unsubscribeMessage = signaling.on("message", (message) => handleMessage(message));
    const unsubscribeError = signaling.on("error", (error) => {
      setErrors((prev) => [...prev, error.message]);
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
      role: "talent",
      onIceCandidate: (candidate: IceCandidate) => {
        signalingRef.current?.send({ type: "ice", candidate });
      },
      onNegotiationNeeded: async () => {
        await createOffer();
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        if (state === "failed" || state === "disconnected") {
          setErrors((prev) => [...prev, "WebRTC 接続が切断されました。"]);
        }
      }
    });
    webRtcRef.current = client;
    return () => {
      client.close();
      webRtcRef.current = null;
    };
  }, [createOffer]);
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
    <main className="flex min-h-screen flex-col gap-8 bg-white pb-16">
      <header className="border-b border-slate-100 bg-white/80 px-6 py-4 backdrop-blur">
        <h1 className="text-2xl font-semibold text-slate-800">タレント画面</h1>
        <p className="text-sm text-slate-500">ルームID: {roomId}</p>
      </header>
      <div className="flex flex-col gap-6 px-6">
        <div className="text-sm text-slate-600">待機中: {waitingCount} 人</div>
        <section className="relative grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="relative">
            <VideoPanel stream={remoteStream} muted label="ファン映像" />
            {localStream && (
              <div className="absolute bottom-4 right-4 w-40 rounded-lg border border-white/40 shadow-lg">
                <VideoPanel stream={localStream} muted mirror label="自分プレビュー" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <SignaturePreview
              strokes={canvasState.strokes}
              imageBase64={canvasState.imageBase64}
              width={canvasState.width}
              height={canvasState.height}
              title="サインプレビュー"
              background={canvasState.background}
            />
            <ControlsBar
              isStreaming={isStreaming}
              isMuted={isMuted}
              isCameraOn={isCameraOn}
              onToggleMute={toggleMute}
              onToggleCamera={toggleCamera}
              onStartStream={startStreaming}
              onHangUp={hangUp}
              onOpenSign={openSignPage}
              onNextFan={handleQueueNext}
              waitingCount={waitingCount}
              hasActiveFan={hasActiveFan}
            />
          </div>
        </section>
        <section className="grid gap-4 rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm lg:grid-cols-3">
          <StatusItem label="シグナリング" value={signalingStatus} />
          <StatusItem label="PeerConnection" value={connectionState} />
          <StatusItem label="参加中" value={peers.join(", ") || "参加者なし"} />
        </section>
        {errors.length > 0 && (
          <section className="space-y-2 rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
            <div className="font-semibold">エラー</div>
            <ul className="space-y-1">
              {errors.map((error, index) => (
                <li key={`${error}-${index}`}>・{error}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium text-slate-700">{value}</div>
    </div>
  );
}
