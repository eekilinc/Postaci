// src/hooks/useBatchActions.ts — Toplu eylem ve çoklu seçim mantığı
import { useState } from 'react';
import type { Msg } from '../types';
import { cleanIpcError } from '../utils/errors';
import { useTranslation } from '../i18n';

interface UseBatchActionsProps {
  messages: Msg[];
  activeAccount: string | null;
  activeFolder: string | null;
  isUnified: boolean;
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;
  setSelected: React.Dispatch<React.SetStateAction<Msg | null>>;
  loadFolders: (email: string) => void;
  updateUnifiedCount: () => void;
  setNotice: (n: string | null) => void;
  setError: (e: string | null) => void;
}

export function useBatchActions({
  messages,
  activeAccount,
  activeFolder,
  isUnified,
  setMessages,
  setSelected,
  loadFolders,
  updateUnifiedCount,
  setNotice,
  setError,
}: UseBatchActionsProps) {
  const { t } = useTranslation();
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [lastSelectedUid, setLastSelectedUid] = useState<string | null>(null);

  const handleToggleSelectUid = (uid: string, shiftKey?: boolean) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedUid) {
        const uids = messages.map((m) => m.uid);
        const start = uids.indexOf(lastSelectedUid);
        const end = uids.indexOf(uid);
        if (start !== -1 && end !== -1) {
          const [min, max] = start < end ? [start, end] : [end, start];
          for (let i = min; i <= max; i++) {
            next.add(uids[i]);
          }
          return next;
        }
      }
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
    setLastSelectedUid(uid);
  };

  const handleSelectAll = () => {
    if (selectedUids.size === messages.length) {
      setSelectedUids(new Set());
      setLastSelectedUid(null);
    } else {
      setSelectedUids(new Set(messages.map((m) => m.uid)));
    }
  };

  const handleClearSelection = () => {
    setSelectedUids(new Set());
    setLastSelectedUid(null);
  };

  const handleBatchDelete = async () => {
    if (selectedUids.size === 0 || !window.postaci) return;
    const count = selectedUids.size;
    const isTrash = !isUnified && /trash|çöp|deleted|bin/i.test(activeFolder || '');

    const uidsToDelete = new Set(selectedUids);
    setMessages((prev) => prev.filter((m) => !uidsToDelete.has(m.uid)));
    setSelected((cur) => (cur && uidsToDelete.has(cur.uid) ? null : cur));
    setSelectedUids(new Set());
    setLastSelectedUid(null);

    const groups = new Map<string, string[]>();
    for (const m of messages) {
      if (uidsToDelete.has(m.uid)) {
        const acc = m.account_email || activeAccount;
        const f = m.folder_path || activeFolder || 'INBOX';
        if (acc && f) {
          const k = `${acc}|${f}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(m.uid);
        }
      }
    }

    try {
      for (const [k, uids] of groups.entries()) {
        const [acc, f] = k.split('|');
        await window.postaci.mail.batchDelete(acc, f, uids);
      }
      setNotice(
        isTrash
          ? t('notice.batchDeletedPermanent', { count })
          : t('notice.batchDeletedTrash', { count })
      );
      setTimeout(() => setNotice(null), 2500);
      if (activeAccount) loadFolders(activeAccount);
      updateUnifiedCount();
    } catch (e) {
      setError(cleanIpcError(e));
    }
  };

  const handleBatchMarkRead = async (isRead: boolean) => {
    if (selectedUids.size === 0 || !window.postaci) return;
    const uidsToUpdate = new Set(selectedUids);
    setMessages((prev) =>
      prev.map((m) => (uidsToUpdate.has(m.uid) ? { ...m, is_read: isRead ? 1 : 0 } : m))
    );
    setSelectedUids(new Set());
    setLastSelectedUid(null);

    const groups = new Map<string, string[]>();
    for (const m of messages) {
      if (uidsToUpdate.has(m.uid)) {
        const acc = m.account_email || activeAccount;
        const f = m.folder_path || activeFolder || 'INBOX';
        if (acc && f) {
          const k = `${acc}|${f}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(m.uid);
        }
      }
    }

    try {
      for (const [k, uids] of groups.entries()) {
        const [acc, f] = k.split('|');
        await window.postaci.mail.batchMarkRead(acc, f, uids, isRead);
      }
      if (activeAccount) loadFolders(activeAccount);
      updateUnifiedCount();
    } catch (e) {
      setError(cleanIpcError(e));
    }
  };

  const handleBatchStar = async (starred: boolean) => {
    if (selectedUids.size === 0 || !window.postaci) return;
    const uidsToUpdate = new Set(selectedUids);
    setMessages((prev) =>
      prev.map((m) => (uidsToUpdate.has(m.uid) ? { ...m, starred: starred ? 1 : 0 } : m))
    );
    setSelectedUids(new Set());
    setLastSelectedUid(null);

    const groups = new Map<string, string[]>();
    for (const m of messages) {
      if (uidsToUpdate.has(m.uid)) {
        const acc = m.account_email || activeAccount;
        const f = m.folder_path || activeFolder || 'INBOX';
        if (acc && f) {
          const k = `${acc}|${f}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(m.uid);
        }
      }
    }

    try {
      for (const [k, uids] of groups.entries()) {
        const [acc, f] = k.split('|');
        await window.postaci.mail.batchStar(acc, f, uids, starred);
      }
    } catch (e) {
      setError(cleanIpcError(e));
    }
  };

  const handleBatchArchive = async () => {
    if (selectedUids.size === 0 || !window.postaci) return;
    const count = selectedUids.size;
    const uidsToArchive = new Set(selectedUids);
    setMessages((prev) => prev.filter((m) => !uidsToArchive.has(m.uid)));
    setSelected((cur) => (cur && uidsToArchive.has(cur.uid) ? null : cur));
    setSelectedUids(new Set());
    setLastSelectedUid(null);

    const groups = new Map<string, string[]>();
    for (const m of messages) {
      if (uidsToArchive.has(m.uid)) {
        const acc = m.account_email || activeAccount;
        const f = m.folder_path || activeFolder || 'INBOX';
        if (acc && f) {
          const k = `${acc}|${f}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(m.uid);
        }
      }
    }

    try {
      for (const [k, uids] of groups.entries()) {
        const [acc, f] = k.split('|');
        await window.postaci.mail.batchArchive(acc, f, uids);
      }
      setNotice(t('notice.batchArchived', { count }));
      setTimeout(() => setNotice(null), 2500);
      if (activeAccount) loadFolders(activeAccount);
      updateUnifiedCount();
    } catch (e) {
      setError(cleanIpcError(e));
    }
  };

  const handleBatchMove = async (toFolder: string) => {
    if (selectedUids.size === 0 || !window.postaci || !toFolder) return;
    const count = selectedUids.size;
    const uidsToMove = new Set(selectedUids);
    setMessages((prev) => prev.filter((m) => !uidsToMove.has(m.uid)));
    setSelected((cur) => (cur && uidsToMove.has(cur.uid) ? null : cur));
    setSelectedUids(new Set());
    setLastSelectedUid(null);

    const groups = new Map<string, string[]>();
    for (const m of messages) {
      if (uidsToMove.has(m.uid)) {
        const acc = m.account_email || activeAccount;
        const f = m.folder_path || activeFolder || 'INBOX';
        if (acc && f) {
          const k = `${acc}|${f}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(m.uid);
        }
      }
    }

    try {
      for (const [k, uids] of groups.entries()) {
        const [acc, f] = k.split('|');
        await window.postaci.mail.batchMoveToFolder(acc, f, toFolder, uids);
      }
      setNotice(t('notice.batchMoved', { count, folder: toFolder }));
      setTimeout(() => setNotice(null), 2500);
      if (activeAccount) loadFolders(activeAccount);
      updateUnifiedCount();
    } catch (e) {
      setError(cleanIpcError(e));
    }
  };

  return {
    selectedUids,
    setSelectedUids,
    lastSelectedUid,
    setLastSelectedUid,
    handleToggleSelectUid,
    handleSelectAll,
    handleClearSelection,
    handleBatchDelete,
    handleBatchMarkRead,
    handleBatchStar,
    handleBatchArchive,
    handleBatchMove,
  };
}
