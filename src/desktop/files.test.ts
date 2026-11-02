import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const files = require('../../electron/files.cjs');

const tmp = () => mkdtemp(join(tmpdir(), 'foco-files-'));

describe('nombres de vídeo', () => {
  it('acepta los nombres que genera Foco', () => {
    expect(files.isSafeVideoName('foco-2026-11-02-1830-calculo.mp4')).toBe(true);
    expect(files.isSafeVideoName('foco-2026-11-02-1830.webm')).toBe(true);
  });

  it('rechaza rutas y extensiones raras', () => {
    for (const bad of ['../x.mp4', 'a/b.mp4', 'a\\b.mp4', '.mp4', 'x.exe', 'x.mp4.exe', '', 'x..mp4', 42]) {
      expect(files.isSafeVideoName(bad)).toBe(false);
    }
  });

  it('no deja salir de la carpeta', () => {
    expect(() => files.inside('/datos/foco', '..', 'otra')).toThrow();
    expect(files.inside('/datos/foco', 'videos', 'a.mp4')).toBe(join('/datos/foco', 'videos', 'a.mp4'));
  });
});

describe('carpeta de datos', () => {
  it('lee null si no hay datos y escribe JSON válido', async () => {
    const dir = await tmp();
    expect(await files.readData(dir)).toBeNull();
    await files.writeData(dir, '{"format":"foco-backup"}');
    expect(await files.readData(dir)).toBe('{"format":"foco-backup"}');
    await expect(files.writeData(dir, '{roto')).rejects.toThrow();
    expect(await files.readData(dir)).toBe('{"format":"foco-backup"}');
  });

  it('guarda vídeos sin pisar otros y los lee', async () => {
    const dir = await tmp();
    const a = await files.saveVideo(dir, 'foco-x.mp4', new Uint8Array([1, 2, 3]).buffer);
    const b = await files.saveVideo(dir, 'foco-x.mp4', new Uint8Array([4]).buffer);
    expect([a, b]).toEqual(['foco-x.mp4', 'foco-x-2.mp4']);
    expect([...(await files.readVideo(dir, 'foco-x.mp4'))]).toEqual([1, 2, 3]);
    expect(await files.readVideo(dir, 'nada.mp4')).toBeNull();
    await expect(files.saveVideo(dir, '../fuera.mp4', new Uint8Array([1]).buffer)).rejects.toThrow();
  });

  it('aparta la copia anterior al empezar de cero', async () => {
    const dir = await tmp();
    expect(await files.archiveData(dir)).toBeNull();
    await files.writeData(dir, '{}');
    const name = await files.archiveData(dir);
    expect(name).toMatch(/^foco-datos-anterior-.*\.json$/);
    expect(await readdir(dir)).toEqual([name]);
  });

  it('copia los vídeos que faltan al cambiar de carpeta', async () => {
    const from = await tmp();
    const to = await tmp();
    await files.saveVideo(from, 'a.mp4', new Uint8Array([1]).buffer);
    await files.saveVideo(from, 'b.mp4', new Uint8Array([2]).buffer);
    await mkdir(join(to, 'videos'));
    await writeFile(join(to, 'videos', 'a.mp4'), 'ya estaba');
    expect(await files.copyVideos(from, to)).toBe(1);
    expect(await readFile(join(to, 'videos', 'a.mp4'), 'utf8')).toBe('ya estaba');
  });
});
