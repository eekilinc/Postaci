import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: Toast = { ...toast, id };

    setToasts(prev => [...prev, newToast]);

    const duration = toast.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const success = (message: string, title?: string) => showToast({ type: 'success', message, title });
  const error = (message: string, title?: string) => showToast({ type: 'error', message, title });
  const info = (message: string, title?: string) => showToast({ type: 'info', message, title });

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      {/* Toast Render Portal */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '380px',
        pointerEvents: 'none',
      }}>
        {toasts.map(toast => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          return (
            <div
              key={toast.id}
              className="animate-slide-in"
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-secondary)',
                border: `1px solid ${
                  isSuccess ? '#10b98160' : isError ? '#ef444460' : isWarning ? '#f59e0b60' : 'var(--border-medium)'
                }`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                color: 'var(--text-primary)',
                fontSize: '14px',
              }}
            >
              <div style={{ flexShrink: 0, marginTop: '2px' }}>
                {isSuccess && <CheckCircle2 size={18} color="#10b981" />}
                {isError && <AlertCircle size={18} color="#ef4444" />}
                {isWarning && <AlertCircle size={18} color="#f59e0b" />}
                {!isSuccess && !isError && !isWarning && <Info size={18} color="var(--accent-primary)" />}
              </div>

              <div style={{ flex: 1 }}>
                {toast.title && (
                  <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '2px' }}>
                    {toast.title}
                  </div>
                )}
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.4 }}>
                  {toast.message}
                </div>
                {toast.action && (
                  <button
                    onClick={() => {
                      toast.action?.onClick();
                      removeToast(toast.id);
                    }}
                    style={{
                      marginTop: '8px',
                      background: 'var(--accent-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  lineHeight: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};
