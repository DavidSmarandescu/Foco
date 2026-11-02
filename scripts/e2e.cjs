// Prueba de extremo a extremo con cámara falsa de Chromium. Graba una sesión
// real, monta el vídeo, comprueba racha, modo sin conexión, pausa por ausencia
// y recuperación de sesiones, y regenera las capturas de docs/screenshots.
// Uso: npm run build && npx vite preview --port 4173 (en otra terminal) && node scripts/e2e.cjs
const { chromium } = require('playwright');
const path = require('node:path');
const URL_ = process.env.FOCO_URL || 'http://localhost:4173/';
const ORIGIN = new URL(URL_).origin;
const SHOTS = path.join(__dirname, '..', 'docs', 'screenshots');
const fs = require('node:fs');
const os = require('node:os');

/** Vídeo Y4M estático (gris, sin cara ni movimiento): una «habitación vacía». */
function emptyRoomY4m() {
  const W = 640, H = 480;
  const file = path.join(os.tmpdir(), 'foco-empty-room.y4m');
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Buffer.alloc(W * H, 110), Buffer.alloc((W * H) / 2, 128)]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`), frame, frame]));
  return file;
}
const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const log = (...a) => console.log('·', ...a);

async function newCtx(browser, opts = {}, settings) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  if (settings) await ctx.addInitScript((s) => localStorage.setItem('foco.settings.v1', JSON.stringify(s)), settings);
  return ctx;
}
function watch(page, errs) {
  page.on('load', () => page.addStyleTag({ content: '.toast{display:none!important}' }).catch(() => {}));
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
}

(async () => {
  const browser = await chromium.launch({ args });
  const errs = [];

  // 1) Intro sin permiso concedido
  {
    const ctx = await newCtx(browser);
    const page = await ctx.newPage(); watch(page, errs);
    await page.goto(URL_, { waitUntil: 'networkidle' });
    await page.getByText('Tu escritorio, en cámara rápida.').waitFor();
    await page.screenshot({ path: `${SHOTS}/escritorio-inicio.png` });
    await ctx.close();
  }

  // 2) Sesión real de ~65 s con racha mínima de 1 min
  const settings = { captureIntervalSec: 0.5, fps: 30, presenceMode: 'face+motion', absenceTimeoutSec: 20, streakMinMinutes: 1, dailyGoalMinutes: 30, watermark: true };
  const ctx = await newCtx(browser, {}, settings);
  await ctx.grantPermissions(['camera'], { origin: ORIGIN });
  const page = await ctx.newPage(); watch(page, errs);
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Empezar sesión' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  log('detector chip:', await page.locator('.stage-chip').innerText().catch(() => '-'));
  await page.getByLabel('¿Qué vas a estudiar?').fill('Cálculo');
  await page.screenshot({ path: `${SHOTS}/escritorio-preparado.png` });
  await page.getByRole('button', { name: 'Empezar sesión' }).click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${SHOTS}/escritorio-grabando.png` });
  log('running panel:', (await page.locator('.running').innerText()).replace(/\n/g, ' | '));
  await page.waitForTimeout(56000);
  log('title:', await page.title());
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Terminar' }).click();
  await page.getByText('¡Sesión guardada!').waitFor({ timeout: 120000 });
  log('encode secs:', (Date.now() - t0) / 1000);
  await page.waitForTimeout(1500);
  log('done panel:', (await page.locator('.done').innerText()).replace(/\n/g, ' | '));
  const vinfo = await page.evaluate(() => { const v = document.querySelector('.stage video[src]'); return v && { dur: v.duration, w: v.videoWidth, h: v.videoHeight, err: v.error && v.error.code }; });
  log('video element:', JSON.stringify(vinfo));
  await page.screenshot({ path: `${SHOTS}/escritorio-terminado.png` });

  // 3) Portal con la sesión real
  await page.goto(URL_ + '#/portal');
  await page.waitForTimeout(800);
  log('streak pill:', await page.locator('.streak-pill').innerText());
  log('hero:', (await page.locator('.stat-hero').innerText()).replace(/\n/g, ' | '));
  log('sessions:', await page.locator('.session').count());
  await page.locator('.thumb').first().click();
  await page.waitForTimeout(2000);
  const pv = await page.evaluate(() => { const v = document.querySelector('dialog video'); return v && { dur: v.duration, w: v.videoWidth, err: v.error && v.error.code }; });
  log('player video:', JSON.stringify(pv));
  await page.screenshot({ path: `${SHOTS}/escritorio-reproductor.png` });
  await page.keyboard.press('Escape');

  // 4) Offline: recarga sin red
  await page.waitForTimeout(500);
  const swState = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r && r.active ? r.active.state : 'none'; });
  log('sw:', swState);
  await ctx.setOffline(true);
  await page.goto(URL_ + '#/estudiar');
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Empezar sesión' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(3000);
  log('offline chip:', await page.locator('.stage-chip').innerText().catch(() => '-'), '| pill:', await page.locator('.pill-quiet').innerText().catch(() => '-'));
  await page.goto(URL_ + '#/portal');
  await page.waitForTimeout(800);
  log('offline portal sessions:', await page.locator('.session').count());
  await ctx.setOffline(false);
  await ctx.close();

  // 5) Ausencia: habitación vacía (sin cara ni movimiento) → debe pausar sola
  {
    const empty = await chromium.launch({ args: [...args, `--use-file-for-fake-video-capture=${emptyRoomY4m()}`] });
    const c = await newCtx(empty, {}, { ...settings, absenceTimeoutSec: 5 });
    await c.grantPermissions(['camera'], { origin: ORIGIN });
    const p = await c.newPage(); watch(p, errs);
    await p.goto(URL_, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Empezar sesión' }).waitFor({ timeout: 15000 });
    await p.waitForTimeout(2500);
    log('empty room chip:', await p.locator('.stage-chip').innerText().catch(() => '-'));
    await p.getByRole('button', { name: 'Empezar sesión' }).click();
    await p.waitForTimeout(9000);
    const a = await p.locator('.timer').innerText();
    await p.waitForTimeout(3000);
    const b = await p.locator('.timer').innerText();
    const chip = await p.locator('.stage-chip').innerText();
    log('absent chip:', chip, '| timer frozen:', a === b, a, '| absent:', await p.locator('.facts-grid dd').first().innerText());
    if (!chip.includes('Ausente') || a !== b) throw new Error('La pausa por ausencia no se activó');
    await p.screenshot({ path: `${SHOTS}/escritorio-ausente.png` });
    await c.close();
    await empty.close();
  }

  // 5b) Sesión interrumpida: se cierra la pestaña grabando y se recupera
  {
    const c = await newCtx(browser, {}, settings);
    await c.grantPermissions(['camera'], { origin: ORIGIN });
    const p = await c.newPage(); watch(p, errs);
    await p.goto(URL_, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Empezar sesión' }).waitFor({ timeout: 15000 });
    await p.getByLabel('¿Qué vas a estudiar?').fill('Física');
    await p.getByRole('button', { name: 'Empezar sesión' }).click();
    await p.waitForTimeout(7000);
    await p.close({ runBeforeUnload: false });
    const p2 = await c.newPage(); watch(p2, errs);
    await p2.goto(URL_, { waitUntil: 'networkidle' });
    await p2.locator('.banner').first().waitFor({ timeout: 10000 });
    log('banner:', (await p2.locator('.banner').first().innerText()).replace(/\n/g, ' | '));
    await p2.screenshot({ path: `${SHOTS}/escritorio-recuperar.png` });
    await p2.getByRole('button', { name: 'Generar vídeo' }).click();
    await p2.locator('.banner').first().waitFor({ state: 'detached', timeout: 60000 });
    await p2.goto(URL_ + '#/portal');
    await p2.waitForTimeout(800);
    log('recovered:', (await p2.locator('.session').first().innerText()).replace(/\n/g, ' | '), '| has play:', await p2.locator('.thumb-play').count());
    await c.close();
  }

  // 6) Demo: portal, ajustes (escritorio y móvil)
  for (const [name, opts] of [['escritorio', {}], ['movil', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const c = await newCtx(browser, opts);
    const p = await c.newPage(); watch(p, errs);
    await p.goto(URL_ + '#/portal', { waitUntil: 'networkidle' });
    await p.screenshot({ path: `${SHOTS}/${name}-portal-vacio.png` });
    await p.getByRole('button', { name: 'Ver con datos de ejemplo' }).click();
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${SHOTS}/${name}-portal.png`, fullPage: true });
    await p.goto(URL_ + '#/ajustes');
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${SHOTS}/${name}-ajustes.png`, fullPage: true });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    log(name, 'horizontal overflow px:', overflow);
    if (name === 'movil') {
      await p.goto(URL_ + '#/estudiar');
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${SHOTS}/movil-inicio.png`, fullPage: true });
    }
    await c.close();
  }

  // Móvil grabando
  {
    const c = await newCtx(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, settings);
    await c.grantPermissions(['camera'], { origin: ORIGIN });
    const p = await c.newPage(); watch(p, errs);
    await p.goto(URL_, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Empezar sesión' }).waitFor({ timeout: 15000 });
    await p.getByLabel('¿Qué vas a estudiar?').fill('Contabilidad');
    await p.getByRole('button', { name: 'Empezar sesión' }).click();
    await p.waitForTimeout(5000);
    await p.screenshot({ path: `${SHOTS}/movil-grabando.png`, fullPage: true });
    log('mobile overflow px:', await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
    await c.close();
  }

  await browser.close();
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
