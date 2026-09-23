// src/hooks/useFolders.ts — klasör listesi ve aktif klasör yönetimi
//
// TanStack Query destekli. DIŞ API ESKİSİYLE BİREBİR AYNI:
// { folders, setFolders, activeFolder, setActiveFolder, loadFolders }
// App.tsx'teki 10+ çağrı noktası değişmeden çalışır.
//
// Fark: veri artık anahtarlı önbellekte tutulur. Hesaplar arası hızlı
// geçişlerde eski klasörün yeni hesaba karışması (yarış durumu) anahtar
// izolasyonuyla engellenir; loadFolders() önbelleği geçersiz kılar.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Folder } from '../types';
import { mailKeys } from '../query/mailKeys';

export function useFolders() {
  const queryClient = useQueryClient();
  const [emailKey, setEmailKey] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>('INBOX');

  const query = useQuery({
    queryKey: mailKeys.folders(emailKey),
    queryFn: () => window.postaci!.mail.folders(emailKey!),
    enabled: !!emailKey && typeof window !== 'undefined' && !!window.postaci,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const folders: Folder[] = (query.data as Folder[] | undefined) ?? [];

  const setFolders = (list: Folder[]) => {
    queryClient.setQueryData(mailKeys.folders(emailKey), list);
  };

  const loadFolders = (email: string) => {
    setEmailKey(email);
    void queryClient.invalidateQueries({ queryKey: mailKeys.folders(email) });
  };

  return { folders, setFolders, activeFolder, setActiveFolder, loadFolders };
}
