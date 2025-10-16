import clsx from 'clsx';

const COLORS = [
  { label: '黒', value: '#000000' },
  { label: '赤', value: '#FF0000' },
  { label: '緑', value: '#008000' }
];

const WIDTHS = [
  { label: '細', value: 3 },
  { label: '普通', value: 6 },
  { label: '太い', value: 10 }
];

interface SignToolbarProps {
  color: string;
  width: number;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onClear: () => void;
  onSubmitFinal: () => void;
  isSubmitting?: boolean;
}

export function SignToolbar({
  color,
  width,
  onColorChange,
  onWidthChange,
  onClear,
  onSubmitFinal,
  isSubmitting = false
}: SignToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-lg ring-1 ring-gray-200 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          {COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onColorChange(option.value)}
              className={clsx(
                'flex h-9 w-14 items-center justify-center rounded-full text-sm font-medium transition',
                color === option.value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-800'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {WIDTHS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onWidthChange(option.value)}
              className={clsx(
                'flex h-9 w-14 items-center justify-center rounded-full text-sm font-medium transition',
                width === option.value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-800'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-300"
        >
          クリア
        </button>
      </div>
      <button
        type="button"
        disabled={isSubmitting}
        onClick={onSubmitFinal}
        className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? '送信中...' : '確定版送信'}
      </button>
    </div>
  );
}
