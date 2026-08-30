import React, { useState, useRef } from 'react';
import {
  Search,
  Star,
  Paperclip,
  Archive,
  Trash2,
  Mail,
  MailOpen,
  CheckSquare,
  Square,
  AlertCircle,
  Clock,
  Sparkles,
  Pin,
  Inbox,
  Filter,
  Check,
  RotateCw
} from 'lucide-react';
import { useMail } from '../context/MailContext';
import { Email } from '../types';
import { isToday, isYesterday, format } from 'date-fns';
import { tr } from 'date-fns/locale';

export const EmailList: React.FC = () => {
  const {
    emails,
    selectedEmailId,
    selectEmail,
    checkedEmailIds,
    toggleEmailCheck,
    setCheckedRange,
    selectAllEmails,
    clearCheckedEmails,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    toggleRead,
    toggleStarred,
    togglePinned,
    archiveEmail,
    deleteEmail,
    bulkArchive,
    bulkDelete,
    bulkMarkRead,
    emptyTrashFolder,
    isLoading,
    isSyncing,
    activeFolder,
    activeLabel,
    triggerSync,
  } = useMail();

  const [hoveredEmailId, setHoveredEmailId] = useState<string | null>(null);
  const lastCheckedIdRef = useRef<string | null>(null);

  const formatEmailDate = (dateStr: string) => {
    try {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      if (isToday(d)) {
        return format(d, 'HH:mm');
      }
      if (isYesterday(d)) {
        return 'Dün';
      }
      const currentYear = new Date().getFullYear();
      if (d.getFullYear() === currentYear) {
        return format(d, 'd MMM', { locale: tr });
      }
      return format(d, 'd MMM yyyy', { locale: tr });
    } catch {
      return '';
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getAvatarGradient = (str: string) => {
    const gradients = [
      'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
      'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
      'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
      'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
      'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
      'linear-gradient(135deg, #10b981 0%, #84cc16 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < (str || '').length; i++) {
      hash = (str.charCodeAt(i) + ((hash << 5) - hash));
    }
    return gradients[Math.abs(hash) % gradients.length];
  };

  const isAllSelected = emails.length > 0 && checkedEmailIds.size === emails.length;

  return (
    <section style={{
      width: '380px',
      height: '100%',
      backgroundColor: 'var(--bg-primary)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* Search Bar Header */}
      <div style={{
        padding: '14px 14px 10px 14px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="E-postalarda ara... (/) kısayolu"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 34px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          {[
            { key: 'all', label: 'Tümü' },
            { key: 'unread', label: 'Okunmamış' },
            { key: 'starred', label: 'Yıldızlı' },
            { key: 'has_attachment', label: 'Ekli' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as any)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: filter === tab.key ? 'var(--bg-active)' : 'var(--bg-secondary)',
                color: filter === tab.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: filter === tab.key ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Operations or Folder Title Header */}
      <div style={{
        padding: '8px 14px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: 'var(--text-secondary)',
      }}>
        {checkedEmailIds.size > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={selectAllEmails}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {isAllSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {checkedEmailIds.size} seçildi
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => bulkMarkRead(true)}
                title="Okundu İşaretle"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <MailOpen size={15} />
              </button>
              <button
                onClick={() => bulkMarkRead(false)}
                title="Okunmadı İşaretle"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <Mail size={15} />
              </button>
              <button
                onClick={bulkArchive}
                title="Toplu Arşivle"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <Archive size={15} />
              </button>
              <button
                onClick={bulkDelete}
                title="Toplu Sil"
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', padding: '4px' }}
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={clearCheckedEmails}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', marginLeft: '4px' }}
              >
                İptal
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={selectAllEmails}
                title="Tümünü Seç (Ctrl+A veya * a)"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {isAllSelected ? <CheckSquare size={15} color="var(--accent-primary)" /> : <Square size={15} />}
              </button>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {activeLabel ? `#${activeLabel}` : (
                  activeFolder === 'INBOX' ? 'Gelen Kutusu' :
                  activeFolder === 'STARRED' ? 'Yıldızlılar' :
                  activeFolder === 'SENT' ? 'Gönderilenler' :
                  activeFolder === 'DRAFTS' ? 'Taslaklar' :
                  activeFolder === 'ARCHIVE' ? 'Arşiv' :
                  activeFolder === 'SPAM' ? 'İstenmeyen' :
                  activeFolder === 'TRASH' ? 'Çöp Kutusu' : activeFolder
                )}
              </span>

              {/* Mailbird-style Live Sync Button */}
              <button
                onClick={() => triggerSync()}
                disabled={isSyncing}
                title={isSyncing ? 'E-postalar eşitleniyor...' : 'E-postaları Şimdi Senkronize Et (Mailbird Tarzı Anlık Çek)'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: isSyncing ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-tertiary)',
                  border: isSyncing ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '2px 7px',
                  cursor: isSyncing ? 'default' : 'pointer',
                  color: isSyncing ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  transition: 'all 0.15s ease',
                  marginLeft: '4px'
                }}
              >
                <RotateCw
                  size={12}
                  className={isSyncing ? 'animate-spin' : ''}
                  style={{ color: isSyncing ? 'var(--accent-primary)' : 'inherit' }}
                />
                <span style={{ fontSize: '10.5px' }}>{isSyncing ? 'Eşitleniyor...' : 'Eşitle'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {activeFolder === 'TRASH' && emails.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Çöp kutusundaki TÜM e-postaları kalıcı olarak silmek istediğinizden emin misiniz?')) {
                      emptyTrashFolder();
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--accent-danger)',
                    borderRadius: '4px',
                    color: 'var(--accent-danger)',
                    padding: '2px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  🗑️ Çöpü Boşalt
                </button>
              )}
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {emails.length} ileti
              </span>
            </div>
          </>
        )}
      </div>

      {/* Email Items List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '6px',
      }}>
        {isLoading && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            <Sparkles size={20} className="animate-pulse" style={{ margin: '0 auto 8px auto', color: 'var(--accent-primary)' }} />
            İletiler yükleniyor...
          </div>
        )}

        {!isLoading && emails.length === 0 && isSyncing && (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ width: '56px', height: '56px', margin: '0 auto 14px auto', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)' }}>
              <Sparkles size={28} className="animate-spin" color="var(--accent-primary)" />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              📬 E-postalar Senkronize Ediliyor
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '250px', margin: '0 auto 14px auto', lineHeight: 1.5 }}>
              Hesabınız kuruluyor ve iletileriniz sunucudan aktarılıyor. Lütfen birkaç saniye bekleyin...
            </p>
          </div>
        )}

        {!isLoading && emails.length === 0 && !isSyncing && (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="animate-float" style={{ width: '56px', height: '56px', margin: '0 auto 14px auto', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)' }}>
              <Sparkles size={28} color="var(--accent-primary)" />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              {activeFolder === 'INBOX' ? '✨ Harika! Gelen Kutunuz Tertemiz' : 'Bu Klasörde E-Posta Yok'}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '240px', margin: '0 auto 14px auto', lineHeight: 1.4 }}>
              {activeFolder === 'INBOX' ? 'Tüm e-postalarınızı tamamladınız. Yeni e-postalar arka planda otomatik eşitlenmektedir.' : 'Yeni iletiler için senkronizasyon otomatik çalışıyor.'}
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '4px 10px', borderRadius: '999px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              <span>Komut paleti için</span>
              <span className="kbd-badge">Ctrl + K</span>
            </div>
          </div>
        )}

        {emails.map((email, index) => {
          const isSelected = email.id === selectedEmailId;
          const isChecked = checkedEmailIds.has(email.id);
          const isHovered = hoveredEmailId === email.id;

          return (
            <div
              key={email.id}
              draggable={true}
              onDragStart={(e) => {
                const idsToDrag = checkedEmailIds.has(email.id) && checkedEmailIds.size > 1
                  ? Array.from(checkedEmailIds)
                  : [email.id];
                e.dataTransfer.setData('text/plain', JSON.stringify(idsToDrag));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={(e) => {
                if (e.shiftKey && lastCheckedIdRef.current) {
                  e.preventDefault();
                  const startIdx = emails.findIndex(em => em.id === lastCheckedIdRef.current);
                  const endIdx = index;
                  if (startIdx !== -1 && endIdx !== -1) {
                    const [minI, maxI] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
                    const rangeIds = emails.slice(minI, maxI + 1).map(em => em.id);
                    setCheckedRange(rangeIds);
                    return;
                  }
                }
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  toggleEmailCheck(email.id);
                  lastCheckedIdRef.current = email.id;
                  return;
                }
                lastCheckedIdRef.current = email.id;
                selectEmail(email.id);
              }}
              onMouseEnter={() => setHoveredEmailId(email.id)}
              onMouseLeave={() => setHoveredEmailId(null)}
              className={`glass-card ${isSelected ? 'animate-fade-in' : ''}`}
              style={{
                position: 'relative',
                padding: '10px 12px',
                marginBottom: '4px',
                backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.08)' : isSelected ? 'var(--bg-active)' : 'var(--bg-secondary)',
                borderColor: isChecked ? 'var(--accent-primary)' : isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                borderLeft: isChecked ? '3px solid var(--accent-primary)' : !email.isRead ? '3px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Top Row: Sender, Monogram Avatar, Date, Star, Selection, Pin */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  {/* Dedicated Selection Checkbox */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.shiftKey && lastCheckedIdRef.current) {
                        const startIdx = emails.findIndex(em => em.id === lastCheckedIdRef.current);
                        const endIdx = index;
                        if (startIdx !== -1 && endIdx !== -1) {
                          const [minI, maxI] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
                          const rangeIds = emails.slice(minI, maxI + 1).map(em => em.id);
                          setCheckedRange(rangeIds);
                          return;
                        }
                      }
                      lastCheckedIdRef.current = email.id;
                      toggleEmailCheck(email.id);
                    }}
                    title="Seç / Çoklu Seç (Shift ile aralık seçebilir, Del ile silebilirsiniz)"
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      transition: 'all 0.15s ease',
                      opacity: isChecked || isHovered || checkedEmailIds.size > 0 ? 1 : 0.4,
                    }}
                  >
                    {isChecked ? (
                      <CheckSquare size={17} color="var(--accent-primary)" />
                    ) : (
                      <Square size={17} color={isHovered ? "var(--text-primary)" : "var(--text-muted)"} />
                    )}
                  </div>

                  {/* Monogram Avatar */}
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: getAvatarGradient(email.fromEmail || email.fromName),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#ffffff',
                      flexShrink: 0,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                  >
                    {getInitials(email.fromName || email.fromEmail)}
                  </div>

                  <span style={{
                    fontSize: '13px',
                    fontWeight: !email.isRead ? 700 : 500,
                    color: !email.isRead ? 'var(--text-primary)' : 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {email.fromName}
                  </span>

                  {email.isPinned && (
                    <Pin size={12} color="var(--accent-primary)" style={{ transform: 'rotate(45deg)', flexShrink: 0 }} />
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {formatEmailDate(email.date)}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStarred(email.id, email.isStarred);
                    }}
                    title="Yıldızla (s)"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: email.isStarred ? '#f59e0b' : 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                      lineHeight: 0,
                    }}
                  >
                    <Star size={14} fill={email.isStarred ? '#f59e0b' : 'transparent'} />
                  </button>
                </div>
              </div>

              {/* Middle Row: Subject & Priority */}
              <div style={{
                fontSize: '13px',
                fontWeight: !email.isRead ? 600 : 500,
                color: 'var(--text-primary)',
                marginBottom: '3px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
              }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {email.subject}
                </span>

                {email.priority === 'high' && (
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    backgroundColor: '#ef444420',
                    color: '#ef4444',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    flexShrink: 0,
                  }}>
                    Önemli
                  </span>
                )}
              </div>

              {/* Bottom Row: Snippet & Hover Quick Actions */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}>
                <div style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.3,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flex: 1,
                }}>
                  {email.snippet}
                </div>

                {/* Badges / Attachments or Hover Actions */}
                {isHovered ? (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: 'var(--bg-tertiary)',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }}
                  >
                    <button
                      onClick={() => toggleRead(email.id, email.isRead)}
                      title={email.isRead ? 'Okunmadı İşaretle (u)' : 'Okundu İşaretle (u)'}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
                    >
                      {email.isRead ? <Mail size={13} /> : <MailOpen size={13} />}
                    </button>
                    <button
                      onClick={() => togglePinned(email.id, email.isPinned)}
                      title={email.isPinned ? 'Sabitlemeyi Kaldır (p)' : 'Başa Sabitle (p)'}
                      style={{ background: 'transparent', border: 'none', color: email.isPinned ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
                    >
                      <Pin size={13} style={{ transform: 'rotate(45deg)' }} />
                    </button>
                    <button
                      onClick={() => archiveEmail(email.id)}
                      title="Arşivle (e)"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
                    >
                      <Archive size={13} />
                    </button>
                    <button
                      onClick={() => deleteEmail(email.id)}
                      title="Sil (#)"
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', padding: '2px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  email.attachments && email.attachments.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0 }}>
                      <Paperclip size={12} />
                      <span>{email.attachments.length}</span>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
