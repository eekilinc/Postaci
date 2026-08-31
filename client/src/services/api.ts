import { Account, Email, Contact, CalendarEvent, FolderStat, Attachment } from '../types';
export interface EmailQuery {
  accountId?: string; folder?: string; isStarred?: boolean; isUnread?: boolean;
  label?: string; search?: string; limit?: number; offset?: number; sort?: string; hasAttachment?: boolean;
}
export const API_BASE = '/api';
export const EVENTS_URL = '/events';
let sessionPromise: Promise<void> | undefined;
export function ensureSession(): Promise<void> {
  if (!sessionPromise) sessionPromise = fetch(API_BASE + '/session', {
    method: 'POST', credentials: 'include', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' }, body: '{}',
  }).then(res => { if (!res.ok) throw new Error('Yerel oturum başlatılamadı. Uygulamayı localhost adresinden açın.'); })
    .catch(err => { sessionPromise = undefined; throw err; });
  return sessionPromise;
}
export async function fetchSafe(url: string, options: RequestInit = {}): Promise<Response> {
  options.signal?.throwIfAborted();
  await ensureSession();
  options.signal?.throwIfAborted();
  const method = options.method || 'GET';
  const retries = method === 'GET' ? 3 : 1;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      let res = await fetch(url, { ...options, credentials: 'include' });
      if (res.status === 401) {
        sessionPromise = undefined;
        await ensureSession();
        res = await fetch(url, { ...options, credentials: 'include' });
      }
      return res;
    } catch (err: any) {
      if (options.signal?.aborted || err.name === 'AbortError' || attempt === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw new Error('Yerel sunucuya ulaşılamadı.');
}

export const api = {
  // Accounts
  async getAccounts(): Promise<Account[]> {
    const res = await fetchSafe(`${API_BASE}/accounts`);
    if (!res.ok) throw new Error('Hesaplar alınamadı.');
    return res.json();
  },

  async getOAuthConfig(): Promise<{ googleClientId?: string; hasGoogleClientSecret?: boolean; microsoftClientId?: string; googleRedirectUri?: string }> {
    const res = await fetchSafe(`${API_BASE}/auth/oauth-config`);
    if (!res.ok) throw new Error('OAuth ayarları alınamadı.');
    return res.json();
  },

  async saveOAuthConfig(config: { googleClientId?: string; googleClientSecret?: string; microsoftClientId?: string }): Promise<{ googleClientId?: string; googleClientSecret?: string; microsoftClientId?: string }> {
    const res = await fetchSafe(`${API_BASE}/auth/oauth-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('OAuth ayarları kaydedilemedi.');
    return res.json();
  },

  async getGoogleAuthUrl(clientId?: string): Promise<{ url: string }> {
    const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
    const res = await fetchSafe(`${API_BASE}/auth/google/url${query}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Google yetkilendirme bağlantısı alınamadı.');
    }
    return res.json();
  },

  async createAccount(account: Partial<Account>): Promise<Account> {
    const res = await fetchSafe(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Hesap oluşturulamadı.');
    }
    return res.json();
  },

  async testAccountConnection(account: Partial<Account>): Promise<{
    success: boolean;
    message: string;
    folders?: string[];
    suggestedImapUser?: string;
    suggestedImapPort?: number;
    suggestedImapSecure?: boolean;
  }> {
    const res = await fetchSafe(`${API_BASE}/accounts/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    return res.json();
  },

  async autodiscoverAccount(email: string): Promise<{
    success: boolean;
    providerName: string;
    source: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    usernameType: string;
    notes?: string;
  }> {
    const res = await fetchSafe(`${API_BASE}/accounts/autodiscover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return res.json();
  },

  async updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
    const res = await fetchSafe(`${API_BASE}/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Hesap güncellenemedi.');
    return res.json();
  },

  async deleteAccount(id: string): Promise<boolean> {
    const res = await fetchSafe(`${API_BASE}/accounts/${id}`, { method: 'DELETE' });
    return res.ok;
  },

  async syncAccount(id: string): Promise<{ success: boolean; syncedCount: number }> {
    const res = await fetchSafe(`${API_BASE}/accounts/${id}/sync`, { method: 'POST' });
    return res.json();
  },

  async resyncFullAccount(id: string): Promise<{ success: boolean; syncedCount: number }> {
    const res = await fetchSafe(`${API_BASE}/accounts/${id}/resync-full`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Yeniden senkronizasyon başarısız.');
    }
    return res.json();
  },

  async syncFolder(accountId: string, mailboxPath: string): Promise<{ success: boolean; syncedCount: number }> {
    const res = await fetchSafe(`${API_BASE}/folders/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, mailboxPath }),
    });
    return res.json();
  },

  async loadOlderEmails(accountId: string, mailboxPath: string): Promise<{ syncedCount: number; hasMoreOlder?: boolean }> {
    const res = await fetchSafe(API_BASE + '/folders/older', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, mailboxPath }) });
    if (!res.ok) throw new Error((await res.json()).error || 'Eski iletiler yüklenemedi.');
    return res.json();
  },

  async resetDatabase(): Promise<{ success: boolean }> {
    const res = await fetchSafe(`${API_BASE}/settings/reset-database`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Veritabanı sıfırlanamadı.');
    }
    return res.json();
  },

  // Emails
  async getEmails(params: EmailQuery): Promise<Email[]> {
    return (await api.getEmailPage(params)).items;
  },
  async getEmailPage(params: EmailQuery, signal?: AbortSignal): Promise<{ items: Email[]; hasMore: boolean; nextOffset: number }> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
    const res = await fetchSafe(API_BASE + '/emails?' + query, { signal });
    if (!res.ok) throw new Error('E-postalar alınamadı.');
    return res.json();
  },

  async getEmailById(id: string): Promise<Email> {
    const res = await fetchSafe(`${API_BASE}/emails/${id}`);
    if (!res.ok) throw new Error('E-posta bulunamadı.');
    return res.json();
  },

  async getEmailThread(threadId: string): Promise<Email[]> {
    const res = await fetchSafe(`${API_BASE}/emails/thread/${threadId}`);
    if (!res.ok) throw new Error('E-posta dizisi alınamadı.');
    return res.json();
  },

  async updateEmailFlags(id: string, updates: Partial<{
    isRead: boolean;
    isStarred: boolean;
    isArchived: boolean;
    isDeleted: boolean;
    isSpam: boolean;
    folder: string;
    labels: string[];
  }>): Promise<Email> {
    const res = await fetchSafe(`${API_BASE}/emails/${id}/flags`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('E-posta durumu güncellenemedi.');
    return res.json();
  },

  async bulkUpdateEmailFlags(ids: string[], updates: Partial<{
    isRead: boolean;
    isStarred: boolean;
    isArchived: boolean;
    isDeleted: boolean;
    isSpam: boolean;
    folder: string;
    labels: string[];
  }>): Promise<{ success: boolean; updatedCount: number }> {
    const res = await fetchSafe(`${API_BASE}/emails/bulk-flags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, updates }),
    });
    if (!res.ok) throw new Error('Toplu e-posta güncelleme başarısız oldu.');
    return res.json();
  },

  async bulkDeleteEmails(ids: string[]): Promise<{ success: boolean; deletedCount: number }> {
    const res = await fetchSafe(`${API_BASE}/emails/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error('Toplu silme işlemi başarısız oldu.');
    return res.json();
  },

  async emptyTrash(accountId?: string): Promise<{ success: boolean; deletedCount: number }> {
    const res = await fetchSafe(`${API_BASE}/folders/empty-trash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: accountId === 'all' ? undefined : accountId }),
    });
    if (!res.ok) throw new Error('Çöp kutusu boşaltılamadı.');
    return res.json();
  },

  async deleteEmailPermanent(id: string): Promise<boolean> {
    const res = await fetchSafe(`${API_BASE}/emails/${id}`, { method: 'DELETE' });
    return res.ok;
  },

  async getFolderStats(accountId?: string): Promise<FolderStat[]> {
    const query = accountId ? `?accountId=${accountId}` : '';
    const res = await fetchSafe(`${API_BASE}/folders/stats${query}`);
    if (!res.ok) throw new Error('Klasör istatistikleri alınamadı.');
    return res.json();
  },

  // Compose & Send
  async sendMail(payload: {
    accountId: string;
    to: { name: string; email: string }[];
    cc?: { name: string; email: string }[];
    bcc?: { name: string; email: string }[];
    subject: string;
    bodyText: string;
    bodyHtml: string;
    attachments?: Attachment[];
    priority?: 'normal' | 'high';
    inReplyTo?: string;
    references?: string;
    threadId?: string;
  }): Promise<Email> {
    const res = await fetchSafe(`${API_BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'E-posta gönderilemedi.');
    }
    return res.json();
  },

  async saveDraft(draft: Partial<Email>): Promise<Email> {
    const res = await fetchSafe(`${API_BASE}/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!res.ok) throw new Error('Taslak kaydedilemedi.');
    return res.json();
  },

  async uploadAttachment(file: File): Promise<Attachment> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetchSafe(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Dosya yüklenemedi.');
    return res.json();
  },

  // AI Copilot
  async summarizeEmail(email: Email): Promise<string> {
    const res = await fetchSafe(`${API_BASE}/ai/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
    });
    const data = await res.json();
    return data.summary;
  },

  async getSmartReplies(email: Email): Promise<string[]> {
    const res = await fetchSafe(`${API_BASE}/ai/smart-replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
    });
    const data = await res.json();
    return data.replies || [];
  },

  async polishText(text: string, style: 'formal' | 'friendly' | 'concise' | 'persuasive' | 'expand' | 'fix_grammar'): Promise<string> {
    const res = await fetchSafe(`${API_BASE}/ai/polish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, style }),
    });
    const data = await res.json();
    return data.text;
  },

  async generateDraft(prompt: string, replyContext?: { fromName?: string; subject?: string; text?: string }): Promise<{
    subject: string;
    bodyHtml: string;
    bodyText: string;
  }> {
    const res = await fetchSafe(`${API_BASE}/ai/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, replyContext }),
    });
    return res.json();
  },

  async extractTasks(email: Email): Promise<Array<{
    task: string;
    type: 'action' | 'meeting' | 'question' | 'deadline';
    urgency: 'high' | 'normal';
    date?: string;
  }>> {
    const res = await fetchSafe(`${API_BASE}/ai/extract-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
    });
    const data = await res.json();
    return data.tasks || [];
  },

  async checkSecurity(email: Email): Promise<{
    score: number;
    level: 'safe' | 'low' | 'medium' | 'high';
    reasons: string[];
    hasBlockedImages: boolean;
  }> {
    const res = await fetchSafe(`${API_BASE}/ai/security-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
    });
    return res.json();
  },

  // Calendar
  async getCalendarEvents(): Promise<CalendarEvent[]> {
    const res = await fetchSafe(`${API_BASE}/calendar/events`);
    if (!res.ok) throw new Error('Etkinlikler alınamadı.');
    return res.json();
  },

  async createCalendarEvent(event: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const res = await fetchSafe(`${API_BASE}/calendar/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!res.ok) throw new Error('Etkinlik oluşturulamadı.');
    return res.json();
  },

  async updateCalendarEvent(id: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const res = await fetchSafe(`${API_BASE}/calendar/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return res.json();
  },

  async deleteCalendarEvent(id: string): Promise<boolean> {
    const res = await fetchSafe(`${API_BASE}/calendar/events/${id}`, { method: 'DELETE' });
    return res.ok;
  },

  async respondToRsvp(emailId: string, status: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE'): Promise<any> {
    const res = await fetchSafe(`${API_BASE}/calendar/rsvp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId, status }),
    });
    return res.json();
  },

  // Contacts
  async searchRecipients(q: string): Promise<Array<{ name: string; email: string; source: 'contact' | 'history' }>> {
    const res = await fetchSafe(`${API_BASE}/contacts/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    return res.json();
  },

  async getContacts(): Promise<Contact[]> {
    const res = await fetchSafe(`${API_BASE}/contacts`);
    if (!res.ok) throw new Error('Kişiler alınamadı.');
    return res.json();
  },

  async createContact(contact: Partial<Contact>): Promise<Contact> {
    const res = await fetchSafe(`${API_BASE}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contact),
    });
    return res.json();
  },

  async updateContact(id: string, updates: Partial<Contact>): Promise<Contact> {
    const res = await fetchSafe(`${API_BASE}/contacts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return res.json();
  },

  async deleteContact(id: string): Promise<boolean> {
    const res = await fetchSafe(`${API_BASE}/contacts/${id}`, { method: 'DELETE' });
    return res.ok;
  },

  // Backup & Restore
  async exportBackup(passphrase: string, preferences: Record<string, string>): Promise<any> {
    const res = await fetchSafe(`${API_BASE}/backup/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase, preferences }) });
    if (!res.ok) throw new Error('Yedekleme verisi alınamadı.');
    return res.json();
  },

  async importBackup(backup: any, mode: 'merge' = 'merge', passphrase = ''): Promise<{ success: boolean; restoredAccounts: number; message: string; preferences: Record<string, string> }> {
    const res = await fetchSafe(`${API_BASE}/backup/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup, mode, passphrase }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Yedek yükleme başarısız oldu.');
    }
    return res.json();
  },

  // GitHub Release Updates
  async checkUpdate(repo?: string): Promise<{
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseName?: string;
    releaseNotes?: string;
    publishedAt?: string;
    downloadUrl?: string;
    htmlUrl?: string;
    error?: string;
  }> {
    const query = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    const res = await fetchSafe(`${API_BASE}/system/update-check${query}`);
    if (!res.ok) throw new Error('Güncelleme sorgulanamadı.');
    return res.json();
  }
};
