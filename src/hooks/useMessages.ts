// src/hooks/useMessages.ts — mesaj listesi, filtreleme, sayfalama ve sync
//
// TanStack Query destekli. DIŞ API ESKİSİYLE BİREBİR AYNI (dönüş nesnesindeki
// tüm alanlar + fonksiyon imzaları). App.tsx ve useBatchActions değişmeden çalışır.
//
// Farklar:
// - Liste/sayı, hedef anahtarlı ([hesap, klasör, birleşik]) sorgu önbelleğinde
//   tutulur. Klasör değişiminde eski liste yeni hedefe karışamaz (anahtar
//   izolasyonu, eski reqId sayaçlarının yerini alır).
// - setMessages hem doğrudan değer hem fonksiyonel güncelleyici kabul eder;
//   yazımlar o anki hedefin önbelleğine uygulanır (iyimser UI aynen korunur).
// - loadMessages hedefi değiştirir, veri akışı sorgudan gelir; sync ve
//   loadMoreFromServer aynı akışla çalışır, bitiminde ilgili anahtar tazelenir.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, useEffect } from 'react';
import { mailKeys } from '../query/mailKeys';
import type { FilterKey, Msg } from '../types';
import { cleanIpcError } from '../utils/errors';

const PAGE_SIZE = 50;

export interface MessageTarget {
  email: string | null;
  folder: string;
  unified: boolean;
}

const EMPTY_TARGET: MessageTarget = {
  email: null,
  folder: 'INBOX',
  unified: false,
};

