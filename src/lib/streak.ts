// Rachas y agregados. Una sesión cuenta para el día local en que empezó.
import { addDays, dayKey, parseDayKey, weekStart } from './time';

export interface StudyLike {
  startedAt: number;
  studiedMs: number;
  subject?: string;
}

export type DailyTotals = Map<string, number>;

export function dailyTotals(sessions: StudyLike[]): DailyTotals {
  const totals: DailyTotals = new Map();
  for (const s of sessions) {
    const k = dayKey(s.startedAt);
    totals.set(k, (totals.get(k) ?? 0) + s.studiedMs);
  }
  return totals;
}

const met = (totals: DailyTotals, key: string, minMs: number) => (totals.get(key) ?? 0) >= minMs;

export interface CurrentStreak {
  /** Días consecutivos cumplidos. */
  days: number;
  /** Si hoy ya se ha cumplido el mínimo. */
  todayDone: boolean;
}

/**
 * La racha sigue viva aunque hoy aún no se haya cumplido: cuenta hacia atrás
 * desde ayer. Solo se rompe si ayer tampoco se cumplió.
 */
export function currentStreak(totals: DailyTotals, todayKey: string, minMs: number): CurrentStreak {
  const todayDone = met(totals, todayKey, minMs);
  let key = todayDone ? todayKey : addDays(todayKey, -1);
  let days = 0;
  while (met(totals, key, minMs)) {
    days++;
    key = addDays(key, -1);
  }
  return { days, todayDone };
}

export function bestStreak(totals: DailyTotals, minMs: number): number {
  const keys = [...totals.keys()].filter((k) => met(totals, k, minMs)).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of keys) {
    run = prev !== null && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export interface HeatCell {
  key: string;
  ms: number;
  future: boolean;
}

/** Columnas de semanas (lunes a domingo) que terminan en la semana de hoy. */
export function heatmapWeeks(totals: DailyTotals, todayKey: string, weeks = 53): HeatCell[][] {
  const first = addDays(weekStart(todayKey), -7 * (weeks - 1));
  const cols: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(first, w * 7 + d);
      col.push({ key, ms: totals.get(key) ?? 0, future: key > todayKey });
    }
    cols.push(col);
  }
  return cols;
}

/** Nivel 0–4 de intensidad respecto al objetivo diario. */
export function heatLevel(ms: number, goalMs: number): 0 | 1 | 2 | 3 | 4 {
  if (ms <= 0) return 0;
  const r = ms / Math.max(1, goalMs);
  if (r < 0.34) return 1;
  if (r < 0.67) return 2;
  if (r < 1) return 3;
  return 4;
}

export interface WeekTotal {
  weekStart: string;
  ms: number;
}

/** Totales de las últimas `n` semanas, de la más antigua a la actual. */
export function weeklyTotals(totals: DailyTotals, todayKey: string, n = 8): WeekTotal[] {
  const current = weekStart(todayKey);
  const out: WeekTotal[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const ws = addDays(current, -7 * i);
    let ms = 0;
    for (let d = 0; d < 7; d++) ms += totals.get(addDays(ws, d)) ?? 0;
    out.push({ weekStart: ws, ms });
  }
  return out;
}

export const NO_SUBJECT = 'Sin asignatura';

export function totalsBySubject(sessions: StudyLike[]): { subject: string; ms: number }[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    const name = s.subject?.trim() || NO_SUBJECT;
    map.set(name, (map.get(name) ?? 0) + s.studiedMs);
  }
  return [...map.entries()].map(([subject, ms]) => ({ subject, ms })).sort((a, b) => b.ms - a.ms);
}

/** Días transcurridos (inclusive) entre dos claves; útil para etiquetas. */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((parseDayKey(toKey).getTime() - parseDayKey(fromKey).getTime()) / 86_400_000);
}
