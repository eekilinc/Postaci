// src/components/settings/GeneralTab.tsx — "Genel" sekmesi.
//
// SettingsModal'dan ayrıldı: uygulama davranışı (başlangıç, görev çubuğu,
// çıkış, kısayollar, imla), okundu işaretleme zamanlaması, bildirimler (rozet,
// ses, senkronizasyon sıklığı, sessiz saatler) ve dil seçimi.
//
// Ayar DEĞİŞTİRMEZ — hepsi props + callback. Ana modal state'i (localStorage +
// appSettings.save + notifications.saveSettings) burada değil, orada tutulur.
import { useTranslation } from '../../i18n';
import type { MarkReadTiming } from '../../types';

export interface GeneralTabProps {
  // Uygulama davranışı — hepsi tek callback'e gider (partial update)
  launchOnStartup: boolean;
  startMinimized: boolean;
  hideTaskbarOnMinimize: boolean;
  closeToQuit: boolean;
  useGmailShortcuts: boolean;
  onAppBehaviorChange: (patch: {
    launchOnStartup?: boolean;
    startMinimized?: boolean;
    hideTaskbarOnMinimize?: boolean;
    closeToQuit?: boolean;
    useGmailShortcuts?: boolean;
  }) => void;

  spellcheckEnabled: boolean;
  onToggleSpellcheck: (v: boolean) => void;

  markReadTiming: MarkReadTiming;
  onMarkReadTimingChange: (v: MarkReadTiming) => void;

  // Bildirimler
  showUnreadBadge: boolean;
  onShowUnreadBadgeChange: (v: boolean) => void;
  showTaskbarAlert: boolean;
  onShowTaskbarAlertChange: (v: boolean) => void;
  showTrackingAlert: boolean;
  onShowTrackingAlertChange: (v: boolean) => void;
  showInAppAlerts: boolean;
  onToggleInAppAlerts: (v: boolean) => void;

  soundChoice: string;
  onSoundChange: (v: string) => void;
  syncInterval: number;
  onSyncIntervalChange: (v: number) => void;
  onTestNotification: () => void;
  testNotice: string | null;

  quietHoursEnabled: boolean;
  onQuietHoursToggle: (v: boolean) => void;
  quietHoursStart: string;
  quietHoursEnd: string;
  onQuietHoursTimeChange: (which: 'start' | 'end', v: string) => void;
}

