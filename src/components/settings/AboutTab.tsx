// src/components/settings/AboutTab.tsx — "Postacı Hakkında" sekmesi.
//
// SettingsModal'dan ayrıldı: sürüm, güncelleme durumu, GitHub bağlantıları ve
// çalışma ortamı bilgilerini gösterir. HİÇBİR ayarı değiştirmez — bu yüzden
// tek state'lik (logoLoadError) ve tamamen props'lu bir bileşendir.
import { useState } from 'react';
import { useTranslation } from '../../i18n';
import { PostaciLogo } from '../PostaciLogo';
import appIcon from '../../assets/icon.png';

export interface AboutTabProps {
  /** Vite build'de inject edilen gerçek sürüm; okunamadıysa '—' */
  currentVersion: string;
  updateCheckStatus: string | null;
  /** electron-updater'ın anlık durumu (indirme yüzdesi vb.) */
  updaterStatus: {
    state?: string;
    version?: string | null;
    percent?: number;
    message?: string | null;
  };
  /** GitHub API / updater sonucu: yayınlanan sürüm ve indirme bağlantısı */
  latestReleaseInfo: {
    version?: string;
    hasUpdate?: boolean;
    url?: string;
  } | null;
  onCheckUpdate: () => void;
  onRestartToUpdate: () => void;
  /** Dış bağlantı açma — ana modal'ın openUrl sarmalayıcısı (şema doğrulaması yapar) */
  openUrl: (url: string) => void;
  systemInfo: {
    ram: { heapUsedMB: number; heapTotalMB: number; rssMB: number; externalMB: number };
    db: { sizeBytes: number; sizeMB: number; path: string | null };
    versions: { electron: string; node: string; chrome: string; v8: string };
  } | null;
}

