// Detección de presencia: señales por fotograma y máquina de estados con
// tolerancia, para no pausar por un parpadeo del detector.

/** RGBA → escala de grises (luminancia aproximada). */
export function toGray(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return out;
}

/** Fracción de píxeles que cambian más de `threshold` entre dos fotogramas. */
export function motionScore(prev: Uint8Array, cur: Uint8Array, threshold = 28): number {
  if (prev.length !== cur.length || cur.length === 0) return 0;
  let changed = 0;
  for (let i = 0; i < cur.length; i++) {
    if (Math.abs(cur[i] - prev[i]) > threshold) changed++;
  }
  return changed / cur.length;
}

export type PresenceState = 'present' | 'absent';

export class PresenceTracker {
  private lastSeenAt: number;
  state: PresenceState = 'present';

  constructor(
    private timeoutMs: number,
    now: number,
  ) {
    this.lastSeenAt = now;
  }

  setTimeout(ms: number) {
    this.timeoutMs = ms;
  }

  /** Reinicia como presente (al empezar o reanudar). */
  reset(now: number) {
    this.lastSeenAt = now;
    this.state = 'present';
  }

  /** Devuelve true si el estado cambia. */
  update(now: number, seen: boolean): boolean {
    if (seen) this.lastSeenAt = now;
    const next: PresenceState = seen || now - this.lastSeenAt <= this.timeoutMs ? 'present' : 'absent';
    const changed = next !== this.state;
    this.state = next;
    return changed;
  }
}
