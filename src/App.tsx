/// src/App.tsx — Postacı ana orkestrasyon bileşeni
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Tipler & sabitler
import type { ComposeFile, DateFormatPreference, ListDensity, Msg, SnippetLines } from './types';
import { getAccountSignature } from './utils/signatures';
import { cleanIpcError } from './utils/errors';
import { playNotificationSound } from './utils/sound';
import { ACCENTS } from './constants';

// Hook'lar
import { useTheme } from './hooks/useTheme';
import { useAccounts } from './hooks/useAccounts';
import { useFolders } from './hooks/useFolders';
import { useMessages } from './hooks/useMessages';
import { useMessageBody } from './hooks/useMessageBody';
import { useBatchActions } from './hooks/useBatchActions';
import { useUndoSend } from './hooks/useUndoSend';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTranslation } from './i18n';

// Bileşenler
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { ReadingPane } from './components/ReadingPane';
import { AddAccountModal } from './components/AddAccountModal';
import { SettingsModal } from './components/SettingsModal';
import { ContactsModal } from './components/ContactsModal';
import { ComposeModal } from './components/ComposeModal';
import { Toast } from './components/Toast';
import { AttachmentPreviewModal } from './components/AttachmentPreviewModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { ShortcutsHelpModal } from './components/ShortcutsHelpModal';
import { UndoSendBar } from './components/UndoSendBar';
import type { LayoutMode } from './components/LayoutSwitcher';
import { PostaciLogo } from './components/PostaciLogo';
import { InAppNotification, type IncomingMailData } from './components/InAppNotification';
import { MenuIcon, PlusIcon } from './components/icons';

const ACCENT_COLORS: Record<string, string> = {
  blue: '#2563eb',
  green: '#059669',
  purple: '#7c3aed',
  orange: '#ea580c',
  teal: '#0d9488',
  rose: '#e11d48',
  slate: '#475569',
};

