import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackup } from '../storage/backup';
import type { SessionRecord } from '../storage/db';

const rec = (id: string, status: SessionRecord['status']): SessionRecord => ({
  id, subject: 'Física', startedAt: 1, endedAt: 2, studiedMs: 1000, absentMs: 0, frameCount: 3,
  intervalSec: 2, fps: 30, presenceMode: 'face+motion', status,
});

describe('copia de seguridad', () => {
  it('ida y vuelta, sin sesiones a medias', () => {
    const b = makeBackup([rec('a', 'done'), rec('b', 'recording')], { fps: 30 });
    const parsed = parseBackup(JSON.stringify(b));
    expect(parsed.sessions.map((s) => s.id)).toEqual(['a']);
  });
  it('rechaza archivos ajenos', () => {
    expect(() => parseBackup('no json')).toThrow('JSON');
    expect(() => parseBackup('{"hola":1}')).toThrow('Foco');
  });
  it('descarta registros mal formados', () => {
    const text = JSON.stringify({ format: 'foco-backup', sessions: [rec('a', 'done'), { id: 3 }, null] });
    expect(parseBackup(text).sessions).toHaveLength(1);
  });
});
