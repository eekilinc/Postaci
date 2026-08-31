export const preferenceDefaults: Record<string, string> = {
  postaci_ai_mode: 'rules', postaci_ai_model: '',
  postaci_undo_send: '5', postaci_auto_sync: '60', postaci_block_tracking: 'true',
  postaci_block_images: 'true', postaci_desktop_notifs: 'true', postaci_notif_sound: 'subtle',
  postaci_sort_by: 'newest', postaci_view_layout: 'split-3-column',
  postaci_theme: 'dark', postaci_accent: 'blue', postaci_density: 'comfortable', postaci_ai_expanded: 'true',
};
export function filterPreferences(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(key in preferenceDefaults) || typeof value !== 'string' || value.length > 100) continue;
    if (key === 'postaci_undo_send' && (!/^\d+$/.test(value) || +value > 30)) continue;
    if (key === 'postaci_auto_sync' && (!/^\d+$/.test(value) || +value < 15 || +value > 3600)) continue;
    if (['postaci_block_tracking', 'postaci_block_images', 'postaci_desktop_notifs', 'postaci_ai_expanded'].includes(key) && !['true','false'].includes(value)) continue;
    if (key === 'postaci_ai_mode' && !['rules','ollama'].includes(value)) continue;
    if (key === 'postaci_ai_model' && (value && !/^[a-zA-Z0-9_:./-]+$/.test(value) || /cloud/i.test(value))) continue;
    result[key] = value;
  }
  return result;
}
