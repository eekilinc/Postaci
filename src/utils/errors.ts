// src/utils/errors.ts — IPC hata mesajlarını arayüzde gösterilebilir hale getirir
// Electron ham mesajı "Error invoking remote method 'x': Error: ..." önekini taşır;
// kullanıcıya yalnızca asıl (çoğu zaman Türkçe, dostça) kısmı gösterilir.
export function cleanIpcError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? '');
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim() || raw;
}
