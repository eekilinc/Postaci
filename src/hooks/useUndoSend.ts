// src/hooks/useUndoSend.ts — Geri Al özellikli e-posta gönderim kuyruğu
import { useRef, useState } from 'react';
import type { ComposeFile, Msg } from '../types';

export interface SendPayload {
  fromEmail: string;
  to: string;
  cc: string;
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
}: UseUndoSendProps) {
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
      setNotice?.('E-posta başarıyla gönderildi.');
      window.postaci.db.stats().catch(() => {});
      if (selectedMsg && String(selectedMsg.uid).startsWith('draft-') && activeAccount && activeFolder) {
        window.postaci.mail.delete(activeAccount, activeFolder, selectedMsg.uid).catch(() => {});
        setMessages?.((prev) => prev.filter((m) => m.uid !== selectedMsg.uid));
        setSelected?.(null);
      }
    } catch (e) {
      setError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
      setUndoTask(null);
    }
  };

  const queueSendWithUndo = (payload: SendPayload) => {
    if (!window.postaci) return;

    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);

    const taskId = Date.now().toString();
    setUndoTask({
      id: taskId,
      countdown: 5,
      payload,
    });

    let current = 5;
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
    onRestoreCompose?.(p);
    setNotice?.('Gönderim geri alındı. İletinizi düzenlemeye devam edebilirsiniz.');
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
