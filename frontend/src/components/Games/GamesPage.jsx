import { useState } from 'react';
import { GAMES } from './gamesRegistry';
import PlayerSetup from './PlayerSetup';
import './GamesPage.css';

// Egen fullskjerm-modus (som Økonomi) i stedet for et panel under "Mer" –
// spilling skal ikke ha sidepanel/dashboard-distraksjoner rundt seg. Enkel
// tilstandsmaskin: meny -> spilleroppsett -> selve spillet -> resultat.
// Hvert enkelt spill (se gamesRegistry.js) trenger kun å implementere selve
// spill-logikken/brettet og kalle onGameEnd(results) når partiet er ferdig.
export default function GamesPage({ onClose }) {
  const [game, setGame] = useState(null); // valgt rad fra GAMES, eller null = meny
  const [players, setPlayers] = useState(null);
  const [results, setResults] = useState(null); // satt når partiet er ferdig
  const [leaderboard, setLeaderboard] = useState([]);

  function backToMenu() {
    setGame(null);
    setPlayers(null);
    setResults(null);
  }

  function handleGameEnd(rawResults) {
    setResults(rawResults);

    const payload = {
      game_key: game.key,
      players: rawResults.map((r) => {
        const p = players[r.playerIndex];
        return { member_id: p.member_id, guest_name: p.guest_name, placement: r.placement, score: r.score ?? null };
      }),
    };
    fetch('/api/games/results', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});

    fetch(`/api/games/${game.key}/leaderboard`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setLeaderboard)
      .catch(() => setLeaderboard([]));
  }

  function playAgain() {
    setResults(null);
  }

  return (
    <div className="games-overlay">
      <div className="games-shell">
        <button className="games-close" onClick={onClose} aria-label="Lukk Spill">
          ✕
        </button>
        {game && (
          <button className="games-exit" onClick={backToMenu}>
            🚪 Avslutt spill
          </button>
        )}

        {!game && (
          <div className="games-menu">
            <h1 className="games-menu-title">🎮 Spill</h1>
            <p className="games-menu-hint">Velg et spill – alle spilles sammen på denne skjermen.</p>
            <div className="games-grid">
              {GAMES.map((g) => (
                <button key={g.key} className="games-card" onClick={() => setGame(g)}>
                  <span className="games-card-icon">{g.icon}</span>
                  <span className="games-card-name">{g.name}</span>
                  <span className="games-card-players">
                    {g.minPlayers === g.maxPlayers ? `${g.minPlayers} spillere` : `${g.minPlayers}–${g.maxPlayers} spillere`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {game && !players && <PlayerSetup game={game} onBack={backToMenu} onStart={setPlayers} />}

        {game && players && !results && (
          <div className="games-play-area">
            <game.Component players={players} onGameEnd={handleGameEnd} />
          </div>
        )}

        {game && players && results && (
          <div className="games-result">
            <h2 className="games-result-title">
              {results.filter((r) => r.placement === 1).length > 1 ? '🤝 Uavgjort!' : '🏆 Gratulerer!'}
            </h2>
            <div className="games-result-podium">
              {results
                .slice()
                .sort((a, b) => a.placement - b.placement)
                .map((r) => {
                  const p = players[r.playerIndex];
                  return (
                    <div key={r.playerIndex} className={`games-result-row ${r.placement === 1 ? 'games-result-row-winner' : ''}`}>
                      <span className="games-result-avatar" style={{ background: p.color }}>
                        {p.avatar}
                      </span>
                      <span className="games-result-name">{p.name}</span>
                      {r.score != null && <span className="games-result-score">{r.score} poeng</span>}
                    </div>
                  );
                })}
            </div>

            {leaderboard.length > 0 && (
              <div className="games-leaderboard">
                <div className="games-leaderboard-title">Toppliste – {game.name}</div>
                {leaderboard.slice(0, 5).map((m) => (
                  <div key={m.id} className="games-leaderboard-row">
                    <span>{m.avatar} {m.name}</span>
                    <span>{m.wins} seiere ({m.games_played} partier)</span>
                  </div>
                ))}
              </div>
            )}

            <div className="games-result-actions">
              <button className="btn btn-accent" onClick={playAgain}>
                🔁 Spill igjen
              </button>
              <button className="btn" onClick={backToMenu}>
                Nytt spill
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
