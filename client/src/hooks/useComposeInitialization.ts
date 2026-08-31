import { useEffect, useRef } from 'react';

// Reinitializing when accounts/stats refresh would erase the message being edited.
export function useComposeInitialization<T>(open: boolean, data: T, initialize: () => void) {
  const session = useRef<{ data: T }>();
  useEffect(() => {
    if (!open) { session.current = undefined; return; }
    if (session.current && session.current.data === data) return;
    session.current = { data };
    initialize();
  }, [open, data, initialize]);
}
