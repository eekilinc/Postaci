// electron/ipc/mail-mutate-ipc.cjs — durum degistiren kanallar (okundu/yildiz/sil/taşi/bosalt).
// mail-ipc.cjs'in alt grubu; ipc.cjs yukleyicisi tarafindan kaydettirilir.
// Sozlesme: ipc.test.ts (kanal + duman), ipc-static.test.ts (import/kullanim).


const { ipcMain } = require('electron');
const { getDb, getAccountByEmail, markReadDb, markUnreadDb, toggleStarDb, batchMarkReadDb, batchToggleStarDb } = require('../db.cjs');
const { markSeen, markUnseen, moveToTrash, batchMoveToTrash, batchMarkSeen, batchToggleFlag, moveToFolder, batchMoveToFolder } = require('../mail.cjs');
const { freshCredentials } = require('../token-auth.cjs');
const { markDeleted, clearDeleted, imapLock } = require('../imap-queue.cjs');
const { adjustUnread, countUnread, isTrashFolder, getTrashFolder, getSpamFolder, getArchiveFolder, emptySpecialFolder, TRASH_PATTERNS, SPAM_PATTERNS } = require('../ipc-helpers.cjs');



function register(_deps) {
ipcMain.handle('mail:mark-read', async (_evt, email, folderPath, uid) => {
markReadDb(email, folderPath || 'INBOX', uid); // önce yerel
if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
  return true;
}
// Sunucu bayrığı best-effort ve IMAP kuyruğuna girmeden
setImmediate(async () => {
  try {
    const acc = getAccountByEmail(email);
    if (acc) {
      const creds = await freshCredentials(acc);
      await imapLock(email, () =>
        markSeen({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, ...creds })
      );
    }
  } catch { /* best-effort */ }
});
return true;
});

ipcMain.handle('mail:mark-unread', async (_evt, email, folderPath, uid) => {
markUnreadDb(email, folderPath || 'INBOX', uid); // önce yerel
if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
  return true;
}
setImmediate(async () => {
  try {
    const acc = getAccountByEmail(email);
    if (acc) {
      const creds = await freshCredentials(acc);
      await imapLock(email, () =>
        markUnseen({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, ...creds })
      );
    }
  } catch { /* best-effort */ }
});
return true;
});

ipcMain.handle('mail:star', (_evt, email, folderPath, uid) => {
const next = toggleStarDb(email, folderPath || 'INBOX', uid);
// Sunucu bayrağı best-effort (okundu işaretindeki desen): önce yerel, IMAP arka planda
if (!String(uid).startsWith('draft-') && !String(uid).startsWith('local-')) {
  setImmediate(async () => {
    try {
      const acc = getAccountByEmail(email);
      if (!acc) return;
      const creds = await freshCredentials(acc);
      await imapLock(email, () =>
        batchToggleFlag({
          provider: acc.provider, email: acc.email,
          folderPath: folderPath || 'INBOX', uids: [String(uid)],
          isFlagged: !!next, ...creds,
        })
      );
    } catch { /* best-effort */ }
  });
}
return next;
});

