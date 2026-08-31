import { useCallback, useEffect, useRef, useState } from 'react';
export function useUndoSend(isOpen: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pending = useRef<{ timer: ReturnType<typeof setInterval>; reject: (err: Error) => void }>();
  const cancel = useCallback(() => {
    if (!pending.current) return;
    clearInterval(pending.current.timer);
    pending.current.reject(new DOMException('Gönderim geri alındı.', 'AbortError'));
    pending.current = undefined;
    setSecondsLeft(0);
  }, []);
  const wait = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let remaining = Math.max(0, Math.min(30, seconds));
      setSecondsLeft(remaining);
      const timer = setInterval(() => {
        remaining--; setSecondsLeft(remaining);
        if (remaining <= 0) { clearInterval(timer); pending.current = undefined; resolve(); }
      }, 1000);
      pending.current = { timer, reject };
    });
  }, []);
  useEffect(() => { if (!isOpen) cancel(); }, [isOpen, cancel]);
  useEffect(() => cancel, [cancel]);
  return { secondsLeft, wait, cancel };
}
