// src/components/settings/ComposingTab.tsx — "Oluşturma / İmzalar" sekmesi.
//
// SettingsModal'dan ayrıldı: hesaba özel imza (düz metin / zengin HTML editörü,
// logo, link, hazır şablonlar), geri alma penceresi süresi ve hızlı yanıt
// şablonları (snippets).
//
// İmza editörü bu bileşenin sahipliğindedir: contentEditable ref'i, document
// execCommand komutları ve şablon uygulama burada yaşar. Ana modal yalnızca
// kalıcı değerleri (localStorage) ve snippet listesini yönetir.
import { useEffect, useRef } from 'react';
import { useTranslation } from '../../i18n';
import { SnippetIcon, TrashIcon } from '../icons';
import type { QuickSnippet } from '../../types';

export interface ComposingTabProps {
  accounts: { id: number; email: string; display_name?: string | null }[];
  selectedEmail: string;
  onSelectAccount: (email: string) => void;

  // İmza durumu
  sigEnabled: boolean;
  onSigEnabledChange: (v: boolean) => void;
  sigIsHtml: boolean;
  onSigIsHtmlChange: (v: boolean) => void;
  sigText: string;
  onSigTextChange: (v: string) => void;
  sigHtml: string;
  onSigHtmlChange: (v: string) => void;
  onSaveSignature: () => void;
  savedNotice: boolean;

  // Geri alma penceresi
  undoDelay: number;
  onUndoDelayChange: (v: number) => void;

  // Hızlı yanıt şablonları
  quickSnippets: QuickSnippet[];
  snippetTitle: string;
  onSnippetTitleChange: (v: string) => void;
  snippetBody: string;
  onSnippetBodyChange: (v: string) => void;
  snippetNotice: string | null;
  onAddSnippet: (e: React.FormEvent) => void;
  onDeleteSnippet: (id: string) => void;
}

