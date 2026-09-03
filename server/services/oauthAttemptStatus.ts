import type { Account } from '../../shared/mail.js';

export type OAuthAttemptStatus =
  | { status: 'pending' }
  | { status: 'success'; account: Account }
  | { status: 'error'; message: string };

type StoredAttempt = OAuthAttemptStatus & { expiresAt: number };
const attempts = new Map<string, StoredAttempt>();
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

function pruneExpired(now = Date.now()) {
  for (const [state, attempt] of attempts) {
    if (attempt.expiresAt <= now) attempts.delete(state);
  }
}

export function beginOAuthAttempt(state: string) {
  pruneExpired();
  attempts.set(state, { status: 'pending', expiresAt: Date.now() + ATTEMPT_TTL_MS });
}

export function completeOAuthAttempt(state: string, account: Account) {
  if (!state) return;
  attempts.set(state, { status: 'success', account, expiresAt: Date.now() + ATTEMPT_TTL_MS });
}

export function failOAuthAttempt(state: string, message: string) {
  if (!state) return;
  attempts.set(state, { status: 'error', message, expiresAt: Date.now() + ATTEMPT_TTL_MS });
}

export function getOAuthAttempt(state: string): OAuthAttemptStatus | undefined {
  pruneExpired();
  const attempt = attempts.get(state);
  if (!attempt) return undefined;
  if (attempt.status === 'success') return { status: 'success', account: attempt.account };
  if (attempt.status === 'error') return { status: 'error', message: attempt.message };
  return { status: 'pending' };
}
