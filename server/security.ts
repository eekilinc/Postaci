import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, Request } from 'express';

// Match Express's default case-insensitive, optional-trailing-slash routing.
const securityPath = (req: Request) => req.path.toLowerCase().replace(/\/$/, '');
const isProtectedPath = (route: string) => route === '/api' || route.startsWith('/api/') || route === '/events';

export function installSecurity(app: Express, port: number | (() => number)) {
  const token = process.env.POSTACI_API_TOKEN || randomBytes(32).toString('hex');
  const allowedOrigins = () => {
    const currentPort = typeof port === 'function' ? port() : port;
    const origins = new Set(['http://127.0.0.1:' + currentPort, 'http://localhost:' + currentPort]);
    if (process.env.NODE_ENV !== 'production' && process.env.POSTACI_DESKTOP !== '1') {
      origins.add('http://127.0.0.1:5173');
      origins.add('http://localhost:5173');
    }
    return origins;
  };
  const matches = (candidate: string) => {
    const a = Buffer.from(candidate), b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origins = allowedOrigins();
    const hosts = new Set([...origins].map(o => new URL(o).host));
    if (!hosts.has(req.headers.host || '')) return res.status(403).json({ error: 'Geçersiz sunucu adresi.' });
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return res.status(403).json({ error: 'Bu kaynağa izin verilmiyor.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; font-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; frame-src 'self' about:; object-src 'none'; base-uri 'none'; form-action 'none'");
    if (isProtectedPath(securityPath(req))) res.setHeader('Cache-Control', 'no-store');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.post('/api/session', (req, res) => {
    if (!req.headers.origin || !allowedOrigins().has(req.headers.origin)) return res.status(403).json({ error: 'Uygulamayı yerel adresinden açın.' });
    res.cookie('postaci_session', token, { httpOnly: true, sameSite: 'strict', path: '/' });
    res.json({ success: true, token });
  });
  app.use((req: Request, res, next) => {
    const route = securityPath(req);
    const isPublicRead = ['GET', 'HEAD'].includes(req.method) && (route === '/api/system/health' || route === '/api/auth/google/callback');
    if (!isProtectedPath(route) || isPublicRead) return next();
    const bearer = req.headers.authorization?.replace(/^Bearer /, '');
    const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('postaci_session='))?.slice('postaci_session='.length);
    if (!matches(bearer || cookie || '')) return res.status(401).json({ error: 'Oturum doğrulanamadı. Uygulamayı yeniden açın.' });
    if (!['GET', 'HEAD'].includes(req.method) && !bearer && !req.headers.origin) return res.status(403).json({ error: 'İstek kaynağı doğrulanamadı.' });
    next();
  });
}
