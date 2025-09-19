import { useCallback, useMemo, useState } from 'react';
import { VideoTile } from './VideoTile';
import { ReceiverCanvas } from './ReceiverCanvas';
import type { SessionStatus } from '../hooks/useWebRTCSession';
import { Stroke } from '../lib/types';
import { exportSignaturePdf, exportSignaturePng } from '../lib/saveSignature';

interface ReceiverLayoutProps {
  roomId: string;
  status: SessionStatus;
  dataChannelReady: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  strokes: Stroke[];
  onStart: () => Promise<void>;
  onHangUp: () => void;
  shareUrl: string;
  onCopyToClipboard: (value: string) => Promise<void>;
}

export function ReceiverLayout({
  roomId,
  status,
  dataChannelReady,
  localStream,
  remoteStream,
  strokes,
  onStart,
  onHangUp,
  shareUrl,
  onCopyToClipboard
}: ReceiverLayoutProps) {
  const [saving, setSaving] = useState<'png' | 'pdf' | null>(null);
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

  const joinSession = useCallback(async () => {
    setJoining(true);
    try {
      await onStart();
    } finally {
      setJoining(false);
    }
  }, [onStart]);

  const savePng = useCallback(async () => {
    setSaving('png');
    try {
      const blob = await exportSignaturePng(strokes);
      await shareOrDownload(blob, 'signature.png');
    } finally {
      setSaving(null);
    }
  }, [strokes]);

  const savePdf = useCallback(async () => {
    setSaving('pdf');
    try {
      const blob = await exportSignaturePdf(strokes);
      await shareOrDownload(blob, 'signature.pdf');
    } finally {
      setSaving(null);
    }
  }, [strokes]);

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-slate-950 px-4 py-6 text-slate-100">
      <header className="rounded-3xl bg-slate-900/90 p-4 text-sm shadow-xl ring-1 ring-slate-800/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Room</div>
            <div className="font-semibold">{roomId}</div>
          </div>
          <span className="rounded-full bg-brand-accent/10 px-3 py-1 text-xs font-semibold text-brand-accent">{statusLabel}</span>
        </div>
        <p className="mt-3 break-all text-xs text-slate-400">共有リンク: {shareUrl}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="flex-1 rounded-xl bg-brand-accent py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
            onClick={joinSession}
            disabled={joining || status === 'connected' || status === 'connecting'}
          >
            {status === 'connected' ? '接続済み' : '通話に参加'}
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
      </header>

      <div className="flex flex-col gap-4">
        <VideoTile stream={remoteStream} label="書き手" placeholder="書き手の接続を待機しています" />
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-3">
            <VideoTile stream={localStream} label="自分" muted placeholder="接続するとプレビュー" />
          </div>
          <div className="col-span-2 rounded-2xl bg-slate-900/80 p-3 text-xs text-slate-300">
            <p>・縦画面でご利用ください</p>
            <p>・保存時はPNG（推奨） またはPDF</p>
            <p>・iOS Safariでは画像プレビュー後の長押し保存</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-slate-900/90 p-4 shadow-xl ring-1 ring-slate-800/70">
        <ReceiverCanvas strokes={strokes} />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="flex-1 rounded-xl bg-brand-accent py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
            onClick={savePng}
            disabled={!dataChannelReady || strokes.length === 0 || saving === 'png'}
          >
            {saving === 'png' ? '生成中…' : 'PNGとして保存'}
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl border border-slate-700 py-2 text-sm font-semibold text-slate-200 disabled:opacity-40"
            onClick={savePdf}
            disabled={!dataChannelReady || strokes.length === 0 || saving === 'pdf'}
          >
            {saving === 'pdf' ? '生成中…' : 'A4縦PDF'}
          </button>
        </div>
      </div>

      <footer className="text-center text-[11px] text-slate-500">映像・音声が再生されない場合はサウンド許可と回線状態を確認してください。</footer>
    </div>
  );
}

async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'オンラインサイン' });
    return;
  }
  if ('share' in navigator && !(navigator as any).canShare) {
    await navigator.share({ files: [file], title: 'オンラインサイン' }).catch(() => downloadBlob(blob, filename));
    return;
  }
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
