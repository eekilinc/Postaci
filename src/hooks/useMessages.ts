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

  const loadMessages = (
    email: string | null,
    folderPath: string,
    isUnified: boolean = false,
  ) => {
    if ((!email && !isUnified) || !window.postaci) {
      setMessages([]);
      setTotalDbCount(0);
      return;
    }
    const currentReqId = ++reqIdRef.current;

    if (isUnified) {
      window.postaci.mail
        .countUnified()
        .then((counts) => {
          if (reqIdRef.current !== currentReqId) return;
          setTotalDbCount(counts.total);
        })
        .catch(() => {});

      window.postaci.mail
        .listUnified(PAGE_SIZE, 0)
        .then((list) => {
          if (reqIdRef.current !== currentReqId) return;
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
        setTotalDbCount(counts.total);
      })
      .catch(() => {});

    // İlk sayfayı (50 mesaj) yükle
    window.postaci.mail
      .list(email!, folderPath, PAGE_SIZE, 0)
      .then((list) => {
        if (reqIdRef.current !== currentReqId) return;
        setMessages(list);
      })
      .catch(() => {});
  };

  // Yerel DB'den sonraki 50 mesajı yükle
  const loadMore = async (email: string | null, folderPath: string, isUnified: boolean = false) => {
    if ((!email && !isUnified) || !window.postaci || loadingMore || searchQuery.trim()) return;
    if (messages.length >= totalDbCount) return;

    const currentReqId = reqIdRef.current;
    setLoadingMore(true);
    try {
      const nextBatch = isUnified
        ? await window.postaci.mail.listUnified(PAGE_SIZE, messages.length)
        : await window.postaci.mail.list(email!, folderPath, PAGE_SIZE, messages.length);
      if (reqIdRef.current !== currentReqId) return;
      if (nextBatch.length > 0) {
        setMessages((prev) => {
          const existingUids = new Set(prev.map((m) => m.uid));
          const additions = nextBatch.filter((m) => !existingUids.has(m.uid));
          return [...prev, ...additions];
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
      setNotice(
        `Sunucudan ${res.synced} eski e-posta daha çekildi (toplam kutuda: ${res.total}).`,
      );
      setServerTotal(res.total);
      // DB'deki sayıyı güncelle ve listeyi tazele
      const counts = await window.postaci.mail.count(email, folderPath);
      if (reqIdRef.current !== currentReqId) return;
      setTotalDbCount(counts.total);
      const updatedList = await window.postaci.mail.list(email, folderPath, messages.length + PAGE_SIZE, 0);
      if (reqIdRef.current !== currentReqId) return;
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

  const filteredMessages = useMemo(() => {
    switch (activeFilter) {
      case 'unread':
        return messages.filter((m) => !m.is_read);
      case 'starred':
        return messages.filter((m) => !!m.starred);
      case 'attachment':
        return messages.filter((m) => !!m.has_att);
      case 'all':
      default:
        return messages;
    }
  }, [messages, activeFilter]);

  const filterCounts = useMemo(() => ({
    all: messages.length,
    unread: messages.filter((m) => !m.is_read).length,
    starred: messages.filter((m) => !!m.starred).length,
    attachment: messages.filter((m) => !!m.has_att).length,
  }), [messages]);

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