export function AboutTab({
  currentVersion,
  updateCheckStatus,
  updaterStatus,
  latestReleaseInfo,
  onCheckUpdate,
  onRestartToUpdate,
  openUrl,
  systemInfo,
}: AboutTabProps) {
  const { language } = useTranslation();
  // Logo yüklenemezse (eksik dosya/asar bozulması) vektör yedeğe düş.
  const [logoLoadError, setLogoLoadError] = useState(false);

  return (
    <div className="space-y-3.5 text-left">
      {/* Premium Başlık ve Logo Kartı */}
      <div className="relative overflow-hidden flex items-center gap-4 p-3.5 rounded-2xl bg-gradient-to-br from-blue-600/10 via-indigo-500/5 to-purple-600/10 border border-blue-500/20 shadow-xs dark:from-blue-950/40 dark:via-indigo-950/20 dark:to-purple-950/30 dark:border-blue-800/40">
        <div className="relative shrink-0 flex items-center justify-center">
          {!logoLoadError ? (
            <img
              src={appIcon}
              alt="Postacı Logo"
              className="h-16 w-16 rounded-2xl shadow-md border border-white/60 dark:border-zinc-700/60 object-contain p-1 bg-white dark:bg-zinc-800"
              onError={() => setLogoLoadError(true)}
            />
          ) : (
            <PostaciLogo size="xl" variant="squircle" showBadge={false} />
          )}
          <span
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-xs"
            title={language === 'en' ? 'Stable & Secure Version' : 'Stabil ve Güvenli Sürüm'}
          >
            ✓
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
              Postacı
            </h3>
            <span className="inline-flex items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-mono font-bold text-white shadow-2xs">
              v{currentVersion}
            </span>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed">
            {language === 'en'
              ? 'Lightning-fast, secure, modern and sleek desktop email client.'
              : 'Yıldırım hızında, güvenli, modern ve şık masaüstü e-posta istemcisi.'}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Windows x64
            </span>
            <span>•</span>
            <span>{language === 'en' ? 'Local SQLite' : 'Yerel SQLite'}</span>
            <span>•</span>
            <span>{language === 'en' ? 'Hardware-Protected DPAPI' : 'Donanım Korumalı DPAPI'}</span>
          </div>
        </div>
      </div>

      {/* Güncelleme Durum ve Denetleyici Kartı */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-850/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>{language === 'en' ? 'Software Updates' : 'Yazılım Güncellemeleri'}</span>
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {updateCheckStatus === 'available' && latestReleaseInfo?.version
                ? (language === 'en' ? `New version available: v${latestReleaseInfo.version}` : `Yeni sürüm mevcut: v${latestReleaseInfo.version}`)
                : updateCheckStatus === 'latest'
                ? (language === 'en'
                    ? `You are running the latest version (v${currentVersion}).`
                    : `Tebrikler, en güncel sürümü kullanıyorsunuz (v${currentVersion}).`)
                : (language === 'en' ? 'Check official GitHub releases.' : 'Resmi GitHub sürümlerini kontrol edin.')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCheckUpdate}
              disabled={updateCheckStatus === 'checking'}
              className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {updateCheckStatus === 'checking' ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>{language === 'en' ? 'Checking...' : 'Denetleniyor...'}</span>
                </>
              ) : (
                <span>{language === 'en' ? 'Check for Updates' : 'Güncellemeleri Denetle'}</span>
              )}
            </button>
            {updaterStatus.state === 'downloaded' ? (
              <button
                type="button"
                onClick={onRestartToUpdate}
                className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition active:scale-95 inline-flex items-center gap-1"
              >
                <span>{language === 'en' ? 'Restart & Install' : 'Yeniden Başlat ve Kur'}</span>
              </button>
            ) : updaterStatus.state === 'downloading' ? (
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {language === 'en' ? `Downloading %{updaterStatus.percent}` : `İndiriliyor %{updaterStatus.percent}`}
              </span>
            ) : (
              updateCheckStatus === 'available' && latestReleaseInfo?.url && (
                <button
                  type="button"
                  onClick={() => openUrl(latestReleaseInfo.url!)}
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition active:scale-95 inline-flex items-center gap-1"
                >
                  <span>{language === 'en' ? `Download v${latestReleaseInfo.version}` : `v${latestReleaseInfo.version} İndir`}</span>
                  <span>↗</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* GitHub Proje Kartı */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-850/60">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <span>eekilinc / Postaci</span>
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {language === 'en' ? 'Open Source' : 'Açık Kaynak'}
                </span>
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {language === 'en'
                  ? 'Official GitHub repository, source code, and contribution guidelines.'
                  : 'Resmi GitHub deposu, kaynak kodlar ve katkı yönergeleri.'}
              </p>
            </div>
          </div>
        </div>

        {/* GitHub Hızlı Butonlar */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => openUrl('https://github.com/eekilinc/Postaci')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-zinc-800 transition dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 active:scale-95 cursor-pointer"
          >
            <span>{language === 'en' ? 'View on GitHub' : "GitHub'da Görüntüle"}</span>
            <span className="text-xs">↗</span>
          </button>
          <button
            type="button"
            onClick={() => openUrl('https://github.com/eekilinc/Postaci/releases')}
            className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-750 transition active:scale-95 cursor-pointer"
          >
            <span>{language === 'en' ? 'Releases' : 'Sürümler (Releases)'}</span>
          </button>
          <button
            type="button"
            onClick={() => openUrl('https://github.com/eekilinc/Postaci/issues')}
            className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-750 transition active:scale-95 cursor-pointer"
          >
            <span>{language === 'en' ? 'Report Bug / Request' : 'Hata / İstek Bildir'}</span>
          </button>
        </div>
      </div>

      {/* Mimari ve Güvenlik Avantajları */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-2.5 dark:border-zinc-800 dark:bg-zinc-850/40">
          <p className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            <span>⚡</span> <span>{language === 'en' ? 'Offline & Local SQLite' : 'Çevrimdışı & Yerel SQLite'}</span>
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
            {language === 'en'
              ? 'Search your inbox with zero latency even without an active internet connection.'
              : 'İnternet bağlantınız kopsa bile gelen kutunuzda sıfır gecikmeyle anında arama yapabilirsiniz.'}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-2.5 dark:border-zinc-800 dark:bg-zinc-850/40">
          <p className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            <span>🔒</span> <span>{language === 'en' ? 'Hardware Encryption' : 'Donanım Şifreleme'}</span>
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
            {language === 'en'
              ? 'Passwords and OAuth credentials are saved locally encrypted via Windows DPAPI.'
              : 'Hesap şifreleriniz ve OAuth tokenlarınız Windows DPAPI ile yerel olarak şifrelenir.'}
          </p>
        </div>
      </div>

      {/* Sistem Versiyonları */}
      {systemInfo && (
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-850/40 space-y-2">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            {language === 'en' ? 'Runtime Environment Versions:' : 'Çalışma Ortamı Versiyonları:'}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: 'Electron', value: systemInfo.versions.electron },
              { label: 'Node.js', value: systemInfo.versions.node },
              { label: 'Chromium', value: systemInfo.versions.chrome },
              { label: 'V8', value: systemInfo.versions.v8 },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700 px-2.5 py-1.5">
                <span className="text-zinc-500">{label}</span>
                <span className="font-mono font-semibold text-[11px] text-zinc-700 dark:text-zinc-300">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Geliştirici & Lisans */}
      <div className="rounded-xl bg-zinc-50/60 dark:bg-zinc-850/30 p-3 text-xs border border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
        <div>
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
            {language === 'en' ? 'Developer: ' : 'Geliştirici: '}
          </span>
          <span className="text-zinc-600 dark:text-zinc-400">Ekrem Eşref Kılınç</span>
          <span className="mx-1 text-zinc-400">•</span>
          <span className="text-zinc-500">{language === 'en' ? 'MIT License' : 'MIT Lisansı'}</span>
        </div>
        <a
          href="mailto:ekilinc@mehmetakif.edu.tr"
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          {language === 'en' ? 'Contact' : 'İletişim'}
        </a>
      </div>
    </div>
  );
}