export function ComposingTab({
  accounts,
  selectedEmail,
  onSelectAccount,
  sigEnabled,
  onSigEnabledChange,
  sigIsHtml,
  onSigIsHtmlChange,
  sigText,
  onSigTextChange,
  sigHtml,
  onSigHtmlChange,
  onSaveSignature,
  savedNotice,
  undoDelay,
  onUndoDelayChange,
  quickSnippets,
  snippetTitle,
  onSnippetTitleChange,
  snippetBody,
  onSnippetBodyChange,
  snippetNotice,
  onAddSnippet,
  onDeleteSnippet,
}: ComposingTabProps) {
  const { language } = useTranslation();
  const sigEditorRef = useRef<HTMLDivElement | null>(null);

  const accountName =
    accounts.find((a) => a.email === selectedEmail)?.display_name ||
    selectedEmail.split('@')[0] ||
    '';

  // execCommand uygulanmış editörün HTML'ini state'e geri yazar
  const execSigCommand = (cmd: string, val?: string) => {
    if (sigEditorRef.current) sigEditorRef.current.focus();
    document.execCommand(cmd, false, val);
    if (sigEditorRef.current) onSigHtmlChange(sigEditorRef.current.innerHTML);
  };

  const applyTemplateToEditor = (templateType: 'modern' | 'two-column' | 'simple') => {
    let templateHtml = '';
    if (templateType === 'modern') {
      templateHtml = `<div style="font-family: Arial, sans-serif; font-size: 13px; color: #333; line-height: 1.5; border-left: 3px solid #2563eb; padding-left: 12px; margin-top: 8px;"><div style="font-weight: bold; font-size: 14px; color: #1e293b;">${accountName}</div><div style="color: #64748b; font-size: 12px;">Unvan / Departman</div><div style="margin-top: 4px; color: #475569; font-size: 12px;">📧 <a href="mailto:${selectedEmail}" style="color: #2563eb; text-decoration: none;">${selectedEmail}</a> &nbsp;|&nbsp; 🌐 <a href="https://example.com" style="color: #2563eb; text-decoration: none;">example.com</a></div></div>`;
    } else if (templateType === 'two-column') {
      templateHtml = `<table cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333; margin-top: 8px;"><tr><td style="padding-right: 14px; border-right: 2px solid #cbd5e1; vertical-align: middle;"><div style="width: 44px; height: 44px; border-radius: 8px; background: #2563eb; color: #fff; font-weight: bold; font-size: 18px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 44px;">${accountName.slice(0, 2).toUpperCase()}</div></td><td style="padding-left: 14px; vertical-align: middle; line-height: 1.4;"><strong style="color: #0f172a; font-size: 14px;">${accountName}</strong><br/><span style="color: #64748b; font-size: 12px;">Şirket / Kuruluş</span><br/><span style="font-size: 11px; color: #2563eb;">${selectedEmail}</span></td></tr></table>`;
    } else {
      templateHtml = `<div style="font-family: Arial, sans-serif; font-size: 13px; color: #4b5563; line-height: 1.4; margin-top: 8px;">Saygılarımla / Best regards,<br/><strong style="color: #111827;">${accountName}</strong><br/><span style="font-size: 12px; color: #6b7280;">Tel: +90 (5XX) XXX XX XX</span></div>`;
    }
    onSigHtmlChange(templateHtml);
    if (sigEditorRef.current) sigEditorRef.current.innerHTML = templateHtml;
  };

  const insertSigLogo = async () => {
    if (!window.postaci?.openFileDialog) return;
    try {
      const dataUrl = await window.postaci.openFileDialog({
        title: language === 'en' ? 'Choose Signature Logo' : 'İmza Logosu veya Görseli Seç',
        filters: [{ name: 'Görseller / Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }],
      });
      if (dataUrl) {
        const imgTag = `<img src="${dataUrl}" alt="Logo" style="max-height: 50px; max-width: 180px; object-fit: contain; margin-top: 8px; display: block;" />`;
        execSigCommand('insertHTML', imgTag);
      }
    } catch (e) {
      console.error('Failed to insert logo:', e);
    }
  };

  const insertSigLink = () => {
    const url = prompt(language === 'en' ? 'Enter website address (URL):' : 'Web sitesi adresi girin (URL):');
    if (url) {
      const href =
        url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')
          ? url
          : `https://${url}`;
      execSigCommand('createLink', href);
    }
  };

  // Hesap değişince / HTML moduna geçince editör içeriği state ile eşitlenir
  useEffect(() => {
    if (sigEditorRef.current && sigIsHtml) {
      if (sigEditorRef.current.innerHTML !== sigHtml) {
        sigEditorRef.current.innerHTML = sigHtml;
      }
    }
  }, [sigHtml, sigIsHtml]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
        {language === 'en' ? 'Email Signatures & Composing' : 'E-posta İmzaları ve Oluşturma'}
      </h3>

      {accounts.length === 0 ? (
        <p className="text-xs text-zinc-400 py-4">
          {language === 'en'
            ? 'You must connect an email account first to configure signatures.'
            : 'İmza eklemek için önce bir e-posta hesabı bağlamalısınız.'}
        </p>
      ) : (
        <div className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              {language === 'en' ? 'Select Account' : 'Hesap Seçin'}
            </label>
            <select
              value={selectedEmail}
              onChange={(e) => onSelectAccount(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.email}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={sigEnabled}
                onChange={(e) => onSigEnabledChange(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
              />
              <span>
                {language === 'en'
                  ? 'Automatically append signature for this account'
                  : 'Bu hesap için otomatik imza ekle'}
              </span>
            </label>
          </div>

          {/* İmza Biçimi Seçici (Düz Metin vs Zengin HTML) */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-medium text-zinc-500">
              {language === 'en' ? 'Format:' : 'Biçim:'}
            </span>
            <div className="inline-flex rounded-xl bg-zinc-200/70 p-0.5 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => onSigIsHtmlChange(false)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  !sigIsHtml
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                }`}
              >
                {language === 'en' ? 'Plain Text' : 'Düz Metin'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSigIsHtmlChange(true);
                  // Düz metinden geçişte mevcut içerik satır sonları korunarak taşınır
                  if (!sigHtml && sigText) {
                    const converted = sigText.replace(/\n/g, '<br>');
                    onSigHtmlChange(converted);
                    if (sigEditorRef.current) sigEditorRef.current.innerHTML = converted;
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  sigIsHtml
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                }`}
              >
                <span>✨</span>
                <span>{language === 'en' ? 'Rich HTML & Logo' : 'Zengin HTML & Logo'}</span>
              </button>
            </div>
          </div>

          {!sigIsHtml ? (
            <div>
              <textarea
                rows={5}
                disabled={!sigEnabled}
                value={sigText}
                onChange={(e) => onSigTextChange(e.target.value)}
                placeholder={
                  language === 'en'
                    ? 'Best regards,\nYour Name\nTitle / Phone'
                    : 'Saygılarımla,\nAdınız Soyadınız\nUnvan / Telefon'
                }
                className="w-full rounded-xl border border-zinc-300 p-3 text-xs outline-none focus:border-blue-500 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 font-sans"
              />
            </div>
          ) : (
            <div className="space-y-2">
              {/* Zengin İmza Araç Çubuğu */}
              <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-850">
                <button
                  type="button"
                  onClick={() => execSigCommand('bold')}
                  disabled={!sigEnabled}
                  className="w-7 h-7 rounded-lg border border-zinc-300 dark:border-zinc-750 bg-white dark:bg-zinc-800 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer disabled:opacity-40"
                  title={language === 'en' ? 'Bold' : 'Kalın'}
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => execSigCommand('italic')}
                  disabled={!sigEnabled}
                  className="w-7 h-7 rounded-lg border border-zinc-300 dark:border-zinc-750 bg-white dark:bg-zinc-800 text-xs italic font-serif hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer disabled:opacity-40"
                  title={language === 'en' ? 'Italic' : 'İtalik'}
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => execSigCommand('underline')}
                  disabled={!sigEnabled}
                  className="w-7 h-7 rounded-lg border border-zinc-300 dark:border-zinc-750 bg-white dark:bg-zinc-800 text-xs underline hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer disabled:opacity-40"
                  title={language === 'en' ? 'Underline' : 'Altı Çizili'}
                >
                  U
                </button>

                <label
                  className="w-7 h-7 rounded-lg border border-zinc-300 dark:border-zinc-750 bg-white dark:bg-zinc-800 text-xs flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer disabled:opacity-40 relative"
                  title={language === 'en' ? 'Text Color' : 'Yazı Rengi'}
                >
                  <span className="font-bold text-xs" style={{ borderBottom: '3px solid #2563eb' }}>A</span>
                  <input
                    type="color"
                    defaultValue="#2563eb"
                    disabled={!sigEnabled}
                    onChange={(e) => execSigCommand('foreColor', e.target.value)}
                    className="w-0 h-0 opacity-0 absolute"
                  />
                </label>

                <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

                <button
                  type="button"
                  onClick={insertSigLink}
                  disabled={!sigEnabled}
                  className="px-2 h-7 rounded-lg border border-zinc-300 dark:border-zinc-750 bg-white dark:bg-zinc-800 text-xs flex items-center gap-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer disabled:opacity-40"
                  title={language === 'en' ? 'Insert Link' : 'Bağlantı Ekle'}
                >
                  <span>🔗</span>
                  <span>{language === 'en' ? 'Link' : 'Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={insertSigLogo}
                  disabled={!sigEnabled}
                  className="px-2.5 h-7 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 text-xs font-semibold flex items-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition cursor-pointer disabled:opacity-40"
                  title={language === 'en' ? 'Insert Logo or Image from disk' : 'Diskten Logo veya Görsel Ekle'}
                >
                  <span>🖼️</span>
                  <span>{language === 'en' ? 'Logo / Image' : 'Logo / Resim'}</span>
                </button>

                <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

                {/* Hazır Şablonlar */}
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-[10px] font-medium text-zinc-400">
                    {language === 'en' ? 'Templates:' : 'Şablon:'}
                  </span>
                  <button
                    type="button"
                    onClick={() => applyTemplateToEditor('modern')}
                    disabled={!sigEnabled}
                    className="px-2 py-0.5 rounded text-[10px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-blue-500 transition cursor-pointer disabled:opacity-40"
                  >
                    {language === 'en' ? 'Modern' : 'Modern'}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplateToEditor('two-column')}
                    disabled={!sigEnabled}
                    className="px-2 py-0.5 rounded text-[10px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-blue-500 transition cursor-pointer disabled:opacity-40"
                  >
                    {language === 'en' ? 'Card' : 'Kart'}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplateToEditor('simple')}
                    disabled={!sigEnabled}
                    className="px-2 py-0.5 rounded text-[10px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-blue-500 transition cursor-pointer disabled:opacity-40"
                  >
                    {language === 'en' ? 'Minimal' : 'Minimal'}
                  </button>
                </div>
              </div>

              {/* Düzenlenebilir Alan */}
              <div
                ref={sigEditorRef}
                contentEditable={sigEnabled}
                onInput={(e) => onSigHtmlChange(e.currentTarget.innerHTML)}
                data-testid="sig-editor"
                className="w-full min-h-[120px] max-h-[220px] overflow-y-auto rounded-xl border border-zinc-300 p-3 text-xs outline-none focus:border-blue-500 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 bg-white"
                style={{ minHeight: '120px' }}
              />

              {/* Canlı Önizleme Kartı */}
              <div className="mt-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40">
                <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  {language === 'en' ? 'Live Email Preview' : 'Canlı E-posta Önizlemesi'}
                </div>
                <div className="text-xs text-zinc-500 italic mb-2">
                  ...görüşmek üzere, iyi çalışmalar.
                </div>
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  {sigHtml ? (
                    <div
                      className="text-xs"
                      dangerouslySetInnerHTML={{ __html: sigHtml }}
                    />
                  ) : (
                    <span className="text-xs text-zinc-400 italic">
                      {language === 'en' ? 'No signature content' : 'İmza içeriği girilmedi'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onSaveSignature}
              className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-95 cursor-pointer"
            >
              {language === 'en' ? 'Save Signature' : 'İmzayı Kaydet'}
            </button>
            {savedNotice && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {language === 'en' ? '✓ Signature saved!' : '✓ İmza kaydedildi!'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Göndermeyi Geri Alma Süresi (Undo Send) */}
      <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
        <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
          {language === 'en' ? 'Undo Send Window' : 'Göndermeyi Geri Alma Penceresi (Undo Send)'}
        </h4>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {language === 'en'
            ? 'Grace period after sending an email during which delivery can be canceled.'
            : 'E-posta gönderdikten sonra gönderimi iptal etmek için verilen bekleme süresidir.'}
        </p>
        <div className="flex items-center gap-3 pt-1">
          <select
            value={undoDelay}
            onChange={(e) => onUndoDelayChange(Number(e.target.value))}
            className="w-48 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value={0}>{language === 'en' ? 'Disabled (Send immediately)' : 'Devre Dışı (Anında Gönder)'}</option>
            <option value={5}>{language === 'en' ? '5 Seconds (Standard)' : '5 Saniye (Standart)'}</option>
            <option value={10}>{language === 'en' ? '10 Seconds' : '10 Saniye'}</option>
            <option value={20}>{language === 'en' ? '20 Seconds' : '20 Saniye'}</option>
            <option value={30}>{language === 'en' ? '30 Seconds (Maximum)' : '30 Saniye (Maksimum)'}</option>
          </select>
          <span className="text-xs text-zinc-400">
            {undoDelay === 0
              ? (language === 'en' ? 'Emails are sent immediately without delay' : 'İletiler beklemeden derhal iletilir')
              : (language === 'en'
                  ? `Undo button remains active for ${undoDelay} seconds`
                  : `${undoDelay} saniye boyunca geri al düğmesi aktif kalır`)}
          </span>
        </div>
      </div>

      {/* Hızlı Yanıt Şablonları (Quick Snippets) */}
      <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <SnippetIcon size={14} className="text-blue-600 dark:text-blue-400" />
              <span>{language === 'en' ? 'Quick Snippets (Canned Responses)' : 'Hızlı Yanıt Şablonları (Hazır Metinler)'}</span>
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {language === 'en'
                ? 'Insert pre-saved responses with one click from the compose toolbar.'
                : 'E-posta yazarken araç çubuğundaki şablonlar simgesinden tek tıkla eklenecek hazır yanıtlar.'}
            </p>
          </div>
        </div>

        {/* Yeni Şablon Ekleme Formu */}
        <form onSubmit={onAddSnippet} className="rounded-xl border border-zinc-200/90 bg-zinc-50/60 p-3 space-y-2.5 dark:border-zinc-800 dark:bg-zinc-850/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
              {language === 'en' ? 'Add New Snippet' : 'Yeni Şablon Ekle'}
            </span>
            {snippetNotice && (
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {snippetNotice}
              </span>
            )}
          </div>
          <input
            type="text"
            placeholder={language === 'en' ? 'Snippet Title (e.g. Invoice Request, Approval)' : 'Şablon Başlığı (Örn: Fatura Talebi, Onay)'}
            value={snippetTitle}
            onChange={(e) => onSnippetTitleChange(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <textarea
            rows={3}
            placeholder={language === 'en' ? 'Snippet body content...' : 'Şablon metni içeriği...'}
            value={snippetBody}
            onChange={(e) => onSnippetBodyChange(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!snippetTitle.trim() || !snippetBody.trim()}
              className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-40 transition cursor-pointer"
            >
              {language === 'en' ? '+ Save Snippet' : '+ Şablonu Kaydet'}
            </button>
          </div>
        </form>

        {/* Kayıtlı Şablonlar Listesi */}
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {quickSnippets.length === 0 ? (
            <p className="text-xs text-zinc-400 italic py-2">
              {language === 'en' ? 'No saved snippets yet.' : 'Henüz kayıtlı bir şablon bulunmuyor.'}
            </p>
          ) : (
            quickSnippets.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between rounded-xl border border-zinc-200/80 bg-white p-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-800/80 hover:border-zinc-300 transition"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 block truncate">
                    {s.title}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 whitespace-pre-wrap">
                    {s.body}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteSnippet(s.id)}
                  className="p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition shrink-0 cursor-pointer"
                  title={language === 'en' ? 'Delete Snippet' : 'Şablonu Sil'}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}