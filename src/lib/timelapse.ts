// Aritmética de la cámara rápida.

/** Cuántas veces más rápido va el vídeo: un fotograma cada 2 s a 30 fps → 60x. */
export function speedup(intervalSec: number, fps: number): number {
  return intervalSec * fps;
}

/** Duración del vídeo resultante. */
export function timelapseDurationMs(frames: number, fps: number): number {
  return (frames / fps) * 1000;
}

/** Si toca capturar un fotograma nuevo. */
export function shouldCapture(lastCaptureAt: number | null, now: number, intervalMs: number): boolean {
  return lastCaptureAt === null || now - lastCaptureAt >= intervalMs;
}

/**
 * Ajusta las dimensiones de la cámara a un máximo (720p por defecto) sin
 * deformar, con lados pares (H.264 lo exige).
 */
export function fitSize(width: number, height: number, maxW = 1280, maxH = 720): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxW, height: maxH };
  const scale = Math.min(1, maxW / width, maxH / height);
  const even = (n: number) => Math.max(2, Math.floor((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}
