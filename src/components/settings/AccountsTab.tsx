// src/components/settings/AccountsTab.tsx — "Hesaplar" sekmesi.
//
// SettingsModal'dan ayrıldı: hesap listesi, hesap düzenleme formu (OAuth
// hesaplarda sunucu alanları gizlenir), bağlantı testi ve salt-okunur senkron
// tanısı.
//
// Tüm ağ/veri işlemleri ana modal'da; burada yalnızca form durumu tutulur ve
// callback'ler çağrılır.
import { useTranslation } from '../../i18n';
import type { Account } from '../../types';

export interface AccountsTabProps {
  accounts: Account[];
  onOpenAddAccount?: () => void;

  // Düzenleme modu
  editingAccountId: number | null;
  onStartEdit: (acc: Account) => void;
  onCancelEdit: () => void;

  editDisplayName: string;
  onEditDisplayNameChange: (v: string) => void;
  editImapHost: string;
  onEditImapHostChange: (v: string) => void;
  editImapPort: number;
  onEditImapPortChange: (v: number) => void;
  editSmtpHost: string;
  onEditSmtpHostChange: (v: string) => void;
  editSmtpPort: number;
  onEditSmtpPortChange: (v: number) => void;
  editSmtpSecure: boolean;
  onEditSmtpSecureChange: (v: boolean) => void;
  editPassword: string;
  onEditPasswordChange: (v: string) => void;
  showEditPassword: boolean;
  onToggleShowEditPassword: () => void;

  /** OAuth hesaplarında sunucu alanları gösterilmez (token yönetimi otomatik) */
  editingIsOAuth: boolean;

  testingConnection: boolean;
  connectionTestResult: {
    imap: { ok: boolean; error?: string } | null;
    smtp: { ok: boolean; error?: string; note?: string } | null;
  } | null;
  onTestConnection: () => void;

  savingAccount: boolean;
  accountSaveNotice: string | null;
  onSaveAccount: () => void;

  /** Tanı: o an tanı çalışan hesabın e-postası (null = hiçbiri) */
  diagnosingEmail: string | null;
  diagnoseResults: Record<
    string,
    { ok: boolean; steps: { key: string; ok: boolean; detail: string }[]; hint: string }
  >;
  onDiagnose: (acc: Account) => void;
  onRequestDelete: (acc: Account) => void;
}

