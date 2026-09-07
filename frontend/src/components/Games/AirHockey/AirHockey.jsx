import { useEffect, useRef, useState } from 'react';
import {
  TABLE_WIDTH, TABLE_HEIGHT, PUCK_RADIUS, PADDLE_RADIUS, GOAL_WIDTH, WIN_SCORE,
  createInitialPuck, createInitialPaddles, stepPuck, checkGoal, resolvePaddleCollision, clampPaddleToHalf,
} from './airHockeyPhysics';
import './AirHockey.css';

const GOAL_RESET_DELAY_MS = 700;
const WIN_DELAY_MS = 1200;

function drawCircle(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// Puck/kølle-posisjoner ligger i en ref (IKKE React state) og oppdateres i en
// requestAnimationFrame-loop utenfor Reacts render-syklus - dette er det
// eneste spillet i denne modulen som trenger det, siden det er det eneste
// med sanntids-fysikk. React state brukes kun til det som faktisk skal
// trigge en re-render (stillingen, vinner) - ikke posisjon hver frame.
export default function AirHockey({ players, onGameEnd }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    puck: createInitialPuck(),
    paddles: createInitialPaddles(),
    pointerAssign: { top: null, bottom: null },
    frozen: false,
  });
  const scoreRef = useRef([0, 0]);
  const [score, setScore] = useState([0, 0]);
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    let running = true;
    let lastTop = { ...stateRef.current.paddles.top };
    let lastBottom = { ...stateRef.current.paddles.bottom };
    let rafId;

    function finishGame(winnerIdx) {
      setWinner(winnerIdx);
      const results = [
        { playerIndex: winnerIdx, placement: 1 },
        { playerIndex: winnerIdx === 0 ? 1 : 0, placement: 2 },
      ];
      setTimeout(() => onGameEnd(results), WIN_DELAY_MS);
    }

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const st = stateRef.current;

      ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      ctx.fillStyle = '#eef6fb';
      ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

      ctx.strokeStyle = '#c7d8e3';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, TABLE_HEIGHT / 2);
      ctx.lineTo(TABLE_WIDTH, TABLE_HEIGHT / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(TABLE_WIDTH / 2, TABLE_HEIGHT / 2, 70, 0, Math.PI * 2);
      ctx.stroke();

      const goalLeft = (TABLE_WIDTH - GOAL_WIDTH) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(goalLeft, 0, GOAL_WIDTH, 6);
      ctx.fillRect(goalLeft, TABLE_HEIGHT - 6, GOAL_WIDTH, 6);

      drawCircle(ctx, st.paddles.top.x, st.paddles.top.y, PADDLE_RADIUS, players[0].color);
      drawCircle(ctx, st.paddles.bottom.x, st.paddles.bottom.y, PADDLE_RADIUS, players[1].color);
      drawCircle(ctx, st.puck.x, st.puck.y, PUCK_RADIUS, '#2b2f36');
    }

    function frame() {
      if (!running) return;
      const st = stateRef.current;

      const topVel = { vx: st.paddles.top.x - lastTop.x, vy: st.paddles.top.y - lastTop.y };
      const bottomVel = { vx: st.paddles.bottom.x - lastBottom.x, vy: st.paddles.bottom.y - lastBottom.y };
      lastTop = { ...st.paddles.top };
      lastBottom = { ...st.paddles.bottom };

      if (!st.frozen && winner == null) {
        let puck = stepPuck(st.puck);
        puck = resolvePaddleCollision(puck, st.paddles.top, topVel);
        puck = resolvePaddleCollision(puck, st.paddles.bottom, bottomVel);
        st.puck = puck;

        const goal = checkGoal(puck);
        if (goal) {
          st.frozen = true;
          const scorerIdx = goal === 'top' ? 0 : 1;
          scoreRef.current = scoreRef.current.map((s, i) => (i === scorerIdx ? s + 1 : s));
          setScore(scoreRef.current);
          setTimeout(() => {
            st.puck = createInitialPuck();
            st.frozen = false;
            if (scoreRef.current[scorerIdx] >= WIN_SCORE) {
              finishGame(scorerIdx);
            }
          }, GOAL_RESET_DELAY_MS);
        }
      }

      draw();
      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner]);

  function getTableCoords(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * TABLE_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * TABLE_HEIGHT,
    };
  }

  function handlePointerDown(e) {
    if (winner != null) return;
    const { x, y } = getTableCoords(e);
    const half = y < TABLE_HEIGHT / 2 ? 'top' : 'bottom';
    const st = stateRef.current;
    if (st.pointerAssign[half] == null) {
      st.pointerAssign[half] = e.pointerId;
      canvasRef.current.setPointerCapture(e.pointerId);
      st.paddles[half] = clampPaddleToHalf({ x, y }, half);
    }
  }

  function handlePointerMove(e) {
    const st = stateRef.current;
    const { x, y } = getTableCoords(e);
    if (st.pointerAssign.top === e.pointerId) {
      st.paddles.top = clampPaddleToHalf({ x, y }, 'top');
    } else if (st.pointerAssign.bottom === e.pointerId) {
      st.paddles.bottom = clampPaddleToHalf({ x, y }, 'bottom');
    }
  }

  function handlePointerUp(e) {
    const st = stateRef.current;
    if (st.pointerAssign.top === e.pointerId) st.pointerAssign.top = null;
    if (st.pointerAssign.bottom === e.pointerId) st.pointerAssign.bottom = null;
  }

  return (
    <div className="ah-wrap">
      <div className="ah-score-row">
        <span className="ah-score-chip" style={{ borderColor: players[0].color }}>
          {players[0].avatar} {players[0].name}: {score[0]}
        </span>
        <span className="ah-vs">–</span>
        <span className="ah-score-chip" style={{ borderColor: players[1].color }}>
          {players[1].avatar} {players[1].name}: {score[1]}
        </span>
      </div>
      {winner != null && (
        <div className="ah-winner-banner">🎉 {players[winner].name} vant {WIN_SCORE}–{score[winner === 0 ? 1 : 0]}!</div>
      )}
      <div className="ah-table-wrap">
        <canvas
          ref={canvasRef}
          className="ah-canvas"
          width={TABLE_WIDTH}
          height={TABLE_HEIGHT}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
      <p className="ah-hint">
        {players[0].name} styrer øverst, {players[1].name} styrer nederst – begge kan spille samtidig med hver sin finger.
        Første til {WIN_SCORE} mål vinner.
      </p>
    </div>
  );
}
