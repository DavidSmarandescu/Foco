export class CameraError extends Error {
  constructor(
    message: string,
    public kind: 'denied' | 'notfound' | 'busy' | 'insecure' | 'unsupported' | 'unknown',
  ) {
    super(message);
  }
}

export async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new CameraError('La cámara solo funciona en HTTPS o en localhost.', 'insecure');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('Este navegador no permite usar la cámara.', 'unsupported');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new CameraError(
        'Has bloqueado el acceso a la cámara. Actívalo desde el icono del candado en la barra de direcciones y vuelve a intentarlo.',
        'denied',
      );
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('No encontramos ninguna cámara conectada.', 'notfound');
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      throw new CameraError('La cámara está ocupada por otra aplicación. Ciérrala y vuelve a intentarlo.', 'busy');
    }
    throw new CameraError('No se pudo abrir la cámara.', 'unknown');
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
