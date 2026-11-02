// Puente con la app de escritorio (Electron). En la web `desktop` es undefined
// y todo sigue funcionando solo con IndexedDB.

export interface DesktopInfo {
  version: string;
  dataDir: string;
}

export interface FocoDesktop {
  platform: string;
  info(): Promise<DesktopInfo>;
  /** Abre un diálogo para elegir carpeta; devuelve la nueva ruta o null si se cancela. */
  chooseDataDir(): Promise<string | null>;
  openDataDir(): Promise<void>;
  readData(): Promise<string | null>;
  writeData(json: string): Promise<void>;
  /** Renombra foco-datos.json a una copia con fecha; devuelve el nombre nuevo. */
  archiveData(): Promise<string | null>;
  /** Guarda el vídeo en la carpeta de vídeos; devuelve el nombre final del archivo. */
  saveVideo(name: string, data: ArrayBuffer): Promise<string>;
  readVideo(name: string): Promise<Uint8Array | null>;
}

declare global {
  interface Window {
    focoDesktop?: FocoDesktop;
  }
}

export const desktop: FocoDesktop | undefined = typeof window !== 'undefined' ? window.focoDesktop : undefined;

export const DOWNLOAD_URL = 'https://github.com/DavidSmarandescu/Foco/releases/latest';
