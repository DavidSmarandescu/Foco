import { useEffect, useRef, useState } from 'react';
import { Shield } from './Icons';
import { sanitizeSettings, type PresenceMode, type Settings } from '../lib/settings';
import { speedup, timelapseDurationMs } from '../lib/timelapse';
import { formatDuration } from '../lib/time';
import { downloadBlob } from '../lib/download';
import { deleteAll, deleteSession, importSessions, type SessionRecord } from '../storage/db';
import { makeBackup, parseBackup } from '../storage/backup';
import { desktop, DOWNLOAD_URL } from '../desktop/bridge';

interface Props {
  settings: Settings;
  setSettings: (s: Settings) => void;
  sessions: SessionRecord[];
  onChange: () => void;
  notify: (msg: string) => void;
}

const fmtBytes = (n: number) =>
  n >= 1_073_741_824
    ? `${(n / 1_073_741_824).toLocaleString('es-ES', { maximumFractionDigits: 1 })} GB`
    : `${Math.round(n / 1_048_576).toLocaleString('es-ES')} MB`;

export function SettingsView({ settings, setSettings, sessions, onChange, notify }: Props) {
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [dataDir, setDataDir] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshStorage = async () => {
    try {
      const est = await navigator.storage?.estimate();
      if (est) setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
      setPersisted((await navigator.storage?.persisted?.()) ?? null);
    } catch {
      setStorage(null);
    }
  };

  useEffect(() => {
    refreshStorage();
  }, [sessions]);

  useEffect(() => {
    desktop?.info().then((i) => setDataDir(i.dataDir), () => setDataDir(null));
  }, []);

  const changeDir = async () => {
    try {
      const dir = await desktop!.chooseDataDir();
      if (!dir) return;
      setDataDir(dir);
      onChange(); // vuelve a escribir foco-datos.json en la carpeta nueva
      notify('Carpeta cambiada. Los vídeos guardados se han copiado allí.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo usar esa carpeta.');
    }
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings({ ...settings, [key]: value });

  const persist = async () => {
    const ok = (await navigator.storage?.persist?.()) ?? false;
    setPersisted(ok);
    notify(ok ? 'Tus datos están protegidos frente a la limpieza automática.' : 'El navegador no ha concedido el almacenamiento persistente.');
  };

  const exportBackup = () => {
    const data = makeBackup(sessions, settings);
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `foco-copia-${date}.json`);
  };

  const importBackup = async (file: File) => {
    try {
      const backup = parseBackup(await file.text());
      const added = await importSessions(backup.sessions);
      if (backup.settings) setSettings(sanitizeSettings(backup.settings));
      onChange();
      notify(`Importadas ${added} sesiones nuevas.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo importar la copia.');
    }
  };

  const removeDemo = async () => {
    for (const s of sessions.filter((x) => x.demo)) await deleteSession(s.id);
    onChange();
    notify('Datos de ejemplo eliminados.');
  };

  const wipe = async () => {
    const msg = desktop
      ? '¿Borrar TODAS las sesiones de Foco? Los vídeos ya guardados en tu carpeta no se tocan.'
      : '¿Borrar TODAS las sesiones y vídeos de este dispositivo? No se puede deshacer.';
    if (!confirm(msg)) return;
    await deleteAll();
    onChange();
    notify('Todo borrado.');
  };

  const fx = speedup(settings.captureIntervalSec, settings.fps);
  const demoCount = sessions.filter((s) => s.demo).length;
  const usedPct = storage && storage.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0;

  return (
    <section className="settings">
      <h1 className="page-title">Ajustes</h1>

      <article className="card">
        <header className="card-head">
          <h2>Cámara rápida</h2>
        </header>
        <div className="form-grid">
          <label className="field">
            <span>Una foto cada</span>
            <select value={settings.captureIntervalSec} onChange={(e) => set('captureIntervalSec', Number(e.target.value))}>
              {[1, 2, 3, 5, 10].map((s) => (
                <option key={s} value={s}>
                  {s} s ({speedup(s, settings.fps)}x)
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Fotogramas por segundo del vídeo</span>
            <select value={settings.fps} onChange={(e) => set('fps', Number(e.target.value))}>
              {[24, 30, 60].map((f) => (
                <option key={f} value={f}>
                  {f} fps
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">
          A {fx}x, una hora de estudio se convierte en {formatDuration(timelapseDurationMs(3600 / settings.captureIntervalSec, settings.fps))} de vídeo. Se
          aplica a la próxima sesión.
        </p>
        <label className="switch">
          <input type="checkbox" checked={settings.watermark} onChange={(e) => set('watermark', e.target.checked)} />
          <span>
            Marca de agua «Foco» en el vídeo <em className="badge">Pro</em>
          </span>
        </label>
      </article>

      <article className="card">
        <header className="card-head">
          <h2>Pausa automática</h2>
        </header>
        <div className="form-grid">
          <label className="field">
            <span>Detectar presencia con</span>
            <select value={settings.presenceMode} onChange={(e) => set('presenceMode', e.target.value as PresenceMode)}>
              <option value="face+motion">Cara y movimiento (recomendado)</option>
              <option value="face">Solo cara</option>
              <option value="off">Desactivada</option>
            </select>
          </label>
          <label className="field">
            <span>Pausar tras no verte durante</span>
            <select
              value={settings.absenceTimeoutSec}
              onChange={(e) => set('absenceTimeoutSec', Number(e.target.value))}
              disabled={settings.presenceMode === 'off'}
            >
              {[10, 20, 30, 60, 120].map((s) => (
                <option key={s} value={s}>
                  {s < 60 ? `${s} s` : `${s / 60} min`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">
          La detección se hace en tu dispositivo con un modelo de visión incluido en la app. «Cara y movimiento» es más
          tolerante cuando miras hacia abajo para escribir.
        </p>
      </article>

      <article className="card">
        <header className="card-head">
          <h2>Racha y objetivo</h2>
        </header>
        <div className="form-grid">
          <label className="field">
            <span>Mínimo diario para la racha</span>
            <select value={settings.streakMinMinutes} onChange={(e) => set('streakMinMinutes', Number(e.target.value))}>
              {[10, 15, 25, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Objetivo diario</span>
            <select value={settings.dailyGoalMinutes} onChange={(e) => set('dailyGoalMinutes', Number(e.target.value))}>
              {[30, 60, 90, 120, 180, 240, 300, 360].map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m * 60_000)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      <article className="card">
        <header className="card-head">
          <h2>Tus datos</h2>
        </header>
        {desktop ? (
          <>
            <p className="privacy">
              <Shield width={18} height={18} />
              Todo se guarda en tu ordenador. Cada vídeo se copia como archivo y tus sesiones, en foco-datos.json, en
              esta carpeta. Si reinstalas Foco, la app te ofrecerá recuperarlas desde aquí.
            </p>
            {dataDir && <p className="path-box">{dataDir}</p>}
            <div className="button-row">
              <button className="btn btn-quiet" onClick={() => desktop!.openDataDir()}>
                Abrir carpeta
              </button>
              <button className="btn btn-quiet" onClick={changeDir}>
                Cambiar carpeta
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="privacy">
              <Shield width={18} height={18} />
              Tus datos viven en este navegador. Foco no tiene servidores: si borras los datos del sitio (al borrar las
              cookies, por ejemplo) o cambias de dispositivo, se pierden. Haz copias o usa la app de escritorio, que los
              guarda en una carpeta de tu ordenador.
            </p>
            <div className="button-row">
              <a className="btn btn-quiet" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                Descargar app de escritorio
              </a>
            </div>
          </>
        )}
        {storage && (
          <div className="storage">
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${Math.max(1, usedPct)}%` }} />
            </div>
            <p className="hint">
              Usando {fmtBytes(storage.usage)} de {fmtBytes(storage.quota)} disponibles
              {persisted === true ? ' · almacenamiento protegido' : ''}
            </p>
          </div>
        )}
        <div className="button-row">
          {!desktop && persisted !== true && (
            <button className="btn btn-quiet" onClick={persist}>
              Proteger mis datos
            </button>
          )}
          <button className="btn btn-quiet" onClick={exportBackup}>
            Exportar copia (JSON)
          </button>
          <button className="btn btn-quiet" onClick={() => fileRef.current?.click()}>
            Importar copia
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importBackup(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="hint">La copia incluye sesiones, rachas y ajustes. Los vídeos se descargan aparte desde el portal.</p>
        <div className="button-row danger-zone">
          {demoCount > 0 && (
            <button className="btn btn-quiet" onClick={removeDemo}>
              Quitar datos de ejemplo ({demoCount})
            </button>
          )}
          <button className="btn btn-danger" onClick={wipe}>
            Borrar todo
          </button>
        </div>
      </article>
    </section>
  );
}
