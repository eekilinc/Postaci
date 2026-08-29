import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { MailProvider, useMail } from './context/MailContext';
import { Sidebar } from './components/Sidebar';
import { EmailList } from './components/EmailList';
import { EmailDetail } from './components/EmailDetail';
import { Composer } from './components/Composer';
import { CalendarView } from './components/CalendarView';
import { ContactsView } from './components/ContactsView';
import { CommandPalette } from './components/CommandPalette';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';

const MainLayout: React.FC = () => {
  const {
    mainTab,
    viewLayout,
    isShortcutsOpen,
    setIsShortcutsOpen,
    openComposer,
    triggerSync,
    setIsSettingsOpen
  } = useMail();

  React.useEffect(() => {
    if ((window as any).electronAPI?.onAppAction) {
      (window as any).electronAPI.onAppAction((action: string) => {
        if (action === 'compose') openComposer();
        else if (action === 'sync') triggerSync();
        else if (action === 'settings') setIsSettingsOpen(true);
      });
    }
  }, [openComposer, triggerSync, setIsSettingsOpen]);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      backgroundColor: 'var(--bg-primary)',
      overflow: 'hidden',
    }}>
      {/* Fixed Left Navigation Sidebar */}
      <Sidebar />

      {/* Main Content Area based on active tab */}
      {mainTab === 'mail' && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: viewLayout === 'split-horizontal' ? 'column' : 'row',
          height: '100%',
          overflow: 'hidden',
        }}>
          <EmailList />
          <EmailDetail />
        </div>
      )}

      {mainTab === 'calendar' && <CalendarView />}

      {mainTab === 'contacts' && <ContactsView />}

      {/* Global Modals & Floating Tools */}
      <Composer />
      <CommandPalette />
      <SettingsModal />
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <MailProvider>
          <MainLayout />
        </MailProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;
