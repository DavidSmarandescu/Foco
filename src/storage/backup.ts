import type { SessionRecord, SessionStatus } from './db';

export const BACKUP_FORMAT = 'foco-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  settings: unknown;
  sessions: SessionRecord[];
}

export function makeBackup(sessions: SessionRecord[], settings: unknown): Backup {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    // Las sesiones a medias no se exportan; los vídeos tampoco (pesan demasiado).
    sessions: sessions.filter((s) => s.status === 'done' || s.status === 'failed'),
  };
}

const STATUSES: SessionStatus[] = ['recording', 'encoding', 'done', 'failed'];

/** Valida una copia de seguridad de origen desconocido. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const b = data as Partial<Backup>;
  if (!b || b.format !== BACKUP_FORMAT || !Array.isArray(b.sessions)) {
    throw new Error('No es una copia de seguridad de Foco.');
  }
  const sessions = b.sessions.filter(
    (s): s is SessionRecord =>
      !!s &&
      typeof s.id === 'string' &&
      typeof s.startedAt === 'number' &&
      typeof s.studiedMs === 'number' &&
      STATUSES.includes(s.status),
  );
  return { format: BACKUP_FORMAT, version: 1, exportedAt: String(b.exportedAt ?? ''), settings: b.settings, sessions };
}
