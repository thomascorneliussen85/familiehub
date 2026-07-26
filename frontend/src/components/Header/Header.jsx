import Clock from '../Clock/Clock';
import VoiceButton from '../VoiceControl/VoiceButton';
import './Header.css';

export default function Header() {
  return (
    <header className="app-header">
      <div className="app-header-brand">
        <span className="app-header-logo">🏠</span>
        <span className="app-header-title">FamilieHub</span>
      </div>
      <div className="app-header-right">
        <VoiceButton />
        <Clock />
      </div>
    </header>
  );
}
