// Formatos de tiempo y claves de día. Los días son siempre LOCALES: una sesión
// a las 00:30 cuenta para el día del calendario del usuario, no para el UTC.

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 3 723 000 → "01:02:03". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** Duración legible: "45 s", "25 min", "1 h 05 min". */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60000);
  if (totalMin === 0) return `${Math.floor(Math.max(0, ms) / 1000)} s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${pad2(m)} min`;
}

/** Horas con un decimal y coma: "12,5 h". */
export function formatHours(ms: number): string {
  const h = Math.max(0, ms) / 3_600_000;
  return `${h.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: h < 10 && h % 1 !== 0 ? 1 : 0 })} h`;
}

/** Hora del día "HH:MM:SS". */
export function formatTimeOfDay(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Clave de día local "YYYY-MM-DD". */
export function dayKey(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Medianoche local del día indicado. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Suma días de calendario (inmune a los cambios de hora). */
export function addDays(key: string, n: number): string {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Lunes de la semana del día dado. */
export function weekStart(key: string): string {
  const d = parseDayKey(key);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  return addDays(key, -dow);
}

const longDate = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

/** "lun, 2 nov 2026". */
export function formatDateLong(d: Date | number): string {
  return longDate.format(typeof d === 'number' ? new Date(d) : d);
}

/** "lun, 2 nov". */
export function formatDateShort(d: Date | number): string {
  return shortDate.format(typeof d === 'number' ? new Date(d) : d);
}
