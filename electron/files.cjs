// Utilidades de disco del proceso principal, sin dependencias de Electron para
// poder probarlas con Vitest. Todo lo que llega del renderer se valida aquí.
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;

const DATA_FILE = 'foco-datos.json';
const VIDEOS_DIR = 'videos';
const MAX_JSON_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
const VIDEO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(mp4|webm)$/;

/** Solo nombres simples de vídeo, sin rutas ni sorpresas. */
function isSafeVideoName(name) {
  return typeof name === 'string' && VIDEO_NAME.test(name) && !name.includes('..') && path.basename(name) === name;
}

/** Resuelve `name` dentro de `dir` y comprueba que no se sale de ella. */
function inside(dir, ...parts) {
  const base = path.resolve(dir);
  const full = path.resolve(base, ...parts);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('Ruta fuera de la carpeta de Foco');
  return full;
}

async function writeAtomic(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readData(dir) {
  const file = inside(dir, DATA_FILE);
  try {
    const st = await fsp.stat(file);
    if (st.size > MAX_JSON_BYTES) throw new Error('foco-datos.json es demasiado grande');
    return await fsp.readFile(file, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

async function writeData(dir, json) {
  if (typeof json !== 'string' || Buffer.byteLength(json) > MAX_JSON_BYTES) throw new Error('Datos no válidos');
  JSON.parse(json); // nunca escribir algo que luego no se pueda leer
  await writeAtomic(inside(dir, DATA_FILE), json);
}

/** Aparta foco-datos.json con la fecha en el nombre (cuando el usuario empieza de cero). */
async function archiveData(dir) {
  const file = inside(dir, DATA_FILE);
  if (!(await exists(file))) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `foco-datos-anterior-${stamp}.json`;
  await fsp.rename(file, inside(dir, name));
  return name;
}

/** Guarda el vídeo sin pisar otro con el mismo nombre; devuelve el nombre final. */
async function saveVideo(dir, name, bytes) {
  if (!isSafeVideoName(name)) throw new Error('Nombre de vídeo no válido');
  const buf = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
  if (!buf.length || buf.length > MAX_VIDEO_BYTES) throw new Error('Vídeo no válido');
  const videos = inside(dir, VIDEOS_DIR);
  await fsp.mkdir(videos, { recursive: true });
  const ext = path.extname(name);
  const stem = name.slice(0, -ext.length);
  let final = name;
  for (let i = 2; await exists(inside(videos, final)); i++) final = `${stem}-${i}${ext}`;
  await writeAtomic(inside(videos, final), buf);
  return final;
}

async function readVideo(dir, name) {
  if (!isSafeVideoName(name)) throw new Error('Nombre de vídeo no válido');
  try {
    return await fsp.readFile(inside(dir, VIDEOS_DIR, name));
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

/** Al cambiar de carpeta, copia los vídeos que falten en la nueva. */
async function copyVideos(fromDir, toDir) {
  const from = inside(fromDir, VIDEOS_DIR);
  if (!(await exists(from))) return 0;
  const to = inside(toDir, VIDEOS_DIR);
  await fsp.mkdir(to, { recursive: true });
  let copied = 0;
  for (const name of await fsp.readdir(from)) {
    if (!isSafeVideoName(name) || (await exists(inside(to, name)))) continue;
    await fsp.copyFile(inside(from, name), inside(to, name));
    copied++;
  }
  return copied;
}

module.exports = { DATA_FILE, VIDEOS_DIR, isSafeVideoName, inside, readData, writeData, archiveData, saveVideo, readVideo, copyVideos };
