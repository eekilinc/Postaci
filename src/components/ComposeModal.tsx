import { useEffect, useRef, useState } from 'react';
import type { AccentKey, Account, ComposeFile } from '../types';
import { ACCENTS } from '../constants';
import { getAccountSignature } from '../utils/signatures';
import { PostaciLogo } from './PostaciLogo';
import {
  CloseIcon,
  AttachmentIcon,
  SaveIcon,
  SendIcon,
  ExternalLinkIcon,
  ComposeIcon,
  MinusIcon,
  MaximizeIcon,
  DraftIcon,
} from './icons';

interface ComposeModalProps {
  title: string;
  accounts: Account[];
  accent: AccentKey;
  cFrom: string;
  setCFrom: (v: string) => void;
  cTo: string;
  setCTo: (v: string) => void;
  cCc: string;
  setCCc: (v: string) => void;
  cSubject: string;
  setCSubject: (v: string) => void;
  cText: string;
  setCText: (v: string) => void;
  cHtml: string;
  setCHtml: (v: string) => void;
  cFiles: ComposeFile[];
  setCFiles: (f: ComposeFile[]) => void;
  sending: boolean;
  error: string | null;
  onDraftSaved?: (folderPath: string) => void;
  onSend: () => void;
  onClose: () => void;
}

function fmtSize(n: number) {
  return n > 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : n > 1024
    ? `${Math.round(n / 1024)} KB`
    : `${n} B`;
}

