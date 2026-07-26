import { FamilyMembersProvider } from './context/FamilyMembersContext';
import { TimerProvider } from './context/TimerContext';
import { useIdleTimer } from './hooks/useIdleTimer';
import Header from './components/Header/Header';
import Dashboard from './components/Dashboard/Dashboard';
import PhotoFrame from './components/PhotoFrame/PhotoFrame';
import './App.css';

const PHOTO_MODE_IDLE_MINUTES = 5;

function AppShell() {
  const idle = useIdleTimer(PHOTO_MODE_IDLE_MINUTES);

  if (idle) {
    return <PhotoFrame />;
  }

  return (
    <div className="app-shell">
      <Header />
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
