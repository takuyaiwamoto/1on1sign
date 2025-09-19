import { useCallback, useMemo, useRef, useState } from 'react';
import { WriterCanvas, type WriterCanvasHandle } from './WriterCanvas';
import { DrawingToolbar } from './DrawingToolbar';
import { VideoTile } from './VideoTile';
import { StrokeEvent, StrokeTool } from '../lib/types';
import type { SessionStatus } from '../hooks/useWebRTCSession';

interface WriterLayoutProps {
  roomId: string;
  shareUrl: string;
  status: SessionStatus;
  dataChannelReady: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onStart: () => Promise<void>;
  onHangUp: () => void;
  onSendStroke: (event: StrokeEvent) => void;
  onCopyToClipboard: (value: string) => Promise<void>;
}

export function WriterLayout({
  roomId,
  shareUrl,
  status,
  dataChannelReady,
  localStream,
  remoteStream,
  onStart,
  onHangUp,
  onSendStroke,
  onCopyToClipboard
}: WriterLayoutProps) {
  const canvasRef = useRef<WriterCanvasHandle | null>(null);
  const [tool, setTool] = useState<StrokeTool>('pen');
  const [color, setColor] = useState('#0f172a');
  const [lineWidth, setLineWidth] = useState(6);
  const [history, setHistory] = useState({ strokes: 0, undone: 0 });
  const [joining, setJoining] = useState(false);

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'connected':
        return '接続中';
      case 'connecting':
        return '接続中…';
      case 'initializing':
        return '初期化中…';
      case 'permission-error':
        return '権限エラー';
      case 'disconnected':
        return '切断';
      default:
        return '待機中';
    }
  }, [status]);

  const handleStrokeEvent = useCallback(
    (event: StrokeEvent) => {
      setHistory((prev) => {
        switch (event.type) {
          case 'stroke:start':
            return { strokes: prev.strokes + 1, undone: 0 };
          case 'undo':
            return { strokes: Math.max(0, prev.strokes - 1), undone: prev.undone + 1 };
          case 'redo':
            return { strokes: prev.strokes + 1, undone: Math.max(0, prev.undone - 1) };
          case 'clear':
            return { strokes: 0, undone: 0 };
          default:
            return prev;
        }
      });
      onSendStroke(event);
    },
    [onSendStroke]
  );

  const joinSession = useCallback(async () => {
    setJoining(true);
    try {
      await onStart();
    } finally {
      setJoining(false);
    }
  }, [onStart]);

  const handleUndo = () => {
    const event = canvasRef.current?.undo();
    if (event) {
      setHistory((prev) => ({ strokes: Math.max(0, prev.strokes - 1), undone: prev.undone + 1 }));
      onSendStroke(event);
    }
  };

  const handleRedo = () => {
    const event = canvasRef.current?.redo();
    if (event) {
      setHistory((prev) => ({ strokes: prev.strokes + 1, undone: Math.max(0, prev.undone - 1) }));
      onSendStroke(event);
    }
  };

  const handleClear = () => {
    const event = canvasRef.current?.clear();
    if (event) {
      setHistory({ strokes: 0, undone: 0 });
      onSendStroke(event);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 lg:flex-row">
      <aside className="flex w-full flex-col gap-4 border-b border-slate-800 bg-slate-900/50 p-6 lg:h-screen lg:w-1/2 lg:border-b-0 lg:border-r">
        <header className="flex flex-col gap-3 rounded-2xl bg-slate-900/90 p-4 ring-1 ring-slate-700/60">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">ルームID: {roomId}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-accent">{statusLabel}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl bg-brand-accent py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
              onClick={joinSession}
              disabled={joining || status === 'connected' || status === 'connecting'}
            >
              {status === 'connected' ? '接続済み' : '通話を開始'}
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-200"
              onClick={() => onCopyToClipboard(shareUrl)}
            >
              リンクをコピー
            </button>
            <button
              type="button"
              className="rounded-xl border border-rose-600 px-4 text-sm font-semibold text-rose-300"
              onClick={onHangUp}
            >
              切断
            </button>
          </div>
          <p className="text-xs text-slate-400 break-all">共有リンク: {shareUrl}</p>
        </header>
        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <VideoTile stream={remoteStream} label="受信映像" placeholder="受信者の参加を待機しています" />
          </div>
          <div className="lg:col-span-2">
            <VideoTile stream={localStream} label="自分" muted mirrored placeholder="カメラを開始すると表示されます" />
          </div>
        </div>
        <div className="rounded-2xl bg-slate-900/80 p-4 text-xs text-slate-400">
          <p>データチャネル: {dataChannelReady ? '接続済み' : '未接続'}</p>
          <p>ストローク: {history.strokes} / Undo: {history.undone}</p>
        </div>
      </aside>
      <main className="flex w-full flex-1 flex-col gap-6 p-6 lg:max-w-[calc(50vw)] lg:overflow-y-auto">
        <div className="grid min-h-[60vh] grid-cols-1 gap-6 xl:grid-cols-[1fr_minmax(220px,0.28fr)]">
          <div className="relative rounded-3xl bg-slate-900/70 p-4 shadow-xl ring-1 ring-slate-800/70">
            <WriterCanvas ref={canvasRef} tool={tool} color={color} lineWidth={lineWidth} disabled={!dataChannelReady} onStrokeEvent={handleStrokeEvent} />
            {!dataChannelReady ? (
              <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-2xl bg-slate-900/80 text-sm text-slate-200">
                データチャネル接続後に描画できます
              </div>
            ) : null}
          </div>
          <DrawingToolbar
            tool={tool}
            color={color}
            lineWidth={lineWidth}
            canUndo={history.strokes > 0}
            canRedo={history.undone > 0}
            onToolChange={setTool}
            onColorChange={setColor}
            onLineWidthChange={setLineWidth}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClear}
          />
        </div>
      </main>
    </div>
  );
}