export function ComposeModal({
  title,
  accounts,
  accent,
  cFrom,
  setCFrom,
  cTo,
  setCTo,
  cCc,
  setCCc,
  cSubject,
  setCSubject,
  cText,
  setCText,
  cHtml,
  setCHtml,
  cFiles,
  setCFiles,
  sending,
  error,
  onDraftSaved,
  onSend,
  onClose,
}: ComposeModalProps) {
  const A = ACCENTS[accent];
  const [editorMode, setEditorMode] = useState<'rich' | 'plain'>('rich');
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  // Otomatik tamamlama (Recipient Autocomplete) state'leri
  const [suggestions, setSuggestions] = useState<{ name: string; email: string }[]>([]);
  const [activeField, setActiveField] = useState<'to' | 'cc' | null>(null);
  const [suggestionIdx, setSuggestionIdx] = useState(0);

  // Taslak state'leri & Küçültme (Minimize) & Onay Modal State'leri
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Editör içeriğini başlat ve senkronize tut
  useEffect(() => {
    if (!editorRef.current || isInternalUpdate.current) return;
    const initialContent = cHtml || (cText ? cText.replace(/\n/g, '<br>') : '');
    if (editorRef.current.innerHTML !== initialContent) {
      editorRef.current.innerHTML = initialContent;
    }
  }, [cHtml, cText, isMinimized, editorMode]);

  // Otomatik İmza Entegrasyonu (Yeni e-posta açıldığında)
  useEffect(() => {
    if (title === 'Yeni E-posta' && !cHtml && !cText) {
      const sig = getAccountSignature(cFrom);
      if (sig.enabled && sig.text) {
        const sigHtml = `<br><br><div class="postaci-signature" style="color:#666;font-size:13px;border-top:1px solid #e5e7eb;padding-top:6px;margin-top:12px;">${sig.text.replace(/\n/g, '<br>')}</div>`;
        setCHtml(sigHtml);
        setCText(`\n\n--\n${sig.text}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cFrom, title]);

  // Aktif taslağı localStorage'a periyodik kaydet (kazayla kapanmaya ve veri kaybına karşı tam koruma)
  useEffect(() => {
    if (title !== 'Yeni E-posta') return;
    const timer = setTimeout(() => {
      if (cTo.trim() || cCc.trim() || cSubject.trim() || cText.trim() || cHtml.trim()) {
        try {
          localStorage.setItem(
            'postaci_active_draft',
            JSON.stringify({
              from: cFrom,
              to: cTo,
              cc: cCc,
              subject: cSubject,
              text: cText,
              html: cHtml,
              updatedAt: Date.now(),
            })
          );
        } catch {}
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [cFrom, cTo, cCc, cSubject, cText, cHtml, title]);

  const searchRecipient = (val: string, field: 'to' | 'cc') => {
    setActiveField(field);
    const lastToken = val.split(',').pop()?.trim() || '';
    if (lastToken.length >= 2 && window.postaci?.contacts) {
      window.postaci.contacts.search(lastToken).then((res) => {
        setSuggestions(res || []);
        setSuggestionIdx(0);
      }).catch(() => setSuggestions([]));
    } else {
      setSuggestions([]);
    }
  };

  const selectContact = (c: { name: string; email: string }) => {
    const formatted = c.name && c.name !== c.email ? `"${c.name}" <${c.email}>` : c.email;
    if (activeField === 'to') {
      const parts = cTo.split(',');
      parts.pop();
      parts.push(parts.length > 0 ? ` ${formatted}` : formatted);
      setCTo(parts.join(',') + ', ');
    } else if (activeField === 'cc') {
      const parts = cCc.split(',');
      parts.pop();
      parts.push(parts.length > 0 ? ` ${formatted}` : formatted);
      setCCc(parts.join(',') + ', ');
    }
    setSuggestions([]);
    setActiveField(null);
  };

  const handleSaveDraft = async () => {
    if (!window.postaci?.mail.saveDraft) return;
    setSavingDraft(true);
    setDraftNotice(null);
    try {
      const res = await window.postaci.mail.saveDraft({
        email: cFrom,
        to: cTo,
        subject: cSubject,
        text: cText,
        html: cHtml,
      });
      if (res) {
        setDraftNotice(`✓ Taslak kaydedildi (${res.folderPath})`);
        onDraftSaved?.(res.folderPath);
        setTimeout(() => setDraftNotice(null), 2500);
      }
    } catch {
      setDraftNotice('✕ Taslak kaydedilemedi.');
      setTimeout(() => setDraftNotice(null), 2500);
    } finally {
      setSavingDraft(false);
    }
  };

  const hasContent = Boolean(
    cTo.trim() || cCc.trim() || cSubject.trim() || cText.trim() || cHtml.trim() || cFiles.length > 0
  );

  const handleClosePrompt = () => {
    if (hasContent && !sending) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  const handleKeepDraftAndClose = () => {
    if (title === 'Yeni E-posta') {
      try {
        localStorage.setItem(
          'postaci_active_draft',
          JSON.stringify({
            from: cFrom,
            to: cTo,
            cc: cCc,
            subject: cSubject,
            text: cText,
            html: cHtml,
            updatedAt: Date.now(),
          })
        );
      } catch {}
    }
    handleSaveDraft().catch(() => {});
    setShowDiscardConfirm(false);
    onClose();
  };

  const handleDiscardAndClose = () => {
    localStorage.removeItem('postaci_active_draft');
    setShowDiscardConfirm(false);
    onClose();
  };

  // Escape tuşunu güvenli şekilde yakala (yanlışlıkla kapanmayı ve veri kaybını kesin engeller)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiscardConfirm) {
          e.preventDefault();
          e.stopPropagation();
          setShowDiscardConfirm(false);
          return;
        }
        if (suggestions.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setSuggestions([]);
          setActiveField(null);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handleClosePrompt();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [showDiscardConfirm, suggestions.length, hasContent, sending]);

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    isInternalUpdate.current = true;
    const html = editorRef.current.innerHTML;
    const text = editorRef.current.innerText || editorRef.current.textContent || '';
    setCHtml(html);
    setCText(text);
    setTimeout(() => {
      isInternalUpdate.current = false;
    }, 50);
  };

  const handleMinimize = () => {
    handleEditorInput();
    setIsMinimized(true);
  };

  const handleMaximize = () => {
    setIsMinimized(false);
    setTimeout(() => {
      if (editorRef.current) {
        const initialContent = cHtml || (cText ? cText.replace(/\n/g, '<br>') : '');
        if (!editorRef.current.innerHTML) {
          editorRef.current.innerHTML = initialContent;
        }
        editorRef.current.focus();
      }
    }, 50);
  };

  const exec = (cmd: string, value: string | undefined = undefined) => {
    if (editorRef.current) {
      editorRef.current.focus();
    }
    document.execCommand(cmd, false, value);
    handleEditorInput();
  };

  const handleAddLink = () => {
    const url = prompt('Bağlantı adresi (URL) girin:');
    if (url) {
      const href = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') ? url : `https://${url}`;
      exec('createLink', href);
    }
  };

  const handleInsertSignature = () => {
    const sig = getAccountSignature(cFrom);
    if (!sig.text) {
      alert('Bu hesap için kayıtlı bir imza bulunamadı. Ayarlar > İmzalar sekmesinden ekleyebilirsiniz.');
      return;
    }
    const sigHtml = `<br><br><div class="postaci-signature" style="color:#666;font-size:13px;border-top:1px solid #e5e7eb;padding-top:6px;margin-top:12px;">${sig.text.replace(/\n/g, '<br>')}</div>`;
    exec('insertHTML', sigHtml);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter veya Cmd+Enter ile doğrudan gönder
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!sending && cTo.trim() && (cText.trim() || cHtml.trim())) {
        onSend();
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault();
        exec('bold');
      } else if (e.key === 'i') {
        e.preventDefault();
        exec('italic');
      } else if (e.key === 'u') {
        e.preventDefault();
        exec('underline');
      } else if (e.key === 'k') {
        e.preventDefault();
        handleAddLink();
      }
    }
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files) return;
    const MAX = 20 * 1024 * 1024;
    const current = cFiles.reduce((n, f) => n + f.size, 0);
    const out = [...cFiles];
    for (const f of Array.from(files)) {
      if (current + out.reduce((n, x) => n + x.size, 0) + f.size > MAX) {
        break;
      }
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 8192)
        bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      out.push({
        filename: f.name,
        contentType: f.type || 'application/octet-stream',
        dataBase64: btoa(bin),
        size: f.size,
      });
    }
    setCFiles(out);
  };

  return (
    <>
      {/* 1. Küçültülmüş (Minimized) Kayan Dock Bar */}
      {isMinimized && (
        <div className="fixed bottom-4 right-6 z-50 flex items-center gap-3 rounded-2xl border border-zinc-200/90 bg-white/95 px-4 py-2.5 shadow-2xl backdrop-blur-md dark:border-zinc-700/90 dark:bg-zinc-800/95 animate-in fade-in slide-in-from-bottom-3 duration-200 select-none">
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={handleMaximize}
            title="Büyütmek için tıklayın"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <ComposeIcon size={15} />
            </div>
            <div className="flex flex-col max-w-[220px]">
              <span className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-500 transition-colors">
                {cSubject.trim() || 'Yeni E-posta (Taslak)'}
              </span>
              <span className="truncate text-[10px] text-zinc-400">
                {cTo ? `Kime: ${cTo}` : 'Yazmaya devam etmek için tıklayın'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 border-l border-zinc-200 pl-2 dark:border-zinc-700">
            <button
              onClick={handleMaximize}
              title="Pencereyi Genişlet"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 transition"
            >
              <MaximizeIcon size={14} />
            </button>
            <button
              onClick={handleClosePrompt}
              title="Kapat"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 2. Ana Compose Modalı (Küçültüldüğünde DOM'dan silinmez, gizlenir — böylece editör içeriği asla kaybolmaz) */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 ${
          isMinimized ? 'hidden pointer-events-none' : ''
        }`}
        style={isMinimized ? { display: 'none' } : undefined}
      >
        <div
          className="relative flex max-h-[92vh] w-[42rem] max-w-[95vw] flex-col rounded-xl bg-white p-5 shadow-2xl dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PostaciLogo size="xs" />
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-[11px] text-zinc-400">Ctrl+Enter ile Gönder</span>
              <button
                type="button"
                onClick={handleMinimize}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
                title="Simge durumuna küçült"
              >
                <MinusIcon size={16} />
              </button>
              <button
                type="button"
                onClick={handleClosePrompt}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
                title="Kapat"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          </div>

        <div className="space-y-2.5 overflow-y-auto pr-1">
          {/* Kimden */}
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs font-medium text-zinc-500">Kimden</span>
            <select
              value={cFrom}
              onChange={(e) => setCFrom(e.target.value)}
              className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.email}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>

          {/* Kime */}
          <div className="relative flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs font-medium text-zinc-500">Kime</span>
            <input
              value={cTo}
              onChange={(e) => {
                setCTo(e.target.value);
                searchRecipient(e.target.value, 'to');
              }}
              onFocus={() => searchRecipient(cTo, 'to')}
              onBlur={() => setTimeout(() => setActiveField(null), 200)}
              onKeyDown={(e) => {
                if (suggestions.length > 0 && activeField === 'to') {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSuggestionIdx((i) => Math.min(suggestions.length - 1, i + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSuggestionIdx((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    selectContact(suggestions[suggestionIdx]);
                  } else if (e.key === 'Escape') {
                    setSuggestions([]);
                    setActiveField(null);
                  }
                }
              }}
              placeholder="ornek@eposta.com (virgülle birden fazla)"
              className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
            {suggestions.length > 0 && activeField === 'to' && (
              <div className="absolute top-full left-16 z-50 mt-1 max-h-48 w-80 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase">Önerilen Kişiler</div>
                {suggestions.map((s, idx) => (
                  <button
                    key={`${s.email}-${idx}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectContact(s);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex flex-col transition ${
                      idx === suggestionIdx
                        ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/80 dark:text-blue-200'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    <span className="font-semibold truncate">{s.name}</span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{s.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cc */}
          <div className="relative flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs font-medium text-zinc-500">Cc</span>
            <input
              value={cCc}
              onChange={(e) => {
                setCCc(e.target.value);
                searchRecipient(e.target.value, 'cc');
              }}
              onFocus={() => searchRecipient(cCc, 'cc')}
              onBlur={() => setTimeout(() => setActiveField(null), 200)}
              onKeyDown={(e) => {
                if (suggestions.length > 0 && activeField === 'cc') {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSuggestionIdx((i) => Math.min(suggestions.length - 1, i + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSuggestionIdx((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    selectContact(suggestions[suggestionIdx]);
                  } else if (e.key === 'Escape') {
                    setSuggestions([]);
                    setActiveField(null);
                  }
                }
              }}
              placeholder="(isteğe bağlı)"
              className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
            {suggestions.length > 0 && activeField === 'cc' && (
              <div className="absolute top-full left-16 z-50 mt-1 max-h-48 w-80 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase">Önerilen Kişiler</div>
                {suggestions.map((s, idx) => (
                  <button
                    key={`${s.email}-${idx}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectContact(s);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex flex-col transition ${
                      idx === suggestionIdx
                        ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/80 dark:text-blue-200'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    <span className="font-semibold truncate">{s.name}</span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{s.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Konu */}
          <input
            value={cSubject}
            onChange={(e) => setCSubject(e.target.value)}
            placeholder="Konu"
            className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />

          {/* Biçimlendirme Araç Çubuğu */}
          <div className="flex flex-wrap items-center justify-between gap-1 rounded-t-md border border-b-0 border-zinc-300 bg-zinc-100/80 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800/80">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => exec('bold')}
                className="h-7 w-7 rounded font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700"
                title="Kalın (Ctrl+B)"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => exec('italic')}
                className="h-7 w-7 rounded italic font-serif hover:bg-zinc-200 dark:hover:bg-zinc-700"
                title="İtalik (Ctrl+I)"
              >
                I
              </button>
              <button
                type="button"
                onClick={() => exec('underline')}
                className="h-7 w-7 rounded underline hover:bg-zinc-200 dark:hover:bg-zinc-700"
                title="Altı Çizili (Ctrl+U)"
              >
                U
              </button>
              <button
                type="button"
                onClick={() => exec('strikeThrough')}
                className="h-7 w-7 rounded line-through hover:bg-zinc-200 dark:hover:bg-zinc-700"
                title="Üstü Çizili"
              >
                S
              </button>

              <span className="mx-1 h-4 w-px bg-zinc-300 dark:bg-zinc-700" />

              <button
                type="button"
                onClick={() => exec('insertUnorderedList')}
                className="h-7 px-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs"
                title="Madde İşaretli Liste"
              >
                • Liste
              </button>
              <button
                type="button"
                onClick={() => exec('insertOrderedList')}
                className="h-7 px-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs"
                title="Numaralı Liste"
              >
                1. Liste
              </button>
              <button
                type="button"
                onClick={() => exec('formatBlock', '<blockquote>')}
                className="h-7 w-7 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs"
                title="Alıntı Blok"
              >
                ❝
              </button>

              <span className="mx-1 h-4 w-px bg-zinc-300 dark:bg-zinc-700" />

              <button
                type="button"
                onClick={handleAddLink}
                className="h-7 px-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs inline-flex items-center gap-1"
                title="Bağlantı Ekle (Ctrl+K)"
              >
                <ExternalLinkIcon size={12} />
                <span>Link</span>
              </button>
              <button
                type="button"
                onClick={handleInsertSignature}
                className="h-7 px-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs inline-flex items-center gap-1"
                title="Hesap İmzasını Ekle"
              >
                <ComposeIcon size={12} />
                <span>İmza</span>
              </button>
              <button
                type="button"
                onClick={() => exec('removeFormat')}
                className="h-7 px-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-500"
                title="Biçimlendirmeyi Temizle"
              >
                Tx
              </button>
            </div>

            <button
              type="button"
              onClick={() => setEditorMode(editorMode === 'rich' ? 'plain' : 'rich')}
              className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              {editorMode === 'rich' ? 'Düz Metin' : 'Zengin Metin'}
            </button>
          </div>

          {/* Editör Gövdesi */}
          {editorMode === 'rich' ? (
            <div
              ref={editorRef}
              contentEditable
              onInput={handleEditorInput}
              data-placeholder="İletinizi buraya yazın..."
              className="min-h-[180px] max-h-[280px] overflow-y-auto rounded-b-md border border-zinc-300 bg-zinc-50 p-3 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 empty:before:content-[attr(data-placeholder)] empty:before:text-zinc-400"
            />
          ) : (
            <textarea
              value={cText}
              onChange={(e) => {
                setCText(e.target.value);
                setCHtml(e.target.value.replace(/\n/g, '<br>'));
              }}
              placeholder="İletinizi düz metin olarak yazın..."
              rows={8}
              className="w-full rounded-b-md border border-zinc-300 bg-zinc-50 p-3 text-sm font-mono outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
          )}

          {/* Dosya ekleri */}
          <div>
            <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 transition">
              <AttachmentIcon size={13} />
              <span>Dosya Ekle</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  pickFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {cFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cFiles.map((f, i) => (
                  <div
                    key={`${f.filename}-${i}`}
                    className="flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                  >
                    <span className="truncate max-w-[180px] font-medium">{f.filename}</span>
                    <span className="text-[10px] text-zinc-500">({fmtSize(f.size)})</span>
                    <button
                      type="button"
                      onClick={() => setCFiles(cFiles.filter((_, j) => j !== i))}
                      className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 ml-1 p-0.5"
                      title="Kaldır"
                    >
                      <CloseIcon size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Hata Mesajı */}
        {/* Bildirim / Hata Mesajı */}
        {draftNotice && (
          <p className="mt-2.5 rounded-md bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {draftNotice}
          </p>
        )}
        {error && (
          <p className="mt-2.5 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {/* Butonlar */}
        <div className="mt-3.5 flex items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClosePrompt}
              className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingDraft || (!cSubject.trim() && !cText.trim() && !cHtml.trim())}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1.5"
              title="Taslak olarak kaydet"
            >
              <SaveIcon size={14} />
              <span>{savingDraft ? 'Kaydediliyor...' : 'Taslak Kaydet'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onSend}
            disabled={sending || !cTo.trim() || (!cText.trim() && !cHtml.trim())}
            className={`rounded-lg ${A.btn} px-5 py-2 text-sm font-medium text-white disabled:opacity-50 transition shadow-xs flex items-center justify-center gap-1.5`}
          >
            <SendIcon size={14} />
            <span>{sending ? 'Gönderiliyor...' : 'Gönder'}</span>
          </button>
        </div>

        {/* Onaysız Kapatmayı Önleme & Taslak Saklama Diyaloğu */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-xs p-6 animate-in fade-in duration-150">
            <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-800">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                  <DraftIcon size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Taslak Saklansın mı?
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Yazdıklarınız kaybolmasın
                  </p>
                </div>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                Yazdığınız e-postada kaydedilmemiş içerik bulunuyor. Taslağı koruyarak daha sonra kaldığınız yerden devam edebilirsiniz.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleKeepDraftAndClose}
                  className={`w-full rounded-lg ${A.btn} py-2 text-xs font-semibold text-white shadow-xs transition flex items-center justify-center gap-1.5`}
                >
                  <SaveIcon size={13} />
                  <span>Taslağı Koru ve Kapat</span>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDiscardAndClose}
                    className="flex-1 rounded-lg border border-red-200 bg-red-50/50 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40 transition"
                  >
                    Sil ve Kapat
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(false)}
                    className="flex-1 rounded-lg border border-zinc-200 bg-zinc-100 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:border-zinc-750 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 transition"
                  >
                    Yazmaya Devam Et
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </>
);
}
