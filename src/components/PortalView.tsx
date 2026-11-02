import { useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from '../App';
import { Close, Download, Flame, Play, Trash } from './Icons';
import { Heatmap } from './Heatmap';
import type { Settings } from '../lib/settings';
import { bestStreak, currentStreak, dailyTotals, totalsBySubject, weeklyTotals } from '../lib/streak';
import { dayKey, formatClock, formatDateLong, formatDateShort, formatDuration, formatHours, parseDayKey } from '../lib/time';
import { downloadBlob, videoFilename } from '../lib/download';
import { deleteSession, getVideo, putSession, type SessionRecord } from '../storage/db';
import { demoSessions } from '../lib/demo';

interface Props {
  sessions: SessionRecord[];
  loaded: boolean;
  settings: Settings;
  onChange: () => void;
  go: (r: Route) => void;
}

export function PortalView({ sessions, loaded, settings, onChange, go }: Props) {
  const [playing, setPlaying] = useState<SessionRecord | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [shown, setShown] = useState(12);

  const today = dayKey(new Date());
  const minMs = settings.streakMinMinutes * 60_000;
  const goalMs = settings.dailyGoalMinutes * 60_000;

  const stats = useMemo(() => {
    const totals = dailyTotals(sessions);
    const weeks = weeklyTotals(totals, today, 8);
    return {
      totals,
      streak: currentStreak(totals, today, minMs),
      best: bestStreak(totals, minMs),
      todayMs: totals.get(today) ?? 0,
      weekMs: weeks[weeks.length - 1].ms,
      weeks,
      subjects: totalsBySubject(sessions),
      totalMs: sessions.reduce((a, s) => a + s.studiedMs, 0),
    };
  }, [sessions, today, minMs]);

  const hasDemo = sessions.some((s) => s.demo);
  const visible = filter ? sessions.filter((s) => (s.subject.trim() || 'Sin asignatura') === filter) : sessions;

  const loadDemo = async () => {
    for (const s of demoSessions(new Date())) await putSession(s);
    onChange();
  };

  const remove = async (s: SessionRecord) => {
    if (!confirm(`¿Borrar la sesión del ${formatDateLong(s.startedAt)}? Se elimina también el vídeo.`)) return;
    await deleteSession(s.id);
    onChange();
  };

  const download = async (s: SessionRecord) => {
    const blob = await getVideo(s.id);
    if (blob) downloadBlob(blob, videoFilename(s.startedAt, s.subject, s.video?.ext ?? 'mp4'));
  };

  if (loaded && sessions.length === 0) {
    return (
      <section className="portal">
        <div className="empty">
          <span className="cover-icon">
            <Flame width={28} height={28} />
          </span>
          <h1>Aquí verás tu progreso</h1>
          <p>
            Cada sesión que grabes aparecerá en este portal con su vídeo. Estudia al menos{' '}
            {settings.streakMinMinutes} minutos al día para encender la racha.
          </p>
          <div className="empty-actions">
            <button className="btn btn-lg" onClick={() => go('estudiar')}>
              <Play width={18} height={18} /> Empezar a estudiar
            </button>
            <button className="btn btn-quiet btn-lg" onClick={loadDemo}>
              Ver con datos de ejemplo
            </button>
          </div>
        </div>
      </section>
    );
  }

  const maxWeek = Math.max(1, ...stats.weeks.map((w) => w.ms));
  const maxSubject = Math.max(1, ...stats.subjects.map((s) => s.ms));
  const todayPct = Math.min(100, Math.round((stats.todayMs / goalMs) * 100));

  return (
    <section className="portal">
      {hasDemo && (
        <div className="banner banner-quiet">
          <div>
            <strong>Estás viendo datos de ejemplo</strong>
            <span>Puedes quitarlos en cualquier momento desde Ajustes.</span>
          </div>
        </div>
      )}

      <div className="stat-row">
        <article className={`stat stat-hero${stats.streak.todayDone ? ' is-done' : ''}`}>
          <p className="stat-label">
            <Flame width={16} height={16} /> Racha actual
          </p>
          <p className="stat-value">
            {stats.streak.days} <small>{stats.streak.days === 1 ? 'día' : 'días'}</small>
          </p>
          <p className="stat-hint">
            {stats.streak.todayDone
              ? 'Hoy ya está. ¡Sigue así!'
              : stats.streak.days > 0
                ? `Te faltan ${formatDuration(Math.max(0, minMs - stats.todayMs))} hoy para no romperla`
                : `Estudia ${settings.streakMinMinutes} min hoy para empezarla`}
          </p>
        </article>
        <article className="stat">
          <p className="stat-label">Mejor racha</p>
          <p className="stat-value">
            {stats.best} <small>{stats.best === 1 ? 'día' : 'días'}</small>
          </p>
        </article>
        <article className="stat">
          <p className="stat-label">Hoy</p>
          <p className="stat-value">{formatDuration(stats.todayMs)}</p>
          <div className="meter" role="progressbar" aria-valuenow={todayPct} aria-valuemin={0} aria-valuemax={100} aria-label="Objetivo diario">
            <span style={{ width: `${todayPct}%` }} />
          </div>
          <p className="stat-hint">
            {todayPct} % de {formatDuration(goalMs)}
          </p>
        </article>
        <article className="stat">
          <p className="stat-label">Esta semana</p>
          <p className="stat-value">{formatHours(stats.weekMs)}</p>
          <p className="stat-hint">Total: {formatHours(stats.totalMs)}</p>
        </article>
      </div>

      <article className="card">
        <header className="card-head">
          <h2>Último año</h2>
          <div className="legend" aria-hidden="true">
            <span>Menos</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <i key={l} className={`hm-l${l}`} />
            ))}
            <span>Más</span>
          </div>
        </header>
        <Heatmap totals={stats.totals} todayKey={today} goalMs={goalMs} />
      </article>

      <div className="two-col">
        <article className="card">
          <header className="card-head">
            <h2>Últimas 8 semanas</h2>
          </header>
          <div className="bars" role="list">
            {stats.weeks.map((w, i) => (
              <div className="bar" role="listitem" key={w.weekStart} aria-label={`Semana del ${formatDateShort(parseDayKey(w.weekStart))}: ${formatHours(w.ms)}`}>
                <span className="bar-value">{w.ms > 0 ? formatHours(w.ms) : ''}</span>
                <span className="bar-track">
                  <span className={`bar-fill${i === stats.weeks.length - 1 ? ' is-current' : ''}`} style={{ height: `${(w.ms / maxWeek) * 100}%` }} />
                </span>
                <span className="bar-label">{parseDayKey(w.weekStart).getDate()}/{parseDayKey(w.weekStart).getMonth() + 1}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <header className="card-head">
            <h2>Por asignatura</h2>
            {filter && (
              <button className="link-quiet" onClick={() => setFilter('')}>
                Quitar filtro
              </button>
            )}
          </header>
          <ul className="hbars">
            {stats.subjects.slice(0, 6).map((s) => (
              <li key={s.subject}>
                <button className={`hbar${filter === s.subject ? ' is-active' : ''}`} onClick={() => {
                    setFilter(filter === s.subject ? '' : s.subject);
                    setShown(12);
                  }}>
                  <span className="hbar-name">{s.subject}</span>
                  <span className="hbar-track">
                    <span style={{ width: `${(s.ms / maxSubject) * 100}%` }} />
                  </span>
                  <span className="hbar-value">{formatHours(s.ms)}</span>
                </button>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <header className="section-head">
        <h2>Sesiones{filter ? ` · ${filter}` : ''}</h2>
        <span className="muted">{visible.length}</span>
      </header>
      <div className="sessions">
        {visible.slice(0, shown).map((s) => (
          <article className="session" key={s.id}>
            <button
              className="thumb"
              onClick={() => s.video && setPlaying(s)}
              disabled={!s.video}
              aria-label={s.video ? `Ver vídeo de la sesión del ${formatDateLong(s.startedAt)}` : 'Sesión sin vídeo'}
            >
              {s.thumb ? (
                <img src={s.thumb} alt="" loading="lazy" />
              ) : (
                <span className="thumb-empty">
                  <strong>{formatClock(s.studiedMs)}</strong>
                  <small>{s.demo ? 'Sesión de ejemplo' : 'Sin vídeo'}</small>
                </span>
              )}
              {s.video && (
                <span className="thumb-play">
                  <Play width={16} height={16} /> {formatClock(s.video.durationMs).replace(/^00:/, '')}
                </span>
              )}
            </button>
            <div className="session-body">
              <p className="session-subject">{s.subject || 'Sin asignatura'}</p>
              <p className="muted">
                {formatDateLong(s.startedAt)} · {new Date(s.startedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <dl className="session-facts">
                <div>
                  <dt>Estudiado</dt>
                  <dd>{formatDuration(s.studiedMs)}</dd>
                </div>
                <div>
                  <dt>Ausente</dt>
                  <dd>{formatDuration(s.absentMs)}</dd>
                </div>
              </dl>
            </div>
            <div className="session-actions">
              {s.video && (
                <button className="icon-btn" onClick={() => download(s)} aria-label="Descargar vídeo" title="Descargar vídeo">
                  <Download />
                </button>
              )}
              <button className="icon-btn" onClick={() => remove(s)} aria-label="Borrar sesión" title="Borrar sesión">
                <Trash />
              </button>
            </div>
          </article>
        ))}
      </div>
      {visible.length > shown && (
        <button className="btn btn-quiet more" onClick={() => setShown((n) => n + 24)}>
          Ver más sesiones ({visible.length - shown})
        </button>
      )}

      {playing && <Player session={playing} onClose={() => setPlaying(null)} onDownload={() => download(playing)} />}
    </section>
  );
}

function Player({ session, onClose, onDownload }: { session: SessionRecord; onClose: () => void; onDownload: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    let u: string | null = null;
    getVideo(session.id).then((b) => {
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [session.id]);

  return (
    <dialog ref={ref} className="player" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="player-inner">
        <header className="player-head">
          <div>
            <p className="session-subject">{session.subject || 'Sin asignatura'}</p>
            <p className="muted">
              {formatDateLong(session.startedAt)} · {formatDuration(session.studiedMs)} estudiados
            </p>
          </div>
          <div className="player-actions">
            <button className="icon-btn" onClick={onDownload} aria-label="Descargar vídeo" title="Descargar vídeo">
              <Download />
            </button>
            <button className="icon-btn" onClick={() => ref.current?.close()} aria-label="Cerrar" autoFocus>
              <Close />
            </button>
          </div>
        </header>
        {url ? <video src={url} controls autoPlay loop playsInline /> : <div className="player-loading"><span className="spinner" /></div>}
      </div>
    </dialog>
  );
}
