// src/hooks/useMessageBody.ts — seçili mesaj gövdesi, gizlilik koruması, ekler ve thread
import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import type { Attachment, BodyResult, Msg } from '../types';

export function useMessageBody() {
  const [body, setBody] = useState<BodyResult>(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [savingAtt, setSavingAtt] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<{ filename: string; contentType: string; dataBase64: string; index: number } | null>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);

  const hasRemoteImages = useMemo(() => {
    const html = body?.html;
    if (!html) return false;
    return /<img[^>]+src=["']https?:\/\//i.test(html);
  }, [body]);

  const safeHtml = useMemo(() => {
    const html = body?.html;
    if (!html) return '';
    const sanitized = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
    if (!allowRemoteImages) {
      return sanitized.replace(
        /<img([^>]*)\ssrc=["'](https?:\/\/[^"']+)["']([^>]*)>/gi,
        (_match, _before, src) => {
          return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-800/50 text-[10px] text-zinc-400 select-none my-0.5" title="Harici görsel engellendi (${src})">[Görsel gizlendi]</span>`;
        },
      );
    }
    return sanitized;
  }, [body, allowRemoteImages]);

  const resetBody = () => {
    setBody(null);
    setBodyError(null);
    setAtts([]);
    setThread([]);
    setAllowRemoteImages(false);
    setPreviewData(null);
  };

  const loadBody = (
    selected: Msg,
    activeAccount: string,
    activeFolder: string,
    setMessages: React.Dispatch<React.SetStateAction<Msg[]>>,
    setSelected: React.Dispatch<React.SetStateAction<Msg | null>>,
  ) => {
    let cancelled = false;
    resetBody();
    setBodyLoading(true);

    window.postaci!.mail
      .body(activeAccount, activeFolder, selected.uid)
      .then((b) => {
        if (cancelled) return;
        setBody({ html: b.html, text: b.text });
        if (!b.html && !b.text) setBodyError('Sunucu boş gövde döndürdü.');

        // Ekler
        window.postaci
          ?.mail.attachments(activeAccount, activeFolder, selected.uid)
          .then((l) => {
            if (!cancelled) setAtts(l);
          })
          .catch(() => {});

        // Okundu işaretle
        if (!selected.is_read) {
          window.postaci
            ?.mail.markRead(activeAccount, activeFolder, selected.uid)
            .catch(() => {});
          setMessages((prev) =>
            prev.map((m) =>
              m.uid === selected.uid ? { ...m, is_read: 1 } : m,
            ),
          );
          setSelected({ ...selected, is_read: 1 });
        }

        // Thread / iplik
        if (b.messageId) {
          window.postaci
            ?.mail.thread(activeAccount, activeFolder, b.messageId)
            .then((t) => {
              if (!cancelled)
                setThread(t.filter((x) => x.message_id && x.message_id !== b.messageId));
            })
            .catch(() => {});
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setBody({ html: null, text: null });
          setBodyError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setBodyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  };

  const saveAttachment = async (
    activeAccount: string,
    activeFolder: string,
    uid: string,
    index: number,
    setError: (e: string | null) => void,
    setNotice: (n: string | null) => void,
  ) => {
    if (!window.postaci) return;
    setSavingAtt(index);
    try {
      const r = await window.postaci.mail.attachmentSave(
        activeAccount,
        activeFolder,
        uid,
        index,
      );
      if (r.saved) setNotice(`Kaydedildi: ${r.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAtt(null);
    }
  };

  const previewAttachment = async (
    activeAccount: string,
    activeFolder: string,
    uid: string,
    index: number,
    setError: (e: string | null) => void,
  ) => {
    if (!window.postaci) return;
    setLoadingPreview(index);
    try {
      const data = await window.postaci.mail.attachmentPreview(
        activeAccount,
        activeFolder,
        uid,
        index,
      );
      setPreviewData({ ...data, index });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingPreview(null);
    }
  };

  return {
    body,
    bodyLoading,
    bodyError,
    atts,
    savingAtt,
    loadingPreview,
    previewData,
    setPreviewData,
    thread,
    safeHtml,
    hasRemoteImages,
    allowRemoteImages,
    setAllowRemoteImages,
    resetBody,
    loadBody,
    saveAttachment,
    previewAttachment,
  };
}
