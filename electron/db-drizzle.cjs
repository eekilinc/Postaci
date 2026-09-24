// electron/db-drizzle.cjs - Drizzle destekli sorgu yardımcıları (Faz 2)
//
// db.cjs'teki ham SQL fonksiyonları buraya tek tek taşınır. Kurallar:
// - Ham `db` handle dışarıdan alınır (döngüsel require yok).
// - Tablo tanımları electron/db-schema.ts ile AYNI ad/sütunlarda tutulur;
//   parlama testi (db-schema.test.ts) sapmayı yakalar.
// - Davranış birebir korunur (JSON serileştirme dahil).
const { eq } = require('drizzle-orm');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { text, sqliteTable } = require('drizzle-orm/sqlite-core');

const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

const clients = new WeakMap();

function client(db) {
  let dz = clients.get(db);
  if (!dz) {
    dz = drizzle(db, { schema: { settings } });
    clients.set(db, dz);
  }
  return dz;
}

function settingGet(db, key, defaultValue = null) {
  const rows = client(db).select().from(settings).where(eq(settings.key, key)).all();
  if (rows.length === 0) return defaultValue;
  try {
    return JSON.parse(rows[0].value);
  } catch {
    return rows[0].value;
  }
}

function settingSet(db, key, value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  client(db)
    .insert(settings)
    .values({ key, value: str })
    .onConflictDoUpdate({ target: settings.key, set: { value: str } })
    .run();
}

module.exports = { settingGet, settingSet };
