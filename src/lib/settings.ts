// Ajustes del usuario, guardados en el navegador.

export type PresenceMode = 'face+motion' | 'face' | 'off';

export interface Settings {
  /** Segundos entre fotogramas de la cámara rápida. */
  captureIntervalSec: number;
  fps: number;
  presenceMode: PresenceMode;
  /** Segundos sin detectarte antes de pausar. */
  absenceTimeoutSec: number;
  /** Minutos mínimos al día para mantener la racha. */
  streakMinMinutes: number;
  dailyGoalMinutes: number;
  watermark: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  captureIntervalSec: 2,
  fps: 30,
  presenceMode: 'face+motion',
  absenceTimeoutSec: 20,
  streakMinMinutes: 25,
  dailyGoalMinutes: 120,
  watermark: true,
};

const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Valida datos de origen desconocido (localStorage, copias de seguridad). */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const modes: PresenceMode[] = ['face+motion', 'face', 'off'];
  return {
    captureIntervalSec: clampNum(r.captureIntervalSec, 0.5, 60, d.captureIntervalSec),
    fps: clampNum(r.fps, 10, 60, d.fps),
    presenceMode: modes.includes(r.presenceMode as PresenceMode) ? (r.presenceMode as PresenceMode) : d.presenceMode,
    absenceTimeoutSec: clampNum(r.absenceTimeoutSec, 5, 600, d.absenceTimeoutSec),
    streakMinMinutes: clampNum(r.streakMinMinutes, 1, 600, d.streakMinMinutes),
    dailyGoalMinutes: clampNum(r.dailyGoalMinutes, 5, 960, d.dailyGoalMinutes),
    watermark: typeof r.watermark === 'boolean' ? r.watermark : d.watermark,
  };
}

const KEY = 'foco.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* almacenamiento no disponible: los ajustes duran lo que la pestaña */
  }
}
