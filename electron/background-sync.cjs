// electron/background-sync.cjs - periyodik arka plan senkronizasyonu (main.cjs'ten tasindi)
const { getSetting, listAccounts, getAccountByEmail } = require('./db.cjs');
const { _lastSyncTime, runWithConcurrency, syncOneInboxWithTimeout, SYNC_CONCURRENCY } = require('./imap-queue.cjs');
const { notifyNewMessages } = require('./notifications.cjs');

let _getMainWindow = () => null;
function initBackgroundSync({ getMainWindow } = {}) {
  _getMainWindow = getMainWindow || (() => null);
}
function getMainWindow() { return _getMainWindow(); }

let bgSyncTimer = null;
let bgSyncRunning = false;

async function runBackgroundSync() {
  if (bgSyncRunning) return;
  bgSyncRunning = true;
  try {
    const settings = getSetting('notification_settings', {
      notificationsEnabled: true,
      syncIntervalMinutes: 2,
      soundEnabled: true,
    });

    if (!settings.syncIntervalMinutes || settings.syncIntervalMinutes <= 0) return;

    const accounts = listAccounts();
    if (!accounts || accounts.length === 0) return;

    // Eşitlenecek hesapları belirle (son 10 sn'de manuel eşitlenenleri atla)
    const pending = [];
    for (const acc of accounts) {
      try {
        const fullAcc = getAccountByEmail(acc.email);
        if (!fullAcc) continue;
        const normEmail = (fullAcc.email || '').toLowerCase().trim();
        const lastSync = _lastSyncTime.get(normEmail) || 0;
        // Son 10 saniyede kullanıcı/arayüz zaten bu hesabı senkronize ettiyse arka planda tekrar çekme
        if (Date.now() - lastSync < 10000) continue;
        pending.push(fullAcc);
      } catch (err) {
        console.warn(`[bg-sync] ${acc.email} senkronizasyon atlandı:`, err?.message || err);
      }
    }
    if (pending.length === 0) return;

    // Sınırlı paralellik: yavaş/asılı bir hesap diğerlerini bloklamaz
    const outcomes = await runWithConcurrency(pending, SYNC_CONCURRENCY, async (fullAcc) => {
      const res = await syncOneInboxWithTimeout(fullAcc);
      _lastSyncTime.set((fullAcc.email || '').toLowerCase().trim(), Date.now());
      return res;
    });

    outcomes.forEach((o, i) => {
      const fullAcc = pending[i];
      if (o.ok) {
        const res = o.value;
        if (res && res.newMessages && res.newMessages.length > 0) {
          notifyNewMessages(fullAcc.email, res.newMessages);
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notify:background-synced', {
              email: fullAcc.email,
              folderPath: 'INBOX',
              count: res.newMessages.length,
            });
          }
        }
      } else {
        console.warn(`[bg-sync] ${fullAcc.email} senkronizasyon atlandı:`, o.error?.message || o.error);
      }
    });
  } finally {
    bgSyncRunning = false;
  }
}

function updateBackgroundSyncSchedule() {
  if (bgSyncTimer) {
    clearInterval(bgSyncTimer);
    bgSyncTimer = null;
  }
  const settings = getSetting('notification_settings', {
    notificationsEnabled: true,
    syncIntervalMinutes: 2,
    soundEnabled: true,
  });

  const minutes = Number(settings.syncIntervalMinutes) || 2;
  if (minutes > 0) {
    const ms = Math.max(30000, Math.round(minutes * 60 * 1000));
    bgSyncTimer = setInterval(() => {
      runBackgroundSync().catch((e) => console.error('[bg-sync] hata:', e));
    }, ms);
    console.log(`[bg-sync] Arka plan senkronizasyonu devrede (${ms / 1000} sn aralıkla).`);
  } else {
    console.log('[bg-sync] Arka plan senkronizasyonu kapalı.');
  }
}

module.exports = { initBackgroundSync, runBackgroundSync, updateBackgroundSyncSchedule };
