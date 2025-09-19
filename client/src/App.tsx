import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Role, Stroke, StrokeEvent } from './lib/types';
import { RoleSelection } from './components/RoleSelection';
import { WriterLayout } from './components/WriterLayout';
import { ReceiverLayout } from './components/ReceiverLayout';
import { useToasts } from './hooks/useToasts';
import { ToastCenter } from './components/ToastCenter';
import { useWebRTCSession } from './hooks/useWebRTCSession';
import { config as clientConfig } from './config';
import { useStrokeBuffer } from './hooks/useStrokeBuffer';
import { StrokeStore } from './store/strokeStore';

interface ServerConfig {
  iceServers: RTCIceServer[];
  baseUrl: string;
}

const DEFAULT_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialRoomId = searchParams.get('room') ?? '';

  const [role, setRole] = useState<Role | null>(null);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId || null);
  const [shareUrl, setShareUrl] = useState('');
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const receiverStoreRef = useRef(new StrokeStore());
  const [receiverStrokes, setReceiverStrokes] = useState<Stroke[]>([]);

  const { toasts, pushToast, removeToast } = useToasts();

  const handleBufferedEvent = useCallback((event: StrokeEvent) => {
    receiverStoreRef.current.apply(event);
    setReceiverStrokes(receiverStoreRef.current.snapshot.strokes);
  }, []);

  const { enqueue: enqueueStroke, clear: clearBuffer } = useStrokeBuffer(clientConfig.strokeBufferMs, handleBufferedEvent);

  const resetReceiverState = useCallback(() => {
    receiverStoreRef.current = new StrokeStore();
    setReceiverStrokes([]);
    clearBuffer();
  }, [clearBuffer]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${clientConfig.serverOrigin}/api/config`, {
          credentials: 'include'
        });
        if (!response.ok) throw new Error('config fetch failed');
        const data: ServerConfig = await response.json();
        setServerConfig(data);
      } catch (error) {
        console.warn('Failed to load config, falling back to defaults', error);
        setServerConfig({ iceServers: clientConfig.iceServers ?? DEFAULT_ICE, baseUrl: window.location.origin });
      }
    };
    fetchConfig();
  }, []);

  const iceServers = serverConfig?.iceServers ?? clientConfig.iceServers ?? DEFAULT_ICE;

  const signalingUrl = useMemo(() => {
    if (!roomId) return null;
    const serverUrl = new URL(clientConfig.serverOrigin);
    const protocol = serverUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${serverUrl.host}${clientConfig.signalingPath}?room=${roomId}`;
  }, [roomId]);

  const session = useWebRTCSession({
    role,
    roomId,
    signalingUrl,
    iceServers,
    onError: (message) => pushToast(message, 'error'),
    onPeerLeft: () => {
      pushToast('相手が退出しました', 'info');
      resetReceiverState();
    },
    onStrokeEvent: (event) => {
      if (role === 'receiver') {
        enqueueStroke(event);
      }
    }
  });

  useEffect(() => {
    if (role !== 'receiver') {
      resetReceiverState();
    }
  }, [role, resetReceiverState]);

  const updateQueryString = useCallback((nextRoomId: string) => {
    const params = new URLSearchParams(window.location.search);
    if (nextRoomId) {
      params.set('room', nextRoomId);
    } else {
      params.delete('room');
    }
    const qs = params.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState({}, '', nextUrl);
  }, []);

  const handleCreateRoom = useCallback(async () => {
    setLoadingRoom(true);
    try {
      const response = await fetch(`${clientConfig.serverOrigin}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to create room');
      const data = await response.json();
      setRoomId(data.roomId);
      setShareUrl(data.shareUrl);
      updateQueryString(data.roomId);
      pushToast('新しいルームを作成しました', 'success');
    } catch (error) {
      console.error(error);
      pushToast('ルーム作成に失敗しました', 'error');
    } finally {
      setLoadingRoom(false);
    }
  }, [pushToast, updateQueryString]);

  const handleJoin = useCallback(
    (nextRole: Role, inputRoomId: string) => {
      if (nextRole === 'receiver' && !inputRoomId) {
        pushToast('受信者はルームIDが必要です', 'error');
        return;
      }
      const resolvedRoomId = inputRoomId || roomId;
      if (!resolvedRoomId) {
        pushToast('先にルームを作成してください', 'info');
        return;
      }
      setRole(nextRole);
      setRoomId(resolvedRoomId);
      updateQueryString(resolvedRoomId);
      const share = serverConfig?.baseUrl
        ? withRoomParam(serverConfig.baseUrl, resolvedRoomId)
        : withRoomParam(window.location.origin, resolvedRoomId);
      setShareUrl(share);
      pushToast(`${nextRole === 'writer' ? '書き手' : '受信側'}として入室しました`, 'success');
    },
    [pushToast, roomId, serverConfig?.baseUrl, updateQueryString]
  );

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      pushToast('コピーしました', 'success');
    } catch (error) {
      console.error(error);
      pushToast('コピーに失敗しました', 'error');
    }
  }, [pushToast]);

  const renderContent = () => {
    if (!role || !roomId) {
      return (
        <RoleSelection
          initialRoomId={roomId ?? ''}
          onCreateRoom={handleCreateRoom}
          onJoin={handleJoin}
          loading={loadingRoom}
        />
      );
    }

    if (role === 'writer') {
      return (
        <WriterLayout
          roomId={roomId}
          shareUrl={shareUrl || withRoomParam(window.location.origin, roomId)}
          status={session.status}
          dataChannelReady={session.dataChannelReady}
          localStream={session.localStream}
          remoteStream={session.remoteStream}
          onStart={session.start}
          onHangUp={() => {
            session.hangUp();
            pushToast('切断しました', 'info');
          }}
          onSendStroke={session.sendStroke}
          onCopyToClipboard={copyToClipboard}
        />
      );
    }

    return (
      <ReceiverLayout
        roomId={roomId}
        shareUrl={shareUrl || withRoomParam(window.location.origin, roomId)}
        status={session.status}
        dataChannelReady={session.dataChannelReady}
        localStream={session.localStream}
        remoteStream={session.remoteStream}
        strokes={receiverStrokes}
        onStart={session.start}
        onHangUp={() => {
          session.hangUp();
          resetReceiverState();
          pushToast('切断しました', 'info');
        }}
        onCopyToClipboard={copyToClipboard}
      />
    );
  };

  return (
    <>
      {renderContent()}
      <ToastCenter toasts={toasts} onDismiss={removeToast} />
    </>
  );
}

function withRoomParam(baseUrl: string, roomId: string) {
  const url = new URL(baseUrl);
  url.searchParams.set('room', roomId);
  return url.toString();
}
