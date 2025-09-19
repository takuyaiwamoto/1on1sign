import { useEffect, useState } from 'react';
import { Role } from '../lib/types';

interface RoleSelectionProps {
  initialRoomId?: string;
  onCreateRoom: () => Promise<void>;
  onJoin: (role: Role, roomId: string) => void;
  loading?: boolean;
}

export function RoleSelection({ initialRoomId, onCreateRoom, onJoin, loading }: RoleSelectionProps) {
  const [role, setRole] = useState<Role>('writer');
  const [roomId, setRoomId] = useState(initialRoomId ?? '');

  useEffect(() => {
    if (initialRoomId !== undefined) {
      setRoomId(initialRoomId);
    }
  }, [initialRoomId]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-slate-950 px-4 py-12 text-slate-100">
      <div className="max-w-xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Online Sign System</h1>
        <p className="mt-3 text-sm text-slate-300">
          PC（書き手）とスマホ（受信）の2者間で映像・音声通話しながらリアルタイムでサインを共有できます。
        </p>
      </div>
      <div className="w-full max-w-xl rounded-3xl bg-slate-900/80 p-8 shadow-xl ring-1 ring-slate-700/60">
        <div className="flex items-center justify-center gap-4">
          <RoleButton label="Writer (PC)" description="描画と送信" active={role === 'writer'} onClick={() => setRole('writer')} />
          <RoleButton label="Receiver (スマホ)" description="サイン受信 + 保存" active={role === 'receiver'} onClick={() => setRole('receiver')} />
        </div>
        <div className="mt-6 space-y-4 text-left">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="roomId">
            ルームID
          </label>
          <input
            id="roomId"
            type="text"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            placeholder="例: abcd1234"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="flex-1 rounded-xl bg-brand-accent py-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-40"
              onClick={() => onJoin(role, roomId.trim())}
              disabled={loading || (role === 'receiver' && roomId.trim() === '')}
            >
              入室する
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl border border-slate-600 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
              onClick={onCreateRoom}
              disabled={loading}
            >
              新規ルームを作成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RoleButtonProps {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}

function RoleButton({ label, description, active, onClick }: RoleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-6 py-5 text-left transition ${
        active ? 'border-brand-accent bg-brand-accent/10 text-white' : 'border-slate-700 bg-slate-900 text-slate-300'
      }`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-slate-400">{description}</div>
    </button>
  );
}
