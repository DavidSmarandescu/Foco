import { describe, expect, it } from 'vitest';
import { fitSize, shouldCapture, speedup, timelapseDurationMs } from './timelapse';

describe('cámara rápida', () => {
  it('velocidad', () => {
    expect(speedup(2, 30)).toBe(60);
    expect(speedup(5, 30)).toBe(150);
  });
  it('duración del vídeo', () => {
    // 1 h a un fotograma cada 2 s = 1800 fotogramas = 60 s a 30 fps
    expect(timelapseDurationMs(1800, 30)).toBe(60_000);
  });
  it('programación de capturas', () => {
    expect(shouldCapture(null, 0, 2000)).toBe(true);
    expect(shouldCapture(1000, 2999, 2000)).toBe(false);
    expect(shouldCapture(1000, 3000, 2000)).toBe(true);
  });
  it('ajuste a 720p con lados pares', () => {
    expect(fitSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(fitSize(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitSize(1080, 1920)).toEqual({ width: 404, height: 720 });
    expect(fitSize(1281, 721).width % 2).toBe(0);
  });
});
