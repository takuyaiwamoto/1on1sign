import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { SignalingClient } from '../lib/signalingClient';
import { Role, StrokeEvent } from '../lib/types';

export type SessionStatus = 'idle' | 'permission-error' | 'initializing' | 'connecting' | 'connected' | 'disconnected';

export interface WebRTCSessionOptions {
  role: Role | null;
  roomId: string | null;
  signalingUrl: string | null;
  iceServers: RTCIceServer[];
  onError?: (message: string) => void;
  onPeerLeft?: () => void;
  onStrokeEvent?: (event: StrokeEvent) => void;
}

interface UseWebRTCSessionResult {
  clientId: string;
  status: SessionStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  dataChannelReady: boolean;
  start: () => Promise<void>;
  hangUp: () => void;
  sendStroke: (event: StrokeEvent) => void;
}

export function useWebRTCSession({
  role,
  roomId,
  signalingUrl,
  iceServers,
  onError,
  onPeerLeft,
  onStrokeEvent
}: WebRTCSessionOptions): UseWebRTCSessionResult {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [dataChannelReady, setDataChannelReady] = useState(false);

  const clientIdRef = useRef(nanoid(10));
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const signalingCleanupRef = useRef<() => void>();

  const stopTracks = useCallback(() => {
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
  }, [localStream]);

  const cleanupSignaling = useCallback(() => {
    signalingCleanupRef.current?.();
    signalingCleanupRef.current = undefined;
    signalingRef.current = null;
  }, []);

  const cleanupPeerConnection = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    remoteStreamRef.current = null;
    setRemoteStream(null);
    setDataChannelReady(false);
    peerIdRef.current = null;
    pendingCandidatesRef.current = [];
  }, []);

  const handleStrokeMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as StrokeEvent;
        if (payload?.type) {
          onStrokeEvent?.(payload);
        }
      } catch (error) {
        console.error('Failed to parse stroke event', error);
      }
    },
    [onStrokeEvent]
  );

  const setupDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;
      channel.binaryType = 'arraybuffer';
      channel.onopen = () => setDataChannelReady(true);
      channel.onclose = () => setDataChannelReady(false);
      channel.onerror = (event) => {
        console.error('Data channel error', event);
        onError?.('データチャネルでエラーが発生しました');
      };
      channel.onmessage = handleStrokeMessage;
    },
    [handleStrokeMessage, onError]
  );

  const setPeerId = useCallback((peerId: string | null) => {
    peerIdRef.current = peerId;
    if (peerId && pendingCandidatesRef.current.length) {
      pendingCandidatesRef.current.forEach((candidate) => {
        signalingRef.current?.sendSignal(peerId, { type: 'candidate', candidate });
      });
      pendingCandidatesRef.current = [];
    }
  }, []);

  const ensurePeerConnection = useCallback(async () => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }
    if (!role || !roomId) {
      throw new Error('role and roomId are required to create a PeerConnection');
    }
    const pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: 'balanced'
    });
    peerConnectionRef.current = pc;

    const remote = new MediaStream();
    remoteStreamRef.current = remote;
    setRemoteStream(remote);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate.toJSON();
        const targetId = peerIdRef.current;
        if (targetId) {
          signalingRef.current?.sendSignal(targetId, { type: 'candidate', candidate });
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      stream.getTracks().forEach((track) => {
        if (!remoteStreamRef.current?.getTrackById(track.id)) {
          remote.addTrack(track);
        }
      });
      setRemoteStream(new MediaStream(remote.getTracks()));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setStatus('connected');
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setStatus('disconnected');
      }
    };

    pc.ondatachannel = (event) => {
      if (role === 'receiver') {
        setupDataChannel(event.channel);
      }
    };

    return pc;
  }, [iceServers, role, roomId, setupDataChannel]);

  const start = useCallback(async () => {
    if (!role || !roomId || !signalingUrl) {
      onError?.('ロールとルームIDを確認してください');
      return;
    }

    setStatus('initializing');

    try {
      const constraints: MediaStreamConstraints = {
        audio: { echoCancellation: true, noiseSuppression: true },
        video: {
          width: role === 'writer' ? { ideal: 1280 } : { max: 960 },
          height: role === 'writer' ? { ideal: 720 } : { max: 540 },
          frameRate: role === 'writer' ? { ideal: 30, max: 30 } : { max: 24 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      const pc = await ensurePeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      if (role === 'writer') {
        const channel = pc.createDataChannel('strokes', { ordered: true });
        setupDataChannel(channel);
      }

      const signaling = new SignalingClient({
        url: signalingUrl,
        roomId,
        role,
        clientId: clientIdRef.current
      });
      signalingRef.current = signaling;

      const unsubscribes: Array<() => void> = [];

      unsubscribes.push(
        signaling.on('joined', async (payload) => {
          if (payload.peers[0]) {
            setPeerId(payload.peers[0].clientId);
            if (role === 'writer') {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              signaling.sendSignal(payload.peers[0].clientId, { type: 'offer', sdp: offer.sdp });
            }
          }
        })
      );

      unsubscribes.push(
        signaling.on('peer-joined', async (peer) => {
          setPeerId(peer.clientId);
          if (role === 'writer') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            signaling.sendSignal(peer.clientId, { type: 'offer', sdp: offer.sdp });
          }
        })
      );

      unsubscribes.push(
        signaling.on('peer-left', () => {
          setPeerId(null);
          onPeerLeft?.();
          setStatus('disconnected');
        })
      );

      unsubscribes.push(
        signaling.on('signal', async ({ clientId, data }) => {
          setPeerId(clientId);
          const pcRef = peerConnectionRef.current;
          if (!pcRef) return;
          if ((data as any)?.type === 'offer') {
            const desc = new RTCSessionDescription({ type: 'offer', sdp: (data as any).sdp });
            await pcRef.setRemoteDescription(desc);
            const answer = await pcRef.createAnswer();
            await pcRef.setLocalDescription(answer);
            signaling.sendSignal(clientId, { type: 'answer', sdp: answer.sdp });
          } else if ((data as any)?.type === 'answer') {
            const desc = new RTCSessionDescription({ type: 'answer', sdp: (data as any).sdp });
            await pcRef.setRemoteDescription(desc);
          } else if ((data as any)?.type === 'candidate') {
            try {
              await pcRef.addIceCandidate(new RTCIceCandidate((data as any).candidate));
            } catch (error) {
              console.error('Failed to add ICE candidate', error);
            }
          }
        })
      );

      unsubscribes.push(() => signaling.leave());

      signalingCleanupRef.current = () => {
        unsubscribes.forEach((unsubscribe) => unsubscribe?.());
      };

      signaling.connect();
      setStatus('connecting');
    } catch (error) {
      console.error(error);
      setStatus('permission-error');
      onError?.('カメラ・マイクの利用許可を確認してください');
    }
  }, [ensurePeerConnection, onError, onPeerLeft, role, roomId, setPeerId, setupDataChannel, signalingUrl]);

  const hangUp = useCallback(() => {
    cleanupSignaling();
    cleanupPeerConnection();
    stopTracks();
    setStatus('idle');
  }, [cleanupPeerConnection, cleanupSignaling, stopTracks]);

  const sendStroke = useCallback(
    (event: StrokeEvent) => {
      if (dataChannelRef.current?.readyState === 'open') {
        dataChannelRef.current.send(JSON.stringify(event));
      }
    },
    []
  );

  useEffect(() => () => hangUp(), [hangUp]);

  return {
    clientId: clientIdRef.current,
    status,
    localStream,
    remoteStream,
    dataChannelReady,
    start,
    hangUp,
    sendStroke
  };
}
