import Clock from '../Clock/Clock';
import VoiceButton from '../VoiceControl/VoiceButton';
import './Header.css';

export default function Header({ onOpenKids }) {
  return (
    <header className="app-header">
      <div className="app-header-brand">
        <span className="app-header-logo">🏠</span>
        <span className="app-header-title">FamilieHub</span>
      </div>
      <div className="app-header-right">
        <button type="button" className="app-header-kids-btn" onClick={onOpenKids}>
          🧒 Barnas oppgaver
        </button>
        <VoiceButton />
        <Clock />
      </div>
    </header>
  );
}
