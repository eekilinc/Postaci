// src/components/AttachmentPreviewModal.tsx — ek dosya önizleme modalı (resim, PDF, metin)
import { useMemo } from 'react';
import {
  FileImageIcon,
  FilePdfIcon,
  FileTextIcon,
  AttachmentIcon,
  DownloadIcon,
  CloseIcon,
} from './icons';

interface AttachmentPreviewModalProps {
  filename: string;
  contentType: string;
  dataBase64: string;
  onClose: () => void;
  onSave: () => void;
}

export function AttachmentPreviewModal({
  filename,
  contentType,
  dataBase64,
  onClose,
  onSave,
}: AttachmentPreviewModalProps) {
  const isImage = contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);
  const isPdf = contentType.includes('pdf') || /\.pdf$/i.test(filename);
  const isText = contentType.startsWith('text/') || /\.(txt|json|md|csv|log)$/i.test(filename);

  const textContent = useMemo(() => {
    if (!isText) return '';
    try {
      return atob(dataBase64);
    } catch {
      return '';
    }
  }, [isText, dataBase64]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[50rem] max-w-[95vw] flex-col rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık çubuğu */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-zinc-500 shrink-0">
              {isImage ? (
                <FileImageIcon size={20} />
              ) : isPdf ? (
                <FilePdfIcon size={20} />
              ) : isText ? (
                <FileTextIcon size={20} />
              ) : (
                <AttachmentIcon size={20} />
              )}
            </span>
            <div className="truncate">
              <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100" title={filename}>
                {filename}
              </h3>
              <p className="text-xs text-zinc-400">{contentType || 'Bilinmeyen tür'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition shadow-2xs"
            >
              <DownloadIcon size={13} />
              <span>Kaydet</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
              title="Kapat (Esc)"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        {/* Önizleme İçeriği */}
        <div className="flex flex-1 items-center justify-center overflow-auto p-4 min-h-[300px]">
          {isImage ? (
            <img
              src={`data:${contentType || 'image/png'};base64,${dataBase64}`}
              alt={filename}
              className="max-h-[72vh] max-w-full rounded object-contain shadow-sm"
            />
          ) : isPdf ? (
            <iframe
              src={`data:application/pdf;base64,${dataBase64}`}
              title={filename}
              className="h-[72vh] w-full rounded border border-zinc-200 dark:border-zinc-800"
            />
          ) : isText && textContent ? (
            <pre className="h-[72vh] w-full overflow-auto rounded-lg bg-zinc-50 p-4 font-mono text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              {textContent}
            </pre>
          ) : (
            <div className="text-center p-8 text-zinc-500">
              <AttachmentIcon size={36} className="mx-auto text-zinc-400 mb-2" />
              <p className="text-sm font-medium">Bu dosya formatı doğrudan görüntülenemiyor.</p>
              <p className="text-xs text-zinc-400 mt-1">Dosyayı açmak için "Kaydet" butonunu kullanabilirsiniz.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