ipcMain.handle('mail:delete', async (_evt, email, folderPath, uid) => {
if (!email || !folderPath || !uid) return false;
const isTrash = isTrashFolder(folderPath);

// 1. Önce ANINDA yerel DB ve önbellek yönetimi (0ms tepki)
markDeleted(email, folderPath, String(uid));

// Yerel taslaklar veya gönderilen kuyruk mesajları IMAP üzerinde aranmaz, doğrudan DB'den silinir
if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
  try {
    getDb().prepare(
      `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND uid=?`
    ).run(email, String(uid));
  } catch (err) {
    console.warn('[mail:delete] taslak silme uyarısı:', err?.message);
  }
  return true;
}

// Mesajın subject, message_id ve ek bilgilerini yerel DB'den al (IMAP fallback arama ve taşıma için)
let localMsg = null;
let localAtts = [];
try {
  localMsg = getDb().prepare(
    `SELECT * FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
  ).get(email, folderPath, String(uid));
  localAtts = getDb().prepare(
    `SELECT * FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND msg_uid=?`
  ).all(email, folderPath, String(uid));
} catch {}

try {
  // 1. ÖNCE sunucu tarafı IMAP işlemini yürüt.
  // Sıralama kritik: yerel kayıt IMAP başarısı olmadan silinirse, deletedUidCache
  // TTL'i (5 dk) dolduğunda ileti bir sonraki senkronda geri yüklenir ve kullanıcı
  // "sildim, geri geldi" diye raporlar. Başarısızlıkta renderer'a fırlatıp
  // iyimser (optimistic) silmeyi geri aldırıyoruz.
  let res = null;
  const acc = getAccountByEmail(email);
  if (acc) {
    const creds = await freshCredentials(acc);
    res = await imapLock(email, () =>
      moveToTrash({
        provider: acc.provider,
        email: acc.email,
        folderPath,
        uid: String(uid),
        subject: localMsg?.subject,
        messageId: localMsg?.message_id,
        ...creds,
      })
    );
    if (!res) {
      // markDeleted'ı geri al: aksi halde 5 dk boyunca bu UID senkronlanmayacak
      clearDeleted(email, folderPath, String(uid));
      throw new Error('E-posta sunucudan silinemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    }
    console.log('[mail:delete] moveToTrash başarılı:', res.success ? 'ok' : res);
  }

  // 2. IMAP başarılı: yerel kaydı sil.
  // UYARI: Çöp kutusuna eski INBOX UID'si ile geçici kayıt eklemiyoruz!
  // Bu geçersiz UID çöpten silinmeye çalışıldığında bulunamaz ve hortlamaya yol açar.
  getDb().prepare(
    `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
  ).run(email, folderPath, String(uid));
  try {
    getDb().prepare(
      `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND msg_uid=?`
    ).run(email, folderPath, String(uid));
  } catch (attErr) {
    console.warn('[mail:delete] ek temizleme uyarısı:', attErr?.message);
  }

  if (res) {
    if (isTrash) {
      // Çöp kutusunda expunge edilen gerçek UID varsa (eski UID'den farklıysa) onu da önbelleğe al ve DB'den temizle
      if (res.realUid && res.realUid !== String(uid)) {
        markDeleted(email, folderPath, res.realUid);
        try {
          getDb().prepare(
            `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
          ).run(email, folderPath, res.realUid);
          getDb().prepare(
            `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND msg_uid=?`
          ).run(email, folderPath, res.realUid);
        } catch {}
      }
    } else if (res.dest && res.destUid && localMsg) {
      // Normal klasörden çöpe taşındıysa ve sunucu yeni UID döndürdüyse (COPYUID):
      // Çöp kutusuna GERÇEK UID ile ekle! Asla eski/geçersiz INBOX UID'si kullanılmaz.
      const finalDest = res.dest;
      const finalUid = String(res.destUid);
      try {
        const db = getDb();
        const existing = db.prepare(
          `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
        ).get(email, finalDest, finalUid);

        if (!existing) {
          // Çöpe atılan iletiler çöpte okunmuş (is_read=1) sayılır, çöp rozetini şişirmez
          db.prepare(`
            INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, body_html, body_text, is_read, message_id, refs, starred)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            localMsg.account_id,
            finalDest,
            finalUid,
            localMsg.subject,
            localMsg.from_addr,
            localMsg.to_addr,
            localMsg.date,
            localMsg.snippet,
            localMsg.body_html,
            localMsg.body_text,
            1,
            localMsg.message_id,
            localMsg.refs,
            localMsg.starred || 0
          );
        }

        if (localAtts && localAtts.length > 0) {
          const insAtt = db.prepare(`
            INSERT OR IGNORE INTO attachments (account_id, folder_path, msg_uid, idx, filename, content_type, size)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          for (const att of localAtts) {
            insAtt.run(att.account_id, finalDest, finalUid, att.idx, att.filename, att.content_type, att.size);
          }
        }
      } catch (syncErr) {
        console.warn('[mail:delete] DB hedef UID ekleme hatası:', syncErr?.message);
      }
    }
  }

  // 3. Okunmamış sayacını delta ile güncelle.
  // Yerel alt kümeden yeniden hesaplamak sunucu değerini eziyordu.
  if (localMsg && !localMsg.is_read) adjustUnread(email, folderPath, -1);

  return true;
} catch (e) {
  // Renderer iyimser (optimistic) silmeyi geri alsın diye FIRLAT.
  // `return false` sessiz kalıyordu: UI iletiyi gizliyor, DB'de de silinmişti,
  // 5 dk sonra deletedUidCache TTL'i dolunca ileti listede geri beliriyordu.
  console.error('[mail:delete] error:', e);
  const msg = e instanceof Error ? e.message : String(e);
  throw new Error(msg || 'E-posta silinemedi.');
}
});

ipcMain.handle('mail:batch-delete', async (_evt, email, folderPath, uids) => {
if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
const isTrash = isTrashFolder(folderPath);
for (const uid of uids) {
  markDeleted(email, folderPath, String(uid));
}

const localDraftUids = uids.filter((u) => String(u).startsWith('draft-') || String(u).startsWith('local-'));
const serverUids = uids.filter((u) => !String(u).startsWith('draft-') && !String(u).startsWith('local-'));

// Yerel taslakları doğrudan veritabanından sil (sunucuda karşılıkları yok)
if (localDraftUids.length > 0) {
  try {
    const db = getDb();
    const delStmt = db.prepare(
      `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND uid=?`
    );
    db.transaction((list) => {
      for (const uid of list) delStmt.run(email, String(uid));
    })(localDraftUids);
  } catch (err) {
    console.warn('[mail:batch-delete] yerel taslak silme uyarısı:', err?.message);
  }
}

// Sunucu mesajları için: ÖNCE IMAP, SONRA yerel DB.
// Ters sırada IMAP hatasında yerel kayıtlar silinmiş kalıyor ve
// deletedUidCache TTL'i (5 dk) dolunca iletiler toplu halde geri yükleniyordu.
if (serverUids.length > 0) {
  let localMsgs = [];
  let localAtts = [];
  // Okunmamış sayacı için silme ÖNCESİ kaç iletinin okunmamış olduğunu bil
  const removedUnread = countUnread(email, folderPath, serverUids);
  try {
    const acc = getAccountByEmail(email);
    if (acc) {
      // Taşıma için gereken yerel metadata'yı SİLME ÖNCESİ oku
      if (!isTrash && serverUids.length > 0) {
        try {
          const db = getDb();
          const placeholders = serverUids.map(() => '?').join(',');
          localMsgs = db.prepare(
            `SELECT * FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid IN (${placeholders})`
          ).all(email, folderPath, ...serverUids.map(String));
          localAtts = db.prepare(
            `SELECT * FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND msg_uid IN (${placeholders})`
          ).all(email, folderPath, ...serverUids.map(String));
        } catch (readErr) {
          console.warn('[mail:batch-delete] yerel meta okuma uyarısı:', readErr?.message);
        }
      }

      const creds = await freshCredentials(acc);
      const res = await imapLock(email, () =>
        batchMoveToTrash({ provider: acc.provider, email: acc.email, folderPath, uids: serverUids, ...creds })
      );
      if (res && res.success === false) {
        for (const uid of serverUids) clearDeleted(email, folderPath, String(uid));
        throw new Error(res.error || 'E-postalar sunucudan silinemedi.');
      }

      // 1. IMAP başarılı: yerel kayıtları sil
      try {
        const db = getDb();
        const stmt = db.prepare(
          `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
        );
        const attStmt = db.prepare(
          `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND msg_uid=?`
        );
        db.transaction((list) => {
          for (const uid of list) {
            stmt.run(email, folderPath, String(uid));
            try { attStmt.run(email, folderPath, String(uid)); } catch {}
          }
        })(serverUids);
      } catch (dbErr) {
        console.warn('[mail:batch-delete] DB uyarısı:', dbErr?.message);
      }

      if (!isTrash && res?.dest && res?.uidMap && localMsgs.length > 0) {
        const finalDest = res.dest;
        const uidMap = res.uidMap || {};
        try {
          const db = getDb();
          const checkStmt = db.prepare(
            `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
          );
          const insMsg = db.prepare(`
            INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, body_html, body_text, is_read, message_id, refs, starred)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          const insAtt = db.prepare(`
            INSERT OR IGNORE INTO attachments (account_id, folder_path, msg_uid, idx, filename, content_type, size)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          db.transaction((msgs) => {
            for (const m of msgs) {
              const newUid = uidMap[String(m.uid)];
              if (newUid) {
                const existing = checkStmt.get(email, finalDest, String(newUid));
                if (!existing) {
                  insMsg.run(
                    m.account_id,
                    finalDest,
                    String(newUid),
                    m.subject,
                    m.from_addr,
                    m.to_addr,
                    m.date,
                    m.snippet,
                    m.body_html,
                    m.body_text,
                    1,
                    m.message_id,
                    m.refs,
                    m.starred || 0
                  );
                }
                const atts = localAtts.filter((a) => String(a.msg_uid) === String(m.uid));
                for (const a of atts) {
                  try { insAtt.run(a.account_id, finalDest, String(newUid), a.idx, a.filename, a.content_type, a.size); } catch {}
                }
              }
            }
          })(localMsgs);
        } catch (batchDbErr) {
          console.warn('[mail:batch-delete] DB senkron ekleme uyarısı:', batchDbErr?.message);
        }
      }
    }

    // 3. Okunmamış sayacını delta ile güncelle (silinen okunmamış sayısı kadar azalt)
    if (removedUnread > 0) adjustUnread(email, folderPath, -removedUnread);

    return true;
  } catch (e) {
    // Renderer'ın iyimser toplu silmesini geri aldırmak için fırlat
    console.error('[mail:batch-delete] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg || 'E-postalar silinemedi.');
  }
}

return true;
});

ipcMain.handle('mail:move-to-folder', async (_evt, email, fromFolder, toFolder, uid) => {
if (!email || !fromFolder || !toFolder || !uid) return false;
if (fromFolder.toLowerCase() === toFolder.toLowerCase()) return true;

markDeleted(email, fromFolder, String(uid));

// Taslak/yerel iletiler sunucuda yok; doğrudan taşı
if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
  try {
    getDb().prepare(
      `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
    ).run(toFolder, email, fromFolder, String(uid));
  } catch (e) {
    console.warn('[mail:move-to-folder] DB uyarısı:', e?.message);
  }
  return true;
}

// ÖNCE sunucuda taşı, sonra yerel kaydı güncelle. Sunucu başarısız olursa
// markDeleted geri alınır ve renderer'a fırlatılır (iyimser taşıma geri alınır).
try {
  const acc = getAccountByEmail(email);
  if (acc) {
    const creds = await freshCredentials(acc);
    const res = await imapLock(email, () =>
      moveToFolder({ provider: acc.provider, email: acc.email, fromFolder, toFolder, uid: String(uid), ...creds })
    );
    if (!res) {
      clearDeleted(email, fromFolder, String(uid));
      throw new Error('E-posta sunucuda taşınamadı. Bağlantınızı kontrol edip tekrar deneyin.');
    }

    try {
      const db = getDb();
      const finalUid = res.destUid ? String(res.destUid) : String(uid);
      const existing = db.prepare(
        `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
      ).get(email, toFolder, finalUid);
      if (existing) {
        db.prepare(
          `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
        ).run(email, fromFolder, String(uid));
      } else {
        db.prepare(
          `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
        ).run(toFolder, finalUid, email, fromFolder, String(uid));
      }
      try {
        db.prepare(
          `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND msg_uid=?`
        ).run(toFolder, finalUid, email, fromFolder, String(uid));
      } catch {}
    } catch (mErr) {
      console.warn('[mail:move-to-folder] UID güncelleme hatası:', mErr?.message);
    }
  }
  return true;
} catch (e) {
  console.error('[mail:move-to-folder] error:', e);
  const msg = e instanceof Error ? e.message : String(e);
  throw new Error(msg || 'E-posta taşınamadı.');
}
});

