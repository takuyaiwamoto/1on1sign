import clsx from 'clsx';

interface ControlsBarProps {
  isMuted: boolean;
  isCameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
  onOpenSign: () => void;
}

export function ControlsBar({
  isMuted,
  isCameraOff,
  onToggleMute,
  onToggleCamera,
  onEndCall,
  onOpenSign
}: ControlsBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/90 px-4 py-3 shadow-lg ring-1 ring-gray-200 backdrop-blur">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMute}
          className={clsx(
            'rounded-full px-4 py-2 text-sm font-medium transition',
            isMuted ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-800'
          )}
        >
          {isMuted ? 'ミュート解除' : 'ミュート'}
        </button>
        <button
          type="button"
          onClick={onToggleCamera}
          className={clsx(
            'rounded-full px-4 py-2 text-sm font-medium transition',
            isCameraOff ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-800'
          )}
        >
          {isCameraOff ? 'カメラオン' : 'カメラオフ'}
        </button>
        <button
          type="button"
          onClick={onOpenSign}
          className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          サインを書く
        </button>
      </div>
      <button
        type="button"
        onClick={onEndCall}
        className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
      >
        終了
      </button>
    </div>
  );
}
