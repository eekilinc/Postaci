import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Mail,
  Calendar,
  Users,
  Settings,
  FileEdit,
  RefreshCw,
  Sun,
  Moon,
  Inbox,
  Star,
  Send,
  Archive,
  Trash2,
  Tag,
  Sparkles,
  Command
} from 'lucide-react';
import { useMail } from '../context/MailContext';
import { useTheme } from '../context/ThemeContext';

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    setActiveFolder,
    setActiveLabel,
    setMainTab,
    openComposer,
    triggerSync,
    setIsSettingsOpen,
  } = useMail();

  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const commands = [
    {
      id: 'compose',
      category: 'İşlemler',
      title: 'Yeni E-Posta Yaz',
      shortcut: 'C',
      icon: <FileEdit size={16} color="var(--accent-primary)" />,
      action: () => openComposer(),
    },
    {
      id: 'sync',
      category: 'İşlemler',
      title: 'Hesapları ve IMAP Postaları Senkronize Et',
      shortcut: 'S',
      icon: <RefreshCw size={16} color="var(--accent-primary)" />,
      action: () => triggerSync(),
    },
    {
      id: 'inbox',
      category: 'Gezinme',
      title: 'Gelen Kutusuna Git',
      icon: <Inbox size={16} />,
      action: () => { setMainTab('mail'); setActiveFolder('INBOX'); setActiveLabel(null); },
    },
    {
      id: 'starred',
      category: 'Gezinme',
      title: 'Yıldızlı E-Postalara Git',
      icon: <Star size={16} color="#f59e0b" />,
      action: () => { setMainTab('mail'); setActiveFolder('STARRED'); setActiveLabel(null); },
    },
    {
      id: 'sent',
      category: 'Gezinme',
      title: 'Gönderilenlere Git',
      icon: <Send size={16} />,
      action: () => { setMainTab('mail'); setActiveFolder('SENT'); setActiveLabel(null); },
    },
    {
      id: 'calendar',
      category: 'Gezinme',
      title: 'Takvim Görünümünü Aç',
      icon: <Calendar size={16} color="var(--accent-success)" />,
      action: () => setMainTab('calendar'),
    },
    {
      id: 'contacts',
      category: 'Gezinme',
      title: 'Kişiler & Adres Defterini Aç',
      icon: <Users size={16} color="var(--accent-purple)" />,
      action: () => setMainTab('contacts'),
    },
    {
      id: 'settings',
      category: 'Gezinme',
      title: 'Ayarlar ve Hesap Yönetimini Aç',
      icon: <Settings size={16} />,
      action: () => setIsSettingsOpen(true),
    },
    {
      id: 'theme-dark',
      category: 'Tema & Görünüm',
      title: 'Koyu Titanyum Tema (Dark Titanium)',
      icon: <Moon size={16} />,
      action: () => setTheme('dark'),
    },
    {
      id: 'theme-oled',
      category: 'Tema & Görünüm',
      title: 'Saf Siyah OLED Tema (Pitch Black)',
      icon: <Moon size={16} color="#71717a" />,
      action: () => setTheme('oled'),
    },
    {
      id: 'theme-midnight',
      category: 'Tema & Görünüm',
      title: 'Gece Mavisi Tema (Midnight Slate)',
      icon: <Sparkles size={16} color="#8b5cf6" />,
      action: () => setTheme('midnight'),
    },
    {
      id: 'theme-cyberpunk',
      category: 'Tema & Görünüm',
      title: 'Siber Zümrüt Tema (Cyber Emerald)',
      icon: <Sparkles size={16} color="#10b981" />,
      action: () => setTheme('cyberpunk'),
    },
    {
      id: 'theme-nord',
      category: 'Tema & Görünüm',
      title: 'Arktik Ayaz Tema (Nord Frost)',
      icon: <Sparkles size={16} color="#38bdf8" />,
      action: () => setTheme('nord'),
    },
    {
      id: 'theme-light',
      category: 'Tema & Görünüm',
      title: 'Kar Beyazı Açık Tema (Clean Light)',
      icon: <Sun size={16} color="#f59e0b" />,
      action: () => setTheme('light'),
    },
    {
      id: 'theme-warm-paper',
      category: 'Tema & Görünüm',
      title: 'Sıcak Kağıt Tema (Warm Sepia)',
      icon: <Sun size={16} color="#d97706" />,
      action: () => setTheme('warm-paper'),
    },
    {
      id: 'theme-rose-gold',
      category: 'Tema & Görünüm',
      title: 'Gül Kurusu Pastel Tema (Rose Cream)',
      icon: <Sun size={16} color="#f43f5e" />,
      action: () => setTheme('rose-gold'),
    },
  ];

  const filtered = commands.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsCommandPaletteOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        setIsCommandPaletteOpen(false);
      }
    }
  };

  return (
    <div
      onClick={() => setIsCommandPaletteOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        zIndex: 2000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel animate-fade-in"
        style={{
          width: '560px',
          maxHeight: '440px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border-medium)',
        }}
      >
        {/* Search input header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <Search size={18} color="var(--accent-primary)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Bir komut yazın veya arayın..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '15px',
              outline: 'none',
            }}
          />
          <span className="kbd-badge">ESC</span>
        </div>

        {/* Command items list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Eşleşen komut bulunamadı.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    setIsCommandPaletteOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isSelected ? 'var(--bg-active)' : 'transparent',
                    color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                      {item.icon}
                    </span>
                    <span style={{ fontWeight: isSelected ? 600 : 400 }}>{item.title}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.category}</span>
                    {item.shortcut && <span className="kbd-badge">{item.shortcut}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts info */}
        <div style={{
          padding: '8px 16px',
          backgroundColor: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--text-muted)',
        }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span><span className="kbd-badge">↑↓</span> Gezin</span>
            <span><span className="kbd-badge">↵</span> Seç</span>
          </div>
          <span>Postacı Hızlı Erişim Motoru</span>
        </div>
      </div>
    </div>
  );
};
