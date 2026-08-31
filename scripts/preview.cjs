const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
process.env.POSTACI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'postaci-preview-'));
process.env.POSTACI_SEED_DEMO = '1';
process.env.PORT = process.env.PORT || '3101';
process.env.NODE_ENV = 'production';
console.log('Preview uses synthetic demo data only.');
require('../dist/server/index.cjs');
