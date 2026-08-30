import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Account, Email, FolderStat, ViewLayout, MainTab } from '../types';
import { api, EVENTS_URL } from '../services/api';
import { useToast } from './ToastContext';
import { playNotificationChime } from '../utils/sound';

interface MailContextType {
  accounts: Account[];
  activeAccountId: string;
  setActiveAccountId: (id: string) => void;
  folderStats: FolderStat[];
  activeFolder: string;
  setActiveFolder: (folder: string) => void;
  activeLabel: string | null;
  setActiveLabel: (label: string | null) => void;
  emails: Email[];
  selectedEmailId: string | null;
  selectedEmail: Email | undefined;
  threadEmails: Email[];
  checkedEmailIds: Set<string>;
  toggleEmailCheck: (id: string) => void;
  setCheckedRange: (ids: string[]) => void;
  selectAllEmails: () => void;
  clearCheckedEmails: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filter: 'all' | 'unread' | 'starred' | 'has_attachment';
  setFilter: (filter: 'all' | 'unread' | 'starred' | 'has_attachment') => void;
  viewLayout: ViewLayout;
  setViewLayout: (layout: ViewLayout) => void;
  mainTab: MainTab;
  setMainTab: (tab: MainTab) => void;
  isComposerOpen: boolean;
  setIsComposerOpen: (open: boolean) => void;
  composerData: Partial<Email> | null;
  openComposer: (data?: Partial<Email>) => void;
  openReply: (email: Email, replyAll?: boolean) => void;
  openForward: (email: Email) => void;
  closeComposer: () => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isShortcutsOpen: boolean;
  setIsShortcutsOpen: (open: boolean) => void;
  isLoading: boolean;
  isSyncing: boolean;
  refreshEmails: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  refreshStats: () => Promise<void>;
  selectEmail: (id: string | null) => void;
  nextEmail: () => void;
  prevEmail: () => void;
  toggleRead: (id: string, currentStatus: boolean) => Promise<void>;
  toggleStarred: (id: string, currentStatus: boolean) => Promise<void>;
  togglePinned: (id: string, currentStatus?: boolean) => Promise<void>;
  snoozeEmail: (id: string, untilDate: string) => Promise<void>;
  archiveEmail: (id: string) => Promise<void>;
  deleteEmail: (id: string) => Promise<void>;
  markAsSpam: (id: string) => Promise<void>;
  moveToFolder: (ids: string | string[], targetFolder: string) => Promise<void>;
  bulkArchive: () => Promise<void>;
  bulkDelete: () => Promise<void>;
  bulkMarkRead: (read: boolean) => Promise<void>;
  emptyTrashFolder: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

const MailContext = createContext<MailContextType | undefined>(undefined);

export const MailProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { success, info, error } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('all');
  const [folderStats, setFolderStats] = useState<FolderStat[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>('INBOX');
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [checkedEmailIds, setCheckedEmailIds] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'starred' | 'has_attachment'>('all');
  const [viewLayout, setViewLayoutState] = useState<ViewLayout>(() => (localStorage.getItem('postaci_view_layout') as ViewLayout) || 'split-3-column');
  const setViewLayout = useCallback((layout: ViewLayout) => {
    setViewLayoutState(layout);
    localStorage.setItem('postaci_view_layout', layout);
  }, []);
  const [mainTab, setMainTab] = useState<MainTab>('mail');

  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);
  const [composerData, setComposerData] = useState<Partial<Email> | null>(null);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Key combo state (for "g i", "* a", etc.)
  const pendingKeyComboRef = useRef<string | null>(null);
  const comboTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load Accounts
  const refreshAccounts = useCallback(async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data);
      if (data.length === 0) {
        setIsSettingsOpen(true);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  }, []);

  // Load Folder Stats
  const refreshStats = useCallback(async () => {
    try {
      const stats = await api.getFolderStats(activeAccountId !== 'all' ? activeAccountId : undefined);
      setFolderStats(stats);
    } catch (err) {
      console.error('Error fetching folder stats:', err);
    }
  }, [activeAccountId]);

  const lastSyncedFolderRef = useRef<string | null>(null);
  const folderCacheRef = useRef<Map<string, Email[]>>(new Map());

  const pruneFromCache = useCallback((emailIds: string[]) => {
    const idSet = new Set(emailIds);
    for (const [key, list] of folderCacheRef.current.entries()) {
      folderCacheRef.current.set(key, list.filter(e => !idSet.has(e.id)));
    }
  }, []);

  // Load Emails with SWR In-Memory Instant Cache
  const refreshEmails = useCallback(async (showLoading = false) => {
    const cacheKey = `${activeAccountId}-${activeFolder}-${filter}-${activeLabel || ''}-${searchQuery || ''}`;
    
    // If we have cached emails for this folder, show them instantly without wiping the screen
    if (folderCacheRef.current.has(cacheKey)) {
      const cached = folderCacheRef.current.get(cacheKey)!;
      setEmails(cached);
      if (showLoading && cached.length === 0) {
        setIsLoading(true);
      }
    } else if (showLoading) {
      setIsLoading(true);
    }

    try {
      const data = await api.getEmails({
        accountId: activeAccountId !== 'all' ? activeAccountId : undefined,
        folder: activeFolder,
        isStarred: filter === 'starred' ? true : undefined,
        isUnread: filter === 'unread' ? true : undefined,
        label: activeLabel || undefined,
        search: searchQuery || undefined,
      });

      // Filter by attachment if requested
      const filtered = filter === 'has_attachment' ? data.filter(e => e.attachments && e.attachments.length > 0) : data;
      
      const getTime = (d: any) => {
        if (!d) return 0;
        const t = new Date(d).getTime();
        return isNaN(t) ? 0 : t;
      };

      // Sort pinned emails to top, then strictly newest date first, then highest imapUid
      const sorted = [...filtered].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const diff = getTime(b.date) - getTime(a.date);
        if (diff !== 0) return diff;
        return (b.imapUid || 0) - (a.imapUid || 0);
      });

      folderCacheRef.current.set(cacheKey, sorted);
      setEmails(sorted);

      setSelectedEmailId(prevId => {
        if (sorted.length > 0) {
          if (prevId && sorted.some(e => e.id === prevId)) {
            return prevId;
          }
          return sorted[0].id;
        }
        return null;
      });
    } catch (err) {
      console.error('Error fetching emails:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeAccountId, activeFolder, filter, activeLabel, searchQuery]);

  // Initial load
  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    refreshEmails(true);
    refreshStats();
  }, [activeAccountId, activeFolder, activeLabel, filter, searchQuery, refreshEmails, refreshStats]);

  // On-demand folder background sync (runs for custom folders, TRASH, SENT, SPAM on selection)
  useEffect(() => {
    const skipSync = ['STARRED', 'UNREAD', 'DRAFTS', 'ARCHIVE', 'INBOX'];
    if (activeFolder && !skipSync.includes(activeFolder)) {
      const key = `${activeAccountId}-${activeFolder}`;
      if (lastSyncedFolderRef.current !== key) {
        lastSyncedFolderRef.current = key;
        const targetAcc = (activeAccountId && activeAccountId !== 'all')
          ? accounts.find(a => a.id === activeAccountId && a.provider !== 'demo')
          : accounts.find(a => a.provider !== 'demo');
        if (targetAcc) {
          api.syncFolder(targetAcc.id, activeFolder).then(() => {
            refreshEmailsRef.current(false);
            refreshStatsRef.current();
          }).catch(() => {});
        }
      }
    }
  }, [activeAccountId, activeFolder, accounts]);

  // Refs to avoid closing and re-opening SSE connection on every filter/search/folder state change
  const refreshEmailsRef = useRef(refreshEmails);
  refreshEmailsRef.current = refreshEmails;
  const refreshStatsRef = useRef(refreshStats);
  refreshStatsRef.current = refreshStats;
  const refreshAccountsRef = useRef(refreshAccounts);
  refreshAccountsRef.current = refreshAccounts;
  const setActiveAccountIdRef = useRef(setActiveAccountId);
  setActiveAccountIdRef.current = setActiveAccountId;
  const activeAccountIdValRef = useRef(activeAccountId);
  activeAccountIdValRef.current = activeAccountId;
  const infoRef = useRef(info);
  infoRef.current = info;
  const successRef = useRef(success);
  successRef.current = success;

  // Window focus and visibilitychange sync (re-validates local state instantly without network lag)
  useEffect(() => {
    let lastFocusSync = 0;
    const handleFocusSync = () => {
      if (!navigator.onLine) return;
      const now = Date.now();
      if (now - lastFocusSync < 15000) return; // at most once every 15s
      lastFocusSync = now;

      refreshEmailsRef.current(false);
      refreshStatsRef.current();
    };

    window.addEventListener('focus', handleFocusSync);
    const handleVis = () => {
      if (!document.hidden) handleFocusSync();
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, []);

  // Load Thread when selectedEmailId changes (without depending on whole emails array)
  useEffect(() => {
    if (!selectedEmailId) {
      setThreadEmails([]);
      return;
    }

    // Fetch latest email detail from API (triggers on-demand full body fetch if needed)
    api.getEmailById(selectedEmailId).then((fetched: Email) => {
      if (fetched) {
        setEmails(prev => prev.map(e => e.id === fetched.id ? { ...e, ...fetched } : e));
      }
    }).catch(() => {});

    const currentEmail = emails.find(e => e.id === selectedEmailId);
    if (currentEmail?.threadId) {
      api.getEmailThread(currentEmail.threadId)
        .then(res => setThreadEmails(res))
        .catch(() => setThreadEmails(currentEmail ? [currentEmail] : []));
    } else if (currentEmail) {
      setThreadEmails([currentEmail]);
    }
  }, [selectedEmailId]);

  // Request notification permissions on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Server-Sent Events (SSE) for real-time incoming mail and sync (Connects ONCE on mount)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let refreshDebounceTimer: NodeJS.Timeout | null = null;

    const debouncedRefresh = () => {
      if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
      refreshDebounceTimer = setTimeout(() => {
        refreshEmailsRef.current(false);
        refreshStatsRef.current();
      }, 300);
    };

    let lastChimeTime = 0;
    let lastToastTime = 0;

    try {
      eventSource = new EventSource(EVENTS_URL);

      eventSource.addEventListener('new_email', (event: MessageEvent) => {
        try {
          const newMail: Email = JSON.parse(event.data);
          const sender = newMail.fromName || newMail.fromEmail || 'Bilinmeyen';
          const title = `Yeni E-Posta: ${sender}`;
          const body = `${newMail.subject || '(Konusuz)'}\n${(newMail.snippet || '').substring(0, 90)}`;
          const now = Date.now();

          // 1. In-app toast notification (rate limited to once every 3s)
          if (now - lastToastTime > 3000) {
            lastToastTime = now;
            infoRef.current(`${sender}: ${newMail.subject || '(Konusuz)'}`, 'Yeni E-Posta');
          }

          // 2. Play gentle notification audio chime (rate limited to once every 4s)
          if (now - lastChimeTime > 4000) {
            lastChimeTime = now;
            const soundPref = localStorage.getItem('postaci_notif_sound') || 'subtle';
            playNotificationChime(soundPref);
          }

          // 3. Desktop Native Notification (Windows Action Center / Electron / Web)
          const desktopNotifsEnabled = localStorage.getItem('postaci_desktop_notifs') !== 'false';
          if (desktopNotifsEnabled) {
            if ((window as any).electronAPI?.sendNotification) {
              (window as any).electronAPI.sendNotification(title, body);
            } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(title, {
                body,
                icon: '/favicon.svg',
                tag: newMail.id
              });
            }
          }

          debouncedRefresh();
        } catch (e) {
          console.error('Error parsing SSE new_email:', e);
        }
      });

      eventSource.addEventListener('accounts_updated', async (event: MessageEvent) => {
        try {
          const acc = JSON.parse(event.data);
          if (!acc.deleted && acc.email) {
            successRef.current(`${acc.email} hesabı başarıyla bağlandı!`, 'Hesap Eklendi');
          }
          if (acc.deleted) {
            setEmails(prev => prev.filter(e => e.accountId !== acc.id));
          }
          const remaining = await api.getAccounts();
          setAccounts(remaining);
          if (acc.deleted) {
            if (remaining.length === 0) {
              setActiveAccountIdRef.current('');
              setEmails([]);
              setSelectedEmailId(null);
            } else if (!remaining.some(a => a.id === activeAccountIdValRef.current)) {
              setActiveAccountIdRef.current(remaining[0].id);
            }
          } else if (acc.id) {
            setActiveAccountIdRef.current(acc.id);
          }
          debouncedRefresh();
        } catch (e) {
          console.error('Error parsing SSE accounts_updated:', e);
        }
      });

      eventSource.addEventListener('emails_synced', () => {
        debouncedRefresh();
      });

      eventSource.addEventListener('email_updated', () => {
        debouncedRefresh();
      });

      eventSource.addEventListener('email_deleted', () => {
        debouncedRefresh();
      });
    } catch (err) {
      console.warn('SSE connection failed (local polling fallback):', err);
    }

    return () => {
      if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
      if (eventSource) eventSource.close();
    };
  }, []);

  const selectEmail = (id: string | null) => {
    setSelectedEmailId(id);
  };

  const nextEmail = () => {
    if (!emails.length) return;
    const currentIndex = emails.findIndex(e => e.id === selectedEmailId);
    if (currentIndex < emails.length - 1) {
      setSelectedEmailId(emails[currentIndex + 1].id);
    }
  };

  const prevEmail = () => {
    if (!emails.length) return;
    const currentIndex = emails.findIndex(e => e.id === selectedEmailId);
    if (currentIndex > 0) {
      setSelectedEmailId(emails[currentIndex - 1].id);
    }
  };

  const adjustFolderStats = useCallback((adjustments: Array<{ folder: string; countDelta: number; unreadDelta?: number }>) => {
    setFolderStats(prev => {
      const copy = prev.map(s => ({ ...s }));
      for (const adj of adjustments) {
        const found = copy.find(f => f.folder === adj.folder);
        if (found) {
          found.count = Math.max(0, found.count + adj.countDelta);
          if (adj.unreadDelta !== undefined) {
            found.unreadCount = Math.max(0, found.unreadCount + adj.unreadDelta);
          }
        }
      }
      return copy;
    });
  }, []);

  const toggleRead = async (id: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    setEmails(prev => prev.map(e => (e.id === id ? { ...e, isRead: newStatus } : e)));
    
    // 0ms instant stats adjustment
    adjustFolderStats([
      { folder: activeFolder, countDelta: 0, unreadDelta: newStatus ? -1 : 1 }
    ]);

    await api.updateEmailFlags(id, { isRead: newStatus });
    refreshStats();
  };

  const toggleStarred = async (id: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    setEmails(prev => prev.map(e => (e.id === id ? { ...e, isStarred: newStatus } : e)));
    
    // 0ms instant stats adjustment
    adjustFolderStats([
      { folder: 'STARRED', countDelta: newStatus ? 1 : -1 }
    ]);

    await api.updateEmailFlags(id, { isStarred: newStatus });
    refreshStats();
  };

  const togglePinned = async (id: string, currentStatus?: boolean) => {
    const newStatus = currentStatus !== undefined ? !currentStatus : true;
    setEmails(prev => prev.map(e => (e.id === id ? { ...e, isPinned: newStatus } : e)));
    await api.updateEmailFlags(id, { isPinned: newStatus } as any);
    success(newStatus ? 'İleti başa sabitlendi.' : 'İleti sabitlemesi kaldırıldı.');
    refreshEmails();
  };

  const snoozeEmail = async (id: string, untilDate: string) => {
    await api.updateEmailFlags(id, { isArchived: true, folder: 'SNOOZED', snoozedUntil: untilDate } as any);
    success('İleti ertelendi.');
    refreshEmails();
    refreshStats();
  };

  const archiveEmail = async (id: string) => {
    const cur = emails.find(e => e.id === id);
    const wasUnread = cur ? !cur.isRead : false;
    const srcFolder = cur?.folder || activeFolder;

    // Optimistic instant UI update (0ms)
    const idx = emails.findIndex(e => e.id === id);
    const remaining = emails.filter(e => e.id !== id);
    setEmails(remaining);
    if (selectedEmailId === id) {
      if (remaining.length > 0) {
        const nextTarget = remaining[Math.min(idx, remaining.length - 1)];
        setSelectedEmailId(nextTarget.id);
      } else {
        setSelectedEmailId(null);
      }
    }
    pruneFromCache([id]);
    
    // 0ms instant sidebar stats update
    adjustFolderStats([
      { folder: srcFolder, countDelta: -1, unreadDelta: wasUnread ? -1 : 0 },
      { folder: 'ARCHIVE', countDelta: 1, unreadDelta: wasUnread ? 1 : 0 },
    ]);

    success('İleti arşive taşındı.');

    try {
      await api.updateEmailFlags(id, { isArchived: true, folder: 'ARCHIVE' });
      refreshStats();
    } catch {
      refreshEmails();
      refreshStats();
    }
  };

  const deleteEmail = async (id: string) => {
    const cur = emails.find(e => e.id === id);
    const isAlreadyTrash = cur?.folder === 'TRASH' || activeFolder === 'TRASH';
    const wasUnread = cur ? !cur.isRead : false;
    const wasStarred = cur ? Boolean(cur.isStarred) : false;
    const srcFolder = cur?.folder || activeFolder;

    // Optimistic instant UI update (0ms)
    const idx = emails.findIndex(e => e.id === id);
    const remaining = emails.filter(e => e.id !== id);
    setEmails(remaining);
    if (selectedEmailId === id) {
      if (remaining.length > 0) {
        const nextTarget = remaining[Math.min(idx, remaining.length - 1)];
        setSelectedEmailId(nextTarget.id);
      } else {
        setSelectedEmailId(null);
      }
    }
    pruneFromCache([id]);

    // 0ms instant sidebar stats update
    if (isAlreadyTrash) {
      adjustFolderStats([{ folder: 'TRASH', countDelta: -1, unreadDelta: wasUnread ? -1 : 0 }]);
    } else {
      const adjs: Array<{ folder: string; countDelta: number; unreadDelta?: number }> = [
        { folder: srcFolder, countDelta: -1, unreadDelta: wasUnread ? -1 : 0 },
        { folder: 'TRASH', countDelta: 1, unreadDelta: wasUnread ? 1 : 0 },
      ];
      if (wasStarred) {
        adjs.push({ folder: 'STARRED', countDelta: -1 });
      }
      adjustFolderStats(adjs);
    }

    success(isAlreadyTrash ? 'İleti kalıcı olarak silindi.' : 'İleti çöp kutusuna taşındı.');

    try {
      if (isAlreadyTrash) {
        await api.deleteEmailPermanent(id);
      } else {
        await api.updateEmailFlags(id, { isDeleted: true, folder: 'TRASH' });
      }
      refreshEmails(false);
      refreshStats();
    } catch {
      refreshEmails();
      refreshStats();
    }
  };

  const moveToFolder = async (ids: string | string[], targetFolder: string) => {
    const idList = Array.isArray(ids) ? ids : [ids];
    if (idList.length === 0) return;

    const idSet = new Set(idList);
    const selectedItems = emails.filter(e => idSet.has(e.id));
    const unreadCount = selectedItems.filter(e => !e.isRead).length;

    // Optimistic instant removal if not viewing target folder
    if (activeFolder !== targetFolder) {
      setEmails(prev => prev.filter(e => !idSet.has(e.id)));
      if (selectedEmailId && idSet.has(selectedEmailId)) {
        const remaining = emails.filter(e => !idSet.has(e.id));
        setSelectedEmailId(remaining.length > 0 ? remaining[0].id : null);
      }
    }

    // 0ms instant sidebar stats update
    adjustFolderStats([
      { folder: activeFolder, countDelta: -idList.length, unreadDelta: -unreadCount },
      { folder: targetFolder, countDelta: idList.length, unreadDelta: unreadCount },
    ]);

    clearCheckedEmails();

    const folderNames: Record<string, string> = {
      INBOX: 'Gelen Kutusu',
      SENT: 'Gönderilenler',
      DRAFTS: 'Taslaklar',
      TRASH: 'Çöp Kutusu',
      SPAM: 'İstenmeyen (Spam)',
      ARCHIVE: 'Arşiv'
    };

    const targetDisplayName = folderNames[targetFolder] || targetFolder;
    success(`${idList.length} ileti "${targetDisplayName}" klasörüne taşındı.`);

    try {
      await api.bulkUpdateEmailFlags(idList, {
        folder: targetFolder,
        isDeleted: targetFolder === 'TRASH',
        isArchived: targetFolder === 'ARCHIVE',
        isSpam: targetFolder === 'SPAM',
      });
      refreshEmails(false);
      refreshStats();
    } catch {
      refreshEmails();
      refreshStats();
    }
  };

  const markAsSpam = async (id: string) => {
    const cur = emails.find(e => e.id === id);
    const wasUnread = cur ? !cur.isRead : false;

    setEmails(prev => prev.filter(e => e.id !== id));
    if (selectedEmailId === id) {
      const remaining = emails.filter(e => e.id !== id);
      setSelectedEmailId(remaining.length > 0 ? remaining[0].id : null);
    }
    
    // 0ms instant stats adjustment
    adjustFolderStats([
      { folder: activeFolder, countDelta: -1, unreadDelta: wasUnread ? -1 : 0 },
      { folder: 'SPAM', countDelta: 1, unreadDelta: wasUnread ? 1 : 0 },
    ]);

    info('İleti spam olarak işaretlendi.');

    try {
      await api.updateEmailFlags(id, { isSpam: true, folder: 'SPAM' });
      refreshStats();
    } catch {
      refreshEmails();
      refreshStats();
    }
  };

  const toggleEmailCheck = (id: string) => {
    setCheckedEmailIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setCheckedRange = (ids: string[]) => {
    setCheckedEmailIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  };

  const selectAllEmails = () => {
    if (checkedEmailIds.size === emails.length) {
      setCheckedEmailIds(new Set());
    } else {
      setCheckedEmailIds(new Set(emails.map(e => e.id)));
    }
  };

  const clearCheckedEmails = () => {
    setCheckedEmailIds(new Set());
  };

  const bulkArchive = async () => {
    if (checkedEmailIds.size === 0) return;
    const ids = Array.from(checkedEmailIds);
    const idSet = new Set(ids);
    const selectedItems = emails.filter(e => idSet.has(e.id));
    const unreadCount = selectedItems.filter(e => !e.isRead).length;

    // Optimistic removal
    setEmails(prev => prev.filter(e => !idSet.has(e.id)));
    pruneFromCache(ids);
    clearCheckedEmails();
    setSelectedEmailId(prevId => (prevId && idSet.has(prevId) ? null : prevId));

    // 0ms instant sidebar stats update
    adjustFolderStats([
      { folder: activeFolder, countDelta: -ids.length, unreadDelta: -unreadCount },
      { folder: 'ARCHIVE', countDelta: ids.length, unreadDelta: unreadCount },
    ]);

    success(`${ids.length} e-posta arşivlendi.`);

    try {
      await api.bulkUpdateEmailFlags(ids, { isArchived: true, folder: 'ARCHIVE' });
      refreshStats();
    } catch {
      refreshEmails();
      refreshStats();
    }
  };

  const bulkDelete = async () => {
    if (checkedEmailIds.size === 0) return;
    const ids = Array.from(checkedEmailIds);
    const idSet = new Set(ids);
    const isTrash = activeFolder === 'TRASH';
    const selectedItems = emails.filter(e => idSet.has(e.id));
    const unreadCount = selectedItems.filter(e => !e.isRead).length;

    // Optimistic removal
    setEmails(prev => prev.filter(e => !idSet.has(e.id)));
    pruneFromCache(ids);
    clearCheckedEmails();
    setSelectedEmailId(prevId => (prevId && idSet.has(prevId) ? null : prevId));

    // 0ms instant sidebar stats update
    if (isTrash) {
      adjustFolderStats([{ folder: 'TRASH', countDelta: -ids.length, unreadDelta: -unreadCount }]);
    } else {
      adjustFolderStats([
        { folder: activeFolder, countDelta: -ids.length, unreadDelta: -unreadCount },
        { folder: 'TRASH', countDelta: ids.length, unreadDelta: unreadCount },
      ]);
    }

    success(isTrash ? `${ids.length} e-posta kalıcı olarak silindi.` : `${ids.length} e-posta çöp kutusuna taşındı.`);

    try {
      if (isTrash) {
        await api.bulkDeleteEmails(ids);
      } else {
        await api.bulkUpdateEmailFlags(ids, { isDeleted: true, folder: 'TRASH' });
      }
      refreshEmails(false);
      refreshStats();
    } catch {
      refreshEmails();
      refreshStats();
    }
  };

  const emptyTrashFolder = async () => {
    // Optimistic instant clear
    const count = emails.length;
    const unreadCount = emails.filter(e => !e.isRead).length;
    setEmails([]);
    setSelectedEmailId(null);
    clearCheckedEmails();
    folderCacheRef.current.clear();

    // 0ms instant stats adjustment
    adjustFolderStats([
      { folder: 'TRASH', countDelta: -count, unreadDelta: -unreadCount }
    ]);

    success(`Çöp kutusu boşaltıldı (${count} e-posta temizlendi).`);

    try {
      await api.emptyTrash(activeAccountId);
      refreshEmails(false);
      refreshStats();
    } catch {
      refreshEmails();
      refreshStats();
    }
  };

  const bulkMarkRead = async (read: boolean) => {
    if (checkedEmailIds.size === 0) return;
    const ids = Array.from(checkedEmailIds);
    const idSet = new Set(ids);

    setEmails(prev => prev.map(e => idSet.has(e.id) ? { ...e, isRead: read } : e));
    
    // 0ms instant stats adjustment
    adjustFolderStats([
      { folder: activeFolder, countDelta: 0, unreadDelta: read ? -ids.length : ids.length }
    ]);

    success(`${ids.length} e-posta ${read ? 'okundu' : 'okunmadı'} olarak işaretlendi.`);

    try {
      await api.bulkUpdateEmailFlags(ids, { isRead: read });
      refreshStats();
    } catch {
      refreshEmails();
      refreshStats();
    }
  };

  const openComposer = (data?: Partial<Email>) => {
    setComposerData(data || null);
    setIsComposerOpen(true);
  };

  const openReply = (email: Email, replyAll: boolean = false) => {
    const toRecipients = [{ name: email.fromName, email: email.fromEmail }];
    const ccRecipients = replyAll ? email.to.filter(t => t.email !== email.fromEmail) : [];
    const subject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
    const quotedBody = `<br><br><div style="border-left: 2px solid #cbd5e1; padding-left: 12px; margin-top: 16px; color: #64748b;">${email.date} tarihinde ${email.fromName} &lt;${email.fromEmail}&gt; yazdı:<br>${email.bodyHtml}</div>`;

    openComposer({
      accountId: email.accountId,
      threadId: email.threadId,
      inReplyTo: email.messageId || email.id,
      to: toRecipients,
      cc: ccRecipients,
      subject,
      bodyHtml: quotedBody,
      bodyText: `\n\n---\n${email.date} tarihinde ${email.fromName} yazdı:\n${email.bodyText}`
    });
  };

  const openForward = (email: Email) => {
    const subject = email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`;
    const quotedBody = `<br><br><div style="border-left: 2px solid #cbd5e1; padding-left: 12px; margin-top: 16px; color: #64748b;">---------- İletilen İleti ----------<br>Kimden: ${email.fromName} &lt;${email.fromEmail}&gt;<br>Tarih: ${email.date}<br>Konu: ${email.subject}<br><br>${email.bodyHtml}</div>`;

    openComposer({
      accountId: email.accountId,
      subject,
      bodyHtml: quotedBody,
      bodyText: `\n\n---------- İletilen İleti ----------\nKimden: ${email.fromName}\nKonu: ${email.subject}\n\n${email.bodyText}`,
      attachments: email.attachments
    });
  };

  const closeComposer = () => {
    setIsComposerOpen(false);
    setComposerData(null);
  };

  const triggerSync = async () => {
    setIsSyncing(true);
    let successCount = 0;
    let lastError: any = null;

    try {
      const freshAccounts = await api.getAccounts().catch(() => accounts);
      const targets = (activeAccountId && activeAccountId !== 'all')
        ? freshAccounts.filter(a => a.id === activeAccountId && a.provider !== 'demo')
        : freshAccounts.filter(a => a.provider !== 'demo');

      if (targets.length === 0) {
        info('Senkronize edilecek aktif posta hesabı bulunamadı.', 'Postacı');
        return;
      }

      const results = await Promise.allSettled(
        targets.map(async acc => {
          return api.syncAccount(acc.id);
        })
      );

      for (const res of results) {
        if (res.status === 'fulfilled') {
          successCount++;
        } else {
          lastError = res.reason;
        }
      }

      await refreshEmails(false);
      await refreshStats();

      if (successCount > 0) {
        info(targets.length > 1 ? `${successCount}/${targets.length} hesap senkronize edildi.` : 'E-postalar eşitlendi.', 'Postacı');
      } else if (lastError) {
        error(lastError.response?.data?.error || lastError.message || 'Senkronizasyon sırasında bağlantı hatası oluştu.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Global Superhuman & Gmail Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // If user is focused on ANY input, textarea, select or contentEditable element, never intercept!
      if (
        target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('input, textarea, select, [contenteditable="true"]') !== null
        )
      ) {
        return;
      }

      // Global Command Palette (Ctrl+K or Cmd+K)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }

      // Escape always closes dialogs
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setIsSettingsOpen(false);
        setIsShortcutsOpen(false);
        if (isComposerOpen) closeComposer();
        return;
      }

      // If any modal or composer is open, disable all single-key navigation/action shortcuts
      if (isSettingsOpen || isShortcutsOpen || isCommandPaletteOpen || isComposerOpen) {
        return;
      }

      // Select All (Ctrl+A or Cmd+A) when not inside an input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllEmails();
        return;
      }

      // Handle 2-key combos (like 'g i', 'g s', '* a')
      if (pendingKeyComboRef.current) {
        const firstKey = pendingKeyComboRef.current;
        pendingKeyComboRef.current = null;
        if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);

        if (firstKey === 'g') {
          e.preventDefault();
          if (e.key === 'i') { setMainTab('mail'); setActiveFolder('INBOX'); setActiveLabel(null); }
          else if (e.key === 's') { setMainTab('mail'); setActiveFolder('STARRED'); setActiveLabel(null); }
          else if (e.key === 't') { setMainTab('mail'); setActiveFolder('SENT'); setActiveLabel(null); }
          else if (e.key === 'd') { setMainTab('mail'); setActiveFolder('DRAFTS'); setActiveLabel(null); }
          else if (e.key === 'a') { setMainTab('mail'); setActiveFolder('ARCHIVE'); setActiveLabel(null); }
          else if (e.key === 'c') { setMainTab('calendar'); }
          else if (e.key === 'k') { setMainTab('contacts'); }
          return;
        } else if (firstKey === '*') {
          e.preventDefault();
          if (e.key === 'a') selectAllEmails();
          else if (e.key === 'n') clearCheckedEmails();
          return;
        }
      }

      // Check start of 2-key combo
      if (e.key === 'g' || e.key === '*') {
        pendingKeyComboRef.current = e.key;
        comboTimeoutRef.current = setTimeout(() => {
          pendingKeyComboRef.current = null;
        }, 1200);
        return;
      }

      // Help Overlay ('?' key)
      if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen(prev => !prev);
        return;
      }

      // Single Key Actions
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextEmail();
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        prevEmail();
      } else if (e.key === 'c') {
        e.preventDefault();
        openComposer();
      } else if (e.key === 'e' || e.key === 'y') {
        if (checkedEmailIds.size > 0) {
          e.preventDefault();
          bulkArchive();
        } else if (selectedEmailId) {
          e.preventDefault();
          archiveEmail(selectedEmailId);
        }
      } else if (e.key === '#' || e.key === 'Delete' || e.key === 'Backspace') {
        if (checkedEmailIds.size > 0) {
          e.preventDefault();
          bulkDelete();
        } else if (selectedEmailId) {
          e.preventDefault();
          deleteEmail(selectedEmailId);
        }
      } else if (e.key === 's') {
        if (selectedEmailId) {
          e.preventDefault();
          const cur = emails.find(x => x.id === selectedEmailId);
          if (cur) toggleStarred(selectedEmailId, cur.isStarred);
        }
      } else if (e.key === 'u') {
        if (selectedEmailId) {
          e.preventDefault();
          const cur = emails.find(x => x.id === selectedEmailId);
          if (cur) toggleRead(selectedEmailId, cur.isRead);
        }
      } else if (e.key === 'p') {
        if (selectedEmailId) {
          e.preventDefault();
          const cur = emails.find(x => x.id === selectedEmailId);
          if (cur) togglePinned(selectedEmailId, cur.isPinned);
        }
      } else if (e.key === 'x') {
        if (selectedEmailId) {
          e.preventDefault();
          toggleEmailCheck(selectedEmailId);
        }
      } else if (e.key === 'r') {
        if (selectedEmailId) {
          e.preventDefault();
          const cur = emails.find(x => x.id === selectedEmailId);
          if (cur) openReply(cur, false);
        }
      } else if (e.key === 'a' || (e.shiftKey && e.key.toLowerCase() === 'r')) {
        if (selectedEmailId) {
          e.preventDefault();
          const cur = emails.find(x => x.id === selectedEmailId);
          if (cur) openReply(cur, true);
        }
      } else if (e.key === 'f') {
        if (selectedEmailId) {
          e.preventDefault();
          const cur = emails.find(x => x.id === selectedEmailId);
          if (cur) openForward(cur);
        }
      } else if (e.key === '!') {
        if (selectedEmailId) {
          e.preventDefault();
          markAsSpam(selectedEmailId);
        }
      } else if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEmailId, checkedEmailIds, emails, isComposerOpen, isSettingsOpen, isShortcutsOpen, isCommandPaletteOpen, nextEmail, prevEmail, deleteEmail, bulkDelete, archiveEmail, bulkArchive, selectAllEmails, clearCheckedEmails, toggleEmailCheck, openComposer, openReply, openForward, markAsSpam, togglePinned, toggleRead, toggleStarred]);

  const selectedEmail = emails.find(e => e.id === selectedEmailId);

  return (
    <MailContext.Provider
      value={{
        accounts,
        activeAccountId,
        setActiveAccountId,
        folderStats,
        activeFolder,
        setActiveFolder,
        activeLabel,
        setActiveLabel,
        emails,
        selectedEmailId,
        selectedEmail,
        threadEmails,
        checkedEmailIds,
        toggleEmailCheck,
        setCheckedRange,
        selectAllEmails,
        clearCheckedEmails,
        searchQuery,
        setSearchQuery,
        filter,
        setFilter,
        viewLayout,
        setViewLayout,
        mainTab,
        setMainTab,
        isComposerOpen,
        setIsComposerOpen,
        composerData,
        openComposer,
        openReply,
        openForward,
        closeComposer,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        isSettingsOpen,
        setIsSettingsOpen,
        isShortcutsOpen,
        setIsShortcutsOpen,
        isLoading,
        isSyncing,
        refreshEmails,
        refreshAccounts,
        refreshStats,
        selectEmail,
        nextEmail,
        prevEmail,
        toggleRead,
        toggleStarred,
        togglePinned,
        snoozeEmail,
        archiveEmail,
        deleteEmail,
        markAsSpam,
        moveToFolder,
        bulkArchive,
        bulkDelete,
        bulkMarkRead,
        emptyTrashFolder,
        triggerSync,
      }}
    >
      {children}
    </MailContext.Provider>
  );
};

export const useMail = () => {
  const context = useContext(MailContext);
  if (!context) {
    throw new Error('useMail must be used within a MailProvider');
  }
  return context;
};
