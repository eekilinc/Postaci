// src/components/ShortcutsHelpModal.tsx — Kapsamlı Klavye Kısayolları Rehberi
import { PostaciLogo } from './PostaciLogo';
import { CloseIcon } from './icons';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelpModal({ isOpen, onClose }: ShortcutsHelpModalProps) {
  if (!isOpen) return null;

  const shortcutSections = [
    {
      title: 'Navigasyon & Genel',
      shortcuts: [
        { keys: ['Ctrl', 'K'], desc: 'Komut Paleti (Spotlight arama & eylemler)' },
        { keys: ['Ctrl', 'B'], desc: 'Klasör panelini daralt / genişlet' },
        { keys: ['/'], desc: 'Arama çubuğuna hızlıca odaklan' },
        { keys: ['?', 'veya', 'Ctrl', '/'], desc: 'Bu kısayol rehberini göster' },
        { keys: ['ESC'], desc: 'Açık modal, arama veya paneli kapat' },
      ],
    },
    {
      title: 'İleti Listesi',
      shortcuts: [
        { keys: ['↓', 'veya', 'J'], desc: 'Bir sonraki e-postayı seç' },
        { keys: ['↑', 'veya', 'K'], desc: 'Bir önceki e-postayı seç' },
      ],
    },
    {
      title: 'E-posta Eylemleri (Seçili İleti)',
      shortcuts: [
        { keys: ['C'], desc: 'Yeni e-posta oluştur (Compose)' },
        { keys: ['R'], desc: 'Seçili e-postayı yanıtla (Reply)' },
        { keys: ['A'], desc: 'Tümünü yanıtla (Reply All)' },
        { keys: ['F'], desc: 'Başka birine ilet (Forward)' },
        { keys: ['S'], desc: 'Yıldız ekle / kaldır' },
        { keys: ['U'], desc: 'Okundu / Okunmadı olarak işaretle' },
        { keys: ['E'], desc: 'Arşivle (Archive)' },
        { keys: ['Del', 'veya', 'Backspace'], desc: 'Çöp kutusuna taşı / sil' },
      ],
    },
    {
      title: 'E-posta Editörü İçi',
      shortcuts: [
        { keys: ['Ctrl', 'B'], desc: 'Kalın metin' },
        { keys: ['Ctrl', 'I'], desc: 'İtalik metin' },
        { keys: ['Ctrl', 'U'], desc: 'Altı çizili metin' },
        { keys: ['Ctrl', 'K'], desc: 'Köprü / web bağlantısı ekle' },
        { keys: ['Ctrl', 'Enter'], desc: 'E-postayı hemen gönder' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity duration-150 p-4"
      onClick={onClose}
    >
      <div
        className="w-[38rem] max-w-[95vw] max-h-[85vh] flex flex-col rounded-2xl border border-zinc-200/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/95 overflow-hidden animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-zinc-200/80 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <PostaciLogo size="sm" />
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Klavye Kısayolları Kılavuzu
              </h2>
              <p className="text-xs text-zinc-400">
                Postacı'yı klavyeden elinizi kaldırmadan profesyonelce kullanın
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Kısayollar Listesi */}
        <div className="overflow-y-auto p-6 space-y-6">
          {shortcutSections.map((sec) => (
            <div key={sec.title}>
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {sec.title}
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {sec.shortcuts.map((sc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl bg-zinc-50/70 px-3.5 py-2 text-xs dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60"
                  >
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                      {sc.desc}
                    </span>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      {sc.keys.map((k, kIdx) =>
                        k === 'veya' ? (
                          <span key={kIdx} className="text-[10px] text-zinc-400 px-0.5">
                            veya
                          </span>
                        ) : (
                          <kbd
                            key={kIdx}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-800 shadow-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                          >
                            {k}
                          </kbd>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Kapat Butonu */}
        <div className="border-t border-zinc-100 bg-zinc-50/70 px-6 py-3 text-right dark:border-zinc-800 dark:bg-zinc-900/60">
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-200 px-4 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition"
          >
            Anladım (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}
