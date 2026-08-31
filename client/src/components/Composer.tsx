import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Send,
  Paperclip,
  Sparkles,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Code,
  FileText,
  Clock,
  AlertCircle,
  Wand2,
  User,
  History
} from 'lucide-react';
import { useMail } from '../context/MailContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { Attachment, EmailAddress } from '../types';

export const Composer: React.FC = () => {
  const {
    accounts,
    activeAccountId,
    isComposerOpen,
    closeComposer,
    composerData,
    refreshEmails,
    refreshStats,
  } = useMail();

  const { success, error, info } = useToast();

  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    return composerData?.accountId || (activeAccountId !== 'all' ? activeAccountId : accounts[0]?.id || '');
  });

  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');
  const [toRecipients, setToRecipients] = useState<EmailAddress[]>([]);
  const [ccRecipients, setCcRecipients] = useState<EmailAddress[]>([]);
  const [bccRecipients, setBccRecipients] = useState<EmailAddress[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  // Recipient Autocomplete Suggestions
  const [suggestions, setSuggestions] = useState<Array<{ name: string; email: string; source: 'contact' | 'history' }>>([]);
  const [activeInputType, setActiveInputType] = useState<'to' | 'cc' | 'bcc' | null>(null);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number>(0);
  const searchTimeoutRef = useRef<any>(null);

  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high'>('normal');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // Postacı AI Draft Generator Dialog
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cannedTemplates = [
    {
      title: '🤝 Toplantı Teyidi & Ajanda',
      subject: 'Toplantı Teyidi ve Gündem Maddeleri',
      body: '<p>Merhaba,</p><p>Planlanan toplantımızı teyit etmek amacıyla yazıyorum. Toplantıda ele alacağımız ana maddeler:</p><ul><li>1. Proje durumu ve son gelişmeler</li><li>2. Yol haritası ve sonraki adımlar</li></ul><p>Toplantı saatinde görüşmek üzere.</p>',
    },
    {
      title: '📄 Teklif & Bilgilendirme',
      subject: 'Hizmet Teklifi ve Bilgilendirme',
      body: '<p>Merhaba,</p><p>Görüşmemize istinaden hazırladığımız teklif ve detayları bilgilerinize sunarım. Ekli dosyayı inceleyebilir, herhangi bir sorunuz olursa doğrudan iletebilirsiniz.</p><p>İyi çalışmalar dilerim.</p>',
    },
    {
      title: '📬 Alındı Teyidi & Teşekkür',
      subject: 'E-postanız Alındı - Teşekkürler',
      body: '<p>Merhaba,</p><p>E-postanız tarafımıza ulaştı, teşekkür ederiz. İnceledikten sonra en kısa süre içerisinde size detaylı dönüş sağlayacağız.</p><p>Saygılarımla,</p>',
    },
    {
      title: '🏖️ Ofis Dışındayım (Out of Office)',
      subject: 'Ofis Dışındayım / İzin Bilgilendirmesi',
      body: '<p>Merhaba,</p><p>Şu anda ofis dışındayım ve e-postalarıma sınırlı erişimim bulunmaktadır. Döndüğümde mesajınızı yanıtlayacağım. Acil konularda lütfen telefon ile iletişime geçiniz.</p>',
    },
  ];

  const handleApplyTemplate = (tmpl: typeof cannedTemplates[0]) => {
    if (!subject) setSubject(tmpl.subject);
    if (editorRef.current) {
      editorRef.current.innerHTML = `${tmpl.body}<br><br>${editorRef.current.innerHTML}`;
    }
    setShowTemplates(false);
    success(`"${tmpl.title}" şablonu eklendi.`);
  };

  useEffect(() => {
    if (isComposerOpen) {
      const targetAccId = composerData?.accountId 
        || (activeAccountId !== 'all' && accounts.some(a => a.id === activeAccountId) ? activeAccountId : accounts[0]?.id || '');
      setSelectedAccountId(targetAccId);

      if (composerData) {
        setToRecipients(composerData.to || []);
        setCcRecipients(composerData.cc || []);
        setBccRecipients(composerData.bcc || []);
        setShowCc((composerData.cc && composerData.cc.length > 0) || false);
        setShowBcc((composerData.bcc && composerData.bcc.length > 0) || false);
        setSubject(composerData.subject || '');
        setAttachments(composerData.attachments || []);
        if (editorRef.current) {
          editorRef.current.innerHTML = composerData.bodyHtml || composerData.bodyText || '';
        }
      } else {
        const defaultAcc = accounts.find(a => a.id === targetAccId) || accounts[0];
        const signatureHtml = defaultAcc?.signature ? `<br><br><div class="signature" style="color:var(--text-muted); font-size:12px;">--<br>${defaultAcc.signature.replace(/\n/g, '<br>')}</div>` : '';
        if (editorRef.current) {
          editorRef.current.innerHTML = `<p><br></p>${signatureHtml}`;
        }
        setToRecipients([]);
        setCcRecipients([]);
        setBccRecipients([]);
        setToInput('');
        setCcInput('');
        setBccInput('');
        setSubject('');
        setAttachments([]);
      }
    }
  }, [isComposerOpen, composerData, accounts, activeAccountId]);

  if (!isComposerOpen) return null;

  // Search recipients on typing
  const handleInputChange = (type: 'to' | 'cc' | 'bcc', val: string) => {
    if (type === 'to') setToInput(val);
    else if (type === 'cc') setCcInput(val);
    else if (type === 'bcc') setBccInput(val);

    setActiveInputType(type);
    setSelectedSuggestionIdx(0);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!val.trim()) {
      setSuggestions([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await api.searchRecipients(val);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
    }, 100);
  };

  const handleSelectSuggestion = (type: 'to' | 'cc' | 'bcc', item: { name: string; email: string }) => {
    const newAddr: EmailAddress = { name: item.name || item.email.split('@')[0], email: item.email };
    if (type === 'to') {
      setToRecipients(prev => prev.some(r => r.email.toLowerCase() === newAddr.email.toLowerCase()) ? prev : [...prev, newAddr]);
      setToInput('');
    } else if (type === 'cc') {
      setCcRecipients(prev => prev.some(r => r.email.toLowerCase() === newAddr.email.toLowerCase()) ? prev : [...prev, newAddr]);
      setCcInput('');
    } else if (type === 'bcc') {
      setBccRecipients(prev => prev.some(r => r.email.toLowerCase() === newAddr.email.toLowerCase()) ? prev : [...prev, newAddr]);
      setBccInput('');
    }
    setSuggestions([]);
    setActiveInputType(null);
  };

  const handleInputKeyDown = (type: 'to' | 'cc' | 'bcc', e: React.KeyboardEvent<HTMLInputElement>, currentVal: string) => {
    if (suggestions.length > 0 && activeInputType === type) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIdx(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (suggestions[selectedSuggestionIdx]) {
          e.preventDefault();
          handleSelectSuggestion(type, suggestions[selectedSuggestionIdx]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestions([]);
        setActiveInputType(null);
        return;
      }
    }

    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
      e.preventDefault();
      if (currentVal.trim()) {
        handleAddRecipient(type, currentVal);
        setSuggestions([]);
        setActiveInputType(null);
      }
    }
  };

  const handleAddRecipient = (type: 'to' | 'cc' | 'bcc', rawValue: string) => {
    if (!rawValue) return;
    const parts = rawValue.split(/[,;\n\r]+/).map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return;

    for (const part of parts) {
      const emailMatch = part.match(/<([^>]+)>/) || part.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/);
      const email = emailMatch ? emailMatch[1] : (part.includes('@') ? part : `${part}@domain.com`);
      let name = part.replace(/<[^>]+>/, '').trim();
      if (!name) name = email.split('@')[0];

      const newAddr: EmailAddress = { name, email };

      if (type === 'to') {
        setToRecipients(prev => prev.some(r => r.email.toLowerCase() === newAddr.email.toLowerCase()) ? prev : [...prev, newAddr]);
        setToInput('');
      } else if (type === 'cc') {
        setCcRecipients(prev => prev.some(r => r.email.toLowerCase() === newAddr.email.toLowerCase()) ? prev : [...prev, newAddr]);
        setCcInput('');
      } else if (type === 'bcc') {
        setBccRecipients(prev => prev.some(r => r.email.toLowerCase() === newAddr.email.toLowerCase()) ? prev : [...prev, newAddr]);
        setBccInput('');
      }
    }
  };

  const removeRecipient = (type: 'to' | 'cc' | 'bcc', idx: number) => {
    if (type === 'to') setToRecipients(prev => prev.filter((_, i) => i !== idx));
    else if (type === 'cc') setCcRecipients(prev => prev.filter((_, i) => i !== idx));
    else if (type === 'bcc') setBccRecipients(prev => prev.filter((_, i) => i !== idx));
  };

  const handleFormat = (command: string, value: string = '') => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];

    try {
      info(`${file.name} yükleniyor...`);
      const att = await api.uploadAttachment(file);
      setAttachments(prev => [...prev, att]);
      success(`${file.name} eklendi.`);
    } catch (err) {
      error('Dosya yüklenemedi.');
    }
  };

  const handleDropFiles = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        try {
          info(`${file.name} yükleniyor...`);
          const att = await api.uploadAttachment(file);
          setAttachments(prev => [...prev, att]);
          success(`${file.name} eklendi.`);
        } catch {
          error(`${file.name} yüklenemedi.`);
        }
      }
    }
  };

  const handleAiPolish = async (style: 'formal' | 'friendly' | 'concise' | 'persuasive' | 'expand' | 'fix_grammar') => {
    const currentText = editorRef.current?.innerText || '';
    if (!currentText.trim()) {
      info('Lütfen önce biraz metin yazın veya "AI ile Taslak Yaz" butonunu kullanın.');
      return;
    }

    setIsAiLoading(true);
    try {
      const polished = await api.polishText(currentText, style);
      if (editorRef.current) {
        editorRef.current.innerHTML = `<p>${polished.replace(/\n/g, '<br>')}</p>`;
      }
      success('Metin AI ile uyarlandı.');
    } catch {
      error('AI işlemi başarısız oldu.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleGenerateAiDraft = async () => {
    if (!aiPrompt.trim()) {
      info('Lütfen e-posta konusu veya ne anlatmak istediğinizi yazın.');
      return;
    }

    setIsAiGenerating(true);
    try {
      const recipientName = toRecipients[0]?.name || undefined;
      const res = await api.generateDraft(aiPrompt, {
        fromName: recipientName,
        subject: subject || undefined,
      });

      if (res.subject && !subject) {
        setSubject(res.subject);
      }
      if (editorRef.current) {
        editorRef.current.innerHTML = res.bodyHtml;
      }

      setShowAiModal(false);
      setAiPrompt('');
      success('Yapay zeka taslağı hazırlandı!');
    } catch (err) {
      error('Taslak oluşturulamadı.');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSend = async () => {
    let finalTo = [...toRecipients];
    if (toInput.trim()) {
      const parts = toInput.split(/[,;\n\r]+/).map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const emailMatch = part.match(/<([^>]+)>/) || part.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/);
        const email = emailMatch ? emailMatch[1] : (part.includes('@') ? part : `${part}@domain.com`);
        let name = part.replace(/<[^>]+>/, '').trim() || email.split('@')[0];
        finalTo.push({ name, email });
      }
      setToInput('');
    }

    let finalCc = [...ccRecipients];
    if (ccInput.trim()) {
      const parts = ccInput.split(/[,;\n\r]+/).map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const emailMatch = part.match(/<([^>]+)>/) || part.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/);
        const email = emailMatch ? emailMatch[1] : (part.includes('@') ? part : `${part}@domain.com`);
        let name = part.replace(/<[^>]+>/, '').trim() || email.split('@')[0];
        finalCc.push({ name, email });
      }
      setCcInput('');
    }

    let finalBcc = [...bccRecipients];
    if (bccInput.trim()) {
      const parts = bccInput.split(/[,;\n\r]+/).map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const emailMatch = part.match(/<([^>]+)>/) || part.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/);
        const email = emailMatch ? emailMatch[1] : (part.includes('@') ? part : `${part}@domain.com`);
        let name = part.replace(/<[^>]+>/, '').trim() || email.split('@')[0];
        finalBcc.push({ name, email });
      }
      setBccInput('');
    }

    if (finalTo.length === 0) {
      error('Lütfen en az bir alıcı (Kime) adresi belirtin.');
      return;
    }

    const effectiveAccountId = selectedAccountId 
      || (activeAccountId !== 'all' && accounts.some(a => a.id === activeAccountId) ? activeAccountId : accounts[0]?.id || '');

    if (!effectiveAccountId) {
      error('Lütfen e-postayı göndermek için geçerli bir hesap seçin.');
      return;
    }

    const bodyHtml = editorRef.current?.innerHTML || '';
    const bodyText = editorRef.current?.innerText || '';

    setIsSending(true);
    try {
      info('E-posta gönderiliyor...');
      await api.sendMail({
        accountId: effectiveAccountId,
        to: finalTo,
        cc: finalCc.length > 0 ? finalCc : undefined,
        bcc: finalBcc.length > 0 ? finalBcc : undefined,
        subject: subject.trim() || '(Konusuz)',
        bodyText,
        bodyHtml,
        attachments: attachments.length > 0 ? attachments : undefined,
        priority,
        inReplyTo: composerData?.inReplyTo,
        references: composerData?.references,
        threadId: composerData?.threadId,
      });

      success('E-posta başarıyla gönderildi!');
      closeComposer();
      refreshEmails();
      refreshStats();
    } catch (err: any) {
      error(err.message || 'E-posta gönderilirken bir hata oluştu.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: isMinimized ? '0' : '20px',
      right: isMinimized ? '20px' : (isMaximized ? '0' : '20px'),
      top: isMaximized ? '0' : 'auto',
      left: isMaximized ? '0' : 'auto',
      width: isMaximized ? '100vw' : (isMinimized ? '320px' : '680px'),
      height: isMaximized ? '100vh' : (isMinimized ? '44px' : '640px'),
      maxHeight: isMaximized ? '100vh' : '90vh',
      backgroundColor: 'var(--bg-secondary)',
      borderRadius: isMaximized ? '0' : 'var(--radius-lg)',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--border-medium)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Header Bar */}
      <div style={{
        padding: '10px 16px',
        backgroundColor: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {subject.trim() || 'Yeni İleti Oluştur'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
          >
            <Minus size={15} />
          </button>
          <button
            onClick={() => { setIsMaximized(!isMaximized); setIsMinimized(false); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
          >
            {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            onClick={closeComposer}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Metadata Fields: From, To, CC, BCC, Subject */}
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* From Account */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <span style={{ width: '50px', color: 'var(--text-muted)', fontWeight: 500 }}>Kimden:</span>
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} &lt;{acc.email}&gt;
                  </option>
                ))}
              </select>
            </div>

            {/* To Field with Autocomplete */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', position: 'relative' }}>
              <span style={{ width: '50px', color: 'var(--text-muted)', fontWeight: 500, marginTop: '7px' }}>Kime:</span>
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap',
                padding: '4px 8px',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                position: 'relative',
              }}>
                {toRecipients.map((rec, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: 'var(--bg-active)',
                      color: 'var(--accent-primary)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    {rec.name || rec.email}
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeRecipient('to', idx)} />
                  </span>
                ))}
                <input
                  type="text"
                  placeholder={toRecipients.length === 0 ? 'Alıcı e-posta veya isim yazın...' : ''}
                  value={toInput}
                  onChange={e => handleInputChange('to', e.target.value)}
                  onFocus={() => { if (toInput.trim()) handleInputChange('to', toInput); }}
                  onKeyDown={e => handleInputKeyDown('to', e, toInput)}
                  style={{
                    flex: 1,
                    minWidth: '140px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    padding: '4px 0',
                  }}
                />

                {/* Autocomplete Suggestions Dropdown for TO */}
                {activeInputType === 'to' && suggestions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                    zIndex: 1100,
                    maxHeight: '220px',
                    overflowY: 'auto',
                    marginTop: '4px',
                  }}>
                    {suggestions.map((item, i) => (
                      <div
                        key={i}
                        onMouseDown={() => handleSelectSuggestion('to', item)}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          backgroundColor: selectedSuggestionIdx === i ? 'var(--bg-active)' : 'transparent',
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          backgroundColor: item.source === 'contact' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                          color: item.source === 'contact' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}>
                          {item.source === 'contact' ? <User size={13} /> : <History size={13} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {item.email}
                          </div>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', backgroundColor: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                          {item.source === 'contact' ? 'Kişi' : 'Geçmiş'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                {!showCc && (
                  <button
                    onClick={() => setShowCc(true)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    onClick={() => setShowBcc(true)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Bcc
                  </button>
                )}
              </div>
            </div>

            {/* CC Field with Autocomplete */}
            {showCc && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', position: 'relative' }}>
                <span style={{ width: '50px', color: 'var(--text-muted)', fontWeight: 500, marginTop: '7px' }}>Cc:</span>
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  position: 'relative',
                }}>
                  {ccRecipients.map((rec, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: 'var(--bg-active)',
                        color: 'var(--accent-primary)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {rec.name || rec.email}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeRecipient('cc', idx)} />
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder="Bilgi alıcıları..."
                    value={ccInput}
                    onChange={e => handleInputChange('cc', e.target.value)}
                    onFocus={() => { if (ccInput.trim()) handleInputChange('cc', ccInput); }}
                    onKeyDown={e => handleInputKeyDown('cc', e, ccInput)}
                    style={{
                      flex: 1,
                      minWidth: '120px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none',
                      padding: '4px 0',
                    }}
                  />

                  {/* Suggestions for CC */}
                  {activeInputType === 'cc' && suggestions.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                      zIndex: 1100,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      marginTop: '4px',
                    }}>
                      {suggestions.map((item, i) => (
                        <div
                          key={i}
                          onMouseDown={() => handleSelectSuggestion('cc', item)}
                          style={{
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            cursor: 'pointer',
                            backgroundColor: selectedSuggestionIdx === i ? 'var(--bg-active)' : 'transparent',
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.email}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* BCC Field with Autocomplete */}
            {showBcc && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', position: 'relative' }}>
                <span style={{ width: '50px', color: 'var(--text-muted)', fontWeight: 500, marginTop: '7px' }}>Bcc:</span>
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  position: 'relative',
                }}>
                  {bccRecipients.map((rec, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: 'var(--bg-active)',
                        color: 'var(--accent-primary)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {rec.name || rec.email}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeRecipient('bcc', idx)} />
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder="Gizli alıcılar..."
                    value={bccInput}
                    onChange={e => handleInputChange('bcc', e.target.value)}
                    onFocus={() => { if (bccInput.trim()) handleInputChange('bcc', bccInput); }}
                    onKeyDown={e => handleInputKeyDown('bcc', e, bccInput)}
                    style={{
                      flex: 1,
                      minWidth: '120px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none',
                      padding: '4px 0',
                    }}
                  />

                  {/* Suggestions for BCC */}
                  {activeInputType === 'bcc' && suggestions.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                      zIndex: 1100,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      marginTop: '4px',
                    }}>
                      {suggestions.map((item, i) => (
                        <div
                          key={i}
                          onMouseDown={() => handleSelectSuggestion('bcc', item)}
                          style={{
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            cursor: 'pointer',
                            backgroundColor: selectedSuggestionIdx === i ? 'var(--bg-active)' : 'transparent',
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.email}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Subject Field */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <span style={{ width: '50px', color: 'var(--text-muted)', fontWeight: 500 }}>Konu:</span>
              <input
                type="text"
                placeholder="E-posta konusunu girin..."
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              />
              <button
                onClick={() => setPriority(priority === 'high' ? 'normal' : 'high')}
                title="Öncelik Seviyesi"
                style={{
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${priority === 'high' ? '#ef4444' : 'var(--border-subtle)'}`,
                  backgroundColor: priority === 'high' ? '#ef444420' : 'transparent',
                  color: priority === 'high' ? '#ef4444' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🚨 {priority === 'high' ? 'Yüksek' : 'Normal'}
              </button>
            </div>
          </div>

          {/* AI Writing Copilot Quick Bar */}
          <div style={{
            padding: '6px 18px',
            backgroundColor: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
          }}>
            <button
              onClick={() => setShowAiModal(true)}
              style={{
                background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              <Sparkles size={13} />
              ✨ AI ile Taslak Yazdır
            </button>

            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Üslup:</span>

            {[
              { key: 'formal', label: '👔 Kurumsal' },
              { key: 'friendly', label: '😊 Samimi' },
              { key: 'concise', label: '⚡ Kısa & Öz' },
              { key: 'persuasive', label: '🎯 İkna Edici' },
              { key: 'fix_grammar', label: '✍️ İmla Düzelt' },
            ].map(tool => (
              <button
                key={tool.key}
                onClick={() => handleAiPolish(tool.key as any)}
                disabled={isAiLoading}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tool.label}
              </button>
            ))}
          </div>

          {/* AI Draft Generator Prompt Modal */}
          {showAiModal && (
            <div style={{
              padding: '14px 18px',
              backgroundColor: 'var(--bg-tertiary)',
              borderBottom: '2px solid var(--accent-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wand2 size={14} />
                  Postacı AI Akıllı E-Posta Yazarı
                </span>
                <X size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowAiModal(false)} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Örn: 'Toplantıyı Çarşamba 14:00 için teyit et ve ekteki raporu incelemesini rica et...'"
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleGenerateAiDraft(); }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-medium)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleGenerateAiDraft}
                  disabled={isAiGenerating}
                  style={{
                    background: 'var(--accent-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAiGenerating ? 'Oluşturuluyor...' : 'Taslak Üret'}
                </button>
              </div>
            </div>
          )}

          {/* WYSIWYG Formatting Toolbar with onMouseDown preventDefault */}
          <div style={{
            padding: '6px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'var(--bg-secondary)',
          }}>
            <button
              onMouseDown={e => { e.preventDefault(); handleFormat('bold'); }}
              title="Kalın (Bold)"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '5px', cursor: 'pointer' }}
            >
              <Bold size={15} />
            </button>
            <button
              onMouseDown={e => { e.preventDefault(); handleFormat('italic'); }}
              title="İtalik"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '5px', cursor: 'pointer' }}
            >
              <Italic size={15} />
            </button>
            <button
              onMouseDown={e => { e.preventDefault(); handleFormat('underline'); }}
              title="Altı Çizili"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '5px', cursor: 'pointer' }}
            >
              <Underline size={15} />
            </button>

            <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-subtle)', margin: '0 4px' }} />

            <button
              onMouseDown={e => { e.preventDefault(); handleFormat('insertUnorderedList'); }}
              title="Madde İşaretleri"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '5px', cursor: 'pointer' }}
            >
              <List size={15} />
            </button>
            <button
              onMouseDown={e => { e.preventDefault(); handleFormat('insertOrderedList'); }}
              title="Numaralı Liste"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '5px', cursor: 'pointer' }}
            >
              <ListOrdered size={15} />
            </button>
            <button
              onMouseDown={e => { e.preventDefault(); handleFormat('formatBlock', '<blockquote>'); }}
              title="Alıntı"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '5px', cursor: 'pointer' }}
            >
              <Quote size={15} />
            </button>
            <button
              onMouseDown={e => { e.preventDefault(); handleFormat('formatBlock', '<pre>'); }}
              title="Kod Bloğu"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '5px', cursor: 'pointer' }}
            >
              <Code size={15} />
            </button>

            <div style={{ flex: 1 }} />

            {/* Canned Templates Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                title="Hazır Yanıt Şablonları"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  padding: '3px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                }}
              >
                <FileText size={13} />
                <span>Şablonlar</span>
              </button>

              {showTemplates && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  right: 0,
                  marginBottom: '6px',
                  width: '260px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
                  padding: '6px',
                  zIndex: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}>
                  <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                    HAZIR İŞ ŞABLONLARI
                  </div>
                  {cannedTemplates.map((t, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleApplyTemplate(t)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        backgroundColor: 'var(--bg-tertiary)',
                      }}
                    >
                      {t.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Editable Email Body with drag and drop */}
          <div
            ref={editorRef}
            contentEditable
            onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDropFiles}
            style={{
              flex: 1,
              padding: '18px',
              overflowY: 'auto',
              outline: 'none',
              fontSize: '14px',
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              border: isDraggingOver ? '2px dashed var(--accent-primary)' : 'none',
              backgroundColor: isDraggingOver ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
            }}
          />

          {/* Attachments Preview Bar */}
          {attachments.length > 0 && (
            <div style={{
              padding: '8px 18px',
              backgroundColor: 'var(--bg-tertiary)',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}>
              {attachments.map((att, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  <Paperclip size={12} />
                  <span>{att.filename}</span>
                  <X
                    size={13}
                    style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Bottom Footer & Send Action */}
          <div style={{
            padding: '12px 18px',
            backgroundColor: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Dosya Ekle"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                }}
              >
                <Paperclip size={15} />
                <span>Dosya Ekle</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handleSend}
                disabled={isSending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 20px',
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
                <Send size={15} />
                <span>{isSending ? 'Gönderiliyor...' : 'Gönder'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
