// Prueba de la app de escritorio (Electron) con cámara falsa: graba una sesión,
// comprueba que el MP4 y foco-datos.json llegan a la carpeta, y que una
// instalación nueva ofrece restaurarlos (y apartarlos si se empieza de cero).
// Uso: npm run build && npm run e2e:desktop (en Linux sin pantalla: xvfb-run -a npm run e2e:desktop)
const { _electron } = require('playwright');
const electronPath = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const dataDir = tmp('foco-data-');
const log = (...a) => console.log('·', ...a);
const errs = [];
let failed = false;
const check = (ok, msg) => {
  console.log(ok ? '  ✓' : '  ✗', msg);
  if (!ok) failed = true;
};

async function launch(userData) {
  const app = await _electron.launch({
    executablePath: electronPath,
    // --no-sandbox solo porque el contenedor de pruebas corre como root.
    args: [ROOT, ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
    env: { ...process.env, FOCO_TEST: '1', FOCO_DATA_DIR: dataDir, FOCO_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text());
  });
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

(async () => {
  // 1) Sesión real en una instalación nueva
  {
    const { app, page } = await launch(tmp('foco-ud-'));
    const settings = { captureIntervalSec: 0.5, fps: 30, presenceMode: 'face+motion', absenceTimeoutSec: 20, streakMinMinutes: 1, dailyGoalMinutes: 30, watermark: true };
    await page.evaluate((s) => localStorage.setItem('foco.settings.v1', JSON.stringify(s)), settings);
    await page.reload();
    log('url:', page.url(), '| título:', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()));
    check(!!(await page.evaluate(() => window.focoDesktop && typeof window.focoDesktop.saveVideo === 'function')), 'puente focoDesktop disponible');
    check(!(await page.evaluate(() => 'process' in window || 'require' in window)), 'sin Node en la página');
    check((await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length, () => 0))) === 0, 'sin service worker en escritorio');
    check((await page.locator('.download-pill').count()) === 0, 'sin enlace «Descargar app» en escritorio');

    await page.getByRole('button', { name: 'Empezar sesión' }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);
    log('detector:', await page.locator('.stage-chip').innerText().catch(() => '-'));
    check((await page.evaluate(() => navigator.wakeLock?.request('screen').then((l) => (l.release(), 'ok'), (e) => e.name))) === 'ok', 'pantalla encendida (wake lock)');
    await page.getByLabel('¿Qué vas a estudiar?').fill('Cálculo');
    await page.getByRole('button', { name: 'Empezar sesión' }).click();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${SHOTS}/app-escritorio-grabando.png` });
    await page.waitForTimeout(14000);
    await page.getByRole('button', { name: 'Terminar' }).click();
    await page.getByText('¡Sesión guardada!').waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    log('panel:', (await page.locator('.done').innerText()).replace(/\n/g, ' | '));
    await page.screenshot({ path: `${SHOTS}/app-escritorio-terminado.png` });

    const videos = fs.readdirSync(path.join(dataDir, 'videos'));
    log('vídeos en disco:', videos.join(', '));
    check(videos.length === 1 && /^foco-.*-calculo\.mp4$/.test(videos[0]), 'MP4 guardado en la carpeta');
    const mp4 = fs.readFileSync(path.join(dataDir, 'videos', videos[0]));
    check(mp4.subarray(4, 8).toString() === 'ftyp', `el archivo es un MP4 (${(mp4.length / 1024).toFixed(0)} KB)`);
    await page.waitForTimeout(1500);
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'foco-datos.json'), 'utf8'));
    check(data.format === 'foco-backup' && data.sessions.length === 1 && data.sessions[0].file === videos[0], 'foco-datos.json con la sesión y su vídeo');

    await page.goto('app://foco/index.html#/ajustes');
    await page.waitForTimeout(800);
    check((await page.locator('.path-box').innerText()) === dataDir, 'Ajustes muestra la carpeta');
    await page.locator('.card', { hasText: 'Tus datos' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/app-escritorio-ajustes.png` });

    // Navegar fuera de la app debe estar bloqueado.
    await page.evaluate(() => (location.href = 'https://example.com/'));
    await page.waitForTimeout(800);
    check(page.url().startsWith('app://foco/'), 'navegación externa bloqueada');
    // Rutas fuera de dist/ no se sirven.
    check((await page.evaluate(() => fetch('app://foco/..%2Fpackage.json').then((r) => r.status))) === 403, 'el protocolo no sale de dist/');
    await app.close();
  }

  // 2) Instalación nueva con la misma carpeta → restaurar
  {
    const { app, page } = await launch(tmp('foco-ud-'));
    const banner = page.locator('.banner', { hasText: 'carpeta de Foco' });
    await banner.waitFor({ timeout: 15000 });
    log('aviso:', (await banner.innerText()).replace(/\n/g, ' | '));
    await page.screenshot({ path: `${SHOTS}/app-escritorio-restaurar.png` });
    await banner.getByRole('button', { name: 'Restaurar' }).click();
    await page.waitForTimeout(1500);
    await page.goto('app://foco/index.html#/portal');
    await page.waitForTimeout(1000);
    check((await page.locator('.session').count()) === 1, 'sesión restaurada en el portal');
    log('racha:', await page.locator('.streak-pill').innerText());
    await page.locator('.thumb').first().click();
    await page.waitForTimeout(2000);
    const pv = await page.evaluate(() => {
      const v = document.querySelector('dialog video');
      return v && { dur: v.duration, w: v.videoWidth, err: v.error && v.error.code };
    });
    log('reproductor:', JSON.stringify(pv));
    check(!!pv && pv.dur > 0 && !pv.err, 'el vídeo restaurado se reproduce');
    await page.keyboard.press('Escape');
    await app.close();
  }

  // 3) Instalación nueva → empezar de cero aparta la copia
  {
    const { app, page } = await launch(tmp('foco-ud-'));
    const banner = page.locator('.banner', { hasText: 'carpeta de Foco' });
    await banner.waitFor({ timeout: 15000 });
    await banner.getByRole('button', { name: 'Empezar de cero' }).click();
    await page.waitForTimeout(2000);
    const names = fs.readdirSync(dataDir);
    log('carpeta:', names.join(', '));
    check(names.some((n) => n.startsWith('foco-datos-anterior-')), 'copia anterior apartada');
    const fresh = JSON.parse(fs.readFileSync(path.join(dataDir, 'foco-datos.json'), 'utf8'));
    check(fresh.sessions.length === 0, 'foco-datos.json nuevo y vacío');
    await app.close();
  }

  // El 403 es la prueba de ruta fuera de dist/.
  const relevant = errs.filter((e) => !/Download the React DevTools|status of 403/.test(e));
  log('errores de página:', relevant.length ? relevant : 'ninguno');
  if (relevant.length) failed = true;
  console.log(failed ? '\nFALLÓ' : '\nTodo correcto');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
