// src/hooks/useUndoSend.ts — Geri Al özellikli e-posta gönderim kuyruğu
//
// VERİ KAYBI SÖZLEŞMESİ (useUndoSend.test.tsx ile sabitlendi):
// - Gönderim hatası → içerik yazma penceresine GERİ YÜKLENİR (taslak, kuyruğa
//   girerken temizlendiği için aksi halde kullanıcı yazdığını kaybediyordu).
// - Geri alma penceresi (N sn) kalıcıdır: kuyruğa girerken payload
//   localStorage'a yazılır; pencere sırasında uygulama kapanırsa bir sonraki
//   açılışta restorePendingSend() ile kurtarılır. Gönderim/geri alma bitince
//   kayıt silinir. Kota dolarsa ekler olmadan kaydedilir (attachmentsSkipped).
import { useRef, useState } from 'react';
import type { ComposeFile, Msg } from '../types';
import { useTranslation } from '../i18n';

export interface SendPayload {
  fromEmail: string;
  to: string;
  cc: string;
  bcc?: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string;
  references?: string;
  attachments: ComposeFile[];
}

export interface UndoSendTask {
  id: string;
  countdown: number;
  payload: SendPayload;
}

// ── Kalıcı bekleyen gönderim (uygulama pencere sırasında kapansa bile) ────────
export const PENDING_SEND_KEY = 'postaci_pending_send';

export type PendingSend = SendPayload & { attachmentsSkipped?: boolean };

export function persistPendingSend(p: SendPayload) {
  try {
    localStorage.setItem(PENDING_SEND_KEY, JSON.stringify({ ...p, attachmentsSkipped: false }));
  } catch {
    // Kota aşıldı (büyük ekler): ekler olmadan kaydet — tüm e-postayı
    // kaybetmekten iyidir; kurtarımda attachmentsSkipped bayrağı söyler.
    try {
      localStorage.setItem(PENDING_SEND_KEY, JSON.stringify({ ...p, attachments: [], attachmentsSkipped: true }));
    } catch {}
  }
}

export function clearPendingSend() {
  try {
    localStorage.removeItem(PENDING_SEND_KEY);
  } catch {}
}

/** Uygulama açılışında çağrılır: yarım kalmış gönderimi döndürür ve kaydı temizler. */
export function restorePendingSend(): PendingSend | null {
  try {
    const raw = localStorage.getItem(PENDING_SEND_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_SEND_KEY);
    return JSON.parse(raw) as PendingSend;
  } catch {
    return null;
  }
}

interface UseUndoSendProps {
  onSendSuccess?: (payload: SendPayload) => void;
  onSendError?: (err: Error) => void;
  onRestoreCompose?: (payload: SendPayload) => void;
  selectedMsg?: Msg | null;
  activeAccount?: string | null;
  activeFolder?: string | null;
  setMessages?: React.Dispatch<React.SetStateAction<Msg[]>>;
  setSelected?: React.Dispatch<React.SetStateAction<Msg | null>>;
  setNotice?: (n: string | null) => void;
  setError?: (e: string | null) => void;
  undoDelaySeconds?: number;
}

export function useUndoSend({
  onRestoreCompose,
  selectedMsg,
  activeAccount,
  activeFolder,
  setMessages,
  setSelected,
  setNotice,
  setError,
  undoDelaySeconds,
}: UseUndoSendProps) {
  const { t } = useTranslation();
  const [undoTask, setUndoTask] = useState<UndoSendTask | null>(null);
  const [sending, setSending] = useState(false);
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doActualSend = async (payload: SendPayload) => {
    if (!window.postaci) return;
    setSending(true);
    setError?.(null);
    try {
      await window.postaci.mail.send({
        fromEmail: payload.fromEmail,
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        text: payload.text,
        html: payload.html || undefined,
        inReplyTo: payload.inReplyTo,
        references: payload.references,
        attachments: payload.attachments.map(({ filename, contentType, dataBase64 }) => ({
          filename,
          contentType,
          dataBase64,
        })),
      });
      setNotice?.(t('notice.emailSent'));
      // Gönderim tamamlandı: "uygulama kapanırsa kurtar" kaydına gerek kalmadı
      clearPendingSend();
      window.postaci.db.stats().catch(() => {});
      if (selectedMsg && String(selectedMsg.uid).startsWith('draft-') && activeAccount && activeFolder) {
        window.postaci.mail.delete(activeAccount, activeFolder, selectedMsg.uid).catch(() => {});
        setMessages?.((prev) => prev.filter((m) => m.uid !== selectedMsg.uid));
        setSelected?.(null);
      }
    } catch (e) {
      setError?.(e instanceof Error ? e.message : String(e));
      // Veri kaybını önle: taslak gönderim kuyruğa girerken temizlendi.
      // Hata durumunda içeriği yazma penceresine geri yükle ki kullanıcı
      // düzeltip tekrar gönderebilsin (yeniden yazmak zorunda kalmasın).
      onRestoreCompose?.(payload);
    } finally {
      setSending(false);
      setUndoTask(null);
    }
  };

  const queueSendWithUndo = (payload: SendPayload) => {
    if (!window.postaci) return;

    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);

    const delay = undoDelaySeconds !== undefined
      ? undoDelaySeconds
      : Number(localStorage.getItem('postaci_undo_send_delay') ?? 5);

    // Geri alma penceresi kapalıysa (0 sn) doğrudan gönder
    if (delay <= 0) {
      doActualSend(payload);
      return;
    }

    const taskId = Date.now().toString();
    setUndoTask({
      id: taskId,
      countdown: delay,
      payload,
    });
    // Geri sayım bellekte yaşıyor: bu pencerede uygulama kapanırsa e-posta ne
    // gider ne kalırdı. Kalıcı kayıt -> açılışta restorePendingSend() kurtarır.
    persistPendingSend(payload);

    let current = delay;
    undoIntervalRef.current = setInterval(() => {
      current -= 1;
      if (current <= 0) {
        if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
        doActualSend(payload);
      } else {
        setUndoTask((prev) => (prev ? { ...prev, countdown: current } : null));
      }
    }, 1000);
  };

  const handleUndoSend = () => {
    if (!undoTask) return;
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    const p = undoTask.payload;
    setUndoTask(null);
    // İçerik compose'a dönüyor; kurtarma kaydına gerek kalmadı (compose'un
    // otomatik taslak kaydı devralır).
    clearPendingSend();
    onRestoreCompose?.(p);
    setNotice?.(t('notice.undoSendRestored'));
  };

  const handleSendImmediately = () => {
    if (!undoTask) return;
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    doActualSend(undoTask.payload);
  };

  return {
    undoTask,
    sending,
    queueSendWithUndo,
    handleUndoSend,
    handleSendImmediately,
    doActualSend,
  };
}
