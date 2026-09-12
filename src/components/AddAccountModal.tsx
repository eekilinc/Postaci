// src/components/AddAccountModal.tsx — hesap ekleme modal penceresi
import { useState } from 'react';
import type { AccentKey } from '../types';
import { ACCENTS } from '../constants';
import { PostaciLogo } from './PostaciLogo';
import {
  CloseIcon,
  SearchIcon,
  GoogleBrandIcon,
  MicrosoftBrandIcon,
  YahooBrandIcon,
} from './icons';

interface AddAccountModalProps {
  inElectron: boolean;
  accent: AccentKey;
  onClose: () => void;
  onConnected: (email: string) => void;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
}

const PROVIDER_OPTIONS = [
  { id: 'google' as const, label: 'Google (Gmail)', renderIcon: () => <GoogleBrandIcon size={18} /> },
  { id: 'microsoft' as const, label: 'Microsoft (Outlook)', renderIcon: () => <MicrosoftBrandIcon size={18} /> },
  { id: 'yahoo' as const, label: 'Yahoo Mail', renderIcon: () => <YahooBrandIcon size={18} /> },
];

export function AddAccountModal({
  inElectron,
  accent,
  onClose,
  onConnected,
  setError,
  setNotice,
}: AddAccountModalProps) {
  const A = ACCENTS[accent];

  const [addMode, setAddMode] = useState<'oauth' | 'manual'>('oauth');
  const [busy, setBusy] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Manuel form alanları
  const [mEmail, setMEmail] = useState('');
  const [mPass, setMPass] = useState('');
  const [mImap, setMImap] = useState('');
  const [mImapPort, setMImapPort] = useState('993');
  const [mSmtp, setMSmtp] = useState('');
  const [mSmtpPort, setMSmtpPort] = useState('587');
  const [mNote, setMNote] = useState('');

  const connect = async (provider: 'google' | 'microsoft' | 'yahoo') => {
    setBusy(provider);
    setError(null);
    setNotice(null);
    setModalError(null);
    try {
      if (!window.postaci?.auth) {
        throw new Error('Electron API köprüsü yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
      }
      const res = await window.postaci.auth.start(provider);
      if (!res.email) {
        const msg = 'Giriş tamamlandı ama e-posta adresi alınamadı. Hesabı yeniden bağlayın.';
        setModalError(msg);
        setError(msg);
        return;
      }
      setNotice(`${res.email} bağlandı. Eşitleye basın.`);
      onConnected(res.email);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const clean = raw.replace(/^Error invoking remote method '[^']+': (Error:\s*)?/, '');
      setModalError(clean);
      setError(clean);
    } finally {
      setBusy(null);
    }
  };

  const autodetect = async () => {
    if (!mEmail || !window.postaci) return;
    setBusy('autoconfig');
    setError(null);
    try {
      const s = await window.postaci.mail.autoconfig(mEmail);
      setMImap(s.imap.host);
      setMImapPort(String(s.imap.port));
      setMSmtp(s.smtp.host);
      setMSmtpPort(String(s.smtp.port));
      setMNote(
        `${
          s.source === 'bilinen'
            ? 'Bilinen sağlayıcı'
            : s.source === 'autoconfig'
            ? 'Otomatik bulundu'
            : 'Tahmin'
        }: ${s.imap.host} / ${s.smtp.host}${s.note ? ' — ' + s.note : ''}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const addManual = async () => {
    if (!window.postaci) return;
    setBusy('manual');
    setError(null);
    setNotice(null);
    setModalError(null);
    try {
      await window.postaci.accounts.addManual({
        email: mEmail.trim(),
        password: mPass,
        imap: { host: mImap.trim(), port: Number(mImapPort) },
        smtp: {
          host: mSmtp.trim(),
          port: Number(mSmtpPort),
          secure: Number(mSmtpPort) === 465,
        },
      });
      setNotice(`${mEmail} eklendi ve bağlantı doğrulandı. Eşitleye basın.`);
      setMPass('');
      onConnected(mEmail.trim());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setModalError(msg);
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs animate-fadeIn select-none p-4"
      onClick={onClose}
    >
      <div
        className="w-[24rem] max-w-full rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PostaciLogo size="sm" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Hesap Ekle</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Sekme */}
        <div className="mb-4 flex gap-1 rounded-xl bg-zinc-100 p-1 text-xs dark:bg-zinc-800 font-medium">
          <button
            onClick={() => setAddMode('oauth')}
            className={`flex-1 rounded-lg py-1.5 transition ${
              addMode === 'oauth'
                ? 'bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Google / Microsoft / Yahoo
          </button>
          <button
            onClick={() => setAddMode('manual')}
            className={`flex-1 rounded-lg py-1.5 transition ${
              addMode === 'manual'
                ? 'bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Diğer (IMAP)
          </button>
        </div>

        {/* Hata Bildirimi */}
        {modalError && (
          <div className="mb-3 rounded-xl border border-red-300/80 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 flex items-start gap-2">
            <span className="shrink-0 text-sm">⚠️</span>
            <div className="flex-1 min-w-0">
              <span className="font-semibold leading-relaxed break-words">{modalError}</span>
            </div>
            <button
              type="button"
              onClick={() => setModalError(null)}
              className="text-red-400 hover:text-red-700 dark:hover:text-red-200 text-xs shrink-0 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {addMode === 'oauth' ? (
          <>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              {inElectron
                ? 'Sağlayıcıyı seçin, tarayıcıda güvenli giriş yapın.'
                : 'Hesap bağlama yalnızca Electron uygulamasında çalışır. `npm start` ile açın.'}
            </p>
            <div className="space-y-2">
              {PROVIDER_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  disabled={!inElectron || busy !== null}
                  onClick={() => connect(p.id)}
                  className="w-full flex items-center gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3.5 py-2.5 text-left text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-750 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 transition"
                >
                  <span className="shrink-0">{p.renderIcon()}</span>
                  <span className="truncate">
                    {busy === p.id ? 'Bağlanıyor, tarayıcıyı kontrol edin...' : p.label}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Kurumsal veya diğer sağlayıcılar. Şifre, bu bilgisayarda şifreli saklanır.
              Gmail/Outlook/Yahoo için uygulama şifresi gerekir.
            </p>
            <input
              value={mEmail}
              onChange={(e) => setMEmail(e.target.value)}
              placeholder="E-posta adresi"
              className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              value={mPass}
              onChange={(e) => setMPass(e.target.value)}
              type="password"
              placeholder="Şifre / uygulama şifresi"
              className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <button
              disabled={!inElectron || busy !== null || !mEmail}
              onClick={autodetect}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800 transition"
            >
              <SearchIcon size={14} />
              <span>{busy === 'autoconfig' ? 'Aranıyor...' : 'Sunucuyu Otomatik Bul'}</span>
            </button>
            {mNote && <p className={`rounded-md ${A.soft} p-2 text-xs`}>{mNote}</p>}
            <div className="grid grid-cols-[1fr_70px] gap-2">
              <input
                value={mImap}
                onChange={(e) => setMImap(e.target.value)}
                placeholder="IMAP sunucusu"
                className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
              <input
                value={mImapPort}
                onChange={(e) => setMImapPort(e.target.value)}
                placeholder="993"
                className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
              <input
                value={mSmtp}
                onChange={(e) => setMSmtp(e.target.value)}
                placeholder="SMTP sunucusu"
                className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
              <input
                value={mSmtpPort}
                onChange={(e) => setMSmtpPort(e.target.value)}
                placeholder="587"
                className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <button
              disabled={!inElectron || busy !== null || !mEmail || !mPass || !mImap || !mSmtp}
              onClick={addManual}
              className={`w-full rounded-lg ${A.btn} px-3 py-2 text-sm font-medium text-white disabled:opacity-50`}
            >
              {busy === 'manual' ? 'Bağlantı doğrulanıyor...' : 'Kaydet ve Bağlan'}
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Kapat
        </button>
      </div>
    </div>
  );
}
