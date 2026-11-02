// Detección de presencia 100 % local: MediaPipe (detector de caras BlazeFace)
// servido desde la propia web, más una señal de movimiento como respaldo.
import { motionScore, toGray } from '../lib/presence';
import type { PresenceMode } from '../lib/settings';

type FaceDetector = import('@mediapipe/tasks-vision').FaceDetector;

export interface PresenceSignal {
  face: boolean | null; // null si el detector de caras no está disponible
  motion: number;
  seen: boolean;
}

const MOTION_MIN = 0.012;
const W = 64;
const H = 48;

let facePromise: Promise<FaceDetector | null> | null = null;

/** Carga (una sola vez) el detector de caras desde archivos locales. */
export function loadFaceDetector(): Promise<FaceDetector | null> {
  facePromise ??= (async () => {
    try {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const base = new URL('./', document.baseURI);
      const fileset = await FilesetResolver.forVisionTasks(new URL('mediapipe/wasm', base).href);
      return await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: new URL('models/blaze_face_short_range.tflite', base).href, delegate: 'CPU' },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.6,
      });
    } catch (e) {
      console.warn('Detector de caras no disponible; se usa solo movimiento.', e);
      return null;
    }
  })();
  return facePromise;
}

export class PresenceDetector {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private prev: Uint8Array | null = null;
  private lastTs = 0;

  constructor(private face: FaceDetector | null) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  get hasFace() {
    return this.face !== null;
  }

  check(video: HTMLVideoElement, mode: PresenceMode): PresenceSignal {
    if (mode === 'off' || video.readyState < 2) return { face: null, motion: 0, seen: true };

    this.ctx.drawImage(video, 0, 0, W, H);
    const gray = toGray(this.ctx.getImageData(0, 0, W, H).data);
    const motion = this.prev ? motionScore(this.prev, gray) : 0;
    this.prev = gray;

    let face: boolean | null = null;
    if (this.face) {
      try {
        const ts = Math.max(performance.now(), this.lastTs + 1);
        this.lastTs = ts;
        face = this.face.detectForVideo(video, ts).detections.length > 0;
      } catch {
        face = null;
      }
    }

    const moving = motion >= MOTION_MIN;
    const seen =
      mode === 'face' ? (face ?? moving) : // sin detector de caras, el movimiento es la única señal
      (face ?? false) || moving;
    return { face, motion, seen };
  }
}
