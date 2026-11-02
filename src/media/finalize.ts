// Cierra una sesión: monta el vídeo con los fotogramas guardados, lo guarda y
// libera los fotogramas. Sirve también para recuperar sesiones interrumpidas.
import { countFrames, deleteFrames, getFrame, putSession, putVideo, type SessionRecord } from '../storage/db';
import { timelapseDurationMs } from '../lib/timelapse';
import { saveVideoToDisk } from '../desktop/sync';

export async function finalizeSession(
  session: SessionRecord,
  onProgress?: (fraction: number) => void,
): Promise<SessionRecord> {
  const frames = await countFrames(session.id);
  const base: SessionRecord = { ...session, endedAt: session.endedAt ?? Date.now(), frameCount: frames };
  if (frames === 0) {
    const done: SessionRecord = { ...base, status: 'done', video: undefined };
    await putSession(done);
    return done;
  }
  await putSession({ ...base, status: 'encoding' });
  try {
    // Mediabunny solo se descarga al terminar la primera sesión.
    const { encodeTimelapse } = await import('./encoder');
    const result = await encodeTimelapse({
      frameCount: frames,
      getFrame: (i) => getFrame(session.id, i),
      fps: session.fps,
      onProgress,
    });
    await putVideo(session.id, result.blob);
    const file = await saveVideoToDisk(base, result.blob, result.ext);
    const done: SessionRecord = {
      ...base,
      status: 'done',
      file,
      video: {
        mime: result.mime,
        ext: result.ext,
        bytes: result.blob.size,
        durationMs: timelapseDurationMs(frames, session.fps),
        width: result.width,
        height: result.height,
      },
    };
    await putSession(done);
    await deleteFrames(session.id);
    return done;
  } catch (e) {
    console.error(e);
    const failed: SessionRecord = { ...base, status: 'failed' };
    await putSession(failed);
    throw e;
  }
}
