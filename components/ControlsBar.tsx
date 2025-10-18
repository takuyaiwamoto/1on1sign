type ControlsBarProps = {
  isStreaming: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onStartStream: () => void;
  onHangUp: () => void;
  onOpenSign: () => void;
  onNextFan: () => void;
  waitingCount: number;
  hasActiveFan: boolean;
};

const baseButton =
  "rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";

export function ControlsBar({
  isStreaming,
  isMuted,
  isCameraOn,
  onToggleMute,
  onToggleCamera,
  onStartStream,
  onHangUp,
  onOpenSign,
  onNextFan,
  waitingCount,
  hasActiveFan
}: ControlsBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white/70 p-4 shadow-inner">
      <button
        type="button"
        className="rounded-lg border border-indigo-300 bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onNextFan}
        disabled={!hasActiveFan && waitingCount === 0}
      >
        次へ{waitingCount > 0 ? ` (${waitingCount})` : hasActiveFan ? "" : ""}
      </button>
      <button
        type="button"
        className={`${baseButton} ${isStreaming ? "border-green-300 text-green-700" : ""}`}
        onClick={onStartStream}
        disabled={isStreaming}
      >
        配信を開始
      </button>
      <button type="button" className={baseButton} onClick={onToggleMute} disabled={!isStreaming}>
        {isMuted ? "ミュート解除" : "ミュート"}
      </button>
      <button type="button" className={baseButton} onClick={onToggleCamera} disabled={!isStreaming}>
        {isCameraOn ? "カメラ停止" : "カメラ開始"}
      </button>
      <button
        type="button"
        className={`${baseButton} border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50`}
        onClick={onHangUp}
        disabled={!isStreaming}
      >
        配信を終了
      </button>
      <button type="button" className={baseButton} onClick={onOpenSign}>
        サインを書く
      </button>
    </div>
  );
}
