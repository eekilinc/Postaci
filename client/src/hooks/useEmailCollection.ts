import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api, type EmailQuery } from '../services/api';
import type { Email } from '../types';

export function useEmailCollection(query: EmailQuery, select: Dispatch<SetStateAction<string | null>>, autoSelectFirst = true) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreEmails, setHasMoreEmails] = useState(false);
  const [listError, setListError] = useState('');
  const folderCacheRef = useRef(new Map<string, Email[]>());
  const active = useRef({ key: '', pages: 1, sequence: 0 });
  const controller = useRef<AbortController>();
  const queryKey = JSON.stringify(query);

  const refreshEmails = useCallback(async (showLoading = false) => {
    if (active.current.key !== queryKey) {
      active.current.key = queryKey; active.current.pages = 1;
      setEmails(folderCacheRef.current.get(queryKey) || []);
    }
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const sequence = ++active.current.sequence;
    if (showLoading) setIsLoading(true);
    setListError('');
    try {
      const params = JSON.parse(queryKey) as EmailQuery;
      const items: Email[] = [];
      let more = false;
      let offset = 0;
      for (let page = 0; page < active.current.pages; page++) {
        const result = await api.getEmailPage({ ...params, offset, limit: 100 }, abort.signal);
        items.push(...result.items); more = result.hasMore; offset = result.nextOffset;
        if (!more) break;
      }
      if (abort.signal.aborted || sequence !== active.current.sequence) return;
      const unique = [...new Map(items.map(e => [e.id, e])).values()];
      folderCacheRef.current.set(queryKey, unique);
      if (folderCacheRef.current.size > 30) folderCacheRef.current.delete(folderCacheRef.current.keys().next().value!);
      setEmails(unique); setHasMoreEmails(more);
      select(previous => previous && unique.some(e => e.id === previous) ? previous : autoSelectFirst ? unique[0]?.id || null : null);
    } catch (err: any) {
      if (!abort.signal.aborted && sequence === active.current.sequence) setListError(err.message || 'Posta listesi yüklenemedi.');
    } finally {
      if (sequence === active.current.sequence) { setIsLoading(false); setIsLoadingMore(false); }
    }
  }, [queryKey, select, autoSelectFirst]);

  const loadMoreEmails = useCallback(async () => {
    if (isLoadingMore || !hasMoreEmails) return;
    active.current.pages++;
    setIsLoadingMore(true);
    await refreshEmails();
  }, [hasMoreEmails, isLoadingMore, refreshEmails]);
  useEffect(() => () => controller.current?.abort(), []);
  return { emails, setEmails, isLoading, isLoadingMore, hasMoreEmails, loadMoreEmails, listError, folderCacheRef, refreshEmails };
}
