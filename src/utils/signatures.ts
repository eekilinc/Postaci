// src/utils/signatures.ts — hesap bazlı e-posta imza yönetimi
import type { AccountSignature } from '../types';

const STORAGE_KEY = 'postaci_signatures';

export function getAllSignatures(): Record<string, AccountSignature> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getAccountSignature(email: string | null | undefined): AccountSignature {
  if (!email) return { enabled: false, text: '', isHtml: false, html: '' };
  const all = getAllSignatures();
  const found = all[email];
  if (!found) return { enabled: false, text: '', isHtml: false, html: '' };
  return {
    enabled: !!found.enabled,
    text: found.text || '',
    isHtml: !!found.isHtml,
    html: found.html || '',
  };
}

export function saveAccountSignature(email: string, signature: AccountSignature): void {
  if (!email) return;
  const all = getAllSignatures();
  all[email] = signature;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}
