// Todo vive en IndexedDB del navegador: metadatos, fotogramas y vídeos.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PresenceMode } from '../lib/settings';

export type SessionStatus = 'recording' | 'encoding' | 'done' | 'failed';

export interface VideoInfo {
  mime: string;
  ext: string;
  bytes: number;
  durationMs: number;
  width: number;
  height: number;
}

export interface SessionRecord {
  id: string;
  subject: string;
  startedAt: number;
  endedAt: number | null;
  studiedMs: number;
  absentMs: number;
  frameCount: number;
  intervalSec: number;
  fps: number;
  presenceMode: PresenceMode;
  status: SessionStatus;
  /** Miniatura JPEG pequeña como data URL. */
  thumb?: string;
  video?: VideoInfo;
  /** Datos de ejemplo generados para la demo. */
  demo?: boolean;
}

interface FocoDB extends DBSchema {
  sessions: { key: string; value: SessionRecord };
  frames: { key: [string, number]; value: { sessionId: string; index: number; blob: Blob } };
  videos: { key: string; value: { sessionId: string; blob: Blob } };
}

let dbPromise: Promise<IDBPDatabase<FocoDB>> | null = null;

function db() {
  dbPromise ??= openDB<FocoDB>('foco', 1, {
    upgrade(d) {
      d.createObjectStore('sessions', { keyPath: 'id' });
      d.createObjectStore('frames', { keyPath: ['sessionId', 'index'] });
      d.createObjectStore('videos', { keyPath: 'sessionId' });
    },
  });
  return dbPromise;
}

const frameRange = (id: string) => IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);

export async function listSessions(): Promise<SessionRecord[]> {
  const all = await (await db()).getAll('sessions');
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export async function getSession(id: string) {
  return (await db()).get('sessions', id);
}

export async function putSession(s: SessionRecord) {
  await (await db()).put('sessions', s);
}

export async function putFrame(sessionId: string, index: number, blob: Blob) {
  await (await db()).put('frames', { sessionId, index, blob });
}

export async function getFrame(sessionId: string, index: number): Promise<Blob | undefined> {
  return (await (await db()).get('frames', [sessionId, index]))?.blob;
}

export async function countFrames(sessionId: string): Promise<number> {
  return (await db()).count('frames', frameRange(sessionId));
}

export async function deleteFrames(sessionId: string) {
  await (await db()).delete('frames', frameRange(sessionId));
}

export async function putVideo(sessionId: string, blob: Blob) {
  await (await db()).put('videos', { sessionId, blob });
}

export async function getVideo(sessionId: string): Promise<Blob | undefined> {
  return (await (await db()).get('videos', sessionId))?.blob;
}

export async function deleteSession(id: string) {
  const d = await db();
  const tx = d.transaction(['sessions', 'frames', 'videos'], 'readwrite');
  await Promise.all([
    tx.objectStore('sessions').delete(id),
    tx.objectStore('frames').delete(frameRange(id)),
    tx.objectStore('videos').delete(id),
    tx.done,
  ]);
}

export async function deleteAll() {
  const d = await db();
  const tx = d.transaction(['sessions', 'frames', 'videos'], 'readwrite');
  await Promise.all([
    tx.objectStore('sessions').clear(),
    tx.objectStore('frames').clear(),
    tx.objectStore('videos').clear(),
    tx.done,
  ]);
}

/** Importa metadatos de una copia de seguridad sin pisar sesiones existentes. */
export async function importSessions(records: SessionRecord[]): Promise<number> {
  const d = await db();
  const tx = d.transaction('sessions', 'readwrite');
  let added = 0;
  for (const r of records) {
    if (!(await tx.store.get(r.id))) {
      // Los vídeos no viajan en la copia: se importan solo los metadatos.
      await tx.store.put({ ...r, video: undefined, status: r.status === 'done' ? 'done' : 'failed' });
      added++;
    }
  }
  await tx.done;
  return added;
}
