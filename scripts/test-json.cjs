const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/storage.test.ts'], { stdio: 'inherit', env: { ...process.env, POSTACI_STORAGE: 'json' } });
process.exit(result.status ?? 1);
