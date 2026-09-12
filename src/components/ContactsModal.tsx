import { useState, useEffect, useMemo, useRef } from 'react';
import type { ContactItem } from '../types';
import { useTranslation } from '../i18n';
import { SearchIcon, SendIcon, TrashIcon } from './icons';

interface ContactsModalProps {
  onClose: () => void;
  onComposeTo: (email: string, name?: string) => void;
}

// İsimden ya da e-postadan hoş bir pastel renk üretici
function getAvatarColor(str: string): string {
  const colors = [
    'bg-blue-500 text-white',
    'bg-indigo-500 text-white',
    'bg-purple-500 text-white',
    'bg-pink-500 text-white',
    'bg-rose-500 text-white',
    'bg-emerald-500 text-white',
    'bg-teal-500 text-white',
    'bg-sky-500 text-white',
    'bg-amber-500 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name?: string | null, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return '??';
}

export function ContactsModal({ onClose, onComposeTo }: ContactsModalProps) {
  const { language } = useTranslation();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<ContactItem>>({
    name: '',
    email: '',
    phone: '',
    company: '',
    notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const loadContacts = async () => {
    if (!window.postaci?.contacts?.list) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await window.postaci.contacts.list();
      setContacts(list || []);
      if (list && list.length > 0 && selectedId === null) {
        setSelectedId(list[0].id ?? null);
        setFormData({
          id: list[0].id,
          name: list[0].name || '',
          email: list[0].email,
          phone: list[0].phone || '',
          company: list[0].company || '',
          notes: list[0].notes || '',
        });
      }
    } catch (e) {
      console.error('Failed to load contacts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC ile kapatma
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Arama filtresi
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase().trim();
    return contacts.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        c.email.toLowerCase().includes(q) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
    );
  }, [contacts, searchQuery]);

  const handleSelectContact = (c: ContactItem) => {
    setSelectedId(c.id ?? null);
    setFormData({
      id: c.id,
      name: c.name || '',
      email: c.email,
      phone: c.phone || '',
      company: c.company || '',
      notes: c.notes || '',
    });
    setFormError(null);
    setSaveNotice(null);
  };

  const handleStartNewContact = () => {
    setSelectedId('new');
    setFormData({
      name: '',
      email: '',
      phone: '',
      company: '',
      notes: '',
    });
    setFormError(null);
    setSaveNotice(null);
  };

  const handleSaveContact = async () => {
    if (!formData.email || !formData.email.trim()) {
      setFormError(language === 'en' ? 'Email address is required.' : 'E-posta adresi zorunludur.');
      return;
    }
    const cleanEmail = formData.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError(language === 'en' ? 'Please enter a valid email address.' : 'Geçerli bir e-posta adresi giriniz.');
      return;
    }

    setFormError(null);
    setIsSaving(true);
    try {
      const payload: ContactItem = {
        id: selectedId === 'new' ? undefined : (formData.id ?? undefined),
        email: cleanEmail,
        name: formData.name?.trim() || null,
        phone: formData.phone?.trim() || null,
        company: formData.company?.trim() || null,
        notes: formData.notes?.trim() || null,
        is_manual: 1,
      };

      if (window.postaci?.contacts?.upsert) {
        const saved = await window.postaci.contacts.upsert(payload);
        setSaveNotice(language === 'en' ? '✓ Contact saved' : '✓ Kişi kaydedildi');
        setTimeout(() => setSaveNotice(null), 2500);
        await loadContacts();
        if (saved?.id) {
          setSelectedId(saved.id);
        }
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!formData.id) return;
    const confirmMsg =
      language === 'en'
        ? `Are you sure you want to delete ${formData.name || formData.email}?`
        : `${formData.name || formData.email} kişisini rehberden silmek istediğinize emin misiniz?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      if (window.postaci?.contacts?.delete) {
        await window.postaci.contacts.delete(formData.id);
        setSelectedId(null);
        setFormData({ name: '', email: '', phone: '', company: '', notes: '' });
        await loadContacts();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCompose = () => {
    if (!formData.email) return;
    onComposeTo(formData.email, formData.name || undefined);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex flex-col w-full max-w-4xl h-[620px] max-h-[92vh] rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Başlık Çubuğu */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                {language === 'en' ? 'Contacts & Address Book' : 'Kişiler ve Adres Defteri'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {language === 'en'
                  ? 'Manage your email contacts, phone numbers and personal notes'
                  : 'Kayıtlı e-posta adreslerinizi, telefonları ve kişi notlarını yönetin'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
            title={language === 'en' ? 'Close (Esc)' : 'Kapat (Esc)'}
          >
            ✕
          </button>
        </div>

        {/* Ana İçerik: Sol Liste + Sağ Detay */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* SOL PANEL: Kişi Listesi ve Arama */}
          <div className="w-80 sm:w-88 flex flex-col border-r border-zinc-200 dark:border-zinc-800 shrink-0 bg-zinc-50/30 dark:bg-zinc-950/30">
            {/* Arama ve Yeni Kişi Ekle */}
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-2 shrink-0">
              <div className="relative">
                <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={language === 'en' ? 'Search contacts...' : 'Kişilerde ara...'}
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-zinc-400 px-1">
                  {filteredContacts.length}{' '}
                  {language === 'en'
                    ? filteredContacts.length === 1 ? 'contact' : 'contacts'
                    : 'kişi'}
                </span>
                <button
                  type="button"
                  onClick={handleStartNewContact}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <span>+</span>
                  <span>{language === 'en' ? 'Add Contact' : 'Yeni Kişi'}</span>
                </button>
              </div>
            </div>

            {/* Kişi Listesi Scroll Alanı */}
            <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {loading ? (
                <div className="flex items-center justify-center p-8 text-xs text-zinc-400">
                  {language === 'en' ? 'Loading contacts...' : 'Kişiler yükleniyor...'}
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400">
                  <p className="text-xs mb-1">
                    {searchQuery
                      ? (language === 'en' ? 'No contacts match your search.' : 'Aramanıza uygun kişi bulunamadı.')
                      : (language === 'en' ? 'No contacts yet.' : 'Henüz kayıtlı kişi yok.')}
                  </p>
                  {!searchQuery && (
                    <button
                      type="button"
                      onClick={handleStartNewContact}
                      className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {language === 'en' ? 'Create first contact' : 'İlk kişiyi oluşturun'}
                    </button>
                  )}
                </div>
              ) : (
                filteredContacts.map((c) => {
                  const isSelected = selectedId === c.id;
                  const initials = getInitials(c.name, c.email);
                  const avatarColor = getAvatarColor(c.name || c.email);

                  return (
                    <div
                      key={c.id ?? c.email}
                      onClick={() => handleSelectContact(c)}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition select-none ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-l-3 border-blue-600'
                          : 'hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold shadow-xs ${avatarColor}`}
                      >
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold truncate text-zinc-900 dark:text-zinc-100">
                            {c.name || c.email}
                          </span>
                          {c.is_manual ? (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                              title={language === 'en' ? 'Custom edited contact' : 'Özel düzenlenen kişi'}
                            >
                              {language === 'en' ? 'Saved' : 'Kayıtlı'}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {c.email}
                        </div>
                        {c.company && (
                          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                            {c.company}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* SAĞ PANEL: Kişi Detayı & Düzenleme Formu */}
          <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-white dark:bg-zinc-900">
            {selectedId === null ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-400">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  {language === 'en' ? 'No Contact Selected' : 'Kişi Seçilmedi'}
                </h3>
                <p className="text-xs text-zinc-500 max-w-xs">
                  {language === 'en'
                    ? 'Select a contact from the list on the left or click Add Contact to create a new one.'
                    : 'Sol listeden bir kişi seçin veya yeni bir kişi eklemek için Yeni Kişi butonuna tıklayın.'}
                </p>
              </div>
            ) : (
              <div className="space-y-5 max-w-xl">
                {/* Kartvizit Üst Başlık Banner */}
                <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold shadow-md ${getAvatarColor(
                        formData.name || formData.email || 'Postacı'
                      )}`}
                    >
                      {getInitials(formData.name, formData.email)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                        {selectedId === 'new'
                          ? (language === 'en' ? 'New Contact' : 'Yeni Kişi Ekle')
                          : (formData.name || formData.email)}
                      </h3>
                      <p className="text-xs text-zinc-500">
                        {formData.company || (selectedId === 'new' ? '' : formData.email)}
                      </p>
                    </div>
                  </div>

                  {selectedId !== 'new' && formData.email && (
                    <button
                      type="button"
                      onClick={handleCompose}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 dark:text-blue-300 transition cursor-pointer"
                    >
                      <SendIcon size={14} />
                      <span>{language === 'en' ? 'Compose Email' : 'E-posta Yaz'}</span>
                    </button>
                  )}
                </div>

                {/* Form Hata & Başarı Mesajı */}
                {formError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300 text-xs font-medium border border-rose-200 dark:border-rose-900">
                    ✕ {formError}
                  </div>
                )}
                {saveNotice && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-900">
                    {saveNotice}
                  </div>
                )}

                {/* Form Alanları */}
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        {language === 'en' ? 'Full Name' : 'Ad Soyad'}
                      </label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={language === 'en' ? 'John Doe' : 'Ahmet Yılmaz'}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        {language === 'en' ? 'Email Address *' : 'E-posta Adresi *'}
                      </label>
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="ornek@alanadi.com"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        {language === 'en' ? 'Phone Number' : 'Telefon Numarası'}
                      </label>
                      <input
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+90 5XX XXX XX XX"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        {language === 'en' ? 'Company / Title' : 'Şirket / Unvan'}
                      </label>
                      <input
                        type="text"
                        value={formData.company || ''}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        placeholder={language === 'en' ? 'Acme Corp / Manager' : 'Teknoloji A.Ş. / Yönetici'}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      {language === 'en' ? 'Notes / Details' : 'Özel Notlar / Açıklama'}
                    </label>
                    <textarea
                      rows={3}
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder={
                        language === 'en'
                          ? 'Customer project info, meeting notes...'
                          : 'Müşteri proje detayları, toplantı notları...'
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Alt Aksiyon Butonları */}
                <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <div>
                    {selectedId !== 'new' && formData.id && (
                      <button
                        type="button"
                        onClick={handleDeleteContact}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                      >
                        <TrashIcon size={14} />
                        <span>{language === 'en' ? 'Delete Contact' : 'Kişiyi Sil'}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(null);
                        setFormError(null);
                      }}
                      className="px-3.5 py-1.5 text-xs font-medium rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                    >
                      {language === 'en' ? 'Cancel' : 'Vazgeç'}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleSaveContact}
                      className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {isSaving
                        ? (language === 'en' ? 'Saving...' : 'Kaydediliyor...')
                        : (language === 'en' ? 'Save Contact' : 'Kişiyi Kaydet')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
