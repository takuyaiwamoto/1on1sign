const COLORS = [
  { key: "black", hex: "#111827", label: "黒" },
  { key: "red", hex: "#dc2626", label: "赤" },
  { key: "green", hex: "#16a34a", label: "緑" },
  { key: "white", hex: "#ffffff", label: "白" }
];

const WIDTHS = [
  { value: 20, label: "細" },
  { value: 32, label: "中" },
  { value: 48, label: "太" }
];

type SignToolbarProps = {
  color: string;
  width: number;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export function SignToolbar({
  color,
  width,
  onColorChange,
  onWidthChange,
  onClear,
  onSubmit,
  disabled = false
}: SignToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white/90 p-4 shadow">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">色</span>
        <div className="flex gap-2">
          {COLORS.map((option) => {
            const isSelected = color === option.hex;
            const borderClass = isSelected
              ? "border-slate-800"
              : option.hex === "#ffffff"
                ? "border-slate-300"
                : "border-transparent";
            return (
              <button
                key={option.key}
                type="button"
                className={`h-9 w-9 rounded-full border-2 ${borderClass}`}
                style={{ backgroundColor: option.hex }}
                onClick={() => onColorChange(option.hex)}
              >
                <span className="sr-only">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">太さ</span>
        <div className="flex gap-2">
          {WIDTHS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm ${
                width === option.value
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
              onClick={() => onWidthChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          クリア
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className="rounded-lg border border-indigo-300 bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          確定版送信
        </button>
      </div>
    </div>
  );
}
