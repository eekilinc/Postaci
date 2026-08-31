import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './storagePaths.js';
import { atomicWrite } from './secrets.js';
import { filterPreferences } from '../../shared/preferences.js';
const file = path.join(dataDir, 'preferences.json');
export function getPreferences(): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  return filterPreferences(JSON.parse(fs.readFileSync(file, 'utf8')));
}
export function savePreferences(input: unknown, replace = false) {
  const value = { ...(replace ? {} : getPreferences()), ...filterPreferences(input) };
  atomicWrite(file, JSON.stringify(value));
  return value;
}
