import React, { useEffect, useState } from 'react';
import { hydratePreferences } from '../services/preferences';
import { PostaciLogo } from './PostaciLogo';

export function AppBootstrap({ children, initialize = hydratePreferences, timeoutMs = 15000 }: {
  children: React.ReactNode;
  initialize?: (signal?: AbortSignal) => Promise<void>;
  timeoutMs?: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    setStatus('loading');
    setMessage('');
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    controller.signal.addEventListener('abort', () => {
      if (!disposed) {
        setMessage('Yerel sunucu zamanında yanıt vermedi. Uygulamayı yeniden açın veya tekrar deneyin.');
        setStatus('error');
      }
    }, { once: true });
    Promise.resolve().then(() => initialize(controller.signal)).then(() => {
      if (!disposed && !controller.signal.aborted) setStatus('ready');
    }).catch((error: unknown) => {
      if (!disposed && !controller.signal.aborted) {
        setMessage(error instanceof Error ? error.message : 'Yerel sunucuya ulaşılamadı.');
        setStatus('error');
      }
    }).finally(() => clearTimeout(timer));
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [attempt, initialize, timeoutMs]);

  if (status === 'ready') return <>{children}</>;
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#090d16', color: '#f8fafc' }}>
    <section role={status === 'error' ? 'alert' : 'status'} aria-live="polite" style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
      <PostaciLogo size={64} style={{ margin: '0 auto 20px' }} />
      <h1 style={{ fontSize: 24 }}>{status === 'error' ? 'Yerel sunucuya bağlanılamadı' : 'Postacı açılıyor'}</h1>
      <p style={{ color: '#cbd5e1', lineHeight: 1.6 }}>{status === 'error' ? message : 'Hesaplarınız ve tercihleriniz hazırlanıyor…'}</p>
      {status === 'error' && <button onClick={() => setAttempt(value => value + 1)} style={{ marginTop: 12, padding: '12px 22px', border: 0, borderRadius: 8, background: '#2563eb', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Tekrar dene</button>}
      <p style={{ marginTop: 24, color: '#94a3b8', fontSize: 12 }}>Posta verileriniz bu işlem sırasında silinmez.</p>
    </section>
  </main>;
}
