import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from '../App';
import { Camera, Download, Eye, Pause, Play, Shield, Stop, WifiOff } from './Icons';
import { CameraError, openCamera, stopStream } from '../media/camera';
import { loadFaceDetector, PresenceDetector } from '../media/detector';
import { drawFrame } from '../media/overlay';
import { finalizeSession } from '../media/finalize';
import { becomeAbsent, markSeen, newClock, resume, tick, type ClockState } from '../lib/clock';
import { PresenceTracker } from '../lib/presence';
import type { Settings } from '../lib/settings';
import { fitSize, shouldCapture, speedup, timelapseDurationMs } from '../lib/timelapse';
import { formatClock, formatDateLong, formatDuration, formatTimeOfDay } from '../lib/time';
import { downloadBlob, videoFilename } from '../lib/download';
import { deleteSession, getVideo, putFrame, putSession, type SessionRecord } from '../storage/db';

type Phase = 'intro' | 'opening' | 'sleep' | 'error' | 'ready' | 'recording' | 'encoding' | 'done';
type DetectorStatus = 'idle' | 'loading' | 'face' | 'motion';

interface RecState {
  session: SessionRecord;
  clock: ClockState;
  tracker: PresenceTracker;
  paused: boolean;
  frameIndex: number;
  lastCaptureAt: number | null;
  lastSavedAt: number;
  capturing: boolean;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

interface LiveView {
  studiedMs: number;
  absentMs: number;
  frames: number;
  absent: boolean;
  paused: boolean;
}

interface Props {
  visible: boolean;
  settings: Settings;
  sessions: SessionRecord[];
  onChange: () => void;
  go: (r: Route) => void;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const PRESENCE_LABEL: Record<Settings['presenceMode'], string> = {
  'face+motion': 'Cara + movimiento',
  face: 'Solo cara',
  off: 'Desactivada',
};

export function StudyView({ visible, settings, sessions, onChange, go }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<PresenceDetector | null>(null);
  const rec = useRef<RecState | null>(null);
  const settingsRef = useRef(settings);
  const lastDetectAt = useRef(0);
  const lastSeenAt = useRef(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [detector, setDetector] = useState<DetectorStatus>('idle');
  const [seen, setSeen] = useState<boolean | null>(null);
  const [live, setLive] = useState<LiveView | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ session: SessionRecord; url: string | null; blob: Blob | null } | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState<{ id: string; progress: number } | null>(null);

  settingsRef.current = settings;

  // ---------- Cámara ----------

  const enableCamera = useCallback(async () => {
    setError(null);
    setPhase((p) => (p === 'sleep' ? 'sleep' : 'opening'));
    try {
      const stream = await openCamera();
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setPhase('ready');
      if (!detectorRef.current) {
        setDetector('loading');
        const face = await loadFaceDetector();
        detectorRef.current = new PresenceDetector(face);
        setDetector(face ? 'face' : 'motion');
      }
    } catch (e) {
      setError(e instanceof CameraError ? e.message : 'No se pudo abrir la cámara.');
      setPhase('error');
    }
  }, []);

  const releaseCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSeen(null);
  }, []);

  // Si el permiso ya estaba concedido, abre la cámara directamente.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: 'camera' as PermissionName })
      .then((p) => {
        if (!cancelled && p.state === 'granted') enableCamera();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enableCamera]);

  // Fuera de esta pestaña y sin grabar, apaga la cámara; al volver, la reabre.
  useEffect(() => {
    if (!visible && phase === 'ready') {
      releaseCamera();
      setPhase('sleep');
    } else if (visible && phase === 'sleep') {
      enableCamera();
    }
  }, [visible, phase, releaseCamera, enableCamera]);

  useEffect(() => () => stopStream(streamRef.current), []);

  // ---------- Bucle de sesión ----------

  const saveProgress = useCallback((r: RecState) => {
    putSession({
      ...r.session,
      studiedMs: r.clock.studiedMs,
      absentMs: r.clock.absentMs,
      frameCount: r.frameIndex,
    }).catch(console.error);
  }, []);

