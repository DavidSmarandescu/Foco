// Contabilidad del tiempo de una sesión. Solo suma «estudiado» mientras la
// sesión corre y hay presencia; al detectar ausencia, el tiempo transcurrido
// desde la última vez que se te vio pasa de estudiado a ausente.

export interface ClockState {
  studiedMs: number;
  absentMs: number;
  /** Valor de studiedMs la última vez que se detectó presencia. */
  studiedAtLastSeen: number;
  lastTick: number | null;
}

export const newClock = (studiedMs = 0, absentMs = 0): ClockState => ({
  studiedMs,
  absentMs,
  studiedAtLastSeen: studiedMs,
  lastTick: null,
});

export interface TickInput {
  /** La sesión corre (no está en pausa manual). */
  running: boolean;
  /** Hay presencia (o la detección está desactivada). */
  present: boolean;
}

export function tick(s: ClockState, now: number, { running, present }: TickInput): ClockState {
  const dt = s.lastTick === null ? 0 : Math.max(0, now - s.lastTick);
  if (!running) return { ...s, lastTick: now };
  return present
    ? { ...s, studiedMs: s.studiedMs + dt, lastTick: now }
    : { ...s, absentMs: s.absentMs + dt, lastTick: now };
}

export function markSeen(s: ClockState): ClockState {
  return { ...s, studiedAtLastSeen: s.studiedMs };
}

/** Al pasar a ausente, reclasifica el tramo sin detección como ausencia. */
export function becomeAbsent(s: ClockState): ClockState {
  const moved = Math.max(0, s.studiedMs - s.studiedAtLastSeen);
  return { ...s, studiedMs: s.studiedMs - moved, absentMs: s.absentMs + moved };
}

/** Al reanudar tras una pausa, el siguiente tick no debe sumar el hueco. */
export function resume(s: ClockState, now: number): ClockState {
  return { ...s, lastTick: now, studiedAtLastSeen: s.studiedMs };
}
