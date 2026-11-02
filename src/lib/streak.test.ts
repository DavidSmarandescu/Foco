import { describe, expect, it } from 'vitest';
import { bestStreak, currentStreak, dailyTotals, heatLevel, heatmapWeeks, totalsBySubject, weeklyTotals } from './streak';
import { parseDayKey } from './time';

const MIN = 60_000;
const at = (key: string, hour = 10) => {
  const d = parseDayKey(key);
  d.setHours(hour);
  return d.getTime();
};
const s = (key: string, minutes: number, subject?: string, hour = 10) => ({ startedAt: at(key, hour), studiedMs: minutes * MIN, subject });

describe('dailyTotals', () => {
  it('suma por día local de inicio', () => {
    const t = dailyTotals([s('2026-11-01', 20), s('2026-11-01', 10, undefined, 23), s('2026-11-02', 5, undefined, 0)]);
    expect(t.get('2026-11-01')).toBe(30 * MIN);
    expect(t.get('2026-11-02')).toBe(5 * MIN);
  });
});

describe('rachas', () => {
  const sessions = [
    s('2026-10-25', 30), // cambio de hora
    s('2026-10-26', 30),
    s('2026-10-27', 30),
    s('2026-10-29', 40),
    s('2026-10-30', 10),
    s('2026-10-30', 20), // 30 en total ese día
    s('2026-10-31', 26),
    s('2026-11-01', 24), // no llega a 25
    s('2026-11-02', 60),
  ];
  const totals = dailyTotals(sessions);

  it('hoy cumplido: cuenta hoy y hacia atrás hasta el primer hueco', () => {
    expect(currentStreak(totals, '2026-11-02', 25 * MIN)).toEqual({ days: 1, todayDone: true });
  });
  it('hoy pendiente: la racha de ayer sigue viva', () => {
    expect(currentStreak(totals, '2026-11-01', 25 * MIN)).toEqual({ days: 3, todayDone: false });
  });
  it('se rompe si ayer no se cumplió', () => {
    expect(currentStreak(totals, '2026-11-03', 25 * MIN).days).toBe(1);
    expect(currentStreak(totals, '2026-11-04', 25 * MIN).days).toBe(0);
  });
  it('suma sesiones del mismo día', () => {
    expect(currentStreak(totals, '2026-10-31', 25 * MIN).days).toBe(3);
  });
  it('mejor racha atravesando el cambio de hora', () => {
    expect(bestStreak(totals, 25 * MIN)).toBe(3);
    expect(bestStreak(totals, 1 * MIN)).toBe(5); // 29 oct → 2 nov (el 28 no hay)
  });
  it('sin datos', () => {
    expect(bestStreak(new Map(), MIN)).toBe(0);
    expect(currentStreak(new Map(), '2026-11-02', MIN).days).toBe(0);
  });
});

describe('heatmap y agregados', () => {
  const totals = dailyTotals([s('2026-11-02', 60), s('2026-10-26', 30)]);
  it('semanas de lunes a domingo terminando en la semana actual', () => {
    const cols = heatmapWeeks(totals, '2026-11-04', 53);
    expect(cols).toHaveLength(53);
    const last = cols[52];
    expect(last[0].key).toBe('2026-11-02');
    expect(last[0].ms).toBe(60 * MIN);
    expect(last[2].future).toBe(false);
    expect(last[3].future).toBe(true);
    expect(cols[51][0].key).toBe('2026-10-26');
  });
  it('niveles respecto al objetivo', () => {
    expect(heatLevel(0, 100)).toBe(0);
    expect(heatLevel(10, 100)).toBe(1);
    expect(heatLevel(50, 100)).toBe(2);
    expect(heatLevel(80, 100)).toBe(3);
    expect(heatLevel(150, 100)).toBe(4);
  });
  it('totales semanales', () => {
    const w = weeklyTotals(totals, '2026-11-04', 3);
    expect(w.map((x) => x.weekStart)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
    expect(w.map((x) => x.ms / MIN)).toEqual([0, 30, 60]);
  });
  it('por asignatura, ordenado', () => {
    const r = totalsBySubject([s('2026-11-02', 10, 'Cálculo'), s('2026-11-02', 30, ' '), s('2026-11-02', 5, 'Cálculo')]);
    expect(r).toEqual([
      { subject: 'Sin asignatura', ms: 30 * MIN },
      { subject: 'Cálculo', ms: 15 * MIN },
    ]);
  });
});
