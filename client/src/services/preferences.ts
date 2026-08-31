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
export async function persistPreferences() {
  const res = await fetchSafe('/api/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collectPreferences()) });
  if (!res.ok) throw new Error('Tercihler kaydedilemedi.');
  applyPreferences(await res.json());
}
export async function hydratePreferences() {
  localStorage.removeItem('postaci_google_client_secret');
  const res = await fetchSafe('/api/preferences');
  if (!res.ok) throw new Error('Tercihler yüklenemedi.');
  const preferences = await res.json();
  if (Object.keys(preferences).length) applyPreferences(preferences);
  else await persistPreferences();
}
