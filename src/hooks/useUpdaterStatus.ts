// src/hooks/useUpdaterStatus.ts — otomatik güncelleme durumu (preload köprüsü)
// electron-updater olaylarını dinler: checking|available|downloading|
// downloaded|none|error. Köprü yoksa (web önizleme) sessizce boş döner.
import { useEffect, useState } from 'react';

export type UpdaterState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'none'
  | 'error';

export interface UpdaterStatus {
  state: UpdaterState;
  version: string | null;
  percent: number;
  message: string | null;
}

const IDLE: UpdaterStatus = { state: 'idle', version: null, percent: 0, message: null };

export function useUpdaterStatus(): UpdaterStatus {
  const [status, setStatus] = useState<UpdaterStatus>(IDLE);

  useEffect(() => {
    const updater = window.postaci?.updater;
    if (!updater?.onStatus) return;
    return updater.onStatus((data) => {
      setStatus({
        state: (data?.state as UpdaterState) || 'idle',
        version: data?.version ?? null,
        percent: data?.percent ?? 0,
        message: data?.message ?? null,
      });
    });
  }, []);

  return status;
}
