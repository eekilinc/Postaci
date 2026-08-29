import React from 'react';
import { X, Command, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: '⚡ Hızlı İşlemler',
      shortcuts: [
        { key: 'C', desc: 'Yeni e-posta oluştur' },
        { key: 'R', desc: 'Seçili e-postayı yanıtla' },
        { key: 'A', desc: 'Tümünü yanıtla' },
        { key: 'F', desc: 'E-postayı ilet' },
        { key: 'Ctrl + Enter', desc: 'E-postayı gönder' },
      ],
    },
    {
      title: '📁 E-Posta Yönetimi',
      shortcuts: [
        { key: 'E / Y', desc: 'Arşivle' },
        { key: '# / Del', desc: 'Çöp kutusuna taşı' },
        { key: 'S', desc: 'Yıldızla / Kaldır' },
        { key: 'U', desc: 'Okundu / Okunmadı yap' },
        { key: 'H', desc: 'Ertele (Snooze)' },
      ],
    },
    {
      title: '🧭 Gezinme & Arama',
      shortcuts: [
        { key: 'J / ↓', desc: 'Sonraki e-postayı seç' },
        { key: 'K / ↑', desc: 'Önceki e-postayı seç' },
        { key: 'Ctrl + K', desc: 'Komut paletini aç' },
        { key: '/', desc: 'Hızlı arama kutusuna odaklan' },
        { key: 'Esc', desc: 'Açık pencereyi kapat / Seçimi kaldır' },
      ],
    },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel animate-fade-in"
        style={{
          width: '640px',
          maxHeight: '85vh',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          border: '1px solid var(--glass-border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-active)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
            }}>
              <Keyboard size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Klavye Kısayolları (Superhuman Stili)
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Postacı'yı klavyenizden ışık hızında yönetin
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Shortcuts Content */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '20px',
        }}>
          {shortcutGroups.map(group => (
            <div
              key={group.title}
              style={{
                backgroundColor: 'var(--bg-primary)',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <h3 style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--accent-primary)',
                marginBottom: '12px',
                letterSpacing: '0.02em',
              }}>
                {group.title}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {group.shortcuts.map(s => (
                  <div
                    key={s.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {s.desc}
                    </span>
                    <span className="kbd-badge" style={{ fontSize: '11px', fontWeight: 600 }}>
                      {s.key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--text-muted)',
        }}>
          <span>Kısayol penceresini istediğiniz an <strong style={{ color: 'var(--text-primary)' }}>?</strong> tuşuna basarak açabilirsiniz.</span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: 'var(--accent-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Anladım
          </button>
        </div>
      </div>
    </div>
  );
};
