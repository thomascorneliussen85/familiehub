import { db } from '../db/index.js';
import { generateWeeklyBrief } from './financeBriefService.js';
import { detectRecurring } from './financeRecurringService.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const TARGET_DAY = 0; // søndag
const TARGET_HOUR = 20;

let lastRunWeek = null;

// Samme "sjekk med jevne mellomrom"-mønster som briefScheduler.js (05:30
// daglig for Morgenbrief), men søndag kl. 20:00 og ukentlig i stedet for
// daglig, siden en ukesbrief før uken egentlig er over gir lite mening.
export function startFinanceBriefScheduler(io) {
  async function check() {
    const now = new Date();
    const weekKey = now.toISOString().slice(0, 10);
    if (lastRunWeek === weekKey) return;
    const isTargetDay = now.getDay() === TARGET_DAY;
    const afterTarget = now.getHours() >= TARGET_HOUR;
    if (!isTargetDay || !afterTarget) return;
    lastRunWeek = weekKey;

    console.log('💰 Genererer ukens økonomibrief for alle familier…');
    const families = db.prepare('SELECT id FROM families').all();
    for (const { id: familyId } of families) {
      try {
        detectRecurring(familyId);
        await generateWeeklyBrief(familyId);
        io.to(`family:${familyId}`).emit('finance-brief:update');
      } catch (err) {
        console.error(`Økonomibrief: klarte ikke å generere for familie ${familyId}`, err.message);
      }
    }
  }

  check();
  setInterval(check, CHECK_INTERVAL_MS);
}
