// src/hooks/useMessages.ts — mesaj listesi, filtreleme, sayfalama ve sync
import { useMemo, useRef, useState } from 'react';
import type { FilterKey, Msg } from '../types';
import { cleanIpcError } from '../utils/errors';

const PAGE_SIZE = 50;

// Eşitle sonucunu tek cümlede özetler; sessiz başarısızlıkları görünür kılar
function formatSyncNotice(
  folderPath: string | null,
  r: { total: number; synced: number; failed?: number; firstError?: string | null },
): string {
  const where = folderPath ? ` ${folderPath}` : '';
  let s = `Eşitlendi${where}: kutuda ${r.total}, çekilen ${r.synced}`;
  if (r.failed) {
    s += `, hatalı ${r.failed}`;
    if (r.firstError) s += ` (neden: ${r.firstError.slice(0, 180)})`;
  } else if (r.total > 0 && r.synced === 0) {
    s += `. Sunucu ${r.total} ileti bildiriyor ama hiçbiri listeye düşmedi — klasör adı/eşleşmesi veya okuma izni sorunu olabilir.`;
  }
  return s + '.';
}

export function useMessages() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [totalDbCount, setTotalDbCount] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAll, setSearchAll] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  // Her klasör / hesap sorgusu için artan sayaç (yarış durumlarını / zıplamaları önler)
  const reqIdRef = useRef(0);
  const activeFolderRef = useRef<string | null>(null);
  const activeAccountRef = useRef<string | null>(null);
  const isUnifiedRef = useRef<boolean>(false);
  const [currentTarget, setCurrentTarget] = useState<{ folder: string; unified: boolean }>({ folder: 'INBOX', unified: false });

  const loadMessages = (
    email: string | null,
    folderPath: string,
    isUnified: boolean = false,
  ) => {
    if ((!email && !isUnified) || !window.postaci) {
      setMessages([]);
      setTotalDbCount(0);
      activeFolderRef.current = null;
      activeAccountRef.current = null;
      isUnifiedRef.current = false;
      setCurrentTarget({ folder: 'INBOX', unified: false });
      return;
    }
    const currentReqId = ++reqIdRef.current;
    const isTargetChanged =
      activeFolderRef.current !== folderPath ||
      activeAccountRef.current !== email ||
      isUnifiedRef.current !== isUnified;

    activeFolderRef.current = folderPath;
    activeAccountRef.current = email;
    isUnifiedRef.current = isUnified;
    setCurrentTarget({ folder: folderPath, unified: isUnified });

    // Klasör değiştiğinde eski klasörün iletilerinin ekranda kalmaması veya yeni klasörün
    // listesine karışmaması için anında temizle. Yerel SQLite okuması <2ms sürer.
    if (isTargetChanged) {
      setMessages([]);
      setTotalDbCount(0);
      setServerTotal(0);
    }

    if (isUnified) {
      window.postaci.mail
        .countUnified()
        .then((counts) => {
          if (reqIdRef.current !== currentReqId) return;
          if (!isUnifiedRef.current) return;
          setTotalDbCount(counts.total);
        })
        .catch(() => {});

      window.postaci.mail
        .listUnified(PAGE_SIZE, 0)
        .then((list) => {
          if (reqIdRef.current !== currentReqId) return;
          if (!isUnifiedRef.current) return;
          setMessages(list);
        })
        .catch(() => {});
      return;
    }

    // Klasörün toplam sayısını al
    window.postaci.mail
      .count(email!, folderPath)
      .then((counts) => {
        if (reqIdRef.current !== currentReqId) return;
        if (
          (activeFolderRef.current || 'INBOX').toLowerCase() !== (folderPath || 'INBOX').toLowerCase() ||
          activeAccountRef.current !== email ||
          isUnifiedRef.current
        ) {
          return;
        }
        setTotalDbCount(counts.total);
      })
      .catch(() => {});

    // İlk sayfayı (50 mesaj) yükle
    window.postaci.mail
      .list(email!, folderPath, PAGE_SIZE, 0)
      .then((list) => {
        if (reqIdRef.current !== currentReqId) return;
        if (
          (activeFolderRef.current || 'INBOX').toLowerCase() !== (folderPath || 'INBOX').toLowerCase() ||
          activeAccountRef.current !== email ||
          isUnifiedRef.current
        ) {
          return;
        }
        setMessages(list);
      })
      .catch(() => {});
  };

  // Yerel DB'den sonraki 50 mesajı yükle
  const loadMore = async (email: string | null, folderPath: string, isUnified: boolean = false) => {
    if ((!email && !isUnified) || !window.postaci || loadingMore || searchQuery.trim()) return;
    if (messages.length === 0 || messages.length >= totalDbCount) return;
    if (activeFolderRef.current !== folderPath || activeAccountRef.current !== email || isUnifiedRef.current !== isUnified) return;

    const currentReqId = reqIdRef.current;
    setLoadingMore(true);
    try {
      const nextBatch = isUnified
        ? await window.postaci.mail.listUnified(PAGE_SIZE, messages.length)
        : await window.postaci.mail.list(email!, folderPath, PAGE_SIZE, messages.length);
      if (reqIdRef.current !== currentReqId) return;
      if (activeFolderRef.current !== folderPath || activeAccountRef.current !== email || isUnifiedRef.current !== isUnified) return;

      if (nextBatch.length > 0) {
        setMessages((prev) => {
          const targetNorm = (folderPath || 'INBOX').toLowerCase();
          const isDraft = /draft|taslak/i.test(targetNorm);
          // prev içindeki mesajların gerçekten bu klasöre ait olduğundan emin ol (asla yabancı klasör ekleme!)
          const validPrev = isUnified
            ? prev
            : prev.filter((m) => {
                if (!m.folder_path) return true;
                const mNorm = m.folder_path.toLowerCase();
                return mNorm === targetNorm || (isDraft && (/draft|taslak/i.test(mNorm) || String(m.uid).startsWith('draft-')));
              });

          const existingUids = new Set(validPrev.map((m) => m.uid));
          const additions = nextBatch.filter((m) => !existingUids.has(m.uid));
          return [...validPrev, ...additions];
        });
      }
    } finally {
      if (reqIdRef.current === currentReqId) {
        setLoadingMore(false);
      }
    }
  };

  // Sunucudan (IMAP) daha eski e-postaları çek
  const loadMoreFromServer = async (
    email: string | null,
    folderPath: string,
    setError: (e: string | null) => void,
    setNotice: (n: string | null) => void,
  ) => {
    if (!email || !window.postaci || loadingMore || syncing) return;
    const currentReqId = reqIdRef.current;
    setLoadingMore(true);
    setError(null);
    setNotice(null);
    try {
      const oldestMsg = messages[messages.length - 1];
      const beforeUid = oldestMsg?.uid;
      const res = await window.postaci.mail.syncMore(email, folderPath, beforeUid, PAGE_SIZE);
      if (reqIdRef.current !== currentReqId) return;
      if (
        (activeFolderRef.current || 'INBOX').toLowerCase() !== (folderPath || 'INBOX').toLowerCase() ||
        activeAccountRef.current !== email ||
        isUnifiedRef.current
      ) {
        return;
      }
      setNotice(
        `Sunucudan ${res.synced} eski e-posta daha çekildi (toplam kutuda: ${res.total}).`,
      );
      setServerTotal(res.total);
      // DB'deki sayıyı güncelle ve listeyi tazele
      const counts = await window.postaci.mail.count(email, folderPath);
      if (reqIdRef.current !== currentReqId) return;
      if (
        (activeFolderRef.current || 'INBOX').toLowerCase() !== (folderPath || 'INBOX').toLowerCase() ||
        activeAccountRef.current !== email ||
        isUnifiedRef.current
      ) {
        return;
      }
      setTotalDbCount(counts.total);
      const updatedList = await window.postaci.mail.list(email, folderPath, messages.length + PAGE_SIZE, 0);
      if (reqIdRef.current !== currentReqId) return;
      if (
        (activeFolderRef.current || 'INBOX').toLowerCase() !== (folderPath || 'INBOX').toLowerCase() ||
        activeAccountRef.current !== email ||
        isUnifiedRef.current
      ) {
        return;
      }
      setMessages(updatedList);
    } catch (e) {
      if (reqIdRef.current === currentReqId) {
        setError(cleanIpcError(e));
      }
    } finally {
      if (reqIdRef.current === currentReqId) {
        setLoadingMore(false);
      }
    }
  };

  // Katı klasör izolasyonlu mesaj filtresi:
  // Birleşik gelen kutusu veya arama haricinde, aktif klasöre ait olmayan iletileri asla ekrana çıkarma!
  const filteredMessages = useMemo(() => {
    const targetFolder = (currentTarget.folder || 'INBOX').toLowerCase();
    const isSearchActive = !!searchQuery.trim();

    let list = messages;
    if (!currentTarget.unified && !isSearchActive && targetFolder) {
      const isDraftTarget = /draft|taslak/i.test(targetFolder);
      list = messages.filter((m) => {
        if (!m.folder_path) return true;
        const mFolder = m.folder_path.toLowerCase();
        if (mFolder === targetFolder) return true;
        if (isDraftTarget && (/draft|taslak/i.test(mFolder) || (m.uid && String(m.uid).startsWith('draft-')))) {
          return true;
        }
        return false;
      });
    }

    switch (activeFilter) {
      case 'unread':
        return list.filter((m) => !m.is_read);
      case 'starred':
        return list.filter((m) => !!m.starred);
      case 'attachment':
        return list.filter((m) => !!m.has_att);
      case 'all':
      default:
        return list;
    }
  }, [messages, activeFilter, searchQuery, currentTarget]);

  const filterCounts = useMemo(() => {
    const targetFolder = (currentTarget.folder || 'INBOX').toLowerCase();
    const isSearchActive = !!searchQuery.trim();

    let list = messages;
    if (!currentTarget.unified && !isSearchActive && targetFolder) {
      const isDraftTarget = /draft|taslak/i.test(targetFolder);
      list = messages.filter((m) => {
        if (!m.folder_path) return true;
        const mFolder = m.folder_path.toLowerCase();
        if (mFolder === targetFolder) return true;
        if (isDraftTarget && (/draft|taslak/i.test(mFolder) || (m.uid && String(m.uid).startsWith('draft-')))) {
          return true;
        }
        return false;
      });
    }

    return {
      all: list.length,
      unread: list.filter((m) => !m.is_read).length,
      starred: list.filter((m) => !!m.starred).length,
      attachment: list.filter((m) => !!m.has_att).length,
    };
  }, [messages, searchQuery, currentTarget]);

  const hasMoreDb = !searchQuery.trim() && messages.length < totalDbCount;
  const hasMoreServer = !searchQuery.trim() && serverTotal > totalDbCount;

  const sync = async (
    email: string | null,
    folderPath: string,
    setError: (e: string | null) => void,
    setNotice: (n: string | null) => void,
    isUnified: boolean = false,
  ) => {
    if ((!email && !isUnified) || !window.postaci || syncing) return;
    const currentReqId = reqIdRef.current;
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      if (isUnified) {
        const results = await window.postaci.mail.syncAllInboxes();
        if (reqIdRef.current !== currentReqId) return;
        const totalSynced = results.reduce((sum, r) => sum + (r.synced || 0), 0);
        const errs = results.filter((r) => r.error);
        if (errs.length > 0) {
          setError(
            `${errs.length} hesapta eşitlenemedi: ` +
            errs.map((r) => `${r.email} (${String(r.error).slice(0, 160)})`).join(' • ')
          );
        }
        setNotice(`Tüm gelen kutuları eşitlendi (${totalSynced} yeni ileti çekildi).`);
        setTimeout(() => setNotice(null), 3000);
        loadMessages(null, 'INBOX', true);
        window.postaci.db.stats().catch(() => {});
        return;
      }
      if (folderPath === 'INBOX') {
        const r = await window.postaci.mail.sync(email!);
        if (reqIdRef.current !== currentReqId) return;
        setServerTotal(r.total);
        setNotice(formatSyncNotice(null, r));
      } else {
        const r = await window.postaci.mail.syncFolder(email!, folderPath);
        if (reqIdRef.current !== currentReqId) return;
        setServerTotal(r.total);
        setNotice(formatSyncNotice(folderPath, r));
      }
      if (reqIdRef.current !== currentReqId) return;
      if (
        (activeFolderRef.current || 'INBOX').toLowerCase() !== (folderPath || 'INBOX').toLowerCase() ||
        activeAccountRef.current !== email ||
        isUnifiedRef.current
      ) {
        return;
      }
      loadMessages(email, folderPath, false);
      window.postaci.db.stats().catch(() => {});
    } catch (e) {
      if (reqIdRef.current === currentReqId) {
        setError(cleanIpcError(e));
      }
    } finally {
      if (reqIdRef.current === currentReqId) {
        setSyncing(false);
      }
    }
  };

  return {
    messages,
    setMessages,
    filteredMessages,
    totalDbCount,
    serverTotal,
    hasMoreDb,
    hasMoreServer,
    loadingMore,
    activeFilter,
    setActiveFilter,
    filterCounts,
    syncing,
    setSyncing,
    searchQuery,
    setSearchQuery,
    searchAll,
    setSearchAll,
    loadMessages,
    loadMore,
    loadMoreFromServer,
    sync,
  };
}
