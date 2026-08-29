import React, { useState } from 'react';
import {
  Inbox,
  Star,
  Send,
  FileEdit,
  Archive,
  AlertOctagon,
  Trash2,
  Tag,
  Plus,
  RefreshCw,
  Settings,
  Calendar,
  Users,
  Mail,
  ChevronDown,
  Layers,
  Sparkles,
  ShieldCheck,
  Moon,
  Sun,
  Folder
} from 'lucide-react';
import { useMail } from '../context/MailContext';
import { useTheme } from '../context/ThemeContext';

import { PostaciLogo } from './PostaciLogo';

export const Sidebar: React.FC = () => {
  const {
    accounts,
    activeAccountId,
    setActiveAccountId,
    folderStats,
    activeFolder,
    setActiveFolder,
    activeLabel,
    setActiveLabel,
    openComposer,
    mainTab,
    setMainTab,
    setIsSettingsOpen,
    setIsCommandPaletteOpen,
    setIsShortcutsOpen,
    isSyncing,
    triggerSync,
    moveToFolder,
  } = useMail();

  const { theme, toggleTheme } = useTheme();
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const activeAccount = accounts.find(a => a.id === activeAccountId);

  const getFolderIcon = (iconName: string) => {
    switch (iconName) {
      case 'Inbox': return <Inbox size={18} />;
      case 'Star': return <Star size={18} />;
      case 'Send': return <Send size={18} />;
      case 'FileEdit': return <FileEdit size={18} />;
      case 'Archive': return <Archive size={18} />;
      case 'AlertOctagon': return <AlertOctagon size={18} />;
      case 'Trash2': return <Trash2 size={18} />;
      case 'Folder': return <Folder size={18} />;
      default: return <Folder size={18} />;
    }
  };

  const labels = [
    { name: 'İş', color: '#3b82f6' },
    { name: 'Kişisel', color: '#10b981' },
    { name: 'DevOps', color: '#f59e0b' },
    { name: 'Güvenlik', color: '#ef4444' },
    { name: 'Faturalar', color: '#8b5cf6' },
    { name: 'Mimari', color: '#06b6d4' },
    { name: 'GitHub', color: '#64748b' },
  ];

  return (
    <aside style={{
      width: '260px',
      height: '100%',
      backgroundColor: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* Brand Header */}
      <div style={{
        padding: '18px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <PostaciLogo size={34} />
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.2, color: 'var(--text-primary)' }}>
              Postacı
            </h1>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pro E-Posta</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={toggleTheme}
            title={`Tema Değiştir (${theme})`}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          <button
            onClick={triggerSync}
            disabled={isSyncing}
            title="IMAP / SMTP Senkronize Et"
            style={{
              background: 'transparent',
              border: 'none',
              color: isSyncing ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Account Selector Dropdown */}
      <div style={{ padding: '12px 14px', position: 'relative' }}>
        <button
          onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: activeAccountId === 'all' ? '#3b82f6' : activeAccount?.color || '#3b82f6',
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeAccountId === 'all' ? 'Tüm Hesaplar (Birleşik)' : activeAccount?.name || 'Hesap Seçin'}
            </span>
          </div>
          <ChevronDown size={14} color="var(--text-muted)" />
        </button>

        {isAccountDropdownOpen && (
          <div
            className="glass-panel"
            style={{
              position: 'absolute',
              top: '52px',
              left: '14px',
              right: '14px',
              borderRadius: 'var(--radius-md)',
              padding: '6px',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <button
              onClick={() => {
                setActiveAccountId('all');
                setIsAccountDropdownOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeAccountId === 'all' ? 'var(--bg-active)' : 'transparent',
                color: activeAccountId === 'all' ? 'var(--accent-primary)' : 'var(--text-primary)',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={15} />
                <span>Birleşik Gelen Kutusu</span>
              </div>
            </button>

            {accounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => {
                  setActiveAccountId(acc.id);
                  setIsAccountDropdownOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: activeAccountId === acc.id ? 'var(--bg-active)' : 'transparent',
                  color: activeAccountId === acc.id ? 'var(--accent-primary)' : 'var(--text-primary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: acc.color, flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {acc.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {acc.email}
                    </div>
                  </div>
                </div>
                {(acc.unreadCount || 0) > 0 && (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    background: 'var(--accent-primary)',
                    color: 'white',
                    padding: '1px 6px',
                    borderRadius: '999px',
                  }}>
                    {acc.unreadCount}
                  </span>
                )}
              </button>
            ))}

            <button
              onClick={() => {
                setIsAccountDropdownOpen(false);
                setIsSettingsOpen(true);
              }}
              style={{
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'transparent',
                color: 'var(--accent-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={14} />
              <span>Yeni Hesap Ekle</span>
            </button>
          </div>
        )}
      </div>

      {/* Compose Button */}
      <div style={{ padding: '0 14px 14px 14px' }}>
        <button
          onClick={() => openComposer()}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            color: 'white',
            border: 'none',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
          }}
        >
          <FileEdit size={16} />
          <span>E-Posta Yaz</span>
          <span className="kbd-badge" style={{ color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.2)' }}>c</span>
        </button>
      </div>

      {/* Main Folder Navigation */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 8px 4px 8px' }}>
          Klasörler
        </div>

        {folderStats.filter(s => ['INBOX', 'STARRED', 'SENT', 'DRAFTS', 'ARCHIVE', 'SPAM', 'TRASH'].includes(s.folder)).map(stat => {
          const isActive = mainTab === 'mail' && activeFolder === stat.folder && !activeLabel;
          const isDragOver = dragOverFolder === stat.folder;

          return (
            <button
              key={stat.folder}
              onClick={() => {
                setMainTab('mail');
                setActiveFolder(stat.folder);
                setActiveLabel(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverFolder !== stat.folder) setDragOverFolder(stat.folder);
              }}
              onDragLeave={() => {
                setDragOverFolder(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverFolder(null);
                const raw = e.dataTransfer.getData('text/plain');
                if (raw) {
                  try {
                    const ids = JSON.parse(raw);
                    moveToFolder(ids, stat.folder);
                  } catch {
                    moveToFolder(raw, stat.folder);
                  }
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                border: isDragOver ? '1px dashed var(--accent-primary)' : '1px solid transparent',
                backgroundColor: isDragOver ? 'var(--bg-active)' : isActive ? 'var(--bg-active)' : 'transparent',
                color: isDragOver || isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: isDragOver || isActive ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                transform: isDragOver ? 'scale(1.02)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: isDragOver || isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                  {getFolderIcon(stat.icon)}
                </span>
                <span>{stat.displayName}</span>
              </div>

              {stat.unreadCount > 0 && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: isActive ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: isActive ? 'white' : 'var(--text-primary)',
                  padding: '2px 7px',
                  borderRadius: '999px',
                }}>
                  {stat.unreadCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Custom Server IMAP Folders */}
        {folderStats.filter(s => !['INBOX', 'STARRED', 'SENT', 'DRAFTS', 'ARCHIVE', 'SPAM', 'TRASH'].includes(s.folder)).length > 0 && (
          <>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '14px 8px 4px 8px' }}>
              Özel Klasörlerim
            </div>

            {folderStats.filter(s => !['INBOX', 'STARRED', 'SENT', 'DRAFTS', 'ARCHIVE', 'SPAM', 'TRASH'].includes(s.folder)).map(stat => {
              const isActive = mainTab === 'mail' && activeFolder === stat.folder && !activeLabel;
              const isDragOver = dragOverFolder === stat.folder;

              return (
                <button
                  key={stat.folder}
                  onClick={() => {
                    setMainTab('mail');
                    setActiveFolder(stat.folder);
                    setActiveLabel(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverFolder !== stat.folder) setDragOverFolder(stat.folder);
                  }}
                  onDragLeave={() => {
                    setDragOverFolder(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverFolder(null);
                    const raw = e.dataTransfer.getData('text/plain');
                    if (raw) {
                      try {
                        const ids = JSON.parse(raw);
                        moveToFolder(ids, stat.folder);
                      } catch {
                        moveToFolder(raw, stat.folder);
                      }
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: isDragOver ? '1px dashed var(--accent-primary)' : '1px solid transparent',
                    backgroundColor: isDragOver ? 'var(--bg-active)' : isActive ? 'var(--bg-active)' : 'transparent',
                    color: isDragOver || isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontSize: '13px',
                    fontWeight: isDragOver || isActive ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transform: isDragOver ? 'scale(1.02)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Folder size={16} style={{ color: isDragOver || isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.displayName}</span>
                  </div>

                  {stat.unreadCount > 0 && (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: isActive ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: isActive ? 'white' : 'var(--text-primary)',
                      padding: '2px 7px',
                      borderRadius: '999px',
                    }}>
                      {stat.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </>
        )}

        {/* Labels Section */}
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '16px 8px 4px 8px' }}>
          Etiketler
        </div>

        {labels.map(l => {
          const isActive = mainTab === 'mail' && activeLabel === l.name;

          return (
            <button
              key={l.name}
              onClick={() => {
                setMainTab('mail');
                setActiveLabel(l.name);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Tag size={15} style={{ color: l.color }} />
              <span>{l.name}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom App Navigation Tabs */}
      <div style={{
        padding: '10px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '4px',
        backgroundColor: 'var(--bg-secondary)',
      }}>
        <button
          onClick={() => { setMainTab('mail'); setActiveLabel(null); }}
          title="E-Posta"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            padding: '8px 4px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            backgroundColor: mainTab === 'mail' ? 'var(--bg-active)' : 'transparent',
            color: mainTab === 'mail' ? 'var(--accent-primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          <Mail size={17} />
          <span>Posta</span>
        </button>

        <button
          onClick={() => setMainTab('calendar')}
          title="Takvim"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            padding: '8px 4px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            backgroundColor: mainTab === 'calendar' ? 'var(--bg-active)' : 'transparent',
            color: mainTab === 'calendar' ? 'var(--accent-primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          <Calendar size={17} />
          <span>Takvim</span>
        </button>

        <button
          onClick={() => setMainTab('contacts')}
          title="Kişiler & Adres Defteri"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            padding: '8px 4px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            backgroundColor: mainTab === 'contacts' ? 'var(--bg-active)' : 'transparent',
            color: mainTab === 'contacts' ? 'var(--accent-primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          <Users size={17} />
          <span>Kişiler</span>
        </button>

        <button
          onClick={() => setIsSettingsOpen(true)}
          title="Ayarlar & Hesaplar"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            padding: '8px 4px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            backgroundColor: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          <Settings size={17} />
          <span>Ayarlar</span>
        </button>
      </div>

      {/* Command Palette & Shortcuts Trigger Footer */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: 'var(--text-muted)',
      }}>
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
          }}
        >
          <Sparkles size={13} color="var(--accent-purple)" />
          <span>Komut Paleti</span>
        </button>

        <button
          onClick={() => setIsShortcutsOpen(true)}
          title="Klavye Kısayolları Kılavuzu (?)"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            fontSize: '11px',
          }}
        >
          <span className="kbd-badge" style={{ cursor: 'pointer' }}>?</span>
        </button>
      </div>
    </aside>
  );
};
