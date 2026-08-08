import Clock from '../Clock/Clock';
import VoiceButton from '../VoiceControl/VoiceButton';
import FeedbackButton from '../Feedback/FeedbackButton';
import './Header.css';

export default function Header({ onOpenSettings }) {
  return (
    <header className="app-header">
      <div className="app-header-brand">
        <span className="app-header-logo">🏠</span>
        <span className="app-header-title">FamilieHub</span>
      </div>
      <div className="app-header-right">
        <VoiceButton />
        <FeedbackButton />
        <Clock />
        <button className="app-header-settings" onClick={onOpenSettings} aria-label="Innstillinger">
          ⚙️
        </button>
      </div>
    </header>
  );
}
