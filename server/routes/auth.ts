import { Router, type Request, type Response } from 'express';
import { OAuthService } from '../services/oauthService.js';
import { ImapService } from '../services/imapService.js';
import { publicAccount } from '../services/secrets.js';
import { beginOAuthAttempt, completeOAuthAttempt, failOAuthAttempt, getOAuthAttempt } from '../services/oauthAttemptStatus.js';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
const returnToApp = '<a class="btn" href="postaci://oauth-complete">Postacı uygulamasına dön</a>';
export function authRoutes(broadcastSSE: (event: string, data: unknown) => void, port: string | number | (() => number)) {
const getPort = () => typeof port === 'function' ? port() : port;
const getRedirectUri = () => 'http://127.0.0.1:' + getPort() + '/api/auth/google/callback';
const router = Router();
// OAuth 2.0 Configuration Endpoints
router.get('/api/auth/oauth-config', (req: Request, res: Response) => {
  try {
    const creds = OAuthService.getCredentials();
    res.json({ ...creds, googleRedirectUri: getRedirectUri() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/auth/oauth-config', (req: Request, res: Response) => {
  try {
    const updated = OAuthService.saveCredentials(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// OAuth 2.0 Google Endpoints
router.get('/api/auth/google/url', (req: Request, res: Response) => {
  try {
    const clientId = (req.query.clientId as string) || undefined;
    const redirectUri = getRedirectUri();
    const url = OAuthService.getGoogleAuthUrl(redirectUri, clientId);
    const state = new URL(url).searchParams.get('state');
    if (!state) throw new Error('OAuth güvenlik durumu oluşturulamadı.');
    beginOAuthAttempt(state);
    res.json({ url, state });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/api/auth/google/status', (req: Request, res: Response) => {
  const state = String(req.query.state || '');
  if (!state) return res.status(400).json({ error: 'OAuth güvenlik durumu eksik.' });
  const result = getOAuthAttempt(state);
  if (!result) return res.status(404).json({ error: 'Yetkilendirme isteği bulunamadı veya süresi doldu.' });
  if (result.status === 'success') return res.json({ ...result, account: publicAccount(result.account) });
  return res.json(result);
});

router.get('/api/auth/google/callback', async (req: Request, res: Response) => {
  const state = String(req.query.state || '');
  try {
    const code = req.query.code as string;
    const errorQuery = req.query.error as string;
    if (errorQuery) {
      throw new Error(`Google yetkilendirmesi reddedildi veya iptal edildi (${errorQuery}).`);
    }
    if (!code) {
      throw new Error('Yetkilendirme kodu (Authorization code) bulunamadı.');
    }

    const redirectUri = getRedirectUri();
    const account = await OAuthService.handleGoogleCallback(code, redirectUri, state);
    completeOAuthAttempt(state, account);
    broadcastSSE('accounts_updated', publicAccount(account));

    // Auto-focus the desktop app window
    try {
      if (typeof (globalThis as any).__postaciFocusApp === 'function') {
        (globalThis as any).__postaciFocusApp();
      }
    } catch {}

    // Auto-sync the new Google account in background
    ImapService.syncAccount(account.id).catch((syncError: any) => {
      broadcastSSE('sync_error', { accountId: account.id, message: syncError?.message || 'İlk senkronizasyon tamamlanamadı.' });
    });

    res.send(`
      <!DOCTYPE html>
      <html lang="tr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="refresh" content="1;url=postaci://oauth-complete">
          <script>
            setTimeout(function() {
              try { window.location.href = 'postaci://oauth-complete'; } catch(e) {}
              setTimeout(function() { try { window.close(); } catch(e) {} }, 1000);
            }, 800);
          </script>
          <title>Google Girişi Başarılı — Postacı</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1329; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #131e3a; border: 1px solid #3b82f6; border-radius: 16px; padding: 40px; text-align: center; max-width: 460px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            h2 { color: #38bdf8; margin-top: 0; }
            p { color: #94a3b8; line-height: 1.6; font-size: 14px; }
            .badge { display: inline-block; background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 6px 16px; border-radius: 20px; font-weight: 600; margin-bottom: 16px; }
            .btn { display: inline-block; background: #3b82f6; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; cursor: pointer; border: none; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">✓ Yetkilendirme Başarılı</div>
            <h2>Postacı'ya Bağlandı!</h2>
            <p><strong>${account.email}</strong> Google hesabınız başarıyla eklendi ve senkronizasyon başlatıldı.</p>
            <p style="font-size: 13px; color: #64748b;">Postacı masaüstü uygulamasına dönebilirsiniz.</p>
            <p>Bu sekmeyi kapatıp Postacı uygulamasına dönebilirsiniz.</p>
            ${returnToApp}
          </div>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('Google OAuth callback error:', err);
    failOAuthAttempt(state, err.message || 'Yetkilendirme tamamlanamadı.');
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="tr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="refresh" content="1;url=postaci://oauth-complete">
          <title>Google Giriş Durumu — Postacı</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1329; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #131e3a; border: 1px solid #ef4444; border-radius: 16px; padding: 36px; text-align: center; max-width: 500px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            h2 { color: #f87171; margin-top: 0; }
            p { color: #cbd5e1; line-height: 1.6; font-size: 14px; }
            .alert-box { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px; margin: 16px 0; font-family: monospace; font-size: 13px; color: #fca5a5; word-break: break-all; }
            .solution { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 14px; margin-top: 16px; text-align: left; font-size: 13px; color: #93c5fd; }
            .btn { display: inline-block; background: #3b82f6; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Google Yetkilendirme Bildirimi</h2>
            <div class="alert-box">${escapeHtml(err.message || 'Yetkilendirme tamamlanamadı.')}</div>
            <div class="solution">
              <strong>💡 En Hızlı ve Sorunsuz Çözüm:</strong><br>
              Postacı uygulamasında <strong>Hesap Ekle &gt; Gmail</strong> ekranında <strong>"Uygulama Şifresi Kullan"</strong> seçeneğini seçip 16 haneli Google Uygulama Şifrenizle tek tıkla ve şartsız bağlanabilirsiniz.
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: #64748b;">Postacı uygulamasına dönüp işlemi tamamlayabilirsiniz.</p>
            ${returnToApp}
          </div>
        </body>
      </html>
    `);
  }
});


return router;
}
