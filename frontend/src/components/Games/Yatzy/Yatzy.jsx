import { useState } from 'react';
import {
  CATEGORIES, MAX_ROLLS, scoreCategory, computeUpperSum, computeBonus, computeTotal,
  isScorecardFull, createEmptyScorecard,
} from './yatzyLogic';
import './Yatzy.css';

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function Yatzy({ players, onGameEnd }) {
  const [scorecards, setScorecards] = useState(() => players.map(() => createEmptyScorecard()));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [dice, setDice] = useState([1, 1, 1, 1, 1]);
  const [held, setHeld] = useState([false, false, false, false, false]);
  const [rollsLeft, setRollsLeft] = useState(MAX_ROLLS);
  const [turnStarted, setTurnStarted] = useState(false);

  function rollDice() {
    if (rollsLeft <= 0) return;
    setDice((prev) => prev.map((v, i) => (held[i] ? v : 1 + Math.floor(Math.random() * 6))));
    setRollsLeft((n) => n - 1);
    setTurnStarted(true);
  }

  function toggleHold(i) {
    if (!turnStarted || rollsLeft <= 0) return;
    setHeld((prev) => prev.map((h, idx) => (idx === i ? !h : h)));
  }

  function pickCategory(key) {
    if (!turnStarted || scorecards[currentIdx][key] != null) return;
    const score = scoreCategory(key, dice);
    const next = scorecards.map((sc, i) => (i === currentIdx ? { ...sc, [key]: score } : sc));
    setScorecards(next);
    advanceTurn(next);
  }

  function advanceTurn(updated) {
    if (updated.every(isScorecardFull)) {
      const totals = updated.map(computeTotal);
      const maxTotal = Math.max(...totals);
      const results = players.map((_, i) => ({
        playerIndex: i,
        placement: totals[i] === maxTotal ? 1 : 2,
        score: totals[i],
      }));
      setTimeout(() => onGameEnd(results), 900);
      return;
    }
    setDice([1, 1, 1, 1, 1]);
    setHeld([false, false, false, false, false]);
    setRollsLeft(MAX_ROLLS);
    setTurnStarted(false);
    setCurrentIdx((i) => (i + 1) % players.length);
  }

  const current = players[currentIdx];
  const upperCats = CATEGORIES.filter((c) => c.section === 'upper');
  const lowerCats = CATEGORIES.filter((c) => c.section === 'lower');

  return (
    <div className="yz-wrap">
      <div className="yz-turn-banner" style={{ borderLeftColor: current.color }}>
        <span className="yz-turn-avatar">{current.avatar}</span>
        {current.name} sin tur
      </div>

      <div className="yz-dice-row">
        {dice.map((v, i) => (
          <button
            key={i}
            className={`yz-die ${held[i] ? 'yz-die-held' : ''}`}
            onClick={() => toggleHold(i)}
            disabled={!turnStarted || rollsLeft <= 0}
            aria-label={`Terning ${i + 1}: ${v}${held[i] ? ', holdt' : ''}`}
          >
            {DICE_FACES[v]}
          </button>
        ))}
        <button className="btn btn-accent yz-roll-btn" onClick={rollDice} disabled={rollsLeft <= 0}>
          🎲 Kast ({rollsLeft} igjen)
        </button>
      </div>

      <div className="yz-table-wrap">
        <table className="yz-table">
          <thead>
            <tr>
              <th className="yz-corner" />
              {players.map((p, i) => (
                <th key={i} className={i === currentIdx ? 'yz-col-active' : ''}>
                  <span style={{ color: p.color }}>{p.avatar} {p.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {upperCats.map((c) => (
              <ScoreRow
                key={c.key}
                category={c}
                players={players}
                scorecards={scorecards}
                currentIdx={currentIdx}
                dice={dice}
                turnStarted={turnStarted}
                onPick={pickCategory}
              />
            ))}
            <tr className="yz-subtotal-row">
              <td>Sum</td>
              {players.map((p, i) => (
                <td key={i}>{computeUpperSum(scorecards[i])}</td>
              ))}
            </tr>
            <tr className="yz-subtotal-row">
              <td>Bonus (63+)</td>
              {players.map((p, i) => (
                <td key={i}>{computeBonus(scorecards[i]) || '–'}</td>
              ))}
            </tr>
            {lowerCats.map((c) => (
              <ScoreRow
                key={c.key}
                category={c}
                players={players}
                scorecards={scorecards}
                currentIdx={currentIdx}
                dice={dice}
                turnStarted={turnStarted}
                onPick={pickCategory}
              />
            ))}
            <tr className="yz-total-row">
              <td>Totalt</td>
              {players.map((p, i) => (
                <td key={i}>{computeTotal(scorecards[i])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreRow({ category, players, scorecards, currentIdx, dice, turnStarted, onPick }) {
  return (
    <tr>
      <td className="yz-row-label">{category.label}</td>
      {players.map((p, i) => {
        const filled = scorecards[i][category.key];
        if (filled != null) {
          return <td key={i}>{filled}</td>;
        }
        if (i === currentIdx && turnStarted) {
          return (
            <td key={i}>
              <button className="yz-pick-btn" onClick={() => onPick(category.key)}>
                {scoreCategory(category.key, dice)}
              </button>
            </td>
          );
        }
        return (
          <td key={i} className="yz-empty-cell">
            –
          </td>
        );
      })}
    </tr>
  );
}