  const capture = useCallback(
    async (r: RecState, now: number) => {
      const video = videoRef.current;
      if (!video) return;
      r.capturing = true;
      try {
        drawFrame(r.ctx, video, r.width, r.height, {
          now: new Date(now),
          studiedMs: r.clock.studiedMs,
          subject: r.session.subject,
          watermark: settingsRef.current.watermark,
        });
        const blob = await new Promise<Blob | null>((res) => r.canvas.toBlob(res, 'image/jpeg', 0.82));
        if (!blob) return;
        const index = r.frameIndex++;
        await putFrame(r.session.id, index, blob);
        if (index === 0) {
          const t = document.createElement('canvas');
          t.width = 320;
          t.height = Math.round((320 * r.height) / r.width);
          t.getContext('2d')!.drawImage(r.canvas, 0, 0, t.width, t.height);
          r.session = { ...r.session, thumb: t.toDataURL('image/jpeg', 0.7) };
          saveProgress(r);
        }
      } catch (e) {
        console.error('No se pudo guardar el fotograma', e);
      } finally {
        r.capturing = false;
      }
    },
    [saveProgress],
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const video = videoRef.current;
      const st = settingsRef.current;

      let signal: ReturnType<PresenceDetector['check']> | null = null;
      if (video && streamRef.current && detectorRef.current && now - lastDetectAt.current >= 1000) {
        lastDetectAt.current = now;
        signal = detectorRef.current.check(video, st.presenceMode);
        if (signal.seen) lastSeenAt.current = now;
        // El indicador se suaviza 3 s para que no parpadee entre detecciones.
        setSeen(st.presenceMode === 'off' ? null : now - lastSeenAt.current < 3000);
      }

      const r = rec.current;
      if (!r) return;

      const detecting = st.presenceMode !== 'off' && detectorRef.current !== null;
      r.clock = tick(r.clock, now, { running: !r.paused, present: !detecting || r.tracker.state === 'present' });

      if (!r.paused && detecting && signal) {
        if (signal.seen) r.clock = markSeen(r.clock);
        r.tracker.setTimeout(st.absenceTimeoutSec * 1000);
        if (r.tracker.update(now, signal.seen) && r.tracker.state === 'absent') {
          r.clock = becomeAbsent(r.clock);
        }
      }
      const present = !detecting || r.tracker.state === 'present';

      if (
        !r.paused &&
        present &&
        !r.capturing &&
        video &&
        video.readyState >= 2 &&
        shouldCapture(r.lastCaptureAt, now, r.session.intervalSec * 1000)
      ) {
        r.lastCaptureAt = now;
        capture(r, now);
      }

      if (now - r.lastSavedAt >= 5000) {
        r.lastSavedAt = now;
        saveProgress(r);
      }

      setLive({
        studiedMs: r.clock.studiedMs,
        absentMs: r.clock.absentMs,
        frames: r.frameIndex,
        absent: !present,
        paused: r.paused,
      });
    }, 250);
    return () => clearInterval(id);
  }, [capture, saveProgress]);

  // Mantener la pantalla encendida y avisar antes de cerrar la pestaña.
  const requestWakeLock = useCallback(async () => {
    try {
      wakeLock.current = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      wakeLock.current = null;
    }
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const onVis = () => document.visibilityState === 'visible' && requestWakeLock();
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [phase, requestWakeLock]);

  useEffect(() => {
    const base = 'Foco · Estudia en cámara rápida';
    if (phase === 'recording' && live) {
      document.title = `${live.paused ? '⏸' : live.absent ? '◌' : '●'} ${formatClock(live.studiedMs)} · Foco`;
    } else {
      document.title = base;
    }
  }, [phase, live]);

  // ---------- Acciones ----------

  const start = async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const st = settingsRef.current;
    const now = Date.now();
    const session: SessionRecord = {
      id: newId(),
      subject: subject.trim(),
      startedAt: now,
      endedAt: null,
      studiedMs: 0,
      absentMs: 0,
      frameCount: 0,
      intervalSec: st.captureIntervalSec,
      fps: st.fps,
      presenceMode: st.presenceMode,
      status: 'recording',
    };
    await putSession(session);
    const { width, height } = fitSize(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    rec.current = {
      session,
      clock: resume(newClock(), now),
      tracker: new PresenceTracker(st.absenceTimeoutSec * 1000, now),
      paused: false,
      frameIndex: 0,
      lastCaptureAt: null,
      lastSavedAt: now,
      capturing: false,
      canvas,
      ctx: canvas.getContext('2d', { alpha: false })!,
      width,
      height,
    };
    setLive({ studiedMs: 0, absentMs: 0, frames: 0, absent: false, paused: false });
    setPhase('recording');
    requestWakeLock();
    onChange();
  };

  const togglePause = () => {
    const r = rec.current;
    if (!r) return;
    const now = Date.now();
    r.clock = tick(r.clock, now, { running: !r.paused, present: r.tracker.state === 'present' });
    r.paused = !r.paused;
    if (!r.paused) {
      r.clock = resume(r.clock, now);
      r.tracker.reset(now);
    }
    saveProgress(r);
    setLive((l) => (l ? { ...l, paused: r.paused, absent: false } : l));
  };

  const runFinalize = async (session: SessionRecord) => {
    setFinishError(null);
    setProgress(0);
    setPhase('encoding');
    try {
      const done = await finalizeSession(session, setProgress);
      const blob = done.video ? ((await getVideo(done.id)) ?? null) : null;
      setResult({ session: done, blob, url: blob ? URL.createObjectURL(blob) : null });
    } catch (e) {
      setFinishError(
        `No se pudo montar el vídeo (${e instanceof Error ? e.message : 'error desconocido'}). Los fotogramas siguen guardados: puedes reintentarlo.`,
      );
      setResult({ session: { ...session, status: 'failed' }, blob: null, url: null });
    }
    setPhase('done');
    onChange();
  };

  const finish = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    while (r.capturing) await new Promise((res) => setTimeout(res, 50));
    const now = Date.now();
    const clock = tick(r.clock, now, { running: !r.paused, present: r.tracker.state === 'present' });
    const session: SessionRecord = {
      ...r.session,
      studiedMs: clock.studiedMs,
      absentMs: clock.absentMs,
      frameCount: r.frameIndex,
      endedAt: now,
    };
    wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    releaseCamera();
    setLive(null);
    if (session.studiedMs < 5000 && r.frameIndex < 2) {
      await deleteSession(session.id);
      onChange();
      setPhase('sleep');
      enableCamera();
      return;
    }
    await putSession(session);
    await runFinalize(session);
  };

  const newSession = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setFinishError(null);
    setPhase('sleep');
    enableCamera();
  };

  // ---------- Sesiones interrumpidas ----------

  const interrupted = useMemo(
    () =>
      sessions.filter(
        (s) =>
          (s.status === 'recording' || s.status === 'encoding' || (s.status === 'failed' && s.frameCount > 0)) &&
          s.id !== rec.current?.session.id &&
          s.id !== result?.session.id &&
          !(phase === 'encoding' && s.status === 'encoding'),
      ),
    [sessions, result, phase],
  );

  const recover = async (s: SessionRecord) => {
    setRecovering({ id: s.id, progress: 0 });
    try {
      await finalizeSession(s, (p) => setRecovering({ id: s.id, progress: p }));
    } catch {
      /* queda como «failed» y se puede reintentar */
    }
    setRecovering(null);
    onChange();
  };

  const discard = async (s: SessionRecord) => {
    if (!confirm('¿Descartar esta sesión y sus fotogramas? No se puede deshacer.')) return;
    await deleteSession(s.id);
    onChange();
  };

  // ---------- Render ----------

  const st = settings;
  const recording = phase === 'recording' && live;
  const now = new Date();
  const fx = speedup(st.captureIntervalSec, st.fps);

  return (
    <section className="study">
      {interrupted.map((s) => (
        <div className="banner" key={s.id} role="alert">
          <div>
            <strong>Sesión interrumpida</strong>
            <span>
              {formatDateLong(s.startedAt)} · {formatDuration(s.studiedMs)} estudiados · {s.frameCount} fotogramas
              guardados
            </span>
          </div>
          {recovering?.id === s.id ? (
            <div className="progress small" aria-label="Montando vídeo">
              <span style={{ width: `${Math.round(recovering.progress * 100)}%` }} />
            </div>
          ) : (
            <div className="banner-actions">
              <button className="btn btn-quiet" onClick={() => discard(s)} disabled={!!recovering}>
                Descartar
              </button>
              <button className="btn" onClick={() => recover(s)} disabled={!!recovering}>
                Generar vídeo
              </button>
            </div>
          )}
        </div>
      ))}

      <div className="study-grid">
        <div className="stage" data-phase={phase}>
          <video
            ref={videoRef}
            className="stage-video mirror"
            muted
            playsInline
            hidden={phase === 'done' || phase === 'intro' || phase === 'error'}
          />

          {phase === 'intro' && (
            <div className="stage-cover">
              <span className="cover-icon">
                <Camera width={28} height={28} />
              </span>
              <h1>Tu escritorio, en cámara rápida.</h1>
              <p>
                Foco graba tu sesión de estudio con la webcam, le pone la hora encima y te lo devuelve como un vídeo
                acelerado. Mientras, cuenta solo el tiempo que de verdad estás delante.
              </p>
              <ul className="privacy-list">
                <li>
                  <Shield width={16} height={16} /> Nada sale de tu dispositivo: sin cuentas, sin servidores, sin subidas.
                </li>
                <li>
                  <WifiOff width={16} height={16} /> Funciona sin conexión una vez cargada.
                </li>
              </ul>
              <button className="btn btn-lg" onClick={enableCamera}>
                <Camera width={18} height={18} /> Activar cámara
              </button>
              <small>Tu navegador te pedirá permiso para usar la cámara.</small>
            </div>
          )}

          {(phase === 'opening' || phase === 'sleep') && (
            <div className="stage-cover stage-cover-quiet">
              <span className="spinner" aria-hidden="true" />
              <p>Abriendo cámara…</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="stage-cover">
              <span className="cover-icon cover-icon-danger">
                <Camera width={28} height={28} />
              </span>
              <h2>No podemos usar la cámara</h2>
              <p>{error}</p>
              <button className="btn" onClick={enableCamera}>
                Reintentar
              </button>
            </div>
          )}

          {phase === 'ready' && (
            <div className="stage-chip">
              {detector === 'loading' && <span className="chip">Cargando detector…</span>}
              {detector !== 'loading' && st.presenceMode !== 'off' && seen !== null && (
                <span className={`chip ${seen ? 'chip-ok' : 'chip-warn'}`}>
                  <Eye width={14} height={14} /> {seen ? 'Te vemos' : 'No te vemos'}
                </span>
              )}
            </div>
          )}

          {recording && (
            <>
              <div className="stage-chip">
                {live.paused ? (
                  <span className="chip">En pausa</span>
                ) : live.absent ? (
                  <span className="chip chip-warn">Ausente — en pausa</span>
                ) : (
                  <span className="chip chip-rec">
                    <i /> Grabando
                  </span>
                )}
              </div>
              <div className="overlay-preview" aria-hidden="true">
                <span className="op-time">{formatTimeOfDay(now)}</span>
                <span className="op-sub">{formatClock(live.studiedMs)} estudiado</span>
                {subject.trim() && <span className="op-subject">{subject.trim()}</span>}
              </div>
            </>
          )}

          {phase === 'encoding' && (
            <div className="stage-cover stage-cover-quiet">
              <p className="encode-title">Montando tu cámara rápida…</p>
              <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="muted">{Math.round(progress * 100)} %</p>
            </div>
          )}

          {phase === 'done' && result?.url && (
            <video className="stage-video" src={result.url} controls autoPlay loop muted playsInline />
          )}
          {phase === 'done' && !result?.url && (
            <div className="stage-cover stage-cover-quiet">
              <p>{finishError ? 'El vídeo no se pudo generar.' : 'Sesión guardada sin vídeo (no hubo fotogramas).'}</p>
            </div>
          )}
        </div>

        <aside className="panel">
          {(phase === 'intro' || phase === 'error' || phase === 'opening' || phase === 'sleep') && (
            <div className="how">
              <p className="eyebrow">Cómo funciona</p>
              <ol>
                <li>
                  <strong>Activa la cámara</strong> y escribe qué vas a estudiar.
                </li>
                <li>
                  <strong>Estudia.</strong> Si te levantas, el cronómetro se pausa solo.
                </li>
                <li>
                  <strong>Termina</strong> y llévate tu vídeo con la hora sobreimpresa.
                </li>
                <li>
                  <strong>Vuelve mañana</strong> para no romper la racha.
                </li>
              </ol>
            </div>
          )}

          {phase === 'ready' && (
            <div className="ready">
              <label className="field">
                <span>¿Qué vas a estudiar?</span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Cálculo, Contabilidad…"
                  maxLength={60}
                  onKeyDown={(e) => e.key === 'Enter' && start()}
                />
              </label>
              <dl className="facts">
                <div>
                  <dt>Cámara rápida</dt>
                  <dd>
                    1 foto cada {st.captureIntervalSec.toLocaleString('es-ES')} s · {fx}x
                  </dd>
                </div>
                <div>
                  <dt>1 h de estudio</dt>
                  <dd>≈ {formatDuration(timelapseDurationMs(3600 / st.captureIntervalSec, st.fps))} de vídeo</dd>
                </div>
                <div>
                  <dt>Pausa automática</dt>
                  <dd>
                    {st.presenceMode === 'off'
                      ? 'Desactivada'
                      : `${PRESENCE_LABEL[st.presenceMode]} · ${st.absenceTimeoutSec} s`}
                  </dd>
                </div>
              </dl>
              <button className="btn btn-lg btn-block" onClick={start}>
                <Play width={18} height={18} /> Empezar sesión
              </button>
              <a className="link-quiet" href="#/ajustes">
                Cambiar ajustes
              </a>
            </div>
          )}

          {recording && (
            <div className="running">
              <p className="eyebrow">{subject.trim() || 'Sesión de estudio'}</p>
              <p className={`timer${live.absent || live.paused ? ' is-idle' : ''}`} aria-live="off">
                {formatClock(live.studiedMs)}
              </p>
              <p className="timer-caption">tiempo estudiado</p>
              <dl className="facts facts-grid">
                <div>
                  <dt>Ausente</dt>
                  <dd>{formatClock(live.absentMs)}</dd>
                </div>
                <div>
                  <dt>Fotogramas</dt>
                  <dd>{live.frames.toLocaleString('es-ES')}</dd>
                </div>
                <div>
                  <dt>Vídeo</dt>
                  <dd>{formatClock(timelapseDurationMs(live.frames, rec.current?.session.fps ?? st.fps))}</dd>
                </div>
                <div>
                  <dt>Velocidad</dt>
                  <dd>{speedup(rec.current?.session.intervalSec ?? st.captureIntervalSec, rec.current?.session.fps ?? st.fps)}x</dd>
                </div>
              </dl>
              <div className="controls">
                <button className="btn btn-quiet" onClick={togglePause}>
                  {live.paused ? <Play width={18} height={18} /> : <Pause width={18} height={18} />}
                  {live.paused ? 'Reanudar' : 'Pausar'}
                </button>
                <button className="btn" onClick={finish}>
                  <Stop width={16} height={16} /> Terminar
                </button>
              </div>
              {detector === 'motion' && st.presenceMode !== 'off' && (
                <p className="note">Detector de caras no disponible: se usa el movimiento para saber si estás.</p>
              )}
            </div>
          )}

          {phase === 'encoding' && (
            <div className="running">
              <p className="eyebrow">Sesión terminada</p>
              <p className="muted">Se está generando el vídeo en tu dispositivo. No cierres la pestaña.</p>
            </div>
          )}

          {phase === 'done' && result && (
            <div className="done">
              <p className="eyebrow">{finishError ? 'Algo falló' : '¡Sesión guardada!'}</p>
              <p className="timer timer-sm">{formatClock(result.session.studiedMs)}</p>
              <p className="timer-caption">
                estudiado{result.session.subject ? ` · ${result.session.subject}` : ''}
              </p>
              {finishError && <p className="error-text">{finishError}</p>}
              <dl className="facts">
                <div>
                  <dt>Ausente</dt>
                  <dd>{formatDuration(result.session.absentMs)}</dd>
                </div>
                {result.session.video && (
                  <div>
                    <dt>Vídeo</dt>
                    <dd>
                      {formatClock(result.session.video.durationMs)} · {result.session.video.ext.toUpperCase()} ·{' '}
                      {(result.session.video.bytes / 1_048_576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB
                    </dd>
                  </div>
                )}
              </dl>
              {result.blob && (
                <button
                  className="btn btn-block"
                  onClick={() =>
                    downloadBlob(
                      result.blob!,
                      videoFilename(result.session.startedAt, result.session.subject, result.session.video?.ext ?? 'mp4'),
                    )
                  }
                >
                  <Download width={18} height={18} /> Descargar vídeo
                </button>
              )}
              {finishError && (
                <button className="btn btn-block" onClick={() => runFinalize(result.session)}>
                  Reintentar
                </button>
              )}
              <div className="controls">
                <button className="btn btn-quiet" onClick={() => go('portal')}>
                  Ir al portal
                </button>
                <button className="btn btn-quiet" onClick={newSession}>
                  Nueva sesión
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
