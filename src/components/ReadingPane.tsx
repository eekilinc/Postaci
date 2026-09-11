/// src/components/ReadingPane.tsx — Modern, modüler e-posta okuma paneli
import { useMemo, useRef, useState } from 'react';
import type { Attachment, BodyResult, ComposeFile, Folder, Msg } from '../types';
import { organizeAndDeduplicateFolders } from '../utils/folders';
import { EmptyState } from './EmptyState';
import { ReadingToolbar } from './ReadingToolbar';
import { SenderCard } from './SenderCard';
import {
  ShieldIcon,
  AttachmentIcon,
  FilePdfIcon,
  FileImageIcon,
  FileTextIcon,
  FileTableIcon,
  FileZipIcon,
  FileAudioIcon,
  FileVideoIcon,
  EyeIcon,
  DownloadIcon,
  SyncIcon,
  SparklesIcon,
  ReplyIcon,
  ReplyAllIcon,
  ExternalLinkIcon,
  CloseIcon,
  SendIcon,
} from './icons';

interface ReadingPaneProps {
  selected: Msg | null;
  body: BodyResult;
  bodyLoading: boolean;
  bodyError: string | null;
  safeHtml: string;
  hasRemoteImages: boolean;
  allowRemoteImages: boolean;
  onAllowRemoteImages: () => void;
  atts: Attachment[];
  savingAtt: number | null;
  loadingPreview: number | null;
  thread: any[];
  onReply: () => void;
  onForward: () => void;
  onToggleRead: () => void;
  onSaveAttachment: (index: number) => void;
  onPreviewAttachment: (index: number) => void;
  onExportEml?: () => void;
  onEditDraft?: () => void;
  onDeleteCurrent?: () => void;
  onArchiveCurrent?: () => void;
  onMoveCurrent?: (toFolder: string) => void;
  onToggleStarCurrent?: () => void;
  folders?: Folder[];
  onBackToList?: () => void;
  onSendQuickReply?: (data: { text: string; files: ComposeFile[]; replyAll: boolean }) => Promise<void>;
  onExpandToFullCompose?: (text: string, files: ComposeFile[], replyAll: boolean) => void;
  quickSending?: boolean;
}

function fmtSize(n: number) {
  return n > 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : n > 1024
    ? `${Math.round(n / 1024)} KB`
    : `${n} B`;
}

function getAttachmentMeta(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext))
    return {
      renderIcon: () => <FilePdfIcon size={18} />,
      color: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800/60',
    };
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext))
    return {
      renderIcon: () => <FileImageIcon size={18} />,
      color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
    };
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(ext))
    return {
      renderIcon: () => <FileTextIcon size={18} />,
      color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
    };
  if (['xls', 'xlsx', 'csv'].includes(ext))
    return {
      renderIcon: () => <FileTableIcon size={18} />,
      color: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 border-teal-200 dark:border-teal-800/60',
    };
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return {
      renderIcon: () => <FileZipIcon size={18} />,
      color: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
    };
  if (['mp3', 'wav', 'ogg'].includes(ext))
    return {
      renderIcon: () => <FileAudioIcon size={18} />,
      color: 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800/60',
    };
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext))
    return {
      renderIcon: () => <FileVideoIcon size={18} />,
      color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
    };
  return {
    renderIcon: () => <AttachmentIcon size={18} />,
    color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
  };
}

