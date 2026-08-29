import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Users,
  Trash2,
  Edit2,
  X,
  Sparkles,
  CalendarCheck,
  Check
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useMail } from '../context/MailContext';
import { CalendarEvent } from '../types';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths
} from 'date-fns';
import { tr } from 'date-fns/locale';

export const CalendarView: React.FC = () => {
  const { emails } = useMail();
  const { success, error, info } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Form Fields
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newTime, setNewTime] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [newColor, setNewColor] = useState('#3b82f6');
  const [isAllDay, setIsAllDay] = useState(false);

  const loadEvents = async () => {
    try {
      const data = await api.getCalendarEvents();
      setEvents(data);
    } catch {
      console.error('Failed to load events');
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const daysInMonth = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const handleOpenCreateModal = () => {
    setEditingEventId(null);
    setNewTitle('');
    setNewDescription('');
    setNewLocation('');
    setNewTime('10:00');
    setDurationMinutes(60);
    setNewColor('#3b82f6');
    setIsAllDay(false);
    setIsEventModalOpen(true);
  };

  const handleOpenEditModal = (ev: CalendarEvent) => {
    setEditingEventId(ev.id);
    setNewTitle(ev.title);
    setNewDescription(ev.description || '');
    setNewLocation(ev.location || '');
    const startTimeDate = new Date(ev.startTime);
    setNewTime(format(startTimeDate, 'HH:mm'));
    setNewColor(ev.color || '#3b82f6');
    setIsAllDay(Boolean(ev.isAllDay));
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = async () => {
    if (!newTitle.trim()) {
      error('Lütfen bir etkinlik başlığı girin.');
      return;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const [hours, mins] = newTime.split(':').map(Number);
    const startObj = new Date(selectedDate);
    startObj.setHours(hours || 10, mins || 0, 0, 0);

    const endObj = new Date(startObj.getTime() + durationMinutes * 60 * 1000);

    try {
      if (editingEventId) {
        await api.updateCalendarEvent(editingEventId, {
          title: newTitle,
          description: newDescription,
          location: newLocation,
          startTime: startObj.toISOString(),
          endTime: endObj.toISOString(),
          color: newColor,
          isAllDay,
        });
        success('Etkinlik güncellendi!');
      } else {
        await api.createCalendarEvent({
          title: newTitle,
          description: newDescription,
          location: newLocation,
          startTime: startObj.toISOString(),
          endTime: endObj.toISOString(),
          color: newColor,
          isAllDay,
        });
        success('Etkinlik takvime eklendi!');
      }

      setIsEventModalOpen(false);
      loadEvents();
    } catch {
      error('Etkinlik kaydedilemedi.');
    }
  };

  const handleDeleteEvent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Bu etkinliği takvimden silmek istediğinizden emin misiniz?')) {
      try {
        await api.deleteCalendarEvent(id);
        success('Etkinlik silindi.');
        loadEvents();
      } catch {
        error('Etkinlik silinemedi.');
      }
    }
  };

  // Sync Meeting Invites from parsed emails
  const handleSyncInvitesFromEmails = async () => {
    let synced = 0;
    for (const em of emails) {
      if (em.meetingInvite && !events.some(ev => ev.emailId === em.id || (ev.uid && ev.uid === em.meetingInvite?.uid))) {
        try {
          await api.createCalendarEvent({
            uid: em.meetingInvite.uid,
            title: em.meetingInvite.summary || em.subject || 'Toplantı Daveti',
            description: em.meetingInvite.description || em.snippet,
            location: em.meetingInvite.location || 'Online / Video Konferans',
            startTime: em.meetingInvite.startTime || em.date,
            endTime: em.meetingInvite.endTime || new Date(new Date(em.date).getTime() + 3600000).toISOString(),
            color: '#8b5cf6',
            status: 'CONFIRMED',
            emailId: em.id,
            organizer: em.meetingInvite.organizer ? { name: em.meetingInvite.organizer.name || '', email: em.meetingInvite.organizer.email } : undefined,
            attendees: (em.meetingInvite.attendees || []).map(a => ({ name: a.name || '', email: a.email })),
          });
          synced++;
        } catch {}
      }
    }

    if (synced > 0) {
      success(`${synced} toplantı daveti e-postalardan takvime aktarıldı!`);
      loadEvents();
    } else {
      info('E-postalardan eklenecek yeni davet bulunamadı.');
    }
  };

  const selectedDateEvents = events.filter(ev => {
    try {
      return isSameDay(new Date(ev.startTime), selectedDate);
    } catch {
      return false;
    }
  });

  return (
    <section style={{
      flex: 1,
      height: '100%',
      backgroundColor: 'var(--bg-primary)',
      display: 'flex',
      overflow: 'hidden',
    }}>
      {/* Main Calendar View Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--border-subtle)',
        padding: '24px',
        overflowY: 'auto',
      }}>
        {/* Calendar Top Navigation Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, textTransform: 'capitalize' }}>
              {format(currentDate, 'MMMM yyyy', { locale: tr })}
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-secondary)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                title="Önceki Ay"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                Bugün
              </button>
              <button
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                title="Sonraki Ay"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSyncInvitesFromEmails}
              title="E-postalardaki Toplantı Davetlerini Senkronize Et"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Sparkles size={14} color="#8b5cf6" />
              <span>Davetleri Eşitle</span>
            </button>

            <button
              onClick={handleOpenCreateModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={15} />
              <span>Yeni Etkinlik</span>
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px',
          marginBottom: '8px',
          textAlign: 'center',
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--text-muted)',
        }}>
          {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map(d => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Month Days Grid */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridAutoRows: 'minmax(96px, 1fr)',
          gap: '8px',
        }}>
          {daysInMonth.map(day => {
            const isDaySelected = isSameDay(day, selectedDate);
            const isCurrentDay = isToday(day);
            const isThisMonth = isSameMonth(day, currentDate);

            const dayEvents = events.filter(ev => {
              try {
                return isSameDay(new Date(ev.startTime), day);
              } catch {
                return false;
              }
            });

            return (
              <div
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                style={{
                  backgroundColor: isDaySelected ? 'var(--bg-active)' : 'var(--bg-secondary)',
                  border: `1px solid ${isCurrentDay ? 'var(--accent-primary)' : isDaySelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  cursor: 'pointer',
                  opacity: isThisMonth ? 1 : 0.4,
                  minHeight: '88px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: isCurrentDay ? 700 : isDaySelected ? 600 : 500,
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: isCurrentDay ? 'var(--accent-primary)' : 'transparent',
                    color: isCurrentDay ? 'white' : 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {format(day, 'd')}
                  </span>
                  {dayEvents.length > 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {dayEvents.length} etkn
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                  {dayEvents.slice(0, 3).map(ev => (
                    <div
                      key={ev.id}
                      title={`${ev.title} (${ev.startTime ? format(new Date(ev.startTime), 'HH:mm') : ''})`}
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: `${ev.color || '#3b82f6'}20`,
                        color: ev.color || '#3b82f6',
                        borderLeft: `2px solid ${ev.color || '#3b82f6'}`,
                        padding: '2px 4px',
                        borderRadius: '2px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                      +{dayEvents.length - 3} daha
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Agenda Sidebar */}
      <div style={{
        width: '340px',
        backgroundColor: 'var(--bg-secondary)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px', textTransform: 'capitalize' }}>
          {format(selectedDate, 'd MMMM yyyy, EEEE', { locale: tr })}
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
          Günün Etkinlikleri ({selectedDateEvents.length})
        </p>

        {selectedDateEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
            Bu tarihte planlanmış bir etkinlik bulunmuyor.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {selectedDateEvents.map(ev => (
              <div
                key={ev.id}
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderLeft: `4px solid ${ev.color}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {ev.title}
                  </h4>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => handleOpenEditModal(ev)}
                      title="Etkinliği Düzenle"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={e => handleDeleteEvent(ev.id, e)}
                      title="Etkinliği Sil"
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', padding: '2px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <Clock size={13} />
                  <span>{format(new Date(ev.startTime), 'HH:mm')} - {format(new Date(ev.endTime), 'HH:mm')}</span>
                </div>

                {ev.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <MapPin size={13} />
                    <span>{ev.location}</span>
                  </div>
                )}

                {ev.description && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {ev.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New/Edit Event Modal */}
      {isEventModalOpen && (
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
                {editingEventId ? 'Etkinliği Düzenle' : 'Yeni Takvim Etkinliği'}
              </h3>
              <button
                onClick={() => setIsEventModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Etkinlik Başlığı *
              </label>
              <input
                type="text"
                placeholder="Örn: Proje Mimarisi Değerlendirmesi"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
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
                  Başlangıç Saati
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
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
                  Süre
                </label>
                <select
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                >
                  <option value={15}>15 Dakika</option>
                  <option value={30}>30 Dakika</option>
                  <option value={45}>45 Dakika</option>
                  <option value={60}>1 Saat</option>
                  <option value={120}>2 Saat</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Konum / Toplantı Linki
              </label>
              <input
                type="text"
                placeholder="Örn: Google Meet / Ofis Toplantı Odası A"
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
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
                Renk Kategorisi
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: c,
                      border: newColor === c ? '2px solid white' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {newColor === c && <Check size={14} color="white" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Açıklama
              </label>
              <textarea
                rows={3}
                placeholder="Etkinlik gündemi ve detayları..."
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
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
                onClick={() => setIsEventModalOpen(false)}
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
                onClick={handleSaveEvent}
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
                {editingEventId ? 'Değişiklikleri Kaydet' : 'Etkinliği Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
