// src/components/UndoSendBar.tsx — Kayan Gönderimi Geri Al (Undo Send) Bildirim Çubuğu
import { memo } from 'react';
import { MailIcon, UndoIcon, SendIcon } from './icons';
import type { UndoSendTask } from '../hooks/useUndoSend';

interface UndoSendBarProps {
  task: UndoSendTask;
  sending: boolean;
  onUndo: () => void;
  onSendImmediately: () => void;
}

export const UndoSendBar = memo(function UndoSendBar({
  task,
  sending,
  onUndo,
  onSendImmediately,
}: UndoSendBarProps) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900/95 px-5 py-2.5 text-sm text-white shadow-2xl backdrop-blur-md dark:border-zinc-700 animate-fadeIn select-none">
      <div className="flex items-center gap-2">
        <MailIcon size={16} className="animate-pulse text-blue-400" />
        <span>
          {sending ? 'Gönderiliyor...' : `E-posta gönderiliyor... (${task.countdown}s)`}
        </span>
      </div>

      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-700">
        <div
          className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
          style={{ width: `${(task.countdown / 5) * 100}%` }}
        />
      </div>

      {!sending && (
        <div className="flex items-center gap-1.5 pl-1">
          <button
            type="button"
            onClick={onUndo}
            className="rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-zinc-950 transition hover:bg-amber-400 active:scale-95 inline-flex items-center gap-1 cursor-pointer"
          >
            <UndoIcon size={13} />
            <span>Geri Al</span>
          </button>
          <button
            type="button"
            onClick={onSendImmediately}
            className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:bg-zinc-700 hover:text-white inline-flex items-center gap-1 cursor-pointer"
            title="Beklemeden şimdi gönder"
          >
            <span>Hemen Gönder</span>
            <SendIcon size={12} />
          </button>
        </div>
      )}
    </div>
  );
});
