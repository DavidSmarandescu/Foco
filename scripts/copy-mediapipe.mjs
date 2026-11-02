// Copia el runtime WASM de MediaPipe a public/ para servirlo desde el propio
// dominio: la detección de presencia no descarga nada de internet.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dest = join(root, 'public/mediapipe/wasm');

if (!existsSync(src)) {
  console.error('No se encuentra @mediapipe/tasks-vision. Ejecuta npm install.');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const name of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  cpSync(join(src, name), join(dest, name));
}
console.log('MediaPipe WASM copiado a public/mediapipe/wasm');