ipcMain.handle('mail:batch-move-to-folder', async (_evt, email, fromFolder, toFolder, uids) => {
if (!email || !fromFolder || !toFolder || !Array.isArray(uids) || uids.length === 0) return false;
if (fromFolder.toLowerCase() === toFolder.toLowerCase()) return true;

for (const uid of uids) {
  markDeleted(email, fromFolder, String(uid));
}

const serverUids = uids.filter((u) => !String(u).startsWith('draft-') && !String(u).startsWith('local-'));
const localUids = uids.filter((u) => String(u).startsWith('draft-') || String(u).startsWith('local-'));

// Taslak/yerel iletiler sunucuda yok: doğrudan taşı
if (localUids.length > 0) {
  try {
    const db = getDb();
    const stmt = db.prepare(
      `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
    );
    db.transaction((list) => {
      for (const uid of list) stmt.run(toFolder, email, fromFolder, String(uid));
    })(localUids);
  } catch (e) {
    console.warn('[mail:batch-move-to-folder] DB uyarısı:', e?.message);
  }
}
if (serverUids.length === 0) return true;

try {
  const acc = getAccountByEmail(email);
  if (acc) {
    const creds = await freshCredentials(acc);
    const res = await imapLock(email, () =>
      batchMoveToFolder({ provider: acc.provider, email: acc.email, fromFolder, toFolder, uids: serverUids, ...creds })
    );
    if (!res || res.success === false) {
      for (const uid of serverUids) clearDeleted(email, fromFolder, String(uid));
      throw new Error(res?.error || 'E-postalar sunucuda taşınamadı.');
    }

    const uidMap = res.uidMap || {};
    {
      try {
        const db = getDb();
        const updateStmt = db.prepare(
          `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
        );
        const deleteStmt = db.prepare(
          `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
        );
        const checkStmt = db.prepare(
          `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
        );
        const updateAttStmt = db.prepare(
          `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND msg_uid=?`
        );

        db.transaction((list) => {
          for (const oldUid of list) {
            const newUid = uidMap[String(oldUid)];
            if (newUid) {
              const existing = checkStmt.get(email, toFolder, String(newUid));
              if (existing) {
                deleteStmt.run(email, toFolder, String(oldUid));
              } else {
                updateStmt.run(toFolder, String(newUid), email, toFolder, String(oldUid));
              }
              try {
                updateAttStmt.run(toFolder, String(newUid), email, fromFolder, String(oldUid));
              } catch {}
            } else {
              deleteStmt.run(email, toFolder, String(oldUid));
            }
          }
        })(serverUids);
      } catch (bmErr) {
        console.warn('[mail:batch-move-to-folder] UID güncelleme hatası:', bmErr?.message);
      }
    }
  }
  return true;
} catch (e) {
  console.error('[mail:batch-move-to-folder] error:', e);
  const msg = e instanceof Error ? e.message : String(e);
  throw new Error(msg || 'E-postalar taşınamadı.');
}
});

