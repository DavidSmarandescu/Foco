// Copia en disco para la app de escritorio: cada vídeo terminado se guarda como
// archivo y foco-datos.json refleja las sesiones tras cada cambio. IndexedDB
// sigue siendo el almacén principal; la carpeta permite recuperarlo todo.
import { desktop } from './bridge';
import { makeBackup, parseBackup } from '../storage/backup';
import { getSession, putSession, putVideo, type SessionRecord } from '../storage/db';
import { videoFilename } from '../lib/download';
import { sanitizeSettings, type Settings } from '../lib/settings';

let mirrorReady = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: { sessions: SessionRecord[]; settings: Settings } | null = null;
let writing: Promise<void> = Promise.resolve();

/** Hasta comprobar si hay datos que restaurar no se escribe nada en disco. */
export function enableMirror() {
  mirrorReady = true;
  if (pending) scheduleMirror(pending.sessions, pending.settings);
}

export function scheduleMirror(sessions: SessionRecord[], settings: Settings) {
  if (!desktop) return;
  pending = { sessions, settings };
  if (!mirrorReady) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const data = pending;
    pending = null;
    if (!data) return;
    const json = JSON.stringify(
      makeBackup(
        data.sessions.filter((s) => !s.demo),
        data.settings,
      ),
      null,
      2,
    );
    writing = writing
      .then(() => desktop!.writeData(json))
      .catch((e) => console.error('No se pudo guardar foco-datos.json', e));
  }, 600);
}

/** Guarda el vídeo en la carpeta de Foco. Un fallo aquí no rompe la sesión. */
export async function saveVideoToDisk(session: SessionRecord, blob: Blob, ext: string): Promise<string | undefined> {
  if (!desktop) return undefined;
  try {
    return await desktop.saveVideo(videoFilename(session.startedAt, session.subject, ext), await blob.arrayBuffer());
  } catch (e) {
    console.error('No se pudo guardar el vídeo en disco', e);
    return undefined;
  }
}

export interface RestoreOffer {
  sessions: SessionRecord[];
  settings: unknown;
  dataDir: string;
}

/** Si este equipo no tiene sesiones propias pero la carpeta sí, ofrece restaurarlas. */
export async function findRestoreOffer(local: SessionRecord[]): Promise<RestoreOffer | null> {
  if (!desktop) return null;
  if (local.some((s) => !s.demo)) return null;
  try {
    const text = await desktop.readData();
    if (!text) return null;
    const backup = parseBackup(text);
    const sessions = backup.sessions.filter((s) => !s.demo);
    if (!sessions.length) return null;
    return { sessions, settings: backup.settings, dataDir: (await desktop.info()).dataDir };
  } catch (e) {
    console.error('foco-datos.json no se pudo leer', e);
    return null;
  }
}

/** Restaura sesiones y vídeos desde la carpeta. Devuelve sesiones y vídeos recuperados. */
export async function restoreFromDisk(offer: RestoreOffer): Promise<{ sessions: number; videos: number; settings: Settings | null }> {
  let sessions = 0;
  let videos = 0;
  for (const s of offer.sessions) {
    if (await getSession(s.id)) continue;
    let record: SessionRecord = { ...s, status: s.status === 'done' ? 'done' : 'failed' };
    const bytes = s.file && s.video ? await desktop!.readVideo(s.file).catch(() => null) : null;
    if (bytes && s.video) {
      await putVideo(s.id, new Blob([bytes], { type: s.video.mime }));
      videos++;
    } else {
      record = { ...record, video: undefined };
    }
    await putSession(record);
    sessions++;
  }
  return { sessions, videos, settings: offer.settings ? sanitizeSettings(offer.settings) : null };
}

/** El usuario prefiere empezar de cero: se conserva la copia anterior con otro nombre. */
export async function discardRestore() {
  await desktop?.archiveData().catch((e) => console.error(e));
}
