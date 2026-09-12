// src/components/ShortcutsHelpModal.tsx — Kapsamlı Klavye Kısayolları Rehberi
import { PostaciLogo } from './PostaciLogo';
import { CloseIcon } from './icons';
import { useTranslation } from '../i18n';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelpModal({ isOpen, onClose }: ShortcutsHelpModalProps) {
  const { t, language } = useTranslation();
  if (!isOpen) return null;

  const orText = t('shortcuts.or');

  const shortcutSections = [
    {
      title: t('shortcuts.secNav'),
      shortcuts: [
        { keys: ['Ctrl', 'K'], desc: t('shortcuts.cmdPalette') },
        { keys: ['Ctrl', 'B'], desc: t('shortcuts.toggleSidebar') },
        { keys: ['/'], desc: t('shortcuts.focusSearch') },
        { keys: ['?', orText, 'Ctrl', '/'], desc: t('shortcuts.showHelp') },
        { keys: ['ESC'], desc: t('shortcuts.escape') },
      ],
    },
    {
      title: t('shortcuts.secList'),
      shortcuts: [
        { keys: ['↓', orText, 'J'], desc: t('shortcuts.nextMail') },
        { keys: ['↑', orText, 'K'], desc: t('shortcuts.prevMail') },
      ],
    },
    {
      title: t('shortcuts.secActions'),
      shortcuts: [
        { keys: ['C'], desc: t('shortcuts.compose') },
        { keys: ['R'], desc: t('shortcuts.reply') },
        { keys: ['A'], desc: t('shortcuts.replyAll') },
        { keys: ['F'], desc: t('shortcuts.forward') },
        { keys: ['S'], desc: t('shortcuts.star') },
        { keys: ['U'], desc: t('shortcuts.unread') },
        { keys: ['E'], desc: t('shortcuts.archive') },
        { keys: ['Del', orText, 'Backspace'], desc: t('shortcuts.delete') },
      ],
    },
    {
      title: t('shortcuts.secEditor'),
      shortcuts: [
        { keys: ['Ctrl', 'B'], desc: t('shortcuts.bold') },
        { keys: ['Ctrl', 'I'], desc: t('shortcuts.italic') },
        { keys: ['Ctrl', 'U'], desc: t('shortcuts.underline') },
        { keys: ['Ctrl', 'K'], desc: t('shortcuts.link') },
        { keys: ['Ctrl', 'Enter'], desc: t('shortcuts.send') },
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
                {t('shortcuts.title')}
              </h2>
              <p className="text-xs text-zinc-400">
                {t('shortcuts.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
            title={t('common.close')}
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
                        k === orText ? (
                          <span key={kIdx} className="text-[10px] text-zinc-400 px-0.5">
                            {orText}
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
            {language === 'en' ? 'Got it (ESC)' : 'Anladım (ESC)'}
          </button>
        </div>
      </div>
    </div>
  );
}
