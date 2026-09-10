// src/hooks/useAccounts.ts — hesap listesi ve istatistik yönetimi
import { useState } from 'react';
import type { Account } from '../types';

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    accounts: number;
    folders: number;
    messages: number;
  } | null>(null);

  const refresh = () => {
    window.postaci?.db.stats().then(setStats).catch(() => {});
    window.postaci?.accounts
      .list()
      .then((list) => {
        setAccounts(list);
        if (!activeAccount && list.length > 0) setActiveAccount(list[0].email);
      })
      .catch(() => {});
  };

  return { accounts, activeAccount, setActiveAccount, stats, refresh };
}
