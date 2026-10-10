// src/hooks/useComposeDraft.ts — yazma penceresi taslak durumu.
//
// App.tsx bu durumu 10 ayrı useState olarak taşıyordu (cFrom, cTo, cCc, cBcc,
// cSubject, cText, cHtml, cInReplyTo, cReferences, cFiles). ComposeModal bu
// değerleri props olarak aldığı için state tek yerde tutulmak zorundaydı.
//
// Bu hook davranışı BİREBİR korur; sadece yeri değişir:
// - Alan güncelleme ve toplu temizleme (gönderim sonrası)
// - `from` alanı temizlenMEZ (gönderimde `cFrom || activeAccount` kullanılır;
//   temizlenirse ikinci e-posta farklı hesaptan giderdi)
// - Yarım taslak localStorage'a yazılır, ancak otomatik geri yüklenmez — geri
//   yükleme yalnızca compose penceresi açılırken (restoreSaved) yapılır.
import { useCallback, useState } from 'react';
import type { ComposeFile } from '../types';

const STORAGE_KEY = 'postaci_active_draft';

export interface ComposeDraft {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo: string | undefined;
  references: string[] | undefined;
  files: ComposeFile[];
}

/** Yanıt/ileri şablonu yüklerken kullanılan alt küme */
export type DraftPatch = Partial<Omit<ComposeDraft, 'files'>>;

const EMPTY: ComposeDraft = {
  from: '',
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  text: '',
  html: '',
  inReplyTo: undefined,
  references: undefined,
  files: [],
};

function persist(d: ComposeDraft) {
  try {
    const hasContent =
      d.to.trim() || d.cc.trim() || d.bcc.trim() || d.subject.trim() || d.text.trim() || d.html.trim();
    if (!hasContent) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        from: d.from,
        to: d.to,
        cc: d.cc,
        bcc: d.bcc,
        subject: d.subject,
        text: d.text,
        html: d.html,
        updatedAt: Date.now(),
      })
    );
  } catch {}
}

export function useComposeDraft() {
  const [draft, setDraft] = useState<ComposeDraft>(EMPTY);

  const patch = useCallback((p: DraftPatch) => {
    setDraft((prev) => {
      const next = { ...prev, ...p };
      persist(next);
      return next;
    });
  }, []);

  /** Tek alan güncelleme (tüm ComposeModal props setter'ları buradan beslenir) */
  const setField = useCallback(
    <K extends keyof ComposeDraft>(key: K, value: ComposeDraft[K]) => {
      patch({ [key]: value } as DraftPatch);
    },
    [patch]
  );

  const setFiles = useCallback(
    (files: ComposeFile[]) => {
      setDraft((prev) => {
        const next = { ...prev, files };
        persist(next);
        return next;
      });
    },
    []
  );

  /** Tüm taslağı birden değiştirir (yanıt/ileri şablonu, hesap değişimi) */
  const replace = useCallback((p: DraftPatch & { files?: ComposeFile[] }) => {
    setDraft((prev) => {
      const next: ComposeDraft = { ...EMPTY, from: prev.from, ...p };
      persist(next);
      return next;
    });
  }, []);

  /**
   * Gönderim sonrası temizlik. `from` korunur, `files` korunmaz (yüklenen
   * eklentiler gönderildiği için temizlenmeli).
   */
  const clear = useCallback(() => {
    setDraft((prev) => {
      const next: ComposeDraft = {
        ...EMPTY,
        from: prev.from,
      };
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return next;
    });
  }, []);

  /**
   * Compose penceresi açılırken yarım taslağı geri yükler.
   * @returns geri yüklendiyse true (çağıran `setShowCompose(true)` yapar)
   */
  const restoreSaved = useCallback((): boolean => {
    let d: Partial<ComposeDraft> | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      d = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!d || !(d.to || d.cc || d.subject || d.text || d.html)) return false;
    setDraft((prev) => ({
      ...prev,
      from: d!.from ?? prev.from,
      to: d!.to ?? '',
      cc: d!.cc ?? '',
      subject: d!.subject ?? '',
      text: d!.text ?? '',
      html: d!.html ?? '',
      // Ekler diske yazılmaz; geri yüklemede liste boş başlar
      files: [],
    }));
    return true;
  }, []);

  return { draft, setField, setFiles, replace, clear, restoreSaved };
}