import { useEffect, useRef } from 'react';
import { CheckIcon, CloseIcon, ShieldIcon } from './icons';

interface ToastProps {
  message: string;
  type: 'notice' | 'error';
  onClose: () => void;
  accent?: string;
  loading?: boolean;
}

export function Toast({ message, type, onClose, accent = '#6366f1', loading = false }: ToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loading) return;
    timerRef.current = setTimeout(onClose, type === 'error' ? 12000 : 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [message, type, onClose, loading]);

  const isError = type === 'error';

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        borderRadius: '0.75rem',
        minWidth: '260px',
        maxWidth: '480px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
        background: isError
          ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
          : `linear-gradient(135deg, ${accent}, ${accent}cc)`,
        color: '#fff',
        fontSize: '0.875rem',
        fontWeight: 500,
        animation: 'toast-in 0.25s ease-out',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {loading ? (
          <span
            style={{
              width: '16px',
              height: '16px',
              border: '2px solid rgba(255,255,255,0.35)',
              borderTopColor: '#ffffff',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.75s linear infinite',
            }}
          />
        ) : isError ? (
          <ShieldIcon size={16} />
        ) : (
          <CheckIcon size={16} strokeWidth={2.5} />
        )}
      </span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{message}</span>
      <button
        onClick={onClose}
        aria-label="Bildirimi kapat"
        style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)',
          cursor: 'pointer', padding: '0 0.25rem', display: 'flex', alignItems: 'center', flexShrink: 0,
        }}
      >
        <CloseIcon size={14} />
      </button>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translate(-50%, 1rem); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