// Eşitle sonucunu tek cümlede özetler; sessiz başarısızlıkları görünür kılar
function formatSyncNotice(
  folderPath: string | null,
  r: {
    total: number;
    synced: number;
    failed?: number;
    firstError?: string | null;
  },
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

async function fetchPage(t: MessageTarget, offset: number): Promise<Msg[]> {
  if (t.unified) return window.postaci!.mail.listUnified(PAGE_SIZE, offset);
  return window.postaci!.mail.list(t.email!, t.folder, PAGE_SIZE, offset);
}

async function fetchCount(t: MessageTarget): Promise<number> {
  if (t.unified) return (await window.postaci!.mail.countUnified()).total;
  return (await window.postaci!.mail.count(t.email!, t.folder)).total;
}

function ipcReady(t: MessageTarget): boolean {
  if (typeof window === 'undefined' || !window.postaci) return false;
  return t.unified || !!t.email;
}

export function useMessages() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<MessageTarget>(EMPTY_TARGET);
  const [serverTotal, setServerTotal] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAll, setSearchAll] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  // Hedef değişimini yakalamak için ayna (yarış durumu bekçisi)
  const targetRef = useRef(target);
  targetRef.current = target;
  const syncingRef = useRef(false);

  // Hedef (hesap/klasör/birleşik) değiştiğinde sunucu toplamını sıfırla.
  // Önceden hiç sıfırlanmıyordu: hesap A'nın INBOX'ı için öğrenilen 5000 değeri,
  // 3 ilitilik hesap B klasörüne geçilince de "Toplam 5000 ileti" yazıyordu;
  // ayrıca uygulama açılışında 0 olduğu için buton hiç render edilmiyordu
  // (kullanıcı o klasörü elle Eşitlemeden "eski iletileri getir"e erişemiyordu).
  useEffect(() => {
    setServerTotal(0);
  }, [target.email, target.folder, target.unified]);

  const listKey = mailKeys.messageList(target);
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () => fetchPage(target, 0),
    enabled: ipcReady(target),
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const countQuery = useQuery({
    queryKey: mailKeys.messageCount(target),
    queryFn: () => fetchCount(target),
    enabled: ipcReady(target),
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const messages: Msg[] = listQuery.data ?? [];
  const totalDbCount: number = countQuery.data ?? 0;

  const setMessages: React.Dispatch<React.SetStateAction<Msg[]>> = (action) => {
    queryClient.setQueryData<Msg[]>(listKey, (old) => {
      const prev = old ?? [];
      return typeof action === 'function'
        ? (action as (p: Msg[]) => Msg[])(prev)
        : action;
    });
  };

  const currentTarget = useMemo(
    () => ({ folder: target.folder, unified: target.unified, account: target.email }),
    [target],
  );

  const loadMessages = (
    email: string | null,
    folderPath: string,
    isUnified: boolean = false,
  ) => {
    if (
      (!email && !isUnified) ||
      typeof window === 'undefined' ||
      !window.postaci
    ) {
      setTarget(EMPTY_TARGET);
      return;
    }
    setTarget({ email, folder: folderPath, unified: isUnified });

    // Anahtar DEĞİŞMİYORSA (aynı hedefe yeniden yükleme) sorguyu geçersiz kıl.
    // Düzenleme yapılmış durumda: main process DB'yi güncelliyor ama React Query
    // cache'i 15 sn staleTime boyunca bayat kalıyor ve refetchOnWindowFocus
    // kapalı. Sonuç: "Çöp kutusu boşaltıldı" / "ileti silindi" mesajı çıkıyor,
    // kenardaki rozet düşüyor (folders sorgusu geçersiz kılınıyor) ama LİSTE hâlâ
    // dolu görünüyor — kullanıcı "siliyor ama silmiyor" diye raporluyordu.
    // loadMessages her mutasyondan sonra (sil/taşı/arşivle/boşalt) çağrıldığı
    // için burada geçersiz kılmak tüm bu yolları tek yerden düzeltir.
    const sameTarget =
      targetRef.current.email === email &&
      (targetRef.current.folder || 'INBOX').toLowerCase() ===
        (folderPath || 'INBOX').toLowerCase() &&
      targetRef.current.unified === isUnified;
    if (sameTarget) {
      queryClient.invalidateQueries({
        queryKey: mailKeys.messageList({ email, folder: folderPath, unified: isUnified }),
      });
      queryClient.invalidateQueries({
        queryKey: mailKeys.messageCount({ email, folder: folderPath, unified: isUnified }),
      });
    }
  };

  // Yerel DB'den sonraki 50 mesajı yükle
  const loadMore = async (
    email: string | null,
    folderPath: string,
    isUnified: boolean = false,
  ) => {
    if (
      (!email && !isUnified) ||
      !window.postaci ||
      loadingMore ||
      searchQuery.trim()
    )
      return;
    const key = mailKeys.messageList({
      email,
      folder: folderPath,
      unified: isUnified,
    });
    const cached = queryClient.getQueryData<Msg[]>(key) ?? [];
    const count =
      queryClient.getQueryData<number>(
        mailKeys.messageCount({
          email,
          folder: folderPath,
          unified: isUnified,
        }),
      ) ?? 0;
    if (cached.length === 0 || cached.length >= count) return;
    if (
      targetRef.current.email !== email ||
      targetRef.current.folder !== folderPath ||
      targetRef.current.unified !== isUnified
    )
      return;

    const snap = targetRef.current;
    setLoadingMore(true);
    try {
      const nextBatch = isUnified
        ? await window.postaci.mail.listUnified(PAGE_SIZE, cached.length)
        : await window.postaci.mail.list(
            email!,
            folderPath,
            PAGE_SIZE,
            cached.length,
          );
      if (targetRef.current !== snap) return;
      if (
        targetRef.current.email !== email ||
        targetRef.current.folder !== folderPath ||
        targetRef.current.unified !== isUnified
      )
        return;

      if (nextBatch.length > 0) {
        queryClient.setQueryData<Msg[]>(key, (prev) => {
          const validPrev = (prev ?? []).filter((m) => {
            if (isUnified) return true;
            if (!m.folder_path) return true;
            const targetNorm = (folderPath || 'INBOX').toLowerCase();
            const mNorm = m.folder_path.toLowerCase();
            const isDraft = /draft|taslak/i.test(targetNorm);
            return (
              mNorm === targetNorm ||
              (isDraft &&
                (/draft|taslak/i.test(mNorm) ||
                  String(m.uid).startsWith('draft-')))
            );
          });

          const existingUids = new Set(validPrev.map((m) => m.uid));
          const additions = nextBatch.filter((m) => !existingUids.has(m.uid));
          return [...validPrev, ...additions];
        });
      }
    } finally {
      if (targetRef.current === snap) {
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
    if (!email || !window.postaci || loadingMore || syncingRef.current) return;
    const snap = targetRef.current;
    setLoadingMore(true);
    setError(null);
    setNotice(null);
    try {
      const listKey = mailKeys.messageList({ email, folder: folderPath, unified: false });
      const countKey = mailKeys.messageCount({ email, folder: folderPath, unified: false });
      const cached = queryClient.getQueryData<Msg[]>(listKey) ?? [];

      // En eski GERÇEK IMAP iletisini seç. Taslaklar (draft-…) ve gönderim
      // kuyruğu (local-…) yerel üretilmiş UID'lerdir; sunucuda karşılıkları
      // yoktur. `Number('draft-…')` -> NaN olduğu için main process'teki
      // beforeUid dalına giremiyor ve "0 eski e-posta çekildi" dönüyordu.
      const serverMsgs = cached.filter(
        (m) => m.uid && !String(m.uid).startsWith('draft-') && !String(m.uid).startsWith('local-'),
      );
      if (serverMsgs.length === 0) {
        setError('Bu klasörde sunucudan çekilecek ek ileti yok.');
        return;
      }
      const oldestMsg = serverMsgs[serverMsgs.length - 1];
      const beforeUid = oldestMsg.uid;

      const res = await window.postaci.mail.syncMore(email, folderPath, beforeUid, PAGE_SIZE);
      if (targetRef.current !== snap) return;
      if (
        (targetRef.current.folder || 'INBOX').toLowerCase() !==
          (folderPath || 'INBOX').toLowerCase() ||
        targetRef.current.email !== email ||
        targetRef.current.unified
      ) {
        return;
      }

      setServerTotal(res.total);
      if (!res.synced) {
        // Sunucuda bu noktadan eski ileti yok — kullanıcıya dürüstçe söyle,
        // "50 çekildi" gibi yanlış bir mesaj gösterme.
        setNotice(
          `Sunucuda bu noktadan daha eski ileti bulunamadı (kutuda toplam ${res.total} ileti var).`,
        );
        setTimeout(() => setNotice(null), 4000);
        return;
      }
      setNotice(`Sunucudan ${res.synced} eski e-posta daha çekildi (toplam kutuda: ${res.total}).`);

      // LİSTE sorgusunu da invalidate et. Önceden yalnızca countKey geçersiz
      // kılınıyordu; DB'ye yazılan iletiler React Query cache'ine hiç girmiyor,
      // kullanıcı "çekildi" mesajını görüp listede hiçbir değişiklik görmüyordu.
      await queryClient.invalidateQueries({ queryKey: countKey });
      await queryClient.invalidateQueries({ queryKey: listKey });
    } catch (e) {
      setError(cleanIpcError(e));
    } finally {
      // Hedef değişmiş olsa bile kilidi BIRAK: önceden hedef değişince
      // setLoadingMore(false) atlanıyor, loadingMore kalıcı true kalıyor ve
      // "daha fazla" butonları sessizce ölüyordu.
      setLoadingMore(false);
    }
  };

  // Katı klasör ve hesap izolasyonlu mesaj filtresi:
  // Birleşik gelen kutusu veya arama haricinde, aktif klasöre ve aktif hesaba ait olmayan iletileri asla ekrana çıkarma!
  const filteredMessages = useMemo(() => {
    const targetFolder = (currentTarget.folder || 'INBOX').toLowerCase();
    const targetAcc = (currentTarget.account || '').toLowerCase();
    const isSearchActive = !!searchQuery.trim();

    let list = messages;
    if (!currentTarget.unified && !isSearchActive && targetFolder) {
      const isDraftTarget = /draft|taslak/i.test(targetFolder);
      list = messages.filter((m) => {
        if (
          targetAcc &&
          m.account_email &&
          m.account_email.toLowerCase() !== targetAcc
        ) {
          return false;
        }
        if (!m.folder_path) return true;
        const mFolder = m.folder_path.toLowerCase();
        if (mFolder === targetFolder) return true;
        if (
          isDraftTarget &&
          (/draft|taslak/i.test(mFolder) ||
            (m.uid && String(m.uid).startsWith('draft-')))
        ) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeFilter, searchQuery, currentTarget]);

  const filterCounts = useMemo(() => {
    const targetFolder = (currentTarget.folder || 'INBOX').toLowerCase();
    const targetAcc = (currentTarget.account || '').toLowerCase();
    const isSearchActive = !!searchQuery.trim();

    let list = messages;
    if (!currentTarget.unified && !isSearchActive && targetFolder) {
      const isDraftTarget = /draft|taslak/i.test(targetFolder);
      list = messages.filter((m) => {
        if (
          targetAcc &&
          m.account_email &&
          m.account_email.toLowerCase() !== targetAcc
        ) {
          return false;
        }
        if (!m.folder_path) return true;
        const mFolder = m.folder_path.toLowerCase();
        if (mFolder === targetFolder) return true;
        if (
          isDraftTarget &&
          (/draft|taslak/i.test(mFolder) ||
            (m.uid && String(m.uid).startsWith('draft-')))
        ) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, searchQuery, currentTarget]);

  const hasMoreDb = !searchQuery.trim() && messages.length < totalDbCount;
  // Birleşik gelen kutusunda sayfalama hesap bazlıdır (beforeUid tek UID'dir),
  // bu yüzden sunucudan "daha eski ileti getir" orada anlamsızdır.
  const hasMoreServer =
    !searchQuery.trim() && !currentTarget.unified && serverTotal > totalDbCount;

  const sync = async (
    email: string | null,
    folderPath: string,
    setError: (e: string | null) => void,
    setNotice: (n: string | null) => void,
    isUnified: boolean = false,
  ) => {
    if ((!email && !isUnified) || !window.postaci || syncingRef.current) return;
    const snap = targetRef.current;
    syncingRef.current = true;
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      if (isUnified) {
        const results = await window.postaci.mail.syncAllInboxes();
        if (targetRef.current !== snap) return;
        const totalSynced = results.reduce(
          (sum, r) => sum + (r.synced || 0),
          0,
        );
        const errs = results.filter((r) => r.error);
        if (errs.length > 0) {
          setError(
            `${errs.length} hesapta eşitlenemedi: ` +
              errs
                .map((r) => `${r.email} (${String(r.error).slice(0, 160)})`)
                .join(' • '),
          );
        }
        setNotice(
          `Tüm gelen kutuları eşitlendi (${totalSynced} yeni ileti çekildi).`,
        );
        setTimeout(() => setNotice(null), 3000);
        loadMessages(null, 'INBOX', true);
        await queryClient.invalidateQueries({
          queryKey: mailKeys.messageList({
            email: null,
            folder: 'INBOX',
            unified: true,
          }),
        });
        await queryClient.invalidateQueries({
          queryKey: mailKeys.messageCount({
            email: null,
            folder: 'INBOX',
            unified: true,
          }),
        });
        window.postaci.db.stats().catch(() => {});
        return;
      }
      if (folderPath === 'INBOX') {
        const r = await window.postaci.mail.sync(email!);
        if (targetRef.current !== snap) return;
        setServerTotal(r.total);
        setNotice(formatSyncNotice(null, r));
      } else {
        const r = await window.postaci.mail.syncFolder(email!, folderPath);
        if (targetRef.current !== snap) return;
        setServerTotal(r.total);
        setNotice(formatSyncNotice(folderPath, r));
      }
      if (targetRef.current !== snap) return;
      if (
        (targetRef.current.folder || 'INBOX').toLowerCase() !==
          (folderPath || 'INBOX').toLowerCase() ||
        targetRef.current.email !== email ||
        targetRef.current.unified
      ) {
        return;
      }
      loadMessages(email, folderPath, false);
      await queryClient.invalidateQueries({
        queryKey: mailKeys.messageList({
          email,
          folder: folderPath,
          unified: false,
        }),
      });
      await queryClient.invalidateQueries({
        queryKey: mailKeys.messageCount({
          email,
          folder: folderPath,
          unified: false,
        }),
      });
      window.postaci.db.stats().catch(() => {});
    } catch (e) {
      if (targetRef.current === snap) {
        setError(cleanIpcError(e));
      }
    } finally {
      if (targetRef.current === snap) {
        syncingRef.current = false;
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
    setServerTotal,
    sync,
  };
}
