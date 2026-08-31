const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, ['--import','tsx','--test','tests/api.test.ts'], { stdio: 'inherit', env: { ...process.env, POSTACI_TEST_BUNDLE: '1' } });
process.exit(result.status ?? 1);
