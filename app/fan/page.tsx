"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VideoPanel } from '../../components/VideoPanel';
import { SignaturePreview } from '../../components/SignaturePreview';
import { downloadDataUrlPng, SignatureRenderer } from '../../lib/signature';
import { useSignaling } from '../../lib/signaling';
import {
  addIceCandidate,
  createPeerConnection,
  createAnswer,
  acceptRemoteDescription
} from '../../lib/rtc';
import type {
  IceCandidateInit,
  ServerToClientMessage,
  ClientToServerMessage
} from '../../types/signaling';

const ROLE = 'fan';

function FanPageContent() {
  const params = useSearchParams();
  const roomId = params.get('room') ?? '';
  const token = params.get('token') ?? '';

  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [statusMessage, setStatusMessage] = useState<string>('待機中…');
  const [previewReady, setPreviewReady] = useState(false);
  const rendererRef = useRef<SignatureRenderer | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const sendRef = useRef<(message: ClientToServerMessage) => void>(() => {});

  const canConnect = hasStarted && Boolean(roomId) && Boolean(token);

  const ensurePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const pc = createPeerConnection({
      onIceCandidate: (candidate: IceCandidateInit) => {
        sendRef.current({
          kind: 'ice-candidate',
          roomId,
          target: 'talent',
          candidate
        });
      },
      onTrack: (stream) => {
        setRemoteStream(stream);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      }
    });

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    peerConnectionRef.current = pc;
    return pc;
  }, [localStream, roomId]);

  useEffect(() => {
    const pc = peerConnectionRef.current;
    if (!pc || !localStream) return;

    const senders = pc.getSenders();
    const missingTracks = localStream.getTracks().filter(
      (track) => !senders.some((sender) => sender.track?.id === track.id)
    );
    missingTracks.forEach((track) => pc.addTrack(track, localStream));
  }, [localStream]);

  const handleMessage = useCallback(
    async (message: ServerToClientMessage) => {
      switch (message.kind) {
        case 'joined':
          setStatusMessage('タレント待機中…');
          break;
        case 'peer-joined':
          if (message.role === 'talent') {
            setStatusMessage('接続中…');
          }
          break;
        case 'peer-left':
          if (message.role === 'talent') {
            setStatusMessage('タレントが離脱しました');
            setRemoteStream(null);
          }
          break;
        case 'offer': {
          if (message.source !== 'talent') break;
          try {
            const pc = ensurePeerConnection();
            await acceptRemoteDescription(pc, message.description);
            const answer = await createAnswer(pc);
            sendRef.current({
              kind: 'answer',
              roomId,
              target: 'talent',
              description: answer
            });
            setStatusMessage('接続済み');
          } catch (offerError) {
            console.error('Failed to handle offer', offerError);
            setError('通話接続に失敗しました。再読み込みしてください。');
          }
          break;
        }
        case 'answer':
          // Fan never expects answer
          break;
        case 'ice-candidate':
          if (message.source !== 'talent') break;
          try {
            const pc = ensurePeerConnection();
            await addIceCandidate(pc, message.candidate);
          } catch (iceError) {
            console.error('Failed to add ICE candidate', iceError);
          }
          break;
        case 'signature-event':
          if (rendererRef.current) {
            rendererRef.current.handleEvent(message.event);
          }
          break;
        case 'final-sign':
          if (rendererRef.current) {
            rendererRef.current.drawImage(message.image).catch((drawError) => {
              console.error('Failed to update final signature image', drawError);
            });
          }
          break;
        case 'error':
          setError(message.message);
          break;
        default:
          break;
      }
    },
    [ensurePeerConnection, roomId]
  );

  const { send } = useSignaling({
    roomId,
    token,
    role: ROLE,
    onMessage: handleMessage,
    enabled: canConnect
  });
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setLocalStream(stream);
      setHasStarted(true);
      setStatusMessage('接続中…');
    } catch (mediaError) {
      console.error(mediaError);
      setError('カメラとマイクのアクセスが必要です。ブラウザ設定を確認してください。');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (canConnect) {
        sendRef.current({
          kind: 'leave',
          roomId,
          role: ROLE
        });
      }
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      localStream?.getTracks().forEach((track) => track.stop());
    };
  }, [localStream, canConnect, roomId]);

  const handleDownload = useCallback(() => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.exportToDataUrl();
    const filename = `sign_${roomId}_${Date.now()}.png`;
    downloadDataUrlPng(dataUrl, filename);
  }, [roomId]);

  if (!roomId || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4">
        <h1 className="text-2xl font-semibold">アクセスエラー</h1>
        <p className="text-gray-600">正しいURLでアクセスしてください。</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-black text-white">
      <div className="flex-1">
        <VideoPanel
          remoteStream={remoteStream}
          localStream={localStream}
          mutedLocal
          showLocalPreview
          className="rounded-none"
        />
        {!hasStarted && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <button
              type="button"
              onClick={initializeMedia}
              className="rounded-full bg-white px-6 py-3 text-base font-semibold text-gray-900 shadow-lg"
            >
              通話を開始
            </button>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute top-4 left-4 max-w-xs rounded-xl bg-black/60 px-4 py-3 text-xs sm:text-sm">
          <div>ステータス: {statusMessage}</div>
          <div>接続状態: {connectionState}</div>
          {error && <div className="text-red-400">エラー: {error}</div>}
        </div>

        <div className="pointer-events-auto absolute bottom-4 right-4 flex w-32 flex-col items-end gap-3 sm:w-48">
          <SignaturePreview
            className="!bg-black border border-white/20 shadow-xl"
            onRendererReady={(renderer) => {
              rendererRef.current = renderer ?? null;
              setPreviewReady(Boolean(renderer));
            }}
          />
          <button
            type="button"
            onClick={handleDownload}
            className="w-full rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-gray-900 shadow-lg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!previewReady}
          >
            PNG保存
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white text-gray-600">
          読み込み中…
        </div>
      }
    >
      <FanPageContent />
    </Suspense>
  );
}