export function ReadingPane({
  selected,
  body,
  bodyLoading,
  bodyError,
  safeHtml,
  hasRemoteImages,
  allowRemoteImages,
  onAllowRemoteImages,
  atts,
  savingAtt,
  loadingPreview,
  thread,
  onReply,
  onForward,
  onToggleRead,
  onSaveAttachment,
  onPreviewAttachment,
  onExportEml,
  onEditDraft,
  onDeleteCurrent,
  onArchiveCurrent,
  onMoveCurrent,
  onToggleStarCurrent,
  folders = [],
  onBackToList,
  onSendQuickReply,
  onExpandToFullCompose,
  quickSending = false,
}: ReadingPaneProps) {
  const [quickText, setQuickText] = useState('');
  const [quickFiles, setQuickFiles] = useState<ComposeFile[]>([]);
  const [replyAll, setReplyAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const moveCandidateFolders = useMemo(() => {
    const isGoogle = selected?.account_email?.includes('gmail') || selected?.account_provider === 'google';
    const { allDisplayFolders } = organizeAndDeduplicateFolders(folders, selected?.folder_path, isGoogle);
    return allDisplayFolders;
  }, [folders, selected?.folder_path, selected?.account_email, selected?.account_provider]);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    for (const f of Array.from(list)) {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1] || '';
        setQuickFiles((prev) => [
          ...prev,
          {
            filename: f.name,
            contentType: f.type || 'application/octet-stream',
            dataBase64: b64,
            size: f.size,
          },
        ]);
      };
      reader.readAsDataURL(f);
    }
  };

  const handleSend = async () => {
    if (!quickText.trim() || !onSendQuickReply) return;
    await onSendQuickReply({ text: quickText, files: quickFiles, replyAll });
    setQuickText('');
    setQuickFiles([]);
  };

  if (!selected) {
    return (
      <main className="flex-1 overflow-y-auto bg-zinc-50/50 p-6 dark:bg-zinc-950">
        <EmptyState type="no-selection" />
      </main>
    );
  }

  const isTrash = /trash|çöp|deleted|bin/i.test(selected.folder_path || '');
  const isDraft = selected.uid.startsWith('draft-') || /draft|taslak/i.test(selected.folder_path || '');

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden bg-white p-4 sm:p-6 dark:bg-zinc-900 transition-colors min-w-0">
      <div className="max-w-4xl mx-auto space-y-4 min-w-0 w-full">
        {/* 1. Üst Eylem Çubuğu */}
        <ReadingToolbar
          isRead={!!selected.is_read}
          isTrash={isTrash}
          isDraft={isDraft}
          folders={moveCandidateFolders}
          currentFolder={selected.folder_path}
          onBackToList={onBackToList}
          onReply={onReply}
          onForward={onForward}
          onToggleRead={onToggleRead}
          onArchive={onArchiveCurrent}
          onDelete={onDeleteCurrent}
          onMove={onMoveCurrent}
          onExportEml={onExportEml}
          onEditDraft={onEditDraft}
        />

        {/* 2. Konu Başlığı */}
        <div className="pt-1.5 pb-0.5">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-snug">
            {selected.subject || '(konusuz)'}
          </h1>
        </div>

        {/* 3. Gönderen & Alıcı Profil Kartı */}
        <SenderCard
          msg={selected}
          starred={!!selected.starred}
          onToggleStar={onToggleStarCurrent}
        />

        {/* 4. Uzak Görseller Gizlilik Bildirimi */}
        {hasRemoteImages && !allowRemoteImages && (
          <div className="flex items-center justify-between rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-xs text-amber-900 shadow-2xs dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-200 print:hidden animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <ShieldIcon size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Gizliliğinizi korumak için bu iletideki harici görseller engellendi.</span>
            </div>
            <button
              type="button"
              onClick={onAllowRemoteImages}
              className="rounded-xl bg-amber-800 px-3 py-1.5 font-semibold text-white shadow-2xs transition hover:bg-amber-900 dark:bg-amber-700 dark:hover:bg-amber-600 shrink-0"
            >
              Görselleri Göster
            </button>
          </div>
        )}

        {/* 5. Ek Dosyalar Bölümü (Renkli Rozetler) */}
        {atts.length > 0 && (
          <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/60 p-4 dark:border-zinc-800/80 dark:bg-zinc-850/40 print:hidden">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Ek Dosyalar ({atts.length})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {atts.map((a) => {
                const meta = getAttachmentMeta(a.filename);
                return (
                  <div
                    key={a.idx}
                    className={`flex items-center justify-between gap-2.5 rounded-xl border p-2.5 text-xs shadow-2xs transition hover:shadow-xs ${meta.color}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="shrink-0">{meta.renderIcon()}</span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold" title={a.filename}>
                          {a.filename}
                        </div>
                        <div className="text-[10px] opacity-75">{fmtSize(a.size)}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onPreviewAttachment(a.idx)}
                        disabled={loadingPreview === a.idx}
                        className="rounded-lg p-1.5 text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800 shadow-2xs transition disabled:opacity-50"
                        title="Önizle"
                      >
                        {loadingPreview === a.idx ? <SyncIcon size={13} className="animate-spin" /> : <EyeIcon size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSaveAttachment(a.idx)}
                        disabled={savingAtt === a.idx}
                        className="rounded-lg p-1.5 text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800 shadow-2xs transition disabled:opacity-50"
                        title="İndir / Kaydet"
                      >
                        {savingAtt === a.idx ? <SyncIcon size={13} className="animate-spin" /> : <DownloadIcon size={13} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 6. E-posta Gövdesi */}
        <div className="py-2.5 min-w-0 max-w-full overflow-hidden">
          {bodyLoading ? (
            <div className="flex items-center gap-2.5 text-xs text-zinc-400 py-8">
              <SyncIcon size={16} className="animate-spin text-blue-500" />
              <span>İleti içeriği yükleniyor...</span>
            </div>
          ) : safeHtml ? (
            <div
              className="mail-body text-zinc-900 dark:text-zinc-100 selection:bg-blue-100 dark:selection:bg-blue-900/60 leading-relaxed min-w-0 max-w-full overflow-x-auto break-words"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          ) : body?.text ? (
            <pre className="mail-body whitespace-pre-wrap font-sans text-sm text-zinc-900 dark:text-zinc-100 leading-relaxed min-w-0 max-w-full overflow-x-auto break-words">
              {body.text}
            </pre>
          ) : (
            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400">
              {bodyError ? `Gövde alınamadı: ${bodyError}` : 'İleti içeriği henüz çekilmedi. Eşitlemeyi deneyin.'}
            </div>
          )}
        </div>

        {/* 7. İleti Dizisi / Thread Geçmişi */}
        {thread && thread.length > 1 && (
          <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 print:hidden">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
              İleti Dizisi ({thread.length} ileti)
            </h3>
            <div className="space-y-2">
              {thread.map((tm: any) => (
                <div
                  key={tm.uid}
                  className={`rounded-xl border p-3 text-xs transition ${
                    tm.uid === selected.uid
                      ? 'border-blue-300 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20'
                      : 'border-zinc-200/80 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-850/30'
                  }`}
                >
                  <div className="flex items-center justify-between text-zinc-500">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {tm.from_addr}
                    </span>
                    <span>{tm.date ? new Date(tm.date).toLocaleString('tr-TR') : ''}</span>
                  </div>
                  <div className="mt-1 text-zinc-600 dark:text-zinc-400 truncate">
                    {tm.snippet || tm.subject}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 8. Superhuman Tarzı Hızlı Yanıt (Inline Quick Reply) */}
        {!isDraft && onSendQuickReply && (
          <div className="mt-8 rounded-2xl border border-zinc-200/90 bg-zinc-50/70 p-4.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-850/50 print:hidden">
            <div className="mb-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
                  <SparklesIcon size={14} className="text-amber-500" />
                  <span>Hızlı Yanıt</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyAll((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                    replyAll
                      ? 'bg-blue-600 text-white font-bold shadow-2xs'
                      : 'bg-zinc-200/80 text-zinc-700 hover:bg-zinc-300/80 dark:bg-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {replyAll ? <ReplyAllIcon size={12} /> : <ReplyIcon size={12} />}
                  <span>{replyAll ? 'Herkese Yanıtla' : 'Yanıtla'}</span>
                </button>
              </div>

              {onExpandToFullCompose && (
                <button
                  type="button"
                  onClick={() => onExpandToFullCompose(quickText, quickFiles, replyAll)}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400 font-medium flex items-center gap-1.5"
                  title="Gelişmiş zengin editörde aç"
                >
                  <ExternalLinkIcon size={12} />
                  <span>Tam Editörde Aç</span>
                </button>
              )}
            </div>

            <textarea
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Hızlı yanıtınızı buraya yazın... (Göndermek için Ctrl+Enter)"
              rows={3}
              className="w-full resize-y rounded-xl border border-zinc-200/90 bg-white p-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />

            {/* Eklenen Dosyalar */}
            {quickFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {quickFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    <span className="truncate max-w-[150px]">{f.filename}</span>
                    <button
                      type="button"
                      onClick={() => setQuickFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-zinc-400 hover:text-red-500 p-0.5"
                    >
                      <CloseIcon size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Alt Çubuk */}
            <div className="mt-3 flex items-center justify-between">
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  className="hidden"
                  onChange={handleFiles}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-750"
                >
                  <AttachmentIcon size={13} />
                  <span>Dosya Ekle</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={quickSending || !quickText.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50"
              >
                {quickSending ? <SyncIcon size={13} className="animate-spin" /> : <SendIcon size={13} />}
                <span>{quickSending ? 'Gönderiliyor...' : 'Gönder (Ctrl+Enter)'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
