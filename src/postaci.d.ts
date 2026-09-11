export {};

declare global {
  interface ComposeTemplate {
    to: string;
    cc: string;
    subject: string;
    text: string;
    html: string;
    inReplyTo?: string;
    references?: string;
  }
  interface Window {
    postaci?: {
      version: string;
      platform: string;
      db: {
        stats: () => Promise<{ accounts: number; folders: number; messages: number }>;
      };
      accounts: {
        list: () => Promise<
          {
            id: number;
            provider: string;
            email: string;
            display_name: string | null;
            auth_type?: string;
            imap_host?: string;
            imap_port?: number;
            smtp_host?: string;
            smtp_port?: number;
            smtp_secure?: number;
          }[]
        >;
        add: (acc: {
          provider: string;
          email: string;
          displayName?: string;
          refreshTokenEnc?: string | null;
          accessTokenEnc?: string | null;
          tokenExpiry?: string | null;
        }) => Promise<number>;
        addManual: (acc: {
          email: string;
          password: string;
          imap: { host: string; port: number };
          smtp: { host: string; port: number; secure: boolean };
        }) => Promise<number>;
        update: (
          id: number,
          updates: {
            displayName?: string;
            password?: string;
            imapHost?: string;
            imapPort?: number;
            smtpHost?: string;
            smtpPort?: number;
            smtpSecure?: boolean;
          }
        ) => Promise<boolean>;
        delete: (id: number) => Promise<boolean>;
        get: (id: number) => Promise<{
          id: number;
          provider: string;
          email: string;
          display_name: string | null;
          auth_type?: string;
          imap_host?: string;
          imap_port?: number;
          smtp_host?: string;
          smtp_port?: number;
          smtp_secure?: number;
        }>;
      };
      auth: {
        start: (provider: 'google' | 'microsoft' | 'yahoo') => Promise<{
          provider: string;
          email: string | null;
          displayName: string | null;
          refreshTokenEnc: string | null;
          accessTokenEnc: string | null;
          tokenExpiry: string | null;
        }>;
      };
      mail: {
        sync: (email: string) => Promise<{ total: number; synced: number; failed?: number }>;
        syncFolder: (email: string, folderPath: string) => Promise<{ total: number; synced: number; failed?: number }>;
        folders: (email: string) => Promise<{ path: string; name: string; flags: string[] }[]>;
        list: (email: string, folderPath?: string, limit?: number, offset?: number) => Promise<
          { uid: string; subject: string | null; from_addr: string | null; to_addr: string | null; date: string | null; snippet: string | null; is_read: number; starred?: number; has_att?: number; account_email?: string; account_provider?: string; folder_path?: string }[]
        >;
        count: (email: string, folderPath?: string) => Promise<{ total: number; unread: number }>;
        listUnified: (limit?: number, offset?: number) => Promise<
          { uid: string; subject: string | null; from_addr: string | null; to_addr: string | null; date: string | null; snippet: string | null; is_read: number; starred?: number; has_att?: number; account_email?: string; account_provider?: string; folder_path?: string }[]
        >;
        countUnified: () => Promise<{ total: number; unread: number }>;
        searchUnified: (query: string) => Promise<
          { uid: string; subject: string | null; from_addr: string | null; to_addr: string | null; date: string | null; snippet: string | null; is_read: number; starred?: number; has_att?: number; account_email?: string; account_provider?: string; folder_path?: string }[]
        >;
        syncAllInboxes: () => Promise<{ email: string; total?: number; synced?: number; error?: string }[]>;
        exportEml: (email: string, folderPath: string, uid: string) => Promise<{ saved: boolean; path?: string }>;
        emptyTrash: (email: string) => Promise<boolean>;
        syncMore: (email: string, folderPath: string, beforeUid?: string, limit?: number) => Promise<{ total: number; synced: number; failed?: number }>;
        search: (email: string, folderPath: string | undefined, query: string) => Promise<
          { uid: string; subject: string | null; from_addr: string | null; to_addr: string | null; date: string | null; snippet: string | null; is_read: number; folder_path: string; starred?: number; has_att?: number; account_email?: string; account_provider?: string }[]
        >;
        thread: (email: string, folderPath: string | undefined, messageId: string) => Promise<
          { uid: string; message_id: string | null; refs: string | null; subject: string | null; from_addr: string | null; date: string | null; is_read: number }[]
        >;
        autoconfig: (email: string) => Promise<{
          imap: { host: string; port: number; secure: boolean };
          smtp: { host: string; port: number; secure: boolean };
          note: string;
          source: string;
        }>;
        body: (email: string, folderPath: string, uid: string) => Promise<{ html: string | null; text: string | null; messageId?: string | null; references?: string[]; cached: boolean }>;
        markRead: (email: string, folderPath: string, uid: string) => Promise<boolean>;
        markUnread: (email: string, folderPath: string, uid: string) => Promise<boolean>;
        star: (email: string, folderPath: string, uid: string) => Promise<number>;
        delete: (email: string, folderPath: string, uid: string) => Promise<boolean>;
        send: (msg: { fromEmail: string; to: string; cc?: string; subject?: string; text: string; html?: string; inReplyTo?: string; references?: string; attachments?: { filename: string; contentType: string; dataBase64: string }[] }) => Promise<{ messageId: string | null }>;
        replyTemplate: (email: string, folderPath: string, uid: string) => Promise<ComposeTemplate>;
        forwardTemplate: (email: string, folderPath: string, uid: string) => Promise<ComposeTemplate>;
        attachments: (email: string, folderPath: string, uid: string) => Promise<{ idx: number; filename: string; content_type: string | null; size: number }[]>;
        attachmentSave: (email: string, folderPath: string, uid: string, index: number) => Promise<{ saved: boolean; path?: string }>;
        attachmentPreview: (email: string, folderPath: string, uid: string, index: number) => Promise<{ filename: string; contentType: string; dataBase64: string }>;
        batchDelete: (email: string, folderPath: string, uids: string[]) => Promise<boolean>;
        batchMarkRead: (email: string, folderPath: string, uids: string[], isRead: boolean) => Promise<boolean>;
        batchStar: (email: string, folderPath: string, uids: string[], starred: boolean) => Promise<boolean>;
        saveDraft: (args: { email: string; to?: string; subject?: string; text?: string; html?: string }) => Promise<{ uid: string; folderPath: string } | false>;
        moveToFolder: (email: string, fromFolder: string, toFolder: string, uid: string) => Promise<boolean>;
        batchMoveToFolder: (email: string, fromFolder: string, toFolder: string, uids: string[]) => Promise<boolean>;
        archive: (email: string, folderPath: string, uid: string) => Promise<boolean>;
        batchArchive: (email: string, folderPath: string, uids: string[]) => Promise<boolean>;
      };
      contacts: {
        search: (query: string) => Promise<{ name: string; email: string }[]>;
      };
      notifications: {
        getSettings: () => Promise<{
          notificationsEnabled: boolean;
          syncIntervalMinutes: number;
          soundEnabled: boolean;
        }>;
        saveSettings: (settings: Partial<{
          notificationsEnabled: boolean;
          syncIntervalMinutes: number;
          soundEnabled: boolean;
        }>) => Promise<{
          notificationsEnabled: boolean;
          syncIntervalMinutes: number;
          soundEnabled: boolean;
        }>;
        test: () => Promise<boolean>;
        onOpenMessage: (callback: (data: { email: string; folderPath: string; uid: string }) => void) => () => void;
        onBackgroundSynced: (callback: (data: { email: string; folderPath: string; count: number }) => void) => () => void;
      };
      appSettings: {
        get: () => Promise<{
          launchOnStartup: boolean;
          startMinimized: boolean;
          hideTaskbarOnMinimize: boolean;
          closeToQuit: boolean;
          useGmailShortcuts: boolean;
        }>;
        save: (settings: Partial<{
          launchOnStartup: boolean;
          startMinimized: boolean;
          hideTaskbarOnMinimize: boolean;
          closeToQuit: boolean;
          useGmailShortcuts: boolean;
        }>) => Promise<{
          launchOnStartup: boolean;
          startMinimized: boolean;
          hideTaskbarOnMinimize: boolean;
          closeToQuit: boolean;
          useGmailShortcuts: boolean;
        }>;
      };
      openExternal?: (url: string) => Promise<boolean>;
    };
  }
}