export function GeneralTab({
  launchOnStartup,
  startMinimized,
  hideTaskbarOnMinimize,
  closeToQuit,
  useGmailShortcuts,
  onAppBehaviorChange,
  spellcheckEnabled,
  onToggleSpellcheck,
  markReadTiming,
  onMarkReadTimingChange,
  showUnreadBadge,
  onShowUnreadBadgeChange,
  showTaskbarAlert,
  onShowTaskbarAlertChange,
  showTrackingAlert,
  onShowTrackingAlertChange,
  showInAppAlerts,
  onToggleInAppAlerts,
  soundChoice,
  onSoundChange,
  syncInterval,
  onSyncIntervalChange,
  onTestNotification,
  testNotice,
  quietHoursEnabled,
  onQuietHoursToggle,
  quietHoursStart,
  quietHoursEnd,
  onQuietHoursTimeChange,
}: GeneralTabProps) {
  const { language, setLanguage } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Uygulama Davranışı */}
      <div>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
          {language === 'en' ? 'Application behavior' : 'Uygulama davranışı'}
        </h3>
        <div className="space-y-3 text-xs sm:text-[13px]">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={launchOnStartup}
              onChange={(e) => onAppBehaviorChange({ launchOnStartup: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Launch at Windows startup' : 'Windows başlangıcında açılsın'}</span>
          </label>

          <label className="flex items-start gap-2.5 ml-6 cursor-pointer opacity-90">
            <input
              type="checkbox"
              checked={startMinimized}
              disabled={!launchOnStartup}
              onChange={(e) => onAppBehaviorChange({ startMinimized: e.target.checked })}
              className="h-4 w-4 mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer disabled:opacity-40"
            />
            <div className="flex flex-col">
              <span className={!launchOnStartup ? 'text-zinc-400' : ''}>
                {language === 'en' ? 'Start minimized in background silently' : 'Başlangıçta simge durumunda açılsın (arka planda sessizce başlar)'}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {language === 'en' ? 'When enabled, main window will not pop up on Windows startup, waits in system tray.' : 'Açık olduğunda Windows açılırken ana pencere ekrana gelmez, sistem tepsisinde (saat yanında) hazır bekler.'}
              </span>
            </div>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={hideTaskbarOnMinimize}
              onChange={(e) => onAppBehaviorChange({ hideTaskbarOnMinimize: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Hide from taskbar when minimized (system tray only)' : 'Simge durumunda iken görev çubuğu simgesi gizlensin (yalnızca sistem tepsisinde kalsın)'}</span>
          </label>

          <div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={closeToQuit}
                onChange={(e) => onAppBehaviorChange({ closeToQuit: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
              />
              <span>{language === 'en' ? 'Exit application completely when clicking close (✕)' : 'Çıkma tuşuna (✕) basıldığında uygulamadan tamamen çıkılsın'}</span>
            </label>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pl-6.5 mt-0.5 leading-relaxed">
              {language === 'en' ? 'If unchecked (recommended), clicking close keeps Postacı running in background/tray.' : 'İşaretli değilse (önerilen), çıkma tuşuna basıldığında Postacı arka planda ve sistem tepsisinde çalışmaya devam eder.'}
            </p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={useGmailShortcuts}
              onChange={(e) => onAppBehaviorChange({ useGmailShortcuts: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Enable Gmail keyboard shortcuts (C, R, A, E, # etc.)' : 'Gmail klavye kısayollarını kullan (C, R, A, E, # vb.)'}</span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={spellcheckEnabled}
              onChange={(e) => onToggleSpellcheck(e.target.checked)}
              className="h-4 w-4 mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <div className="flex flex-col">
              <span>{language === 'en' ? 'Check spelling as you type (TR & EN)' : 'Yazarken dahili imla ve yazım denetimi yap (Türkçe & İngilizce)'}</span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {language === 'en'
                  ? 'Underlines spelling errors. Right-click words to view suggestions or add to custom dictionary.'
                  : 'Yazım hatalarını kırmızı dalgalı çizgiyle belirtir. Sağ tıklayarak düzeltme önerilerini görebilir veya sözlüğe ekleyebilirsiniz.'}
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* E-posta Okuma & Okundu İşaretleme Davranışı */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2 tracking-tight">
          {language === 'en' ? 'Reading & Mark as Read' : 'Okuma ve Okundu İşaretleme'}
        </h3>
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-850/40 space-y-2">
          <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
            {language === 'en' ? 'Mark as Read Timing' : 'Okundu Olarak İşaretleme Zamanlaması'}
          </h4>
          <p className="text-[11px] text-zinc-500">
            {language === 'en'
              ? 'Determine when an email is automatically marked as read upon selection.'
              : 'Bir ileti seçildiğinde ne zaman okundu olarak işaretleneceğini belirleyin.'}
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[
              {
                id: 'instant',
                label: language === 'en' ? 'Instant' : 'Anında',
                desc: language === 'en' ? 'As soon as email is clicked' : 'İleti tıklandığı anda',
              },
              {
                id: 'delay_3s',
                label: language === 'en' ? 'After 3 Seconds' : '3 Saniye Sonra',
                desc: language === 'en' ? 'When viewing for 3 seconds' : 'İletide 3 sn kalındığında',
              },
              {
                id: 'delay_5s',
                label: language === 'en' ? 'After 5 Seconds' : '5 Saniye Sonra',
                desc: language === 'en' ? 'When viewing for 5 seconds' : 'İletide 5 sn kalındığında',
              },
              {
                id: 'manual',
                label: language === 'en' ? 'Manual' : 'Manuel',
                desc: language === 'en' ? 'Only when button is pressed' : 'Sadece düğmeye basıldığında',
              },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onMarkReadTimingChange(m.id as MarkReadTiming)}
                className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                  markReadTiming === m.id
                    ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40 ring-1 ring-blue-500'
                    : 'border-zinc-200 dark:border-zinc-750 hover:bg-white dark:hover:bg-zinc-800'
                }`}
              >
                <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{m.label}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bildirimler */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
          {language === 'en' ? 'Notifications' : 'Bildirimler'}
        </h3>
        <div className="space-y-2.5 text-xs sm:text-[13px]">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showUnreadBadge}
              onChange={(e) => onShowUnreadBadgeChange(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Show unread count badge in taskbar and tray' : 'Okunmamış ileti sayısı görev çubuğu & bildirim alanında gösterilsin'}</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showTaskbarAlert}
              onChange={(e) => onShowTaskbarAlertChange(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Flash taskbar when new email arrives' : 'İleti geldiğinde görev çubuğunda uyarı gösterilsin'}</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showTrackingAlert}
              onChange={(e) => onShowTrackingAlertChange(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Show notification when tracked email is opened' : 'E-posta İzlemesi olan bir ileti açıldığında bildirim alanında göster'}</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showInAppAlerts}
              onChange={(e) => onToggleInAppAlerts(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>
              {language === 'en'
                ? 'Show in-app floating notification card (top right)'
                : 'Uygulama açıkken sağ üstte canlı bildirim kartı gösterilsin'}
            </span>
          </label>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{language === 'en' ? 'New email sound:' : 'Yeni ileti sesi:'}</span>
            <select
              value={soundChoice}
              onChange={(e) => onSoundChange(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="chirp">{language === 'en' ? 'Default (Chirp)' : 'Varsayılan (Chirp)'}</option>
              <option value="ding">{language === 'en' ? 'Ding (Classic)' : 'Ding (Klasik)'}</option>
              <option value="bell">{language === 'en' ? 'Bell' : 'Çan'}</option>
              <option value="none">{language === 'en' ? 'Mute' : 'Sessiz'}</option>
            </select>
          </div>

          <div className="pt-1 flex items-center justify-between">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{language === 'en' ? 'Sync check frequency:' : 'E-posta denetleme sıklığı:'}</span>
            <select
              value={syncInterval}
              onChange={(e) => onSyncIntervalChange(Number(e.target.value))}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value={0.5}>{language === 'en' ? 'Every 30 seconds (Ultra fast)' : 'Her 30 saniyede bir (Ultra Hızlı)'}</option>
              <option value={1}>{language === 'en' ? 'Every 1 minute (Fast)' : 'Her 1 dakikada bir (Hızlı)'}</option>
              <option value={2}>{language === 'en' ? 'Every 2 minutes (Recommended - Stable)' : 'Her 2 dakikada bir (Önerilen - Kararlı)'}</option>
              <option value={3}>{language === 'en' ? 'Every 3 minutes' : 'Her 3 dakikada bir'}</option>
              <option value={5}>{language === 'en' ? 'Every 5 minutes' : 'Her 5 dakikada bir'}</option>
              <option value={10}>{language === 'en' ? 'Every 10 minutes' : 'Her 10 dakikada bir'}</option>
            </select>
          </div>

          <div className="pt-2 pb-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onTestNotification}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
              >
                {language === 'en' ? 'Send Test Notification' : 'Test Bildirimi Gönder'}
              </button>
              {testNotice && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {testNotice}
                </span>
              )}
            </div>

            {/* Windows Bildirim İpucu & Doğrudan Ayar Butonu */}
            <div className="mt-2.5 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] leading-relaxed text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
              <p>
                <span className="font-semibold">
                  {language === 'en' ? '💡 Windows Notification Tip:' : '💡 Windows Bildirim İpucu:'}
                </span>{' '}
                {language === 'en' ? (
                  <>
                    In Windows 10/11, <span className="font-semibold">Focus Assist (Do Not Disturb)</span> may activate automatically between 23:00 - 07:00 or during full screen. In this mode, Windows stores notifications quietly in the Action Center (<kbd className="rounded bg-blue-100 dark:bg-blue-900 px-1 py-0.5 font-mono text-[10px]">Win + N</kbd>) instead of popping up.
                  </>
                ) : (
                  <>
                    Windows 10/11'de saat 23:00 - 07:00 arasında veya tam ekran modundayken <span className="font-semibold">Odaklanma Yardımı (Rahatsız Etmeyin)</span> otomatik açılabilir. Bu modda Windows, bildirim pencerelerini masaüstüne çıkarmak yerine sağ alttaki Windows Bildirim Merkezi'ne (<kbd className="rounded bg-blue-100 dark:bg-blue-900 px-1 py-0.5 font-mono text-[10px]">Win + N</kbd>) sessizce depolar.
                  </>
                )}
              </p>
              {window.postaci?.openExternal && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => window.postaci?.openExternal?.('ms-settings:notifications')}
                    className="inline-flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-300 hover:underline cursor-pointer"
                  >
                    ⚙ {language === 'en' ? 'Open Windows Notification Settings ↗' : 'Windows Sistem Bildirim Ayarlarını Aç ↗'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sessiz Saatler / Rahatsız Etmeyin */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) => onQuietHoursToggle(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {language === 'en' ? 'Quiet Hours / Do Not Disturb' : 'Sessiz Saatler / Rahatsız Etmeyin (Quiet Hours)'}
              </span>
            </label>
            <p className="text-[11px] text-zinc-500 pl-6.5">
              {language === 'en'
                ? 'Desktop notifications and alert sounds are automatically muted during the specified time range.'
                : 'Belirtilen zaman aralığında gelen yeni e-postalarda Windows masaüstü bildirimi ve sesleri otomatik susturulur.'}
            </p>
            {quietHoursEnabled && (
              <div className="flex items-center gap-4 pl-6.5 pt-1 animate-fadeIn">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {language === 'en' ? 'Start:' : 'Başlangıç:'}
                  </span>
                  <input
                    type="time"
                    value={quietHoursStart}
                    onChange={(e) => onQuietHoursTimeChange('start', e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {language === 'en' ? 'End:' : 'Bitiş:'}
                  </span>
                  <input
                    type="time"
                    value={quietHoursEnd}
                    onChange={(e) => onQuietHoursTimeChange('end', e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dil */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1 tracking-tight">
          {language === 'en' ? 'Language' : 'Dil'}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2.5">
          {language === 'en' ? 'Choose application interface language' : 'Uygulama arayüz dilini seçin'}
        </p>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'tr' | 'en')}
          className="w-52 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="tr">Türkçe (Turkish)</option>
          <option value="en">English (US)</option>
        </select>
      </div>
    </div>
  );
}