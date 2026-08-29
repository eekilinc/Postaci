import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Star,
  Mail,
  Phone,
  Building,
  Briefcase,
  Trash2,
  Edit2,
  X,
  UserCheck,
  Sparkles,
  Download
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useMail } from '../context/MailContext';
import { Contact } from '../types';

export const ContactsView: React.FC = () => {
  const { openComposer, emails } = useMail();
  const { success, error, info } = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const loadContacts = async () => {
    try {
      const data = await api.getContacts();
      setContacts(data);
      if (data.length > 0 && !selectedContactId) {
        setSelectedContactId(data[0].id);
      }
    } catch {
      console.error('Failed to load contacts');
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingContactId(null);
    setName('');
    setEmail('');
    setCompany('');
    setRole('');
    setPhone('');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (c: Contact) => {
    setEditingContactId(c.id);
    setName(c.name);
    setEmail(c.email);
    setCompany(c.company || '');
    setRole(c.role || '');
    setPhone(c.phone || '');
    setNotes(c.notes || '');
    setIsModalOpen(true);
  };

  const handleSaveContact = async () => {
    if (!name.trim() || !email.trim()) {
      error('Lütfen Ad ve E-posta alanlarını doldurun.');
      return;
    }

    try {
      if (editingContactId) {
        await api.updateContact(editingContactId, {
          name,
          email,
          company,
          role,
          phone,
          notes,
        });
        success('Kişi bilgileri güncellendi!');
      } else {
        await api.createContact({
          id: `cnt-${Date.now()}`,
          name,
          email,
          company,
          role,
          phone,
          notes,
          isStarred: false,
        });
        success('Yeni kişi eklendi!');
      }

      setIsModalOpen(false);
      loadContacts();
    } catch {
      error('Kişi kaydedilemedi.');
    }
  };

  const handleToggleStar = async (c: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.updateContact(c.id, { isStarred: !c.isStarred });
      setContacts(prev => prev.map(item => item.id === c.id ? { ...item, isStarred: !item.isStarred } : item));
    } catch {
      error('Güncellenemedi.');
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (confirm('Bu kişiyi adres defterinden silmek istediğinizden emin misiniz?')) {
      try {
        await api.deleteContact(id);
        success('Kişi silindi.');
        if (selectedContactId === id) setSelectedContactId(null);
        loadContacts();
      } catch {
        error('Kişi silinemedi.');
      }
    }
  };

  // Auto-import contacts from all existing emails
  const handleImportFromEmails = async () => {
    const existingEmails = new Set(contacts.map(c => c.email.toLowerCase()));
    let imported = 0;

    for (const em of emails) {
      if (em.fromEmail && !existingEmails.has(em.fromEmail.toLowerCase())) {
        try {
          await api.createContact({
            id: `cnt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            name: em.fromName || em.fromEmail.split('@')[0],
            email: em.fromEmail,
            company: em.fromEmail.includes('@') ? em.fromEmail.split('@')[1] : '',
            isStarred: false,
          });
          existingEmails.add(em.fromEmail.toLowerCase());
          imported++;
        } catch {}
      }
    }

    if (imported > 0) {
      success(`${imported} kişi e-postalarınızdan başarıyla içe aktarıldı!`);
      loadContacts();
    } else {
      info('E-postalardan eklenecek yeni kişi bulunamadı.');
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.company && c.company.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedContact = contacts.find(c => c.id === selectedContactId);

  return (
    <section style={{
      flex: 1,
      height: '100%',
      backgroundColor: 'var(--bg-primary)',
      display: 'flex',
      overflow: 'hidden',
    }}>
      {/* Contacts List Column */}
      <div style={{
        width: '360px',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-secondary)',
      }}>
        <div style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} color="var(--accent-primary)" />
              <span>Kişiler ({contacts.length})</span>
            </h2>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleImportFromEmails}
                title="E-postalardan Kişileri İçe Aktar"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Sparkles size={13} color="#f59e0b" />
                <span>İçe Aktar</span>
              </button>

              <button
                onClick={handleOpenCreateModal}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-primary)',
                  color: 'white',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                <span>Yeni</span>
              </button>
            </div>
          </div>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="İsim, e-posta veya şirket ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
          </div>
        </div>

        {/* List items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
          {filteredContacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Kayıtlı kişi bulunamadı.
            </div>
          ) : (
            filteredContacts.map(c => {
              const isSelected = c.id === selectedContactId;

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedContactId(c.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '3px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--bg-active)' : 'transparent',
                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-primary)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '13px',
                      flexShrink: 0,
                    }}>
                      {c.name ? c.name[0].toUpperCase() : 'K'}
                    </div>

                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.company ? `${c.company} • ` : ''}{c.email}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={e => handleToggleStar(c, e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: c.isStarred ? '#f59e0b' : 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                  >
                    <Star size={14} fill={c.isStarred ? '#f59e0b' : 'transparent'} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Selected Contact Profile Detail */}
      <div style={{
        flex: 1,
        height: '100%',
        backgroundColor: 'var(--bg-primary)',
        padding: '36px',
        overflowY: 'auto',
      }}>
        {selectedContact ? (
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            {/* Header Profile Card */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-primary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                }}>
                  {selectedContact.name ? selectedContact.name[0].toUpperCase() : 'K'}
                </div>

                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {selectedContact.name}
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {selectedContact.role ? `${selectedContact.role} • ` : ''}{selectedContact.company || 'Bireysel Kişi'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => openComposer({
                    to: [{ name: selectedContact.name, email: selectedContact.email }]
                  })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Mail size={15} />
                  <span>E-Posta Gönder</span>
                </button>

                <button
                  onClick={() => handleOpenEditModal(selectedContact)}
                  title="Kişiyi Düzenle"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                  }}
                >
                  <Edit2 size={14} />
                  <span>Düzenle</span>
                </button>

                <button
                  onClick={() => handleDeleteContact(selectedContact.id)}
                  title="Kişiyi Sil"
                  style={{
                    padding: '8px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--accent-danger)',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Information Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px',
              marginBottom: '24px',
            }}>
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <Mail size={13} />
                  <span>E-POSTA ADRESİ</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedContact.email}
                </div>
              </div>

              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <Phone size={13} />
                  <span>TELEFON NUMARASI</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedContact.phone || '—'}
                </div>
              </div>

              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <Building size={13} />
                  <span>ŞİRKET / KURUM</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedContact.company || '—'}
                </div>
              </div>

              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <Briefcase size={13} />
                  <span>ÜNVAN / GÖREV</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedContact.role || '—'}
                </div>
              </div>
            </div>

            {/* Notes Section */}
            {selectedContact.notes && (
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '18px',
              }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Özel Notlar
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
                  {selectedContact.notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '64px' }}>
            Detayları görüntülemek için sol listeden bir kişi seçin
          </div>
        )}
      </div>

      {/* New/Edit Contact Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div
            className="glass-panel animate-fade-in"
            style={{
              width: '460px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {editingContactId ? 'Kişiyi Düzenle' : 'Yeni Kişi Ekle'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Ad Soyad *
              </label>
              <input
                type="text"
                placeholder="Örn: Ayşe Demir"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                E-Posta Adresi *
              </label>
              <input
                type="email"
                placeholder="ayse@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Şirket
                </label>
                <input
                  type="text"
                  placeholder="Şirket adı"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Ünvan / Pozisyon
                </label>
                <input
                  type="text"
                  placeholder="Örn: Proje Yöneticisi"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Telefon Numarası
              </label>
              <input
                type="text"
                placeholder="+90 555 123 4567"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Notlar
              </label>
              <textarea
                rows={2}
                placeholder="Kişi hakkında özel notlar..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                İptal
              </button>
              <button
                onClick={handleSaveContact}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--accent-primary)',
                  color: 'white',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {editingContactId ? 'Değişiklikleri Kaydet' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