ipcMain.handle('mail:archive', async (_evt, email, folderPath, uid) => {
if (!email || !folderPath || !uid) return false;
const targetArchive = getArchiveFolder(email);
if (folderPath.toLowerCase() === targetArchive.toLowerCase()) return true;

markDeleted(email, folderPath, String(uid));

if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
  try {
    getDb().prepare(
      `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
    ).run(targetArchive, email, folderPath, String(uid));
  } catch (e) {
    console.warn('[mail:archive] DB uyarısı:', e?.message);
  }
  return true;
}

// Sunucuda taşı başarısız olursa yerel kayıt taşınmış sayılmasın
try {
  const acc = getAccountByEmail(email);
  if (acc) {
    const creds = await freshCredentials(acc);
    const res = await imapLock(email, () =>
      moveToFolder({ provider: acc.provider, email: acc.email, fromFolder: folderPath, toFolder: targetArchive, uid: String(uid), ...creds })
    );
    if (!res) {
      clearDeleted(email, folderPath, String(uid));
      throw new Error('E-posta sunucuda arşivlenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    }
    try {
      const db = getDb();
      const finalUid = res.destUid ? String(res.destUid) : String(uid);
      db.prepare(
        `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
      ).run(targetArchive, finalUid, email, folderPath, String(uid));
      try {
        db.prepare(
          `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND msg_uid=?`
        ).run(targetArchive, finalUid, email, folderPath, String(uid));
      } catch {}
    } catch (aErr) {
      console.warn('[mail:archive] UID güncelleme hatası:', aErr?.message);
    }
  }
  return true;
} catch (e) {
  console.error('[mail:archive] error:', e);
  const msg = e instanceof Error ? e.message : String(e);
  throw new Error(msg || 'E-posta arşivlenemedi.');
}
});

