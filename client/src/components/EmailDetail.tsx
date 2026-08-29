import React, { useState, useEffect } from 'react';
import {
  Reply,
  ReplyAll,
  Forward,
  Archive,
  Trash2,
  AlertOctagon,
  Star,
  Download,
  Calendar,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Eye,
  Send,
  User,
  Paperclip,
  FileText,
  Pin,
  Mail,
  MailOpen,
  Image as ImageIcon,
  Sun,
  Moon
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { useMail } from '../context/MailContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export const EmailDetail: React.FC = () => {
  const {
    selectedEmail,
    threadEmails,
    toggleStarred,
    togglePinned,
    toggleRead,
    archiveEmail,
    deleteEmail,
    markAsSpam,
    openReply,
    openForward,
  } = useMail();

  const { theme } = useTheme();
  const { success, info, error } = useToast();

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [loadRemoteImages, setLoadRemoteImages] = useState(false);
  const [quickReplyText, setQuickReplyText] = useState('');
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false);
  const [isLightCardMode, setIsLightCardMode] = useState(false);

  useEffect(() => {
    if (!selectedEmail) {
      setAiSummary(null);
      setSmartReplies([]);
      setSecurityStatus(null);
      setLoadRemoteImages(false);
      setQuickReplyText('');
      return;
    }

    // Set pre-computed AI summary & smart replies if available
    setAiSummary(selectedEmail.aiSummary || null);
    if (selectedEmail.aiSmartReplies && selectedEmail.aiSmartReplies.length > 0) {
      setSmartReplies(selectedEmail.aiSmartReplies);
    } else {
      // Auto fetch smart replies
      api.getSmartReplies(selectedEmail).then(replies => setSmartReplies(replies)).catch(() => {});
    }

    // Check security status
    api.checkSecurity(selectedEmail).then(res => setSecurityStatus(res)).catch(() => {});
    setLoadRemoteImages(false);
    setQuickReplyText('');
  }, [selectedEmail]);

  if (!selectedEmail) {
    return (
      <main style={{
        flex: 1,
        height: '100%',
        backgroundColor: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        fontSize: '14px',
        userSelect: 'none',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Sparkles size={36} color="var(--accent-primary)" style={{ opacity: 0.4, margin: '0 auto 12px auto' }} />
          <div>Okumak için listeden bir e-posta seçin</div>
          <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-muted)' }}>
            Klavye ile gezinmek için <span className="kbd-badge">j</span> ve <span className="kbd-badge">k</span> tuşlarını kullanabilirsiniz
          </div>
        </div>
      </main>
    );
  }

  const handleGenerateSummary = async () => {
    setIsSummarizing(true);
    try {
      const summary = await api.summarizeEmail(selectedEmail);
      setAiSummary(summary);
      success('Yapay zeka özeti oluşturuldu.');
    } catch (err: any) {
      error('Özet oluşturulurken bir hata oluştu.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleRsvp = async (status: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE') => {
    try {
      await api.respondToRsvp(selectedEmail.id, status);
      success(
        status === 'ACCEPTED'
          ? 'Toplantı daveti kabul edildi ve takviminize eklendi!'
          : status === 'DECLINED'
          ? 'Toplantı daveti reddedildi.'
          : 'Toplantı daveti belki olarak yanıtlandı.'
      );
    } catch (err: any) {
      error('Yanıt kaydedilemedi.');
    }
  };

  const handleSendQuickReply = async () => {
    if (!quickReplyText.trim()) return;
    setIsSendingQuickReply(true);

    try {
      await api.sendMail({
        accountId: selectedEmail.accountId,
        threadId: selectedEmail.threadId,
        inReplyTo: selectedEmail.messageId || selectedEmail.id,
        to: [{ name: selectedEmail.fromName, email: selectedEmail.fromEmail }],
        subject: selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
        bodyText: quickReplyText,
        bodyHtml: `<p>${quickReplyText.replace(/\n/g, '<br>')}</p>`,
      });

      setQuickReplyText('');
      success('Hızlı yanıt gönderildi!');
    } catch (err: any) {
      error('Yanıt gönderilemedi.');
    } finally {
      setIsSendingQuickReply(false);
    }
  };

  const sanitizeHtml = (html: string) => {
    if (!html) return '';

    let processed = html;

    // 1. Resolve inline CID images from email attachments (e.g. cid:image001.png)
    if (selectedEmail.attachments && selectedEmail.attachments.length > 0) {
      for (const att of selectedEmail.attachments) {
        if (att.contentBase64 && (att.contentId || att.filename)) {
          const mime = att.contentType || 'image/png';
          const dataUri = `data:${mime};base64,${att.contentBase64}`;

          if (att.contentId) {
            const cleanCid = att.contentId.replace(/[<>]/g, '');
            processed = processed.split(`cid:${cleanCid}`).join(dataUri);
            processed = processed.split(`cid:${att.contentId}`).join(dataUri);
          }
          if (att.filename) {
            processed = processed.split(`cid:${att.filename}`).join(dataUri);
          }
        }
      }
    }

    // 2. Normalize inline dark-mode styles when viewing in dark mode (and not in light card mode)
    const isDark = theme !== 'light';
    if (isDark && !isLightCardMode) {
      // Invert or normalize explicit dark text color inline styles so text is clear and readable on dark bg
      processed = processed.replace(/color\s*:\s*(#000000|#000|#111111|#111|#222222|#222|#333333|#333|black|rgb\(0,\s*0,\s*0\))/gi, 'color: inherit');
      // Normalize explicit white background inline styles that cause harsh blocks
      processed = processed.replace(/background(-color)?\s*:\s*(#ffffff|#fff|white|rgb\(255,\s*255,\s*255\))/gi, 'background-color: transparent');
    }

    // 3. DOMPurify sanitize with email HTML and table attributes allowed
    const clean = DOMPurify.sanitize(processed, {
      ADD_TAGS: ['style', 'center', 'font'],
      ALLOWED_TAGS: [
        'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'div', 'span',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
        'table', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot', 'img', 'hr', 'center', 'font', 'style'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'style', 'class', 'id', 'target', 'width', 'height',
        'align', 'valign', 'bgcolor', 'color', 'cellpadding', 'cellspacing', 'border', 'colspan', 'rowspan'
      ]
    });

    return clean;
  };

  const formatFullDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "d MMMM yyyy, EEEE HH:mm", { locale: tr });
    } catch {
      return dateStr;
    }
  };

  return (
    <main style={{
      flex: 1,
      height: '100%',
      backgroundColor: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Top Action Bar */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => openReply(selectedEmail)}
            title="Yanıtla (r)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Reply size={15} />
            <span>Yanıtla</span>
            <span className="kbd-badge">r</span>
          </button>

          <button
            onClick={() => openReply(selectedEmail, true)}
            title="Herkese Yanıtla"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <ReplyAll size={15} />
          </button>

          <button
            onClick={() => openForward(selectedEmail)}
            title="İlet (Forward)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <Forward size={15} />
          </button>

          <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-subtle)', margin: '0 4px' }} />

          <button
            onClick={() => archiveEmail(selectedEmail.id)}
            title="Arşivle (e)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <Archive size={16} />
            <span className="kbd-badge">e</span>
          </button>

          <button
            onClick={() => deleteEmail(selectedEmail.id)}
            title="Sil (#)"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <Trash2 size={16} />
          </button>

          <button
            onClick={() => markAsSpam(selectedEmail.id)}
            title="İstenmeyen (Spam) Bildir"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <AlertOctagon size={16} />
          </button>
          <button
            onClick={() => togglePinned(selectedEmail.id, selectedEmail.isPinned)}
            title={selectedEmail.isPinned ? 'Sabitlemeyi Kaldır (p)' : 'Başa Sabitle (p)'}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: selectedEmail.isPinned ? 'var(--bg-active)' : 'transparent',
              color: selectedEmail.isPinned ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <Pin size={16} style={{ transform: 'rotate(45deg)' }} />
          </button>

          <button
            onClick={() => toggleRead(selectedEmail.id, selectedEmail.isRead)}
            title={selectedEmail.isRead ? 'Okunmadı İşaretle (u)' : 'Okundu İşaretle (u)'}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {selectedEmail.isRead ? <Mail size={16} /> : <MailOpen size={16} />}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {theme !== 'light' && (
            <button
              onClick={() => setIsLightCardMode(!isLightCardMode)}
              title={isLightCardMode ? 'Karanlık Görünüme Dön' : 'Aydınlık Kart Görünümüne Geç (Bülten ve Tablolar için)'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: isLightCardMode ? '#ffffff' : 'var(--bg-tertiary)',
                color: isLightCardMode ? '#1e293b' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {isLightCardMode ? <Moon size={14} color="#3b82f6" /> : <Sun size={14} color="#f59e0b" />}
              <span>{isLightCardMode ? 'Karanlık Görünüm' : 'Aydınlık Kart'}</span>
            </button>
          )}

          <button
            onClick={() => toggleStarred(selectedEmail.id, selectedEmail.isStarred)}
            title="Yıldızla (s)"
            style={{
              background: 'transparent',
              border: 'none',
              color: selectedEmail.isStarred ? '#f59e0b' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <Star size={18} fill={selectedEmail.isStarred ? '#f59e0b' : 'transparent'} />
          </button>
        </div>
      </div>

      {/* Main Email Reading Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {/* Subject Header & Labels */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {selectedEmail.subject}
            </h2>

            {selectedEmail.priority === 'high' && (
              <span style={{
                backgroundColor: '#ef444420',
                color: '#ef4444',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                flexShrink: 0,
              }}>
                🚨 Yüksek Öncelik
              </span>
            )}
          </div>

          {selectedEmail.labels && selectedEmail.labels.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
              {selectedEmail.labels.map(label => (
                <span
                  key={label}
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Sender & Recipient Information */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '18px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-primary)',
              color: 'white',
              fontSize: '15px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
            }}>
              {selectedEmail.fromName ? selectedEmail.fromName[0].toUpperCase() : 'P'}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                  {selectedEmail.fromName}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  &lt;{selectedEmail.fromEmail}&gt;
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Kime: {selectedEmail.to.map(t => t.name || t.email).join(', ')}
                {selectedEmail.cc && selectedEmail.cc.length > 0 && ` | Bilgi (CC): ${selectedEmail.cc.map(c => c.name || c.email).join(', ')}`}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {formatFullDate(selectedEmail.date)}
          </div>
        </div>

        {/* Security & Phishing Alert Banner */}
        {securityStatus && securityStatus.level !== 'safe' && (
          <div style={{
            backgroundColor: securityStatus.level === 'high' ? '#ef444415' : '#f59e0b15',
            border: `1px solid ${securityStatus.level === 'high' ? '#ef444440' : '#f59e0b40'}`,
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}>
            <ShieldAlert size={20} color={securityStatus.level === 'high' ? '#ef4444' : '#f59e0b'} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: securityStatus.level === 'high' ? '#ef4444' : '#f59e0b', marginBottom: '2px' }}>
                Güvenlik Uyarısı (Tehdit Skoru: %{securityStatus.score})
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {securityStatus.reasons.map((r: string, idx: number) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* External Images Privacy Banner */}
        {securityStatus?.hasBlockedImages && !loadRemoteImages && (
          <div style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
              <Eye size={15} />
              <span>Gizliliğinizi korumak için bu iletideki harici görseller engellendi.</span>
            </div>
            <button
              onClick={() => setLoadRemoteImages(true)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-medium)',
                borderRadius: '4px',
                padding: '4px 10px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '11px',
              }}
            >
              Görselleri Göster
            </button>
          </div>
        )}

        {/* AI Intelligence Assistant Widget */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.08))',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 18px',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="var(--accent-purple)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Postacı AI Asistanı
              </span>
            </div>

            {!aiSummary && (
              <button
                onClick={handleGenerateSummary}
                disabled={isSummarizing}
                style={{
                  background: 'var(--accent-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isSummarizing ? 'Özetleniyor...' : 'Özet Çıkar'}
              </button>
            )}
          </div>

          {aiSummary && (
            <div style={{
              fontSize: '13px',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
              whiteSpace: 'pre-line',
              backgroundColor: 'var(--bg-secondary)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}>
              {aiSummary}
            </div>
          )}

          {/* Smart Reply Chips */}
          {smartReplies.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Hızlı Yanıt Önerileri:
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {smartReplies.map((reply, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setQuickReplyText(reply);
                    }}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '999px',
                      padding: '5px 12px',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    💬 {reply}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Meeting Invite Widget (if present) */}
        {selectedEmail.meetingInvite && (
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
            marginBottom: '24px',
            boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Calendar size={22} color="var(--accent-primary)" />
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedEmail.meetingInvite.summary}
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Düzenleyen: {selectedEmail.meetingInvite.organizer.name} ({selectedEmail.meetingInvite.organizer.email})
                </p>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '10px',
              backgroundColor: 'var(--bg-tertiary)',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              marginBottom: '16px',
            }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Zaman</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatFullDate(selectedEmail.meetingInvite.startTime)}
                </div>
              </div>
              {selectedEmail.meetingInvite.location && (
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Konum</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedEmail.meetingInvite.location}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => handleRsvp('ACCEPTED')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--accent-success)',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ✓ Kabul Et
              </button>
              <button
                onClick={() => handleRsvp('TENTATIVE')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-medium)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                ? Belki
              </button>
              <button
                onClick={() => handleRsvp('DECLINED')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-medium)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--accent-danger)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                ✕ Reddet
              </button>
            </div>
          </div>
        )}

        {/* Email Body Content */}
        <div
          className={`email-rendered-body ${isLightCardMode ? 'email-light-mode-card' : ''}`}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEmail.bodyHtml || selectedEmail.bodyText) }}
        />

        {/* Attachments Section */}
        {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
          <div style={{
            marginTop: '32px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-subtle)',
          }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Paperclip size={14} />
              <span>Ekli Dosyalar ({selectedEmail.attachments.length})</span>
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
              {selectedEmail.attachments.map(att => (
                <div
                  key={att.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    {att.contentType.startsWith('image') ? (
                      <ImageIcon size={18} color="var(--accent-primary)" />
                    ) : (
                      <FileText size={18} color="var(--accent-secondary)" />
                    )}
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {att.filename}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {(att.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  </div>

                  <a
                    href={att.url || '#'}
                    onClick={e => {
                      if (att.url === '#') {
                        e.preventDefault();
                        info(`${att.filename} indiriliyor...`);
                      }
                    }}
                    download={att.filename}
                    title="İndir"
                    style={{
                      color: 'var(--text-secondary)',
                      padding: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={16} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Reply Box */}
        <div style={{
          marginTop: '36px',
          padding: '16px',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Reply size={16} color="var(--accent-primary)" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {selectedEmail.fromName} kişisine hızlı yanıt yaz
            </span>
          </div>

          <textarea
            placeholder="Yanıtınızı buraya yazın veya yukarıdaki önerilerden birini seçin..."
            value={quickReplyText}
            onChange={e => setQuickReplyText(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '10px', gap: '8px' }}>
            <button
              onClick={() => openReply(selectedEmail)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '6px 10px',
              }}
            >
              Gelişmiş Editörde Aç
            </button>

            <button
              onClick={handleSendQuickReply}
              disabled={isSendingQuickReply || !quickReplyText.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: !quickReplyText.trim() ? 0.6 : 1,
              }}
            >
              <Send size={14} />
              <span>{isSendingQuickReply ? 'Gönderiliyor...' : 'Gönder'}</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
