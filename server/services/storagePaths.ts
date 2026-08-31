import path from 'node:path';
export const dataDir = process.env.POSTACI_DATA_DIR || path.resolve(process.cwd(), 'data');
