import React, { useRef, useState } from 'react';
import { api } from '../services/api';
import { applyPreferences, collectPreferences } from '../services/preferences';
import { useToast } from '../context/ToastContext';

export function BackupPanel({ onRestored }: { onRestored: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { success, error } = useToast();
  const exportBackup = async () => {
    setBusy(true);
    try {
      const data = await api.exportBackup(passphrase, collectPreferences());
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'postaci_backup_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPassphrase(''); success('Şifreli yedek indirildi.');
    } catch (err: any) { error(err.message || 'Yedek oluşturulamadı.'); }
    finally { setBusy(false); }
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    if (file.size > 45 * 1024 * 1024) { error('Yedek dosyası 45 MB sınırını aşıyor.'); return; }
    setBusy(true);
    try {
      const result = await api.importBackup(JSON.parse(await file.text()), 'merge', passphrase);
      applyPreferences(result.preferences); setPassphrase('');
      success(result.message); onRestored();
    } catch (err: any) { error(err.message || 'Yedek geri yüklenemedi.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const control = { padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-medium)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' };
  return <section aria-label="Şifreli yedekleme" style={{ padding: 16, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
    <h3 style={{ marginTop: 0 }}>Şifreli tam yedek</h3>
    <p style={{ fontSize: 13 }}>Hesaplar ve OAuth izinleri, önbellekteki iletiler ve ekler, kişiler, takvim, klasörler ve tercihler AES-256-GCM ile şifrelenir.</p>
    <label>Yedek parolası (en az 12 karakter)
      <input aria-label="Yedek parolası" type="password" autoComplete="new-password" value={passphrase} onChange={e => setPassphrase(e.target.value)} style={{ ...control, display: 'block', width: '100%', marginTop: 8 }} />
    </label>
    <p style={{ fontSize: 12 }}>Parolayı kaybederseniz yedek açılamaz. Geri yükleme mevcut verilerle birleştirilir; eski şifresiz yedekler de okunabilir. Henüz indirilmemiş ileti gövdeleri yedekte bulunmaz.</p>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <button disabled={busy || passphrase.length < 12} onClick={exportBackup} style={control}>{busy ? 'İşleniyor…' : 'Şifreli yedeği indir'}</button>
      <button disabled={busy} onClick={() => input.current?.click()} style={control}>Yedekten birleştir</button>
      <input ref={input} type="file" accept=".json" hidden onChange={e => importBackup(e.target.files?.[0])} />
    </div>
  </section>;
}