ipcMain.handle('mail:batch-archive', async (_evt, email, folderPath, uids) => {
if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
const targetArchive = getArchiveFolder(email);
if (folderPath.toLowerCase() === targetArchive.toLowerCase()) return true;

for (const uid of uids) {
  markDeleted(email, folderPath, String(uid));
}

const serverUids = uids.filter((u) => !String(u).startsWith('draft-') && !String(u).startsWith('local-'));
const localUids = uids.filter((u) => String(u).startsWith('draft-') || String(u).startsWith('local-'));
if (localUids.length > 0) {
  try {
    const db = getDb();
    const stmt = db.prepare(
      `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
    );
    db.transaction((list) => {
      for (const uid of list) stmt.run(targetArchive, email, folderPath, String(uid));
    })(localUids);
  } catch (e) {
    console.warn('[mail:batch-archive] DB uyarısı:', e?.message);
  }
}
if (serverUids.length === 0) return true;

try {
  const acc = getAccountByEmail(email);
  if (acc) {
    const creds = await freshCredentials(acc);
    const res = await imapLock(email, () =>
      batchMoveToFolder({ provider: acc.provider, email: acc.email, fromFolder: folderPath, toFolder: targetArchive, uids: serverUids, ...creds })
    );
    if (!res || res.success === false) {
      for (const uid of serverUids) clearDeleted(email, folderPath, String(uid));
      throw new Error(res?.error || 'E-postalar sunucuda arşivlenemedi.');
    }

    const uidMap = res.uidMap || {};
      try {
        const db = getDb();
        const updateStmt = db.prepare(
          `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
        );
        const deleteStmt = db.prepare(
          `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
        );
        const checkStmt = db.prepare(
          `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
        );
        const updateAttStmt = db.prepare(
          `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND msg_uid=?`
        );

        db.transaction((list) => {
          for (const oldUid of list) {
            const newUid = uidMap[String(oldUid)];
            if (newUid) {
              const existing = checkStmt.get(email, targetArchive, String(newUid));
              if (existing) {
                deleteStmt.run(email, targetArchive, String(oldUid));
              } else {
                updateStmt.run(targetArchive, String(newUid), email, targetArchive, String(oldUid));
              }
              try {
                updateAttStmt.run(targetArchive, String(newUid), email, folderPath, String(oldUid));
              } catch {}
            } else {
              deleteStmt.run(email, targetArchive, String(oldUid));
            }
          }
        })(serverUids);
      } catch (baErr) {
        console.warn('[mail:batch-archive] UID güncelleme hatası:', baErr?.message);
      }
  }
  return true;
} catch (e) {
  console.error('[mail:batch-archive] error:', e);
  const msg = e instanceof Error ? e.message : String(e);
  throw new Error(msg || 'E-postalar arşivlenemedi.');
}
});

