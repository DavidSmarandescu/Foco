import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Flame, Logo, WifiOff } from './components/Icons';
import { StudyView } from './components/StudyView';
import { PortalView } from './components/PortalView';
import { SettingsView } from './components/SettingsView';
import { listSessions, type SessionRecord } from './storage/db';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import { currentStreak, dailyTotals } from './lib/streak';
import { dayKey } from './lib/time';
import { desktop, DOWNLOAD_URL } from './desktop/bridge';
import { discardRestore, enableMirror, findRestoreOffer, restoreFromDisk, scheduleMirror, type RestoreOffer } from './desktop/sync';

export type Route = 'estudiar' | 'portal' | 'ajustes';

const ROUTES: { id: Route; label: string }[] = [
  { id: 'estudiar', label: 'Estudiar' },
  { id: 'portal', label: 'Portal' },
  { id: 'ajustes', label: 'Ajustes' },
];

const readRoute = (): Route => {
  const r = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.some((x) => x.id === r) ? r : 'estudiar';
};

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [restoreOffer, setRestoreOffer] = useState<RestoreOffer | null>(null);
  const [restoring, setRestoring] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSessions(await listSessions());
    } catch (e) {
      console.error(e);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Escritorio: antes de reflejar nada en disco, mira si la carpeta tiene sesiones
  // que este equipo no tiene (p. ej. tras reinstalar) y ofrece recuperarlas.
  useEffect(() => {
    if (!desktop || !loaded) return;
    let cancelled = false;
    findRestoreOffer(sessions).then((offer) => {
      if (cancelled) return;
      if (offer) setRestoreOffer(offer);
      else enableMirror();
    });
    return () => {
      cancelled = true;
    };
    // Solo una vez, con la primera lista de sesiones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    if (loaded) scheduleMirror(sessions, settings);
  }, [loaded, sessions, settings]);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    const onReady = () => setToast('Foco ya funciona sin conexión.');
    const onNet = () => setOnline(navigator.onLine);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('foco:offline-ready', onReady);
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('foco:offline-ready', onReady);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);

  const acceptRestore = async () => {
    if (!restoreOffer) return;
    setRestoring(true);
    try {
      const r = await restoreFromDisk(restoreOffer);
      if (r.settings) setSettings(r.settings);
      setToast(`Recuperadas ${r.sessions} sesiones y ${r.videos} vídeos.`);
    } catch (e) {
      console.error(e);
      setToast('No se pudo restaurar todo desde la carpeta.');
    } finally {
      setRestoreOffer(null);
      setRestoring(false);
      enableMirror();
      refresh();
    }
  };

  const declineRestore = async () => {
    await discardRestore();
    setRestoreOffer(null);
    enableMirror();
  };

  const go = useCallback((r: Route) => {
    location.hash = `/${r}`;
  }, []);

  const finished = useMemo(() => sessions.filter((s) => s.status !== 'recording'), [sessions]);
  const streak = useMemo(
    () => currentStreak(dailyTotals(finished), dayKey(new Date()), settings.streakMinMinutes * 60_000),
    [finished, settings.streakMinMinutes],
  );

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/estudiar" aria-label="Foco, inicio">
          <Logo />
          <span>Foco</span>
        </a>
        <nav className="tabs" aria-label="Secciones">
          {ROUTES.map((r) => (
            <a key={r.id} href={`#/${r.id}`} className="tab" aria-current={route === r.id ? 'page' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
        <div className="topbar-end">
          {!desktop && (
            <a className="pill pill-quiet download-pill" href={DOWNLOAD_URL} target="_blank" rel="noreferrer" title="Foco para Mac, Windows y Linux: tus datos en tu ordenador">
              <Download width={15} height={15} /> <span>Descargar app</span>
            </a>
          )}
          {!online && !desktop && (
            <span className="pill pill-quiet" title="Sin conexión: Foco sigue funcionando">
              <WifiOff width={15} height={15} /> Sin conexión
            </span>
          )}
          <a
            className={`pill streak-pill${streak.todayDone ? ' is-done' : ''}`}
            href="#/portal"
            title={streak.todayDone ? 'Racha de hoy conseguida' : 'Estudia hoy para mantener la racha'}
          >
            <Flame width={16} height={16} />
            <strong>{streak.days}</strong>
            <span className="streak-label">{streak.days === 1 ? 'día' : 'días'}</span>
          </a>
        </div>
      </header>

      <main>
        {restoreOffer && (
          <div className="banner" role="alert">
            <div>
              <strong>
                Hay {restoreOffer.sessions.length} {restoreOffer.sessions.length === 1 ? 'sesión guardada' : 'sesiones guardadas'} en tu carpeta de Foco
              </strong>
              <span>{restoreOffer.dataDir}</span>
            </div>
            <div className="banner-actions">
              <button className="btn btn-quiet" onClick={declineRestore} disabled={restoring}>
                Empezar de cero
              </button>
              <button className="btn" onClick={acceptRestore} disabled={restoring}>
                {restoring ? 'Restaurando…' : 'Restaurar'}
              </button>
            </div>
          </div>
        )}
        {/* La vista de estudio no se desmonta: una sesión en curso sigue grabando aunque mires el portal. */}
        <div hidden={route !== 'estudiar'}>
          <StudyView
            visible={route === 'estudiar'}
            settings={settings}
            sessions={sessions}
            onChange={refresh}
            go={go}
          />
        </div>
        {route === 'portal' && (
          <PortalView sessions={finished} loaded={loaded} settings={settings} onChange={refresh} go={go} />
        )}
        {route === 'ajustes' && (
          <SettingsView settings={settings} setSettings={setSettings} sessions={sessions} onChange={refresh} notify={setToast} />
        )}
      </main>

      <footer className="footer">
        <span>{desktop ? 'Tus vídeos y datos se guardan en tu ordenador.' : 'Tus vídeos y datos no salen de este dispositivo.'}</span>
        <span>Foco · funciona sin conexión</span>
      </footer>

      <div className="toast" role="status" aria-live="polite" data-show={toast ? '' : undefined}>
        {toast}
      </div>
    </div>
  );
}
