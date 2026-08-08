import { db } from '../db/index.js';
import { generateBrief } from './briefService.js';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const TARGET_HOUR = 5;
const TARGET_MINUTE = 30;

let lastRunDate = null;

async function generateAllBriefs(io) {
  const members = db.prepare('SELECT id, family_id FROM family_members').all();
  const affectedFamilies = new Set();
  for (const { id, family_id } of members) {
    await generateBrief(id).catch((err) =>
      console.error(`Morgenbrief: klarte ikke å forhåndsgenerere for medlem ${id}`, err.message)
    );
    affectedFamilies.add(family_id);
  }
  for (const familyId of affectedFamilies) {
    io.to(`family:${familyId}`).emit('brief:update', { all: true });
  }
}

// Pre-genererer dagens Morgenbrief for alle familiemedlemmer kl. 05:30, slik
// at briefen er klar når "God morgen"-kortet vises på dashbordet (05–10).
// Sjekker med jevne mellomrom i stedet for å planlegge et eksakt tidspunkt,
// slik at det tåler at serveren restartes gjennom dagen.
export function startBriefScheduler(io) {
  async function check() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (lastRunDate === today) return;
    const afterTarget =
      now.getHours() > TARGET_HOUR || (now.getHours() === TARGET_HOUR && now.getMinutes() >= TARGET_MINUTE);
    if (!afterTarget) return;
    lastRunDate = today;
    console.log('🌅 Genererer dagens Morgenbrief for alle familiemedlemmer…');
    await generateAllBriefs(io);
  }

  check();
  setInterval(check, CHECK_INTERVAL_MS);
}
