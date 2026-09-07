import './GamesWidget.css';

// Nivå 1: enkel invitasjonsflis på dashbordet, samme mønster som
// FinanceWidget – selve spillingen skjer i den fullskjerms GamesPage-en
// (åpnes via onOpen, tråes gjennom Dashboard -> App.jsx som onOpenGames).
export default function GamesWidget({ onOpen }) {
  return (
    <section className="panel panel-games" onClick={onOpen} role="button" tabIndex={0}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🎮</span> Spill
        </div>
      </div>
      <div className="panel-body">
        <div className="games-widget-hint">Fire på rad og flere spill – spill sammen på skjermen 🎲</div>
      </div>
    </section>
  );
}
