// Datos de ejemplo para enseñar el portal sin esperar semanas de uso.
import type { SessionRecord } from '../storage/db';
import { addDays, dayKey, parseDayKey } from './time';

const SUBJECTS = ['Cálculo', 'Contabilidad', 'Estructuras de datos', 'Microeconomía', 'Bases de datos'];

/** Generador pseudoaleatorio con semilla: los datos de demo son estables. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function demoSessions(today: Date, days = 120): SessionRecord[] {
  const rand = rng(42);
  const todayKey = dayKey(today);
  const out: SessionRecord[] = [];
  for (let i = days; i >= 1; i--) {
    const key = addDays(todayKey, -i);
    // Las últimas dos semanas sin huecos para lucir una racha; antes, días sueltos.
    const skip = i > 14 && rand() < 0.28;
    if (skip) continue;
    const n = 1 + Math.floor(rand() * 2.4);
    for (let k = 0; k < n; k++) {
      const start = parseDayKey(key);
      start.setHours(9 + k * 4 + Math.floor(rand() * 3), Math.floor(rand() * 60));
      const studied = (20 + Math.floor(rand() * 85)) * 60_000;
      const absent = Math.floor(rand() * 12) * 60_000;
      const frames = Math.round(studied / 2000);
      out.push({
        id: `demo-${key}-${k}`,
        subject: SUBJECTS[Math.floor(rand() * SUBJECTS.length)],
        startedAt: start.getTime(),
        endedAt: start.getTime() + studied + absent,
        studiedMs: studied,
        absentMs: absent,
        frameCount: frames,
        intervalSec: 2,
        fps: 30,
        presenceMode: 'face+motion',
        status: 'done',
        demo: true,
      });
    }
  }
  return out;
}
