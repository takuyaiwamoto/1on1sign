import { StrokeTool } from '../lib/types';

interface DrawingToolbarProps {
  tool: StrokeTool;
  color: string;
  lineWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: StrokeTool) => void;
  onColorChange: (color: string) => void;
  onLineWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

const COLORS = ['#0f172a', '#222222', '#2563eb', '#14b8a6', '#f97316', '#ec4899', '#facc15'];
const WIDTHS = [2, 4, 6, 8, 12];

export function DrawingToolbar({
  tool,
  color,
  lineWidth,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onLineWidthChange,
  onUndo,
  onRedo,
  onClear
}: DrawingToolbarProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-slate-900/80 p-4 shadow-lg ring-1 ring-slate-700/60">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">ツール</h3>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${tool === 'pen' ? 'bg-brand-accent text-slate-900' : 'bg-slate-800 text-slate-200'}`}
            onClick={() => onToolChange('pen')}
          >
            ペン
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${tool === 'eraser' ? 'bg-brand-accent text-slate-900' : 'bg-slate-800 text-slate-200'}`}
            onClick={() => onToolChange('eraser')}
          >
            消しゴム
          </button>
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">カラー</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`h-7 w-7 rounded-full border-2 ${color === preset ? 'border-brand-accent' : 'border-slate-700'}`}
              style={{ backgroundColor: preset }}
              onClick={() => onColorChange(preset)}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(event) => onColorChange(event.target.value)}
            className="h-7 w-12 rounded-md border border-slate-700 bg-slate-800"
          />
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">太さ</h3>
        <div className="mt-2 flex gap-2">
          {WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              className={`flex h-8 min-w-[44px] items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-semibold ${lineWidth === width ? 'ring-2 ring-brand-accent' : ''}`}
              onClick={() => onLineWidthChange(width)}
            >
              {width}px
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-full bg-slate-800 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          onClick={onUndo}
          disabled={!canUndo}
        >
          Undo
        </button>
        <button
          type="button"
          className="flex-1 rounded-full bg-slate-800 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          onClick={onRedo}
          disabled={!canRedo}
        >
          Redo
        </button>
      </div>
      <button
        type="button"
        className="rounded-full bg-rose-600 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  );
}
