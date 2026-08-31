import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

for (const storage of ['sqlite', 'json']) {
  test('corrupt ' + storage + ' data fails closed instead of creating another store', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'postaci-test-corrupt-'));
    const filename = storage === 'sqlite' ? 'postaci.db' : 'postaci_store.json';
    const content = storage === 'sqlite' ? 'invalid SQLite file' : '{"accounts": "invalid"}';
    fs.writeFileSync(path.join(directory, filename), content);
    const child = spawnSync(process.execPath, ['--import','tsx','--input-type=module','-e', "const db = await import('./server/services/db.ts'); db.initDatabase();"], {
      cwd: process.cwd(),
      env: { ...process.env, POSTACI_DATA_DIR: directory, POSTACI_STORAGE: storage, POSTACI_SEED_DEMO: '0' },
      encoding: 'utf8',
    });
    assert.notEqual(child.status, 0);
    assert.equal(fs.readFileSync(path.join(directory, filename), 'utf8'), content);
    assert.ok(!fs.existsSync(path.join(directory, 'accounts.json')));
    if (storage === 'sqlite') assert.ok(!fs.existsSync(path.join(directory, 'postaci_store.json')));
  });
}
