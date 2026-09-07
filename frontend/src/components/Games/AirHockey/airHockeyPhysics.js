// Ren fysikk for Airhockey - ingen canvas/DOM her, kun tall inn og tall ut,
// slik at selve bevegelses-/kollisjons-/mål-reglene kan testes uavhengig av
// selve tegne-loopen (som kjører i komponenten via requestAnimationFrame,
// UTENFOR React sin render-loop - posisjoner ligger i refs, ikke state).

export const TABLE_WIDTH = 500;
export const TABLE_HEIGHT = 800;
export const PUCK_RADIUS = 14;
export const PADDLE_RADIUS = 28;
export const GOAL_WIDTH = 160;
export const FRICTION = 0.997;
export const WIN_SCORE = 5;

export function createInitialPuck() {
  return { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT / 2, vx: 0, vy: 0 };
}

export function createInitialPaddles() {
  return {
    top: { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT * 0.15 },
    bottom: { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT * 0.85 },
  };
}

function goalXRange() {
  const left = (TABLE_WIDTH - GOAL_WIDTH) / 2;
  return { left, right: left + GOAL_WIDTH };
}

// Flytter pucken ett steg: posisjon, friksjon, og sprett mot sideveggene samt
// topp-/bunnveggen UTENFOR målåpningen (innenfor målåpningen skal den IKKE
// sprette - det er der checkGoal fanger den opp i stedet).
export function stepPuck(puck) {
  let { x, y, vx, vy } = puck;
  x += vx;
  y += vy;
  vx *= FRICTION;
  vy *= FRICTION;

  if (x - PUCK_RADIUS < 0) {
    x = PUCK_RADIUS;
    vx = Math.abs(vx);
  }
  if (x + PUCK_RADIUS > TABLE_WIDTH) {
    x = TABLE_WIDTH - PUCK_RADIUS;
    vx = -Math.abs(vx);
  }

  const { left, right } = goalXRange();
  const inGoalX = x > left && x < right;
  if (!inGoalX) {
    if (y - PUCK_RADIUS < 0) {
      y = PUCK_RADIUS;
      vy = Math.abs(vy);
    }
    if (y + PUCK_RADIUS > TABLE_HEIGHT) {
      y = TABLE_HEIGHT - PUCK_RADIUS;
      vy = -Math.abs(vy);
    }
  }
  return { x, y, vx, vy };
}

// Returnerer hvilken spiller ('top' eller 'bottom') som SCORER hvis pucken
// akkurat nå er inne i en målåpning - dvs. motstanderens mål ble brutt.
// Bryter pucken toppmålet (y<0 innenfor målbredden) betyr BUNN-spilleren
// scorer (topp-spilleren forsvarte toppmålet og mislyktes).
export function checkGoal(puck) {
  const { left, right } = goalXRange();
  const inGoalX = puck.x > left && puck.x < right;
  if (!inGoalX) return null;
  if (puck.y - PUCK_RADIUS < 0) return 'bottom';
  if (puck.y + PUCK_RADIUS > TABLE_HEIGHT) return 'top';
  return null;
}

// Kollisjon puck<->kølle: skyver pucken ut av overlappet og gir den ny fart
// langs kollisjonsnormalen, pluss litt av køllas egen bevegelse (gjør et
// raskt "smash" merkbart sterkere enn et stillestående dult).
export function resolvePaddleCollision(puck, paddle, paddleVel) {
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const dist = Math.hypot(dx, dy);
  const minDist = PUCK_RADIUS + PADDLE_RADIUS;
  if (dist === 0 || dist >= minDist) return puck;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  const x = puck.x + nx * overlap;
  const y = puck.y + ny * overlap;

  const currentSpeed = Math.hypot(puck.vx, puck.vy);
  const baseSpeed = Math.max(currentSpeed, 4);
  const vx = nx * baseSpeed + (paddleVel?.vx || 0) * 0.5;
  const vy = ny * baseSpeed + (paddleVel?.vy || 0) * 0.5;
  return { x, y, vx, vy };
}

// Holder en kølle innenfor sin egen halvdel av bordet (kan ikke krysse
// midtlinja eller gå av kanten), slik at spillerne ikke kan "stjele"
// motstanderens halvdel.
export function clampPaddleToHalf(pos, half) {
  const x = Math.min(TABLE_WIDTH - PADDLE_RADIUS, Math.max(PADDLE_RADIUS, pos.x));
  let y;
  if (half === 'top') {
    y = Math.min(TABLE_HEIGHT / 2 - PADDLE_RADIUS, Math.max(PADDLE_RADIUS, pos.y));
  } else {
    y = Math.min(TABLE_HEIGHT - PADDLE_RADIUS, Math.max(TABLE_HEIGHT / 2 + PADDLE_RADIUS, pos.y));
  }
  return { x, y };
}
