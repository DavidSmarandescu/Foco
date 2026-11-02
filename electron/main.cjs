// Proceso principal de la app de escritorio de Foco.
// Sirve la web compilada (dist/) desde un protocolo propio, app://foco/, para que
// cámara, WebCodecs, MediaPipe e IndexedDB funcionen igual que en la web, y
// guarda vídeos y sesiones en una carpeta del usuario (Documentos/Foco).
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, shell, systemPreferences } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const files = require('./files.cjs');

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://foco`;
const DIST = path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.FOCO_DEV_URL; // p. ej. http://localhost:5173 con `npm run desktop:dev`
const START_URL = DEV_URL || `${ORIGIN}/index.html`;

// Solo para pruebas automáticas: cámara falsa y carpetas aisladas.
if (process.env.FOCO_TEST === '1') {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  if (process.env.FOCO_FAKE_VIDEO) app.commandLine.appendSwitch('use-file-for-fake-video-capture', process.env.FOCO_FAKE_VIDEO);
}
if (process.env.FOCO_USER_DATA) app.setPath('userData', process.env.FOCO_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const isOwn = (url) => {
  if (!url) return false;
  if (url === ORIGIN || url.startsWith(`${ORIGIN}/`)) return true;
  return !!DEV_URL && (url === DEV_URL || url.startsWith(DEV_URL.replace(/\/$/, '') + '/'));
};

// ---------- Carpeta de datos ----------

const configFile = () => path.join(app.getPath('userData'), 'config.json');
let dataDir;

function loadDataDir() {
  if (process.env.FOCO_DATA_DIR) return path.resolve(process.env.FOCO_DATA_DIR);
  try {
    const cfg = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    if (typeof cfg.dataDir === 'string' && path.isAbsolute(cfg.dataDir)) return cfg.dataDir;
  } catch {
    /* primera vez: carpeta por defecto */
  }
  return path.join(app.getPath('documents'), 'Foco');
}

async function saveDataDir(dir) {
  await fsp.mkdir(path.dirname(configFile()), { recursive: true });
  await fsp.writeFile(configFile(), JSON.stringify({ dataDir: dir }, null, 2));
}

// ---------- IPC ----------

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    // Solo la página de Foco puede hablar con el proceso principal.
    if (!isOwn(event.senderFrame?.url)) throw new Error('Origen no permitido');
    return fn(event, ...args);
  });
}

function registerIpc() {
  handle('foco:info', () => ({ version: app.getVersion(), dataDir }));
  handle('foco:open-dir', async () => {
    await fsp.mkdir(dataDir, { recursive: true });
    await shell.openPath(dataDir);
  });
  handle('foco:choose-dir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win, {
      title: 'Elige dónde guardar tus sesiones de Foco',
      defaultPath: dataDir,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const next = path.resolve(res.filePaths[0]);
    if (next === dataDir) return dataDir;
    await fsp.mkdir(next, { recursive: true });
    await files.copyVideos(dataDir, next);
    dataDir = next;
    await saveDataDir(next);
    return dataDir;
  });
  handle('foco:read-data', () => files.readData(dataDir));
  handle('foco:write-data', (_e, json) => files.writeData(dataDir, json));
  handle('foco:archive-data', () => files.archiveData(dataDir));
  handle('foco:save-video', (_e, name, data) => files.saveVideo(dataDir, name, data));
  handle('foco:read-video', (_e, name) => files.readVideo(dataDir, name));
}

// ---------- Protocolo app:// ----------

function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'foco') return new Response('No encontrado', { status: 404 });
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.resolve(DIST, '.' + rel);
    if (!file.startsWith(DIST + path.sep)) return new Response('Prohibido', { status: 403 });
    try {
      const data = await fsp.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = { 'content-type': type, 'cache-control': 'no-cache' };
      if (type.startsWith('text/html')) headers['content-security-policy'] = CSP;
      return new Response(data, { headers });
    } catch {
      return new Response('No encontrado', { status: 404 });
    }
  });
}

// ---------- Permisos ----------

async function cameraAllowed() {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('camera');
  if (status === 'granted') return true;
  if (status === 'denied' || status === 'restricted') return false;
  return systemPreferences.askForMediaAccess('camera');
}

function registerPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const own = isOwn(details.requestingUrl);
    if (process.env.FOCO_TEST === '1') console.log('[permiso]', permission, details.requestingUrl);
    if (permission === 'media' && own) {
      const types = details.mediaTypes || [];
      if (types.some((t) => t !== 'video')) return callback(false);
      cameraAllowed().then(callback, () => callback(false));
      return;
    }
    // Pantalla encendida mientras estudias; vídeo a pantalla completa en el portal.
    if ((permission === 'screen-wake-lock' || permission === 'fullscreen') && own) return callback(true);
    callback(false);
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => {
    if (process.env.FOCO_TEST === '1') console.log('[comprobación]', permission, origin);
    return (permission === 'media' || permission === 'fullscreen') && isOwn(origin);
  });
}

// ---------- Ventana ----------

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: 'Foco',
    backgroundColor: '#0B0B0D',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      // Que la sesión siga capturando aunque la ventana quede detrás de otra.
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Enlaces externos al navegador del sistema; nada de navegar fuera de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isOwn(url)) return;
    event.preventDefault();
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });
  // La página avisa antes de cerrar si hay una sesión en curso; Electron no
  // muestra ese aviso por sí solo, así que lo preguntamos con un diálogo nativo.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Salir', 'Seguir estudiando'],
      defaultId: 1,
      cancelId: 1,
      title: 'Foco',
      message: '¿Salir con una sesión en curso?',
      detail: 'Lo grabado hasta ahora no se pierde: al volver a abrir Foco podrás generar el vídeo.',
    });
    if (choice === 0) event.preventDefault();
  });
  win.on('closed', () => {
    win = null;
  });

  win.loadURL(START_URL);
}

function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(DEV_URL ? Menu.buildFromTemplate([{ role: 'viewMenu' }]) : null);
    return;
  }
  // En macOS hace falta un menú para Cmd+Q, copiar/pegar y minimizar.
  const template = [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }];
  if (DEV_URL) template.push({ role: 'viewMenu' });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    dataDir = loadDataDir();
    registerProtocol();
    registerPermissions();
    registerIpc();
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
