import { useState } from 'react';
import { FamilyMembersProvider } from './context/FamilyMembersContext';
import { TimerProvider } from './context/TimerContext';
import { useIdleTimer } from './hooks/useIdleTimer';
import Header from './components/Header/Header';
import Dashboard from './components/Dashboard/Dashboard';
import PhotoFrame from './components/PhotoFrame/PhotoFrame';
import KidsTasksPage from './components/KidsTasks/KidsTasksPage';
import './App.css';

const PHOTO_MODE_IDLE_MINUTES = 5;

function AppShell() {
  const idle = useIdleTimer(PHOTO_MODE_IDLE_MINUTES);
  const [view, setView] = useState('dashboard');

  if (idle) {
    return <PhotoFrame />;
  }

  if (view === 'kids') {
    return <KidsTasksPage onBack={() => setView('dashboard')} />;
  }

  return (
    <div className="app-shell">
      <Header onOpenKids={() => setView('kids')} />
      <Dashboard />
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
