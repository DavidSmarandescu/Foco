import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';

describe('ajustes', () => {
  it('valores por defecto ante basura', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ presenceMode: 'raro', fps: 'x' })).toEqual(DEFAULT_SETTINGS);
  });
  it('limita rangos', () => {
    const s = sanitizeSettings({ captureIntervalSec: 0, absenceTimeoutSec: 9999, watermark: false });
    expect(s.captureIntervalSec).toBe(0.5);
    expect(s.absenceTimeoutSec).toBe(600);
    expect(s.watermark).toBe(false);
  });
});
