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
  if (!email) return { enabled: false, text: '' };
  const all = getAllSignatures();
  return all[email] || { enabled: false, text: '' };
}

export function saveAccountSignature(email: string, signature: AccountSignature): void {
  if (!email) return;
  const all = getAllSignatures();
  all[email] = signature;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}
