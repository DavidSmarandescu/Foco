import { describe, expect, it } from 'vitest';
import { addDays, dayKey, formatClock, formatDuration, formatTimeOfDay, weekStart } from './time';

describe('formatos', () => {
  it('formatClock', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(3_723_000)).toBe('01:02:03');
    expect(formatClock(-5)).toBe('00:00:00');
  });
  it('formatDuration', () => {
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(25 * 60_000)).toBe('25 min');
    expect(formatDuration(65 * 60_000)).toBe('1 h 05 min');
  });
  it('formatTimeOfDay', () => {
    expect(formatTimeOfDay(new Date(2026, 10, 2, 9, 5, 7))).toBe('09:05:07');
  });
});

describe('días locales', () => {
  it('usa la fecha local, no UTC', () => {
    // 00:30 hora local del 3 de noviembre: en UTC sigue siendo día 2.
    expect(dayKey(new Date(2026, 10, 3, 0, 30))).toBe('2026-11-03');
  });
  it('addDays cruza meses, años y cambios de hora', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-26', -1)).toBe('2026-10-25'); // fin del horario de verano en Europa
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // inicio del horario de verano
  });
  it('weekStart devuelve el lunes', () => {
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // lunes
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // domingo
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
  });
});
