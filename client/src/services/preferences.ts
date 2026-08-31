import { filterPreferences, preferenceDefaults } from '../../../shared/preferences';
import { fetchSafe } from './api';
export function collectPreferences() {
  const values: Record<string, string> = {};
  for (const key of Object.keys(preferenceDefaults)) values[key] = localStorage.getItem(key) ?? preferenceDefaults[key];
  return filterPreferences(values);
}
export function applyPreferences(input: unknown) {
  for (const [key, value] of Object.entries(filterPreferences(input))) localStorage.setItem(key, value);
  window.dispatchEvent(new Event('postaci-preferences-changed'));
}
export async function persistPreferences(signal?: AbortSignal) {
  const res = await fetchSafe('/api/preferences', { method: 'PUT', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collectPreferences()) });
  if (!res.ok) throw new Error('Tercihler kaydedilemedi.');
  const preferences = await res.json();
  signal?.throwIfAborted();
  applyPreferences(preferences);
}
export async function hydratePreferences(signal?: AbortSignal) {
  localStorage.removeItem('postaci_google_client_secret');
  const res = await fetchSafe('/api/preferences', { signal });
  if (!res.ok) throw new Error('Tercihler yüklenemedi.');
  const preferences = await res.json();
  signal?.throwIfAborted();
  if (Object.keys(preferences).length) applyPreferences(preferences);
  else await persistPreferences(signal);
}
