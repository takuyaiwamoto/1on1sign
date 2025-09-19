import { Toast } from '../lib/types';

interface ToastCenterProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastCenter({ toasts, onDismiss }: ToastCenterProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto w-[min(320px,90vw)] rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ring-black/10 ${toneClasses(toast.tone)}`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{toast.message}</span>
            <button
              type="button"
              className="text-xs font-semibold text-slate-900/60"
              onClick={() => onDismiss(toast.id)}
            >
              閉じる
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function toneClasses(tone: Toast['tone']) {
  switch (tone) {
    case 'success':
      return 'bg-emerald-200/95 text-emerald-950';
    case 'error':
      return 'bg-rose-200/95 text-rose-950';
    default:
      return 'bg-slate-200/95 text-slate-950';
  }
}
