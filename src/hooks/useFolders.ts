// src/hooks/useFolders.ts — klasör listesi ve aktif klasör yönetimi
import { useState } from 'react';
import type { Folder } from '../types';

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>('INBOX');

  const loadFolders = async (email: string) => {
    if (!window.postaci) return;
    try {
      const list = await window.postaci.mail.folders(email);
      setFolders(list);
    } catch {}
  };

  return { folders, setFolders, activeFolder, setActiveFolder, loadFolders };
}
