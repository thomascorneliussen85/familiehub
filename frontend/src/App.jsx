import { useState } from 'react';
import { FamilyMembersProvider } from './context/FamilyMembersContext';
import { TimerProvider } from './context/TimerContext';
import { useIdleTimer } from './hooks/useIdleTimer';
import Header from './components/Header/Header';
import Dashboard from './components/Dashboard/Dashboard';
import PhotoFrame from './components/PhotoFrame/PhotoFrame';
import FriendPlayToast from './components/PlayOutside/FriendPlayToast';
import SettingsModal from './components/Settings/SettingsModal';
import PairingPendingBanner from './components/Settings/PairingPendingBanner';
import './App.css';

const PHOTO_MODE_IDLE_MINUTES = 5;

function AppShell() {
  const idle = useIdleTimer(PHOTO_MODE_IDLE_MINUTES);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (idle) {
    return <PhotoFrame />;
  }

  return (
    <div className="app-shell">
      <FriendPlayToast />
      {!settingsOpen && <PairingPendingBanner onOpenSettings={() => setSettingsOpen(true)} />}
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      <Dashboard />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <FamilyMembersProvider>
      <TimerProvider>
        <AppShell />
      </TimerProvider>
    </FamilyMembersProvider>
  );
}
