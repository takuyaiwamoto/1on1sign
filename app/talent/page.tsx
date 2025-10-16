"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { VideoPanel } from '../../components/VideoPanel';
import { ControlsBar } from '../../components/ControlsBar';
import {
  acceptRemoteDescription,
  addIceCandidate,
  createOffer,
  createPeerConnection
} from '../../lib/rtc';
import { useSignaling } from '../../lib/signaling';
import type {
  ClientToServerMessage,
  IceCandidateInit,
  ServerToClientMessage
} from '../../types/signaling';

const ROLE = 'talent';

function TalentPageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const roomId = params.get('room') ?? '';
  const token = params.get('token') ?? '';
  const signToken = params.get('signToken') ?? '';
  const signUrlParam = params.get('signUrl');

  const log = useCallback((...parts: unknown[]) => {
    // eslint-disable-next-line no-console
    console.info('[talent]', ...parts);
  }, []);

  const [hasStarted, setHasStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('準備中…');
  const [error, setError] = useState<string | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const sendRef = useRef<(message: ClientToServerMessage) => void>(() => {});
  const negotiatingRef = useRef(false);

  const canConnect = hasStarted && Boolean(roomId) && Boolean(token);

  const ensurePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      const pc = peerConnectionRef.current;
      if (localStream) {
        const existingTrackIds = new Set(
          pc.getSenders().map((sender) => sender.track?.id).filter(Boolean) as string[]
        );
        localStream.getTracks().forEach((track) => {
          if (!existingTrackIds.has(track.id)) {
            log('add local track', track.kind, track.id);
            pc.addTrack(track, localStream);
          }
        });
      }
      return pc;
    }

    const pc = createPeerConnection({
      onIceCandidate: (candidate: IceCandidateInit) => {
        log('local ice', candidate);
        sendRef.current({
          kind: 'ice-candidate',
          roomId,
          target: 'fan',
          candidate
        });
      },
      onTrack: (stream) => {
        log('remote track received', stream.id, stream.getTracks().map((t) => t.kind));
        setRemoteStream(stream);
      }
    });
    log('peer connection created');

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        log('add local track', track.kind, track.id);
        pc.addTrack(track, localStream);
      });
    }

    peerConnectionRef.current = pc;
    return pc;
  }, [localStream, roomId, log]);

  useEffect(() => {
    const pc = peerConnectionRef.current;
    if (!pc || !localStream) return;

    const senders = pc.getSenders();
    const missing = localStream.getTracks().filter(
      (track) => !senders.some((sender) => sender.track?.id === track.id)
    );
    missing.forEach((track) => {
      log('sync track', track.kind, track.id);
      pc.addTrack(track, localStream);
    });
  }, [localStream, log]);

  const negotiate = useCallback(async () => {
    if (negotiatingRef.current) return;
    negotiatingRef.current = true;
    log('negotiate start');

    try {
      const pc = ensurePeerConnection();
      const offer = await createOffer(pc);
      log('created offer', offer.type);
      sendRef.current({
        kind: 'offer',
        roomId,
        target: 'fan',
        description: offer
      });
      setStatusMessage('視聴者と接続中…');
    } catch (error_) {
      console.error('Failed to start negotiation', error_);
      setError('接続処理に失敗しました。再試行してください。');
    } finally {
      negotiatingRef.current = false;
    }
  }, [ensurePeerConnection, roomId, log]);

  const handleMessage = useCallback(
    async (message: ServerToClientMessage) => {
      switch (message.kind) {
        case 'joined':
          if (message.peers.includes('fan')) {
            await negotiate();
          } else {
            setStatusMessage('ファンの参加を待っています…');
          }
          break;
        case 'peer-joined':
          if (message.role === 'fan') {
            await negotiate();
          }
          break;
        case 'answer':
          if (message.source !== 'fan') break;
          try {
            const pc = ensurePeerConnection();
            await acceptRemoteDescription(pc, message.description);
            log('applied answer');
            setStatusMessage('接続済み');
          } catch (answerError) {
            console.error('Failed to apply remote answer', answerError);
            setError('接続に失敗しました。再読み込みしてください。');
          }
          break;
        case 'offer':
          // Talent initiates offers; ignore offers from fan.
          break;
        case 'ice-candidate':
          if (message.source !== 'fan') break;
          try {
            const pc = ensurePeerConnection();
            await addIceCandidate(pc, message.candidate);
            log('added remote ice');
          } catch (candidateError) {
            console.error('Failed to add ICE candidate', candidateError);
          }
          break;
        case 'peer-left':
          if (message.role === 'fan') {
            setStatusMessage('ファンが離脱しました。');
            setRemoteStream(null);
          }
          break;
        case 'error':
          setError(message.message);
          break;
        default:
          break;
      }
    },
    [ensurePeerConnection, negotiate, log]
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
    log('initialize media');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      log('media ready', stream.getTracks().map((t) => `${t.kind}:${t.id}`));
      setLocalStream(stream);
      setHasStarted(true);
      setStatusMessage('接続準備中…');
    } catch (mediaError) {
      console.error(mediaError);
      setError('カメラ・マイクの許可が必要です。ブラウザ設定を確認してください。');
    }
  }, [log]);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const next = !isMuted;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setIsMuted(next);
  }, [isMuted, localStream]);

  const toggleCamera = useCallback(() => {
    if (!localStream) return;
    const next = !isCameraOff;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    setIsCameraOff(next);
  }, [isCameraOff, localStream]);

  const endCall = useCallback(() => {
    router.replace('/');
  }, [router]);

  const signUrl = useMemo(() => {
    if (signUrlParam) {
      return signUrlParam;
    }
    if (!signToken || typeof window === 'undefined') {
      return null;
    }
    const url = new URL(window.location.href);
    url.pathname = '/sign';
    url.search = `?room=${encodeURIComponent(roomId)}&token=${encodeURIComponent(signToken)}`;
    return url.toString();
  }, [roomId, signToken, signUrlParam]);

  const openSignPage = useCallback(() => {
    if (!signUrl) {
      setError('サイン用URLが設定されていません。管理者に確認してください。');
      return;
    }
    window.open(signUrl, '_blank', 'noopener,noreferrer');
  }, [signUrl]);

  if (!roomId || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4">
        <h1 className="text-2xl font-semibold">アクセスエラー</h1>
        <p className="text-gray-600">正しいURLでアクセスしてください。</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        <div className="flex-1 overflow-hidden rounded-3xl bg-gray-900">
          <VideoPanel remoteStream={remoteStream} localStream={localStream} />
          {!hasStarted && (
            <div className="flex h-full items-center justify-center bg-black/40">
              <button
                type="button"
                onClick={initializeMedia}
                className="rounded-full bg-white px-6 py-3 text-base font-semibold text-gray-900 shadow-lg"
              >
                配信を開始
              </button>
            </div>
          )}
        </div>
        <ControlsBar
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onEndCall={endCall}
          onOpenSign={openSignPage}
        />
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <div>ステータス: {statusMessage}</div>
          {error && <div className="text-red-600">エラー: {error}</div>}
        </div>
      </main>
    </div>
  );
}

export default function TalentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white text-gray-600">
          読み込み中…
        </div>
      }
    >
      <TalentPageContent />
    </Suspense>
  );
}