export default function App() {
  const { t } = useTranslation();
  const inElectron = !!(window.postaci || (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)));

  // ── Tema & accent ────────────────────────────────────────────────────────
  const { theme, setTheme, accent, setAccent, oledMode, setOledMode } = useTheme();

  // ── Gelişmiş Kişiselleştirme & Liste Tercihleri ───────────────────────────
  const [listDensity, setListDensity] = useState<ListDensity>(
    () => (localStorage.getItem('postaci_list_density') as ListDensity) || 'normal'
  );
  const [showAvatars, setShowAvatars] = useState<boolean>(
    () => localStorage.getItem('postaci_show_avatars') !== 'false'
  );
  const [snippetLines, setSnippetLines] = useState<SnippetLines>(
    () => Number(localStorage.getItem('postaci_snippet_lines') ?? 1) as SnippetLines
  );
  const [dateFormat, setDateFormat] = useState<DateFormatPreference>(
    () => (localStorage.getItem('postaci_date_format') as DateFormatPreference) || 'smart'
  );

  // ── Hesaplar ─────────────────────────────────────────────────────────────
  const { accounts, activeAccount, setActiveAccount, stats, refresh } = useAccounts();

  // ── Klasörler ────────────────────────────────────────────────────────────
  const { folders, setFolders, activeFolder, setActiveFolder, loadFolders } = useFolders();

  // ── Mesajlar ─────────────────────────────────────────────────────────────
  const {
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
  } = useMessages();

  // ── Mesaj gövdesi ────────────────────────────────────────────────────────
  const {
    body,
    bodyLoading,
    bodyError,
    atts,
    savingAtt,
    loadingPreview,
    previewData,
    setPreviewData,
    thread,
    safeHtml,
    hasRemoteImages,
    allowRemoteImages,
    setAllowRemoteImages,
    allowSenderAlways,
    resetBody,
    loadBody,
    saveAttachment,
    previewAttachment,
  } = useMessageBody();

  // ── Lokal UI state ───────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Msg | null>(null);
  // Masaüstü bildirimine tıklandığında hedef mesajın seçilmesini garantiye alan ref
  const targetSelectUidRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [inAppAlert, setInAppAlert] = useState<IncomingMailData | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [isUnified, setIsUnified] = useState(false);
  const [unifiedUnreadCount, setUnifiedUnreadCount] = useState(0);

  // ── Düzen (Layout) & Mobil Çekmece (Drawer) State ──────────────────────────
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    return (localStorage.getItem('postaci_layout_mode') as LayoutMode) || 'three-column';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleSetLayoutMode = (mode: LayoutMode) => {
    setLayoutMode(mode);
    localStorage.setItem('postaci_layout_mode', mode);
  };

  const updateUnifiedCount = () => {
    if (window.postaci?.mail?.countUnified) {
      window.postaci.mail.countUnified().then((c) => setUnifiedUnreadCount(c.unread)).catch(() => {});
    }
  };

  // Windows görev çubuğu rozeti — okunmamış sayısı değişince güncelle
  useEffect(() => {
    if (window.postaci?.setBadge) {
      window.postaci.setBadge(unifiedUnreadCount).catch(() => {});
    }
  }, [unifiedUnreadCount]);

  // ── Okunmamış İleti Sayaçları (Tüm Hesaplar ve Klasörler) ──────────────────
  const [unreadCounts, setUnreadCounts] = useState<{
    byAccount: Record<string, number>;
    byFolder: Record<string, number>;
    unified: number;
  }>({ byAccount: {}, byFolder: {}, unified: 0 });

  const refreshUnreadCounts = useCallback(async () => {
    if (!window.postaci?.mail?.unreadCounts) return;
    try {
      const data = await window.postaci.mail.unreadCounts();
      if (data) {
        setUnreadCounts(data);
        if (typeof data.unified === 'number') {
          setUnifiedUnreadCount(data.unified);
        }
      }
    } catch {}
  }, []);

  // Aktif hesaba göre klasör listesini en güncel okunmamış sayılarıyla eşle
  const displayFolders = useMemo(() => {
    if (!activeAccount) return folders;
    return folders.map((f) => {
      const key = `${activeAccount}:${f.path}`;
      const unread = unreadCounts.byFolder[key];
      return typeof unread === 'number' ? { ...f, unread_count: unread } : f;
    });
  }, [folders, activeAccount, unreadCounts.byFolder]);

  // ── Yeniden Boyutlandırılabilir Klasör Paneli Genişliği (Splitter) ──────────
  const [folderWidth, setFolderWidth] = useState<number>(() => {
    const saved = localStorage.getItem('postaci_folder_width');
    const parsed = saved ? parseInt(saved, 10) : 220;
    return isNaN(parsed) || parsed < 160 || parsed > 450 ? 220 : parsed;
  });
  const [isResizingFolder, setIsResizingFolder] = useState(false);
  const [folderCollapsed, setFolderCollapsed] = useState(() => {
    return localStorage.getItem('postaci_folder_collapsed') === 'true';
  });

  const toggleFolderCollapse = useCallback(() => {
    setFolderCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('postaci_folder_collapsed', String(next));
      return next;
    });
  }, []);

  const handleMouseDownFolderResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingFolder(true);
    const startX = e.clientX;
    const startWidth = folderWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxW = Math.min(window.innerWidth - 450, 450);
      const newWidth = Math.max(160, Math.min(startWidth + deltaX, maxW));
      setFolderWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizingFolder(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [folderWidth]);

  useEffect(() => {
    localStorage.setItem('postaci_folder_width', String(folderWidth));
  }, [folderWidth]);

  // ── Yeniden Boyutlandırılabilir E-posta Listesi Genişliği (Splitter) ────────
  const [listWidth, setListWidth] = useState<number>(() => {
    const saved = localStorage.getItem('postaci_message_list_width');
    const parsed = saved ? parseInt(saved, 10) : 380;
    return isNaN(parsed) || parsed < 260 || parsed > 750 ? 380 : parsed;
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = listWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxW = Math.min(window.innerWidth - 360, 750);
      const newWidth = Math.max(260, Math.min(startWidth + deltaX, maxW));
      setListWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [listWidth]);

  useEffect(() => {
    localStorage.setItem('postaci_message_list_width', String(listWidth));
  }, [listWidth]);

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [composeTitle, setComposeTitle] = useState('Yeni E-posta');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [cCc, setCCc] = useState('');
  const [cBcc, setCBcc] = useState('');
  const [cSubject, setCSubject] = useState('');
  const [cText, setCText] = useState('');
  const [cHtml, setCHtml] = useState('');
  const [cInReplyTo, setCInReplyTo] = useState<string | undefined>(undefined);
  const [cReferences, setCReferences] = useState<string | undefined>(undefined);
  const [cFiles, setCFiles] = useState<ComposeFile[]>([]);

  // ── Gönderimi Geri Al (Undo Send) Hook ────────────────────────────────────
  const {
    undoTask,
    sending,
    queueSendWithUndo,
    handleUndoSend,
    handleSendImmediately,
  } = useUndoSend({
    onRestoreCompose: (p) => {
      setCFrom(p.fromEmail);
      setCTo(p.to);
      setCCc(p.cc);
      setCBcc(p.bcc || '');
      setCSubject(p.subject);
      setCText(p.text);
      setCHtml(p.html);
      setCFiles(p.attachments);
      setCInReplyTo(p.inReplyTo);
      setCReferences(p.references);
      setShowCompose(true);
    },
    selectedMsg: selected,
    activeAccount,
    activeFolder,
    setMessages,
    setSelected,
    setNotice,
    setError,
  });

  // ── Çoklu Seçim & Toplu İşlemler (Multi-Select & Batch Actions) Hook ───────
  const {
    selectedUids,
    handleToggleSelectUid,
    handleSelectAll,
    handleClearSelection,
    handleBatchDelete,
    handleBatchMarkRead,
    handleBatchStar,
    handleBatchArchive,
    handleBatchMove,
  } = useBatchActions({
    messages: filteredMessages,
    activeAccount,
    activeFolder,
    isUnified,
    setMessages,
    setSelected,
    loadFolders,
    updateUnifiedCount,
    setNotice,
    setError,
  });

  // ── Effect'ler ───────────────────────────────────────────────────────────

  // İlk yükleme
  useEffect(() => {
    refresh();
    updateUnifiedCount();
    refreshUnreadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mesajlar veya aktif hesap değiştikçe okunmamış sayılarını yerel DB'den anında güncelle
  useEffect(() => {
    refreshUnreadCounts();
  }, [messages, activeAccount, refreshUnreadCounts]);

  // Aktif hesap değişince klasörleri yükle
  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      if (!activeAccount || !window.postaci) {
        setFolders([]);
        return;
      }
      try {
        const list = await window.postaci.mail.folders(activeAccount);
        if (cancelled) return;
        setFolders(list);
        const folderExists = list.some((f) => f.path === activeFolder);
        if (!folderExists) {
          const inbox = list.find((f) => f.path.toUpperCase() === 'INBOX' || f.flags?.includes('\\Inbox'));
          setActiveFolder(inbox?.path || 'INBOX');
        }
      } catch {
        if (!cancelled) setFolders([]);
      }
    };
    loadAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount]);

  // Bekleyen bildirim tıklaması varsa gelen iletiler arasında bul ve seç
  useEffect(() => {
    if (targetSelectUidRef.current && messages.length > 0) {
      const targetUid = targetSelectUidRef.current;
      const found = messages.find((m) => String(m.uid) === targetUid);
      if (found) {
        setSelected(found);
        targetSelectUidRef.current = null;
      }
    }
  }, [messages]);

  // Aktif klasör veya hesap değişince sync + mesaj yükle
  useEffect(() => {
    if (isUnified) return;
    if (!activeAccount) return;
    if (!targetSelectUidRef.current) {
      setSelected(null);
    }
    let cancelled = false;
    const targetFolder = activeFolder || 'INBOX';

    // 1. Yerel SQLite mesajlarını ANINDA ekranda göster (0ms bekleme, sıfır zıplama)
    loadMessages(activeAccount, targetFolder, false);

    // 2. Arka planda sunucu senkronizasyonu
    const doSync = async () => {
      if (!window.postaci) return;
      try {
        setSyncing(true);
        await window.postaci.mail.syncFolder(activeAccount, targetFolder);
        if (cancelled) return; // Kullanıcı başka klasöre/hesaba geçtiyse bu sync sonucunu UI'a uygulama
        loadMessages(activeAccount, targetFolder, false);
        loadFolders(activeAccount);
        updateUnifiedCount();
      } catch (err) {
        if (!cancelled) {
          console.error('[sync error]', err);
          // Liste tamamen boşsa sessiz kalma: kullanıcı neden mail gelmediğini görsün.
          // Dolu listede transient hatalarda banner gösterme (gürültü önleme).
          const msg = err instanceof Error ? err.message : String(err);
          window.postaci?.mail?.count(activeAccount, targetFolder)?.then((c) => {
            if (!cancelled && (c?.total || 0) === 0) {
              setError(msg);
            }
          }).catch(() => {});
        }
      } finally {
        if (!cancelled) setSyncing(false);
      }
    };
    doSync();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolder, activeAccount, isUnified]);

  // Arama
  useEffect(() => {
    if ((!activeAccount && !isUnified) || !window.postaci) return;
    const q = searchQuery.trim();
    const handler = setTimeout(() => {
      if (!q) {
        loadMessages(activeAccount, activeFolder || 'INBOX', isUnified);
        return;
      }
      if (isUnified) {
        window.postaci?.mail.searchUnified(q).then(setMessages).catch(() => {});
        return;
      }
      const folder = searchAll ? '*' : (activeFolder ?? undefined);
      window.postaci?.mail.search(activeAccount!, folder, q).then(setMessages).catch(() => {});
    }, 250);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeAccount, activeFolder, searchAll, isUnified]);

  // Seçili mesaj gövdesini yükle
  useEffect(() => {
    const targetAccount = selected?.account_email || activeAccount;
    const targetFolder = selected?.folder_path || activeFolder;
    if (!selected || !targetAccount || !window.postaci || !targetFolder) {
      resetBody();
      return;
    }
    const cancel = loadBody(selected, targetAccount, targetFolder, setMessages, setSelected);
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.uid, activeAccount, isUnified]);

  // E-posta bildirimine veya ekran içi kartına tıklandığında hedeflenen mesaja geçiş yap
  const navigateToMessage = useCallback(async (email: string, folderPath: string, uid?: string | null) => {
    const targetFolder = folderPath || 'INBOX';
    const targetUid = uid ? String(uid) : null;
    targetSelectUidRef.current = targetUid;

    setIsUnified(false);
    setShowSettings(false);
    if (email && email !== activeAccount) {
      setActiveAccount(email);
    }
    setActiveFolder(targetFolder);

    try {
      let list = await window.postaci?.mail.list(email, targetFolder, 50, 0);
      let found = list?.find((m) => String(m.uid) === targetUid);
      if (!found && targetUid) {
        const moreList = await window.postaci?.mail.list(email, targetFolder, 100, 0);
        if (moreList) {
          list = moreList;
          found = list.find((m) => String(m.uid) === targetUid);
        }
      }
      if (list && list.length > 0) {
        setMessages(list);
        if (found) {
          setSelected(found);
          targetSelectUidRef.current = null;
        } else if (!targetUid) {
          setSelected(list[0]);
        }
      }
    } catch (err) {
      console.error('[navigateToMessage] Mesaj açılamadı:', err);
    }
  }, [activeAccount, setActiveAccount, setActiveFolder, setMessages, setSelected]);

  const handleViewInAppMail = useCallback((alertData: IncomingMailData) => {
    setInAppAlert(null);
    navigateToMessage(alertData.email, alertData.folderPath, alertData.uid);
  }, [navigateToMessage]);

  // ── Masaüstü Bildirimleri & Arka Plan Senkronizasyonu Olayları ─────────────
  useEffect(() => {
    if (!window.postaci?.notifications) return;

    // 1. Windows bildirimine tıklandığında ilgili e-postaya git ve seç
    const unsubOpen = window.postaci.notifications.onOpenMessage(async ({ email, folderPath, uid }) => {
      await navigateToMessage(email, folderPath, uid);
    });

    // 2. Yeni e-posta geldiğinde (arka plan veya anlık senkronizasyon):
    const unsubNewMail = window.postaci.notifications.onNewMail?.(({ email, folderPath, count, messages }) => {
      if (email === activeAccount) {
        loadFolders(email);
        const currentFolder = activeFolder || 'INBOX';
        if ((folderPath || 'INBOX') === currentFolder) {
          loadMessages(email, currentFolder);
        }
      }
      refreshUnreadCounts();

      // Ses çal
      const soundPref = localStorage.getItem('postaci_sound_choice') || 'chirp';
      playNotificationSound(soundPref);

      // Ekran içi zengin bildirim kartı (In-App floating notification)
      if (messages && messages.length > 0) {
        const first = messages[0];
        setInAppAlert({
          id: String(first.uid || Date.now()),
          from: first.from || email,
          email,
          subject: first.subject || '(konusuz e-posta)',
          folderPath: folderPath || 'INBOX',
          uid: first.uid,
          count,
        });
      } else if (count > 0) {
        setInAppAlert({
          id: Date.now().toString(),
          from: email,
          email,
          subject: `${count} yeni e-posta alındı.`,
          folderPath: folderPath || 'INBOX',
          count,
        });
      }
    });

    // 3. Arka plan senkronizasyonu yeni posta getirdiğinde UI'ı sessizce tazele
    const unsubBg = window.postaci.notifications.onBackgroundSynced(({ email, folderPath, count }) => {
      if (email === activeAccount) {
        loadFolders(email);
        const currentFolder = activeFolder || 'INBOX';
        if ((folderPath || 'INBOX') === currentFolder) {
          loadMessages(email, currentFolder);
        }
      }
      refreshUnreadCounts();
      if (count > 0) {
        setNotice(t('notice.newEmails', { count }));
        setTimeout(() => setNotice(null), 4000);
      }
    });

    return () => {
      unsubOpen();
      unsubBg();
      unsubNewMail?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount, activeFolder]);

  // ── Action handler'ları ──────────────────────────────────────────────────

  const handleSync = () => {
    if (isUnified) {
      sync(null, 'INBOX', setError, setNotice, true).then(() => updateUnifiedCount());
      return;
    }
    if (!activeAccount || !activeFolder) return;
    sync(activeAccount, activeFolder, setError, setNotice, false).then(() => {
      window.postaci?.db.stats().catch(() => {});
      updateUnifiedCount();
    });
  };

  const toggleStar = async (m: Msg) => {
    const targetAccount = m.account_email || activeAccount;
    const targetFolder = m.folder_path || activeFolder;
    if (!targetAccount || !window.postaci || !targetFolder) return;
    try {
      const next = await window.postaci.mail.star(targetAccount, targetFolder, m.uid);
      setMessages((prev) => prev.map((x) => (x.uid === m.uid ? { ...x, starred: next } : x)));
      setSelected((s) => (s?.uid === m.uid ? { ...s, starred: next } : s));
    } catch {}
  };

  const deleteMessage = async (m: Msg) => {
    const targetAccount = m.account_email || activeAccount;
    const targetFolder = m.folder_path || activeFolder;
    if (!targetAccount || !window.postaci || !targetFolder) return;
    const fromFolder = targetFolder;
    const fromAccount = targetAccount;
    // Optimistik: UI'dan hemen kaldır — IPC bitmesini bekleme
    setMessages((prev) => prev.filter((x) => x.uid !== m.uid));
    setSelected((s) => (s?.uid === m.uid ? null : s));
    setError(null);
    try {
      await window.postaci.mail.delete(fromAccount, fromFolder, m.uid);
      // Kullanıcı başka klasöre veya hesaba geçtiyse eski klasörün bildirimini gösterme
      if (isUnified || (activeFolder === fromFolder && activeAccount === fromAccount)) {
        setNotice(t('notice.deleted'));
        setTimeout(() => {
          setNotice((prev) => (prev === t('notice.deleted') ? null : prev));
        }, 2500);
      }
      loadFolders(fromAccount); // okunmadı sayısını güncelle
      updateUnifiedCount();
    } catch (e) {
      if (isUnified || (activeFolder === fromFolder && activeAccount === fromAccount)) {
        loadMessages(fromAccount, fromFolder, isUnified);
        setError(cleanIpcError(e));
        setTimeout(() => setError((prev) => (prev ? null : null)), 4000);
      }
    }
  };

  const handleArchiveMessage = async (m?: Msg | null) => {
    const target = m || selected;
    if (!target || !window.postaci) return;
    const targetAccount = target.account_email || activeAccount;
    const targetFolder = target.folder_path || activeFolder;
    if (!targetAccount || !targetFolder) return;
    const fromFolder = targetFolder;
    const fromAccount = targetAccount;

    // Optimistik: UI'dan hemen kaldır
    setMessages((prev) => prev.filter((x) => x.uid !== target.uid));
    setSelected((s) => (s?.uid === target.uid ? null : s));
    setError(null);
    setNotice(t('notice.archived'));
    setTimeout(() => {
      setNotice((prev) => (prev === t('notice.archived') ? null : prev));
    }, 2500);

    try {
      await window.postaci.mail.archive(fromAccount, fromFolder, target.uid);
      loadFolders(fromAccount);
      updateUnifiedCount();
    } catch (e) {
      if (isUnified || (activeFolder === fromFolder && activeAccount === fromAccount)) {
        loadMessages(fromAccount, fromFolder, isUnified);
        setError(cleanIpcError(e));
        setTimeout(() => setError((prev) => (prev ? null : null)), 4000);
      }
    }
  };

  const handleMoveMessage = async (m: Msg | null | undefined, toFolder: string) => {
    const target = m || selected;
    if (!target || !window.postaci || !toFolder) return;
    const targetAccount = target.account_email || activeAccount;
    const targetFolder = target.folder_path || activeFolder;
    if (!targetAccount || !targetFolder) return;
    if (targetFolder === toFolder) return;
    const fromFolder = targetFolder;
    const fromAccount = targetAccount;

    // Optimistik: UI'dan hemen kaldır
    setMessages((prev) => prev.filter((x) => x.uid !== target.uid));
    setSelected((s) => (s?.uid === target.uid ? null : s));
    setError(null);
    setNotice(t('notice.moved', { folder: toFolder }));
    setTimeout(() => {
      setNotice((prev) => (prev === t('notice.moved', { folder: toFolder }) ? null : prev));
    }, 2500);

    try {
      await window.postaci.mail.moveToFolder(fromAccount, fromFolder, toFolder, target.uid);
      loadFolders(fromAccount);
      updateUnifiedCount();
    } catch (e) {
      if (isUnified || (activeFolder === fromFolder && activeAccount === fromAccount)) {
        loadMessages(fromAccount, fromFolder, isUnified);
        setError(cleanIpcError(e));
        setTimeout(() => setError((prev) => (prev ? null : null)), 4000);
      }
    }
  };

  // Seçili mesajı okundu yap
  const markAsRead = async (m: Msg) => {
    const targetAccount = m.account_email || activeAccount;
    const targetFolder = m.folder_path || activeFolder;
    if (!targetAccount || !window.postaci || !targetFolder || m.is_read) return;
    setMessages((prev) => prev.map((x) => (x.uid === m.uid ? { ...x, is_read: 1 } : x)));
    setSelected((s) => (s?.uid === m.uid ? { ...s, is_read: 1 } : s));
    try {
      await window.postaci.mail.markRead(targetAccount, targetFolder, m.uid);
      loadFolders(targetAccount);
      updateUnifiedCount();
    } catch { /* best-effort */ }
  };

  // Seçili mesajı okunmadı yap
  const markAsUnread = async (m: Msg) => {
    const targetAccount = m.account_email || activeAccount;
    const targetFolder = m.folder_path || activeFolder;
    if (!targetAccount || !window.postaci || !targetFolder || !m.is_read) return;
    setMessages((prev) => prev.map((x) => (x.uid === m.uid ? { ...x, is_read: 0 } : x)));
    setSelected((s) => (s?.uid === m.uid ? { ...s, is_read: 0 } : s));
    try {
      await window.postaci.mail.markUnread(targetAccount, targetFolder, m.uid);
      loadFolders(targetAccount);
      updateUnifiedCount();
    } catch { /* best-effort */ }
  };

  const toggleRead = (m: Msg) => {
    if (m.is_read) {
      markAsUnread(m);
    } else {
      markAsRead(m);
    }
  };

  const openNew = (targetTo?: unknown, targetSubject?: unknown) => {
    const toStr = typeof targetTo === 'string' ? targetTo : '';
    const subjStr = typeof targetSubject === 'string' ? targetSubject : '';
    setComposeTitle('Yeni E-posta');
    const sender = activeAccount || '';
    setCFrom(sender);
    setCInReplyTo(undefined);
    setCReferences(undefined);
    setError(null);
    setNotice(null);

    // Hedef alıcı belirtilmemişse kaydedilmiş aktif taslak var mı kontrol et
    if (!toStr) {
      const savedDraftRaw = localStorage.getItem('postaci_active_draft');
      if (savedDraftRaw) {
        try {
          const d = JSON.parse(savedDraftRaw);
          if (d && (d.to || d.cc || d.subject || d.text || d.html)) {
            if (d.from) setCFrom(d.from);
            setCTo(d.to || '');
            setCCc(d.cc || '');
            setCSubject(d.subject || '');
            setCText(d.text || '');
            setCHtml(d.html || '');
            setCFiles([]);
            setShowCompose(true);
            setNotice(t('notice.draftRestored'));
            setTimeout(() => setNotice(null), 3000);
            return;
          }
        } catch {}
      }
    }

    setCTo(toStr); setCCc(''); setCBcc(''); setCSubject(subjStr); setCFiles([]);
    // Otomatik imza kontrolü
    const sig = getAccountSignature(sender);
    if (sig.enabled) {
      if (sig.isHtml && sig.html) {
        setCText(`\n\n--\n${sig.text || ''}`);
        setCHtml(`<br><br><div class="postaci-signature" style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:14px;">${sig.html}</div>`);
      } else if (sig.text) {
        setCText(`\n\n--\n${sig.text}`);
        setCHtml(`<br><br><div class="postaci-signature" style="color:#666;font-size:13px;border-top:1px solid #e5e7eb;padding-top:6px;margin-top:12px;">${sig.text.replace(/\n/g, '<br>')}</div>`);
      } else {
        setCText('');
        setCHtml('');
      }
    } else {
      setCText('');
      setCHtml('');
    }

    setShowCompose(true);
  };

  const openReplyForward = async (mode: 'reply' | 'replyAll' | 'forward') => {
    const targetAccount = selected?.account_email || activeAccount;
    const targetFolder = selected?.folder_path || activeFolder;
    if (!window.postaci || !targetAccount || !selected || !targetFolder) return;
    setError(null); setNotice(null);
    try {
      const tpl =
        mode === 'reply'
          ? await window.postaci.mail.replyTemplate(targetAccount, targetFolder, selected.uid)
          : mode === 'replyAll'
          ? await window.postaci.mail.replyAllTemplate(targetAccount, targetFolder, selected.uid)
          : await window.postaci.mail.forwardTemplate(targetAccount, targetFolder, selected.uid);
      setComposeTitle(mode === 'reply' ? 'Yanıtla' : mode === 'replyAll' ? 'Tümünü Yanıtla' : 'İlet');
      setCFrom(targetAccount);
      setCTo(tpl.to); setCCc(tpl.cc); setCBcc(''); setCSubject(tpl.subject);
      setCText(tpl.text);
      setCHtml(tpl.html || tpl.text.replace(/\n/g, '<br>'));
      setCInReplyTo(tpl.inReplyTo); setCReferences(tpl.references);
      setShowCompose(true);
    } catch (e) {
      setError(cleanIpcError(e));
    }
  };

  // Hızlı Yanıt (Inline Quick Reply) gönderme fonksiyonu
  const handleSendQuickReply = async ({ text, files, replyAll }: { text: string; files: ComposeFile[]; replyAll: boolean }) => {
    if (!selected) return;
    const targetAccount = selected.account_email || activeAccount;
    const targetFolder = selected.folder_path || activeFolder;
    if (!targetAccount || !targetFolder) return;

    const to = selected.from_addr || '';
    const cc = replyAll && selected.to_addr ? selected.to_addr : '';
    const subject = selected.subject?.startsWith('Re:') ? selected.subject : `Re: ${selected.subject || ''}`;

    const sig = getAccountSignature(targetAccount);
    let fullText = text;
    let sigHtmlBlock = '';
    if (sig.enabled) {
      if (sig.isHtml && sig.html) {
        fullText = sig.text ? `${text}\n\n--\n${sig.text}` : text;
        sigHtmlBlock = `<br/><br/><div class="postaci-signature" style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:14px;">${sig.html}</div>`;
      } else if (sig.text) {
        fullText = `${text}\n\n--\n${sig.text}`;
        sigHtmlBlock = `<br/><br/><div class="postaci-signature" style="color:#666;font-size:13px;border-top:1px solid #e5e7eb;padding-top:6px;margin-top:12px;">${sig.text.replace(/\n/g, '<br/>')}</div>`;
      }
    }
    const fullHtml = `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6;">${text.replace(/\n/g, '<br/>')}${sigHtmlBlock}</div>`;

    const payload = {
      fromEmail: targetAccount,
      to,
      cc,
      subject,
      text: fullText,
      html: fullHtml,
      inReplyTo: selected.uid,
      references: selected.uid,
      attachments: files,
    };

    queueSendWithUndo(payload);
  };

  const handleExpandToFullCompose = (text: string, files: ComposeFile[], replyAll: boolean) => {
    if (!selected) return;
    const targetAccount = selected.account_email || activeAccount;
    if (!targetAccount) return;
    setComposeTitle(replyAll ? 'Tümünü Yanıtla' : 'Yanıtla');
    setCFrom(targetAccount);
    setCTo(selected.from_addr || '');
    setCCc(replyAll && selected.to_addr ? selected.to_addr : '');
    setCBcc('');
    setCSubject(selected.subject?.startsWith('Re:') ? selected.subject : `Re: ${selected.subject || ''}`);
    setCText(text);
    setCHtml(text.replace(/\n/g, '<br>'));
    setCFiles(files);
    setCInReplyTo(selected.uid);
    setCReferences(selected.uid);
    setShowCompose(true);
  };

  const handleExportEml = async () => {
    if (!selected || !window.postaci) return;
    const targetAccount = selected.account_email || activeAccount;
    const targetFolder = selected.folder_path || activeFolder || 'INBOX';
    if (!targetAccount) return;
    try {
      const res = await window.postaci.mail.exportEml(targetAccount, targetFolder, selected.uid);
      if (res.saved) {
        setNotice(t('notice.emlSaved'));
        setTimeout(() => setNotice(null), 3000);
      }
    } catch (e) {
      setError(cleanIpcError(e));
    }
  };

  const handleEmptyTrash = async () => {
    if (!activeAccount || !window.postaci) return;
    try {
      setNoticeLoading(true);
      setNotice(t('notice.trashEmptying'));
      await window.postaci.mail.emptyTrash(activeAccount);
      setNoticeLoading(false);
      setNotice(t('notice.trashEmptied'));
      setTimeout(() => setNotice(null), 3000);
      loadMessages(activeAccount, activeFolder || 'INBOX', isUnified);
      loadFolders(activeAccount);
      updateUnifiedCount();
    } catch (e) {
      setNoticeLoading(false);
      setError(cleanIpcError(e));
    }
  };

  const handleEditDraft = () => {
    if (!selected) return;
    const targetAccount = selected.account_email || activeAccount;
    if (!targetAccount) return;
    setComposeTitle('Taslağı Düzenle');
    setCFrom(targetAccount);
    setCTo(selected.to_addr || '');
    setCCc('');
    setCBcc('');
    setCSubject(selected.subject === '(Taslak)' ? '' : (selected.subject || ''));
    setCText(body?.text || selected.snippet || '');
    setCHtml(body?.html || (body?.text ? body.text.replace(/\n/g, '<br>') : ''));
    setCFiles([]);
    setShowCompose(true);
  };

  const handleDraftSaved = (savedFolder: string) => {
    const targetAccount = activeAccount || accounts[0]?.email;
    if (targetAccount) {
      loadFolders(targetAccount);
      if (activeFolder === savedFolder || /draft|taslak/i.test(activeFolder || '') || isUnified) {
        loadMessages(targetAccount, activeFolder || savedFolder, isUnified);
      }
      setNotice(t('notice.draftSaved'));
      setTimeout(() => setNotice((prev) => (prev === t('notice.draftSaved') ? null : prev)), 3500);
    }
  };

  const handleQueueSend = () => {
    if (!window.postaci) return;
    const payload = {
      fromEmail: cFrom || activeAccount || '',
      to: cTo,
      cc: cCc,
      bcc: cBcc,
      subject: cSubject,
      text: cText,
      html: cHtml,
      inReplyTo: cInReplyTo,
      references: cReferences,
      attachments: [...cFiles],
    };

    // Formu kapat ve aktif taslağı temizle
    localStorage.removeItem('postaci_active_draft');
    setShowCompose(false);
    setCTo(''); setCCc(''); setCBcc(''); setCSubject(''); setCText(''); setCHtml(''); setCFiles([]);
    setCInReplyTo(undefined); setCReferences(undefined);

    queueSendWithUndo(payload);
  };

  const handleSaveAttachment = (index: number) => {
    if (!activeAccount || !activeFolder || !selected) return;
    saveAttachment(activeAccount, activeFolder, selected.uid, index, setError, setNotice);
  };

  // ── Klavye kısayolları (Superhuman / Vim tarzı) ───────────────────────────
  useKeyboardShortcuts({
    selected,
    setSelected,
    filteredMessages,
    onNewEmail: openNew,
    onReply: () => openReplyForward('reply'),
    onReplyAll: () => openReplyForward('replyAll'),
    onForward: () => openReplyForward('forward'),
    onToggleStar: toggleStar,
    onToggleRead: toggleRead,
    onArchive: handleArchiveMessage,
    onDelete: deleteMessage,
    onOpenCommandPalette: () => setShowCommandPalette((prev) => !prev),
    onOpenShortcutsHelp: () => setShowShortcutsHelp(true),
    onSelectAll: handleSelectAll,
    shortcutsEnabled: localStorage.getItem('postaci_gmail_shortcuts') !== 'false',
    isModalOpen: showCompose || showAdd || showSettings || showCommandPalette || showShortcutsHelp,
  });

  // ── Hesap & Klasör Değişim Yönetimi ───────────────────────────────────────
  const handleSelectUnified = () => {
    setIsUnified(true);
    setMobileSidebarOpen(false);
    setSelected(null);
    handleClearSelection();
    setActiveFilter('all');
    setSearchQuery('');
    setNotice(null);
    setError(null);
    loadMessages(null, 'INBOX', true);
  };

  const handleSelectAccount = (email: string) => {
    setIsUnified(false);
    setMobileSidebarOpen(false);
    handleClearSelection();
    if (email === activeAccount) return;
    setActiveAccount(email);
    setActiveFolder('INBOX');
    loadFolders(email);
    setSelected(null);
    setActiveFilter('all');
    setSearchQuery('');
    setNotice(null);
    setError(null);
  };

  const handleSelectFolder = (path: string) => {
    setIsUnified(false);
    setMobileSidebarOpen(false);
    handleClearSelection();
    if (path === activeFolder) return;
    setActiveFolder(path);
    setSelected(null);
    setNotice(null);
    setError(null);
  };

  // Klasör listesini sunucudan zorla tazele (önbellek eksikse manuel kurtarma)
  const handleRefreshFolders = useCallback(async () => {
    if (!activeAccount || isUnified || !window.postaci?.mail?.foldersRefresh) return;
    try {
      const fresh = await window.postaci.mail.foldersRefresh(activeAccount);
      setFolders(fresh);
      setNotice(t('notice.foldersRefreshed', { count: fresh.length }));
      setTimeout(() => setNotice(null), 3000);
    } catch (e) {
      setError(cleanIpcError(e));
    }
  }, [activeAccount, isUnified, setFolders, setNotice, setError, t]);

  // ── Render ───────────────────────────────────────────────────────────────
  const A = ACCENTS[accent];

  const renderMessageList = (customClass?: string) => (
    <MessageList
      messages={filteredMessages}
      selected={selected}
      onSelect={setSelected}
      activeAccount={activeAccount}
      activeFolder={activeFolder}
      syncing={syncing}
      inElectron={inElectron}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      searchAll={searchAll}
      setSearchAll={setSearchAll}
      activeFilter={activeFilter}
      setActiveFilter={setActiveFilter}
      filterCounts={filterCounts}
      accent={accent}
      density={listDensity}
      showAvatars={showAvatars}
      snippetLines={snippetLines}
      dateFormat={dateFormat}
      hasMoreDb={hasMoreDb}
      hasMoreServer={hasMoreServer}
      loadingMore={loadingMore}
      totalDbCount={totalDbCount}
      serverTotal={serverTotal}
      onLoadMore={() => loadMore(activeAccount, activeFolder || 'INBOX', isUnified)}
      onLoadMoreServer={() => loadMoreFromServer(activeAccount, activeFolder || 'INBOX', setError, setNotice)}
      onSync={handleSync}
      onDelete={deleteMessage}
      onToggleStar={toggleStar}
      onToggleRead={toggleRead}
      onArchive={handleArchiveMessage}
      isUnified={isUnified}
      onEmptyTrash={handleEmptyTrash}
      selectedUids={selectedUids}
      onToggleSelectUid={handleToggleSelectUid}
      onSelectAll={handleSelectAll}
      onClearSelection={handleClearSelection}
      onBatchDelete={handleBatchDelete}
      onBatchMarkRead={handleBatchMarkRead}
      onBatchStar={handleBatchStar}
      folders={folders}
      onBatchArchive={handleBatchArchive}
      onBatchMove={handleBatchMove}
      className={customClass}
    />
  );

  const renderReadingPane = (onBack?: () => void) => (
    <ReadingPane
      selected={selected}
      body={body}
      bodyLoading={bodyLoading}
      bodyError={bodyError}
      safeHtml={safeHtml}
      hasRemoteImages={hasRemoteImages}
      allowRemoteImages={allowRemoteImages}
      onAllowRemoteImages={() => setAllowRemoteImages(true)}
      onAllowSenderAlways={allowSenderAlways}
      atts={atts}
      savingAtt={savingAtt}
      loadingPreview={loadingPreview}
      thread={thread}
      folders={folders}
      onBackToList={onBack}
      onReply={() => openReplyForward('reply')}
      onReplyAll={() => openReplyForward('replyAll')}
      onForward={() => openReplyForward('forward')}
      onToggleRead={() => selected && toggleRead(selected)}
      onToggleStarCurrent={() => selected && toggleStar(selected)}
      onDeleteCurrent={() => selected && deleteMessage(selected)}
      onArchiveCurrent={() => selected && handleArchiveMessage(selected)}
      onMoveCurrent={(targetFolder) => selected && handleMoveMessage(selected, targetFolder)}
      onSaveAttachment={(idx) => {
        const targetAccount = selected?.account_email || activeAccount;
        const targetFolder = selected?.folder_path || activeFolder;
        if (targetAccount && targetFolder && selected) {
          saveAttachment(targetAccount, targetFolder, selected.uid, idx, setError, setNotice);
        }
      }}
      onPreviewAttachment={(idx) => {
        const targetAccount = selected?.account_email || activeAccount;
        const targetFolder = selected?.folder_path || activeFolder;
        if (targetAccount && targetFolder && selected) {
          previewAttachment(targetAccount, targetFolder, selected.uid, idx, setError);
        }
      }}
      onExportEml={handleExportEml}
      onSendQuickReply={handleSendQuickReply}
      onExpandToFullCompose={handleExpandToFullCompose}
      quickSending={sending}
      onEditDraft={handleEditDraft}
    />
  );

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">

      {/* Mobil Üst Çubuk (md altı ekranlarda görünür) */}
      <header className="md:hidden flex items-center justify-between px-3 py-2 border-b border-zinc-200/80 bg-zinc-50/95 dark:border-zinc-800/80 dark:bg-zinc-900/95 shrink-0 z-30 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/80 dark:hover:bg-zinc-800 transition shrink-0"
            title="Menüyü Aç"
          >
            <MenuIcon size={18} />
          </button>
          <PostaciLogo size="sm" showBadge={false} />
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[120px]">
            {isUnified ? 'Tüm Gelenler' : (activeFolder || 'INBOX')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={openNew}
            className={`p-1.5 rounded-lg ${A.btn} text-white shadow-2xs`}
            title="Yeni E-posta"
          >
            <PlusIcon size={16} />
          </button>
        </div>
      </header>

      {/* Mobil Çekmece Arka Plan Karartması */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-fadeIn"
        />
      )}

      {/* Sidebar: Masaüstünde statik, mobilde çekmece (drawer) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } shrink-0 h-full`}
      >
        <Sidebar
          accounts={accounts}
          activeAccount={activeAccount}
          setActiveAccount={handleSelectAccount}
          folders={displayFolders}
          activeFolder={activeFolder}
          setActiveFolder={handleSelectFolder}
          stats={stats}
          accent={accent}
          onNewEmail={openNew}
          onShowAdd={() => { setError(null); setNotice(null); setShowAdd(true); }}
          onShowSettings={() => setShowSettings(true)}
          onShowContacts={() => setShowContacts(true)}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onOpenShortcutsHelp={() => setShowShortcutsHelp(true)}
          isUnified={isUnified}
          onSelectUnified={handleSelectUnified}
          unifiedUnreadCount={unifiedUnreadCount}
          accountUnreadCounts={unreadCounts.byAccount}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onRefreshFolders={handleRefreshFolders}
          folderWidth={folderWidth}
          isCollapsed={folderCollapsed}
          onToggleCollapse={toggleFolderCollapse}
        />
      </div>

      {/* Klasörler ve Mesaj Listesi Arasındaki Yeniden Boyutlandırma Bölücüsü (Splitter) */}
      {!folderCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleMouseDownFolderResize}
          onDoubleClick={() => setFolderWidth(220)}
          className="hidden md:flex items-center justify-center w-2 -mx-1 z-20 cursor-col-resize group shrink-0 select-none hover:w-3.5 hover:-mx-1.75 transition-all"
          title="Klasör panelini genişletmek veya daraltmak için sağa/sola sürükleyin (Sıfırlamak için çift tıklayın)"
        >
          <div
            className={`w-[2px] h-full transition-all ${
              isResizingFolder
                ? 'bg-blue-600 dark:bg-blue-400 w-[3px] shadow-sm'
                : 'bg-zinc-200/90 group-hover:bg-blue-500/80 dark:bg-zinc-800 group-hover:dark:bg-blue-400/80'
            }`}
          />
        </div>
      )}

      {/* Ana İçerik Alanı: Düzen Moduna Göre */}
      <div className="flex-1 flex overflow-hidden min-w-0 h-full">
        {layoutMode === 'three-column' && (
          <>
            <div
              style={{
                width: typeof window !== 'undefined' && window.innerWidth >= 768 ? `${listWidth}px` : undefined,
                minWidth: typeof window !== 'undefined' && window.innerWidth >= 768 ? '260px' : undefined,
                maxWidth: typeof window !== 'undefined' && window.innerWidth >= 768 ? '750px' : undefined,
              }}
              className={`flex flex-col h-full shrink-0 min-w-0 ${
                selected ? 'hidden md:flex' : 'flex-1 md:flex-none w-full'
              }`}
            >
              {renderMessageList('w-full h-full border-r border-zinc-200/80 dark:border-zinc-800/80')}
            </div>

            {/* Yeniden Boyutlandırma Bölücüsü (Splitter) */}
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={handleMouseDownResize}
              onDoubleClick={() => setListWidth(380)}
              className="hidden md:flex items-center justify-center w-2 -mx-1 z-20 cursor-col-resize group shrink-0 select-none hover:w-3.5 hover:-mx-1.75 transition-all"
              title="Genişletmek veya daraltmak için sağa/sola sürükleyin (Sıfırlamak için çift tıklayın)"
            >
              <div
                className={`w-[2px] h-full transition-all ${
                  isResizing
                    ? 'bg-blue-600 dark:bg-blue-400 w-[3px] shadow-sm'
                    : 'bg-zinc-200/90 group-hover:bg-blue-500/80 dark:bg-zinc-800 group-hover:dark:bg-blue-400/80'
                }`}
              />
            </div>

            <div className={`flex-1 flex flex-col h-full min-w-0 ${selected ? 'flex' : 'hidden md:flex'}`}>
              {renderReadingPane(() => setSelected(null))}
            </div>
          </>
        )}

        {layoutMode === 'horizontal' && (
          <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
            <div className={`flex flex-col min-w-0 ${selected ? 'hidden md:flex' : 'flex'} md:h-[42%] md:min-h-[220px] md:max-h-[50%] shrink-0 border-b border-zinc-200/80 dark:border-zinc-800/80`}>
              {renderMessageList('w-full h-full border-none')}
            </div>
            <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${selected ? 'flex' : 'hidden md:flex'}`}>
              {renderReadingPane(() => setSelected(null))}
            </div>
          </div>
        )}

        {layoutMode === 'compact' && (
          <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
            {selected ? (
              renderReadingPane(() => setSelected(null))
            ) : (
              renderMessageList('w-full h-full border-none')
            )}
          </div>
        )}
      </div>

      {showAdd && (
        <AddAccountModal
          inElectron={inElectron}
          accent={accent}
          onClose={() => setShowAdd(false)}
          onConnected={(email) => {
            setShowAdd(false);
            refresh();
            handleSelectAccount(email);
          }}
          setError={setError}
          setNotice={setNotice}
        />
      )}

      {showSettings && (
        <SettingsModal
          theme={theme}
          setTheme={setTheme}
          accent={accent}
          setAccent={setAccent}
          oledMode={oledMode}
          setOledMode={setOledMode}
          listDensity={listDensity}
          setListDensity={setListDensity}
          showAvatars={showAvatars}
          setShowAvatars={setShowAvatars}
          snippetLines={snippetLines}
          setSnippetLines={setSnippetLines}
          dateFormat={dateFormat}
          setDateFormat={setDateFormat}
          accounts={accounts}
          activeAccount={activeAccount}
          layoutMode={layoutMode}
          onLayoutModeChange={handleSetLayoutMode}
          onRefreshAccounts={refresh}
          onOpenAddAccount={() => {
            setShowSettings(false);
            setError(null);
            setNotice(null);
            setShowAdd(true);
          }}
          onOpenShortcutsHelp={() => {
            setShowSettings(false);
            setShowShortcutsHelp(true);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showContacts && (
        <ContactsModal
          onClose={() => setShowContacts(false)}
          onComposeTo={(email, name) => {
            openNew(name ? `"${name}" <${email}>` : email);
          }}
        />
      )}

      {showCompose && (
        <ComposeModal
          title={composeTitle}
          accounts={accounts}
          accent={accent}
          cFrom={cFrom} setCFrom={setCFrom}
          cTo={cTo} setCTo={setCTo}
          cCc={cCc} setCCc={setCCc}
          cBcc={cBcc} setCBcc={setCBcc}
          cSubject={cSubject} setCSubject={setCSubject}
          cText={cText} setCText={setCText}
          cHtml={cHtml} setCHtml={setCHtml}
          cFiles={cFiles} setCFiles={setCFiles}
          sending={sending}
          error={error}
          onDraftSaved={handleDraftSaved}
          onSend={handleQueueSend}
          onClose={() => setShowCompose(false)}
        />
      )}

      {/* Gönderimi Geri Al (Undo Send) Kayan Bar */}
      {undoTask && (
        <UndoSendBar
          task={undoTask}
          sending={sending}
          onUndo={handleUndoSend}
          onSendImmediately={handleSendImmediately}
        />
      )}

      {/* Global toast bildirimleri (notice + hata) */}
      {notice && !showCompose && (
        <Toast
          message={notice}
          type="notice"
          accent={ACCENT_COLORS[accent] || '#2563eb'}
          loading={noticeLoading}
          onClose={() => {
            setNotice(null);
            setNoticeLoading(false);
          }}
        />
      )}
      {error && !showCompose && (
        <Toast
          message={error}
          type="error"
          onClose={() => setError(null)}
        />
      )}
      {/* Ekran içi zengin e-posta bildirim kartı (Superhuman/Slack tarzı) */}
      {inAppAlert && (
        <InAppNotification
          key={inAppAlert.id}
          data={inAppAlert}
          onClose={() => setInAppAlert(null)}
          onView={handleViewInAppMail}
          accent={ACCENT_COLORS[accent] || '#2563eb'}
        />
      )}

      {/* Ek dosya önizleme modalı */}
      {previewData && (
        <AttachmentPreviewModal
          filename={previewData.filename}
          contentType={previewData.contentType}
          dataBase64={previewData.dataBase64}
          onClose={() => setPreviewData(null)}
          onSave={() => {
            if (selected && activeAccount && activeFolder) {
              handleSaveAttachment(previewData.index);
            }
          }}
        />
      )}

      {/* Superhuman Hızlı Komut Paleti (Ctrl+K) */}
      <CommandPaletteModal
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        accounts={accounts}
        activeAccount={activeAccount}
        onSelectAccount={handleSelectAccount}
        folders={folders}
        activeFolder={activeFolder || 'INBOX'}
        onSelectFolder={handleSelectFolder}
        onNewMail={openNew}
        onSync={handleSync}
        onOpenSettings={() => setShowSettings(true)}
        onOpenShortcutsHelp={() => setShowShortcutsHelp(true)}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
        layoutMode={layoutMode}
        onSelectLayoutMode={handleSetLayoutMode}
      />

      {/* Klavye Kısayolları Rehberi (?) */}
      <ShortcutsHelpModal
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />
    </div>
  );
}
