import { describe, expect, it } from 'vitest';
import { motionScore, PresenceTracker, toGray } from './presence';
import { becomeAbsent, markSeen, newClock, resume, tick } from './clock';

describe('señales', () => {
  it('toGray', () => {
    expect([...toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))]).toEqual([255, 0]);
  });
  it('motionScore', () => {
    const a = new Uint8Array([0, 0, 0, 0]);
    const b = new Uint8Array([0, 100, 10, 200]);
    expect(motionScore(a, b, 28)).toBe(0.5);
    expect(motionScore(a, new Uint8Array(3))).toBe(0);
  });
});

describe('PresenceTracker', () => {
  it('tolera huecos menores que el límite y pausa después', () => {
    const t = new PresenceTracker(20_000, 0);
    expect(t.update(10_000, false)).toBe(false);
    expect(t.state).toBe('present');
    expect(t.update(20_001, false)).toBe(true);
    expect(t.state).toBe('absent');
    expect(t.update(25_000, true)).toBe(true);
    expect(t.state).toBe('present');
  });
});

describe('reloj de estudio', () => {
  it('suma estudiado con presencia y nada en pausa manual', () => {
    let c = newClock();
    c = tick(c, 0, { running: true, present: true });
    c = tick(c, 1000, { running: true, present: true });
    c = tick(c, 5000, { running: false, present: true });
    c = tick(c, 6000, { running: true, present: true });
    expect(c.studiedMs).toBe(2000);
    expect(c.absentMs).toBe(0);
  });
  it('al pasar a ausente reclasifica el tramo sin detección', () => {
    let c = newClock();
    c = tick(c, 0, { running: true, present: true });
    c = tick(c, 10_000, { running: true, present: true });
    c = markSeen(c); // visto a los 10 s
    c = tick(c, 31_000, { running: true, present: true }); // 21 s sin verte
    c = becomeAbsent(c);
    expect(c.studiedMs).toBe(10_000);
    expect(c.absentMs).toBe(21_000);
    c = tick(c, 41_000, { running: true, present: false });
    expect(c.absentMs).toBe(31_000);
  });
  it('resume no suma el hueco de la pausa', () => {
    let c = tick(newClock(), 0, { running: true, present: true });
    c = resume(c, 100_000);
    c = tick(c, 101_000, { running: true, present: true });
    expect(c.studiedMs).toBe(1000);
  });
});
