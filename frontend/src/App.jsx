import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/Auth/LoginPage';
import SignupPage from './components/Auth/SignupPage';
import { FamilyMembersProvider } from './context/FamilyMembersContext';
import { TimerProvider } from './context/TimerContext';
import { PinnedCameraProvider } from './context/PinnedCameraContext';
import { PanelNavigationProvider } from './context/PanelNavigationContext';
import { useIdleTimer } from './hooks/useIdleTimer';
import { useTimeOfDay } from './hooks/useTimeOfDay';
import Sidebar from './components/Sidebar/Sidebar';
import Dashboard from './components/Dashboard/Dashboard';
import PhotoFrame from './components/PhotoFrame/PhotoFrame';
import FriendPlayToast from './components/PlayOutside/FriendPlayToast';
import SettingsModal from './components/Settings/SettingsModal';
import PairingPendingBanner from './components/Settings/PairingPendingBanner';
import FloatingCameraView from './components/Cameras/FloatingCameraView';
import './App.css';

const PHOTO_MODE_IDLE_MINUTES = 5;

function AppShell() {
  const idle = useIdleTimer(PHOTO_MODE_IDLE_MINUTES);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calendarConnectMsg, setCalendarConnectMsg] = useState('');
  const { isDark } = useTimeOfDay();

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('calendar_connect');
    if (result === 'ok') {
      setCalendarConnectMsg('Kalender koblet til ✓');
    } else if (result === 'error') {
      setCalendarConnectMsg('Klarte ikke å koble til kalenderen. Prøv igjen fra ⚙️ → Kalendere.');
    }
    if (result) {
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setCalendarConnectMsg(''), 6000);
    }
  }, []);

  if (idle) {
    return <PhotoFrame />;
  }

  return (
    <div className="app-shell">
      <FriendPlayToast />
      {calendarConnectMsg && <div className="calendar-connect-toast">{calendarConnectMsg}</div>}
      {!settingsOpen && <PairingPendingBanner onOpenSettings={() => setSettingsOpen(true)} />}
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="app-main">
        <Dashboard onOpenSettings={() => setSettingsOpen(true)} />
      </main>
      <FloatingCameraView />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function MainApp() {
  return (
    <FamilyMembersProvider>
      <TimerProvider>
        <PinnedCameraProvider>
          <PanelNavigationProvider>
            <AppShell />
          </PanelNavigationProvider>
        </PinnedCameraProvider>
      </TimerProvider>
    </FamilyMembersProvider>
  );
}

function Routed() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/signup" element={user ? <Navigate to="/" replace /> : <SignupPage />} />
      <Route path="*" element={user ? <MainApp /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routed />
      </AuthProvider>
    </BrowserRouter>
  );
}