ipcMain.handle('mail:batch-mark-read', async (_evt, email, folderPath, uids, isRead = true) => {
if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
batchMarkReadDb(email, folderPath, uids, isRead ? 1 : 0);
try {
  const acc = getAccountByEmail(email);
  if (acc) {
    const creds = await freshCredentials(acc);
    await imapLock(email, () =>
      batchMarkSeen({ provider: acc.provider, email: acc.email, folderPath, uids, isSeen: !!isRead, ...creds })
    );
  }
  return true;
} catch (e) {
  console.error('[mail:batch-mark-read] error:', e);
  return false;
}
});

ipcMain.handle('mail:batch-star', async (_evt, email, folderPath, uids, starred = true) => {
if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
batchToggleStarDb(email, folderPath, uids, starred ? 1 : 0);
try {
  const acc = getAccountByEmail(email);
  if (acc) {
    const creds = await freshCredentials(acc);
    await imapLock(email, () =>
      batchToggleFlag({ provider: acc.provider, email: acc.email, folderPath, uids, isFlagged: !!starred, ...creds })
    );
  }
  return true;
} catch (e) {
  console.error('[mail:batch-star] error:', e);
  return false;
}
});

ipcMain.handle('mail:empty-trash', async (_evt, email) => {
return emptySpecialFolder({
  email,
  folder: getTrashFolder(email),
  patterns: TRASH_PATTERNS,
  imapFlag: '\\Trash',
  label: 'Çöp kutusu',
});
});

ipcMain.handle('mail:empty-spam', async (_evt, email) => {
return emptySpecialFolder({
  email,
  folder: getSpamFolder(email),
  patterns: SPAM_PATTERNS,
  imapFlag: '\\Junk',
  label: 'Gereksiz e-posta',
});
});

}

module.exports = { register };