export function AccountsTab({
  accounts,
  onOpenAddAccount,
  editingAccountId,
  onStartEdit,
  onCancelEdit,
  editDisplayName,
  onEditDisplayNameChange,
  editImapHost,
  onEditImapHostChange,
  editImapPort,
  onEditImapPortChange,
  editSmtpHost,
  onEditSmtpHostChange,
  editSmtpPort,
  onEditSmtpPortChange,
  editSmtpSecure,
  onEditSmtpSecureChange,
  editPassword,
  onEditPasswordChange,
  showEditPassword,
  onToggleShowEditPassword,
  editingIsOAuth,
  testingConnection,
  connectionTestResult,
  onTestConnection,
  savingAccount,
  accountSaveNotice,
  onSaveAccount,
  diagnosingEmail,
  diagnoseResults,
  onDiagnose,
  onRequestDelete,
}: AccountsTabProps) {
  const { language } = useTranslation();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {language === 'en'
              ? `Connected Email Accounts (${accounts.length})`
              : `Bağlı E-posta Hesapları (${accounts.length})`}
          </h3>
          <p className="text-[11px] text-zinc-500">
            {language === 'en'
              ? 'Manage your accounts, edit server credentials or sender display name.'
              : 'Hesaplarınızı yönetin, sunucu veya görünen ad bilgilerini düzenleyin.'}
          </p>
        </div>
        {onOpenAddAccount && !editingAccountId && (
          <button
            type="button"
            onClick={onOpenAddAccount}
            className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            <span className="text-sm leading-none">+</span>
            <span>{language === 'en' ? 'Add New Account' : 'Yeni Hesap Ekle'}</span>
          </button>
        )}
      </div>

      {/* Düzenleme Modu Aktifse */}
      {editingAccountId ? (
        <div className="rounded-2xl border border-blue-300/80 bg-blue-50/30 p-4 text-xs dark:border-blue-800/80 dark:bg-blue-950/20 space-y-3.5 animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-blue-200/60 dark:border-blue-900/60">
            <span className="font-bold text-blue-900 dark:text-blue-200 text-sm">
              {language === 'en' ? 'Edit Account Settings' : 'Hesap Ayarlarını Düzenle'}
            </span>
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xs"
            >
              {language === 'en' ? 'Cancel' : 'Vazgeç'}
            </button>
          </div>

          {/* Görünen Ad */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              {language === 'en' ? 'Display Name (Sender Name)' : 'Görünen Ad (Gönderici İsmi)'}
            </label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => onEditDisplayNameChange(e.target.value)}
              placeholder={language === 'en' ? 'e.g. John Doe' : 'Örn: Ekrem Eşref Kılınç'}
              className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <p className="text-[10px] text-zinc-400 mt-0.5">
              {language === 'en'
                ? 'The name recipients see when they receive your emails.'
                : 'Gönderdiğiniz e-postalarda alıcıların göreceği isimdir.'}
            </p>
          </div>

          {/* IMAP / SMTP Sunucu Ayarları veya OAuth Bilgisi */}
          {editingIsOAuth ? (
            <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70">
              <div className="rounded-xl border border-blue-200/80 bg-blue-50/50 p-3.5 dark:border-blue-900/50 dark:bg-blue-950/30 flex items-start gap-2.5">
                <span className="text-base shrink-0">🔒</span>
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-blue-900 dark:text-blue-200">
                    {language === 'en' ? 'OAuth 2.0 Secure Authentication' : 'OAuth 2.0 Güvenli Kimlik Doğrulama'}
                  </p>
                  <p className="text-[11px] text-blue-700/90 dark:text-blue-300/90 leading-relaxed">
                    {language === 'en'
                      ? 'This account is authenticated securely via Google/Microsoft OAuth 2.0. Server connections and tokens are automatically refreshed in the background.'
                      : 'Bu hesap Google / Microsoft OAuth 2.0 ile güvenli olarak bağlanmıştır. Sunucu bağlantıları ve güvenlik anahtarları arka planda otomatik yenilenir.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70 space-y-3">
              <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                {language === 'en' ? 'Server & Connection Settings' : 'Sunucu & Bağlantı Ayarları'}
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] text-zinc-500 mb-0.5">
                    {language === 'en' ? 'Incoming Server (IMAP)' : 'Gelen Sunucu (IMAP)'}
                  </label>
                  <input
                    type="text"
                    value={editImapHost}
                    onChange={(e) => onEditImapHostChange(e.target.value)}
                    placeholder="imap.example.com"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-0.5">
                    {language === 'en' ? 'Port' : 'Port'}
                  </label>
                  <input
                    type="number"
                    value={editImapPort}
                    onChange={(e) => onEditImapPortChange(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] text-zinc-500 mb-0.5">
                    {language === 'en' ? 'Outgoing Server (SMTP)' : 'Giden Sunucu (SMTP)'}
                  </label>
                  <input
                    type="text"
                    value={editSmtpHost}
                    onChange={(e) => onEditSmtpHostChange(e.target.value)}
                    placeholder="smtp.example.com"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-0.5">
                    {language === 'en' ? 'Port' : 'Port'}
                  </label>
                  <input
                    type="number"
                    value={editSmtpPort}
                    onChange={(e) => onEditSmtpPortChange(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={editSmtpSecure}
                  onChange={(e) => onEditSmtpSecureChange(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-0"
                />
                <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  {language === 'en' ? 'Use SMTP Secure Connection (SSL/TLS)' : 'SMTP Güvenli Bağlantı (SSL/TLS) kullan'}
                </span>
              </label>

              {/* Şifre Güncelleme (Opsiyonel) */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="block text-[10px] text-zinc-500">
                    {language === 'en'
                      ? 'Password / App Password (leave blank to keep current)'
                      : 'Şifre / Uygulama Şifresi (Yalnızca değiştirmek istiyorsanız doldurun)'}
                  </label>
                  <button
                    type="button"
                    onClick={onToggleShowEditPassword}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showEditPassword ? (language === 'en' ? 'Hide' : 'Gizle') : (language === 'en' ? 'Show' : 'Göster')}
                  </button>
                </div>
                <input
                  type={showEditPassword ? 'text' : 'password'}
                  value={editPassword}
                  onChange={(e) => onEditPasswordChange(e.target.value)}
                  placeholder={language === 'en' ? 'Leave empty to preserve existing password' : 'Mevcut şifreyi korumak için boş bırakın'}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </div>
          )}

          {/* Bağlantı Testi */}
          <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onTestConnection}
                disabled={testingConnection || savingAccount}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-750 transition active:scale-95 disabled:opacity-50"
              >
                {testingConnection ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                    <span>{language === 'en' ? 'Testing...' : 'Test ediliyor...'}</span>
                  </>
                ) : (
                  <>
                    <span>🔌</span>
                    <span>{language === 'en' ? 'Test Connection' : 'Bağlantıyı Test Et'}</span>
                  </>
                )}
              </button>

              {connectionTestResult && (
                <div className="flex items-center gap-2 text-[11px] flex-wrap">
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold border ${
                    connectionTestResult.imap?.ok
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60'
                  }`}>
                    {connectionTestResult.imap?.ok ? '✓ IMAP' : '✕ IMAP'}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold border ${
                    connectionTestResult.smtp?.ok
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                      : connectionTestResult.smtp === null
                      ? 'bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60'
                  }`}>
                    {connectionTestResult.smtp?.ok ? '✓ SMTP' : connectionTestResult.smtp === null ? '– SMTP' : '✕ SMTP'}
                  </span>
                </div>
              )}
            </div>

            {/* Hata Detayları */}
            {connectionTestResult && (
              <div className="mt-2 space-y-1">
                {connectionTestResult.imap && !connectionTestResult.imap.ok && connectionTestResult.imap.error && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed">
                    <span className="font-semibold">IMAP:</span> {connectionTestResult.imap.error}
                  </p>
                )}
                {connectionTestResult.smtp && !connectionTestResult.smtp.ok && connectionTestResult.smtp.error && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed">
                    <span className="font-semibold">SMTP:</span> {connectionTestResult.smtp.error}
                  </p>
                )}
                {connectionTestResult.smtp?.ok && connectionTestResult.smtp.note && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{connectionTestResult.smtp.note}</p>
                )}
              </div>
            )}
          </div>

          {/* Kaydet ve İptal Butonları */}
          <div className="pt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSaveAccount}
                disabled={savingAccount}
                className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-95 disabled:opacity-50"
              >
                {savingAccount
                  ? (language === 'en' ? 'Saving...' : 'Kaydediliyor...')
                  : (language === 'en' ? 'Save Changes' : 'Değişiklikleri Kaydet')}
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 transition"
              >
                {language === 'en' ? 'Cancel' : 'İptal'}
              </button>
            </div>

            {accountSaveNotice && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {accountSaveNotice}
              </span>
            )}
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-500 dark:border-zinc-750">
          {language === 'en' ? 'No connected email accounts yet.' : 'Henüz bağlı bir e-posta hesabı bulunmuyor.'}
        </div>
      ) : (
        /* Hesaplar Listesi */
        <div className="space-y-2.5 pr-1">
          {accounts.map((acc) => {
            const isGoogle = acc.provider?.includes('google') || acc.email.includes('gmail');
            const isMs =
              acc.provider?.includes('microsoft') ||
              acc.email.includes('hotmail') ||
              acc.email.includes('outlook');
            const isEdu = acc.email.includes('.edu');

            let badge = 'IMAP/SMTP';
            let badgeClass =
              'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
            if (isGoogle) {
              badge = 'Gmail OAuth';
              badgeClass =
                'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-800/60';
            } else if (isMs) {
              badge = 'Outlook OAuth';
              badgeClass =
                'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800/60';
            } else if (isEdu) {
              badge = language === 'en' ? 'Institutional' : 'Kurumsal';
              badgeClass =
                'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/60';
            }

            return (
              <div
                key={acc.id}
                className="rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-850/60 hover:shadow-2xs transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {acc.email}
                      </span>
                      <span
                        className={`rounded-md border px-1.5 py-0.2 text-[9px] font-bold shrink-0 ${badgeClass}`}
                      >
                        {badge}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                      <span className="truncate">
                        {acc.display_name
                          ? `${language === 'en' ? 'Display' : 'Görünen'}: ${acc.display_name}`
                          : (language === 'en' ? 'No name specified' : 'İsim belirtilmemiş')}
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {language === 'en' ? 'Active & Synced' : 'Aktif & Senkronize'}
                      </span>
                    </div>
                  </div>

                  {/* Düzenle & Kaldır & Tanı Aksiyonları */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onDiagnose(acc)}
                      disabled={diagnosingEmail !== null}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 transition disabled:opacity-50"
                      title={language === 'en' ? 'Run read-only sync diagnosis' : 'Salt-okunur senkron tanısı çalıştır'}
                    >
                      {diagnosingEmail === acc.email ? '…' : (language === 'en' ? 'Diagnose' : 'Tanı')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartEdit(acc)}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 transition"
                    >
                      {language === 'en' ? 'Edit' : 'Düzenle'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRequestDelete(acc)}
                      className="rounded-lg border border-red-200 bg-red-50/60 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/60 transition"
                      title={language === 'en' ? "Remove account from Postacı" : "Hesabı Postacı'dan kaldır"}
                    >
                      {language === 'en' ? 'Remove' : 'Kaldır'}
                    </button>
                  </div>
                </div>
                {/* Tanı sonucu (salt-okunur) */}
                {diagnoseResults[acc.email] && (
                  <div className={`mt-2 rounded-xl border p-2.5 text-[11px] leading-relaxed ${
                    diagnoseResults[acc.email].ok
                      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                      : 'border-red-200 bg-red-50/60 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200'
                  }`}>
                    <div className="font-bold mb-1">
                      {diagnoseResults[acc.email].ok
                        ? (language === 'en' ? '✓ Connection healthy' : '✓ Bağlantı sağlıklı')
                        : (language === 'en' ? '✕ Sync problem found' : '✕ Senkron sorunu bulundu')}
                    </div>
                    <ul className="space-y-0.5">
                      {diagnoseResults[acc.email].steps.map((s) => (
                        <li key={s.key} className="break-words">
                          <span className="font-semibold">{s.ok ? '✓' : '✕'} {s.key}:</span> {s.detail}
                        </li>
                      ))}
                    </ul>
                    {diagnoseResults[acc.email].hint && (
                      <p className="mt-1 font-medium">💡 {diagnoseResults[acc.email].hint}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}