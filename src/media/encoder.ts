// Monta el vídeo en cámara rápida a partir de los fotogramas guardados.
// Preferencia: WebCodecs + Mediabunny (MP4/H.264, mucho más rápido que tiempo
// real). Si el navegador no tiene WebCodecs, MediaRecorder sobre un canvas.
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  canEncodeVideo,
  type VideoCodec,
} from 'mediabunny';

export interface EncodeInput {
  frameCount: number;
  getFrame: (index: number) => Promise<Blob | undefined>;
  fps: number;
  onProgress?: (fraction: number) => void;
}

export interface EncodeResult {
  blob: Blob;
  mime: string;
  ext: string;
  width: number;
  height: number;
  method: 'webcodecs' | 'mediarecorder';
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

async function firstFrameSize(input: EncodeInput) {
  for (let i = 0; i < input.frameCount; i++) {
    const b = await input.getFrame(i);
    if (b) {
      const bmp = await loadBitmap(b);
      const size = { width: bmp.width - (bmp.width % 2), height: bmp.height - (bmp.height % 2) };
      bmp.close();
      return size;
    }
  }
  throw new Error('La sesión no tiene fotogramas.');
}

async function pickCodec(width: number, height: number): Promise<{ codec: VideoCodec; container: 'mp4' | 'webm' } | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const opts = { width, height, bitrate: QUALITY_HIGH };
  if (await canEncodeVideo('avc', opts)) return { codec: 'avc', container: 'mp4' };
  if (await canEncodeVideo('vp9', opts)) return { codec: 'vp9', container: 'webm' };
  if (await canEncodeVideo('vp8', opts)) return { codec: 'vp8', container: 'webm' };
  return null;
}

export async function encodeTimelapse(input: EncodeInput): Promise<EncodeResult> {
  const { width, height } = await firstFrameSize(input);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const choice = await pickCodec(width, height);
  if (choice) {
    const output = new Output({
      format: choice.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const source = new CanvasSource(canvas, { codec: choice.codec, bitrate: QUALITY_HIGH, keyFrameInterval: 1 });
    output.addVideoTrack(source, { frameRate: input.fps });
    await output.start();
    let written = 0;
    for (let i = 0; i < input.frameCount; i++) {
      const b = await input.getFrame(i);
      if (!b) continue;
      const bmp = await loadBitmap(b);
      ctx.drawImage(bmp, 0, 0, width, height);
      bmp.close();
      await source.add(written / input.fps, 1 / input.fps);
      written++;
      input.onProgress?.((i + 1) / input.frameCount);
    }
    await output.finalize();
    const mime = choice.container === 'mp4' ? 'video/mp4' : 'video/webm';
    return {
      blob: new Blob([output.target.buffer!], { type: mime }),
      mime,
      ext: choice.container,
      width,
      height,
      method: 'webcodecs',
    };
  }
  return encodeWithMediaRecorder(input, canvas, ctx, width, height);
}

async function encodeWithMediaRecorder(
  input: EncodeInput,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): Promise<EncodeResult> {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
    throw new Error('Este navegador no puede generar vídeo.');
  }
  const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const stream = canvas.captureStream(input.fps);
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (recorder.onstop = () => r()));
  recorder.start();
  // MediaRecorder graba en tiempo real: hay que pintar al ritmo del vídeo.
  const frameMs = 1000 / input.fps;
  let next = performance.now();
  for (let i = 0; i < input.frameCount; i++) {
    const b = await input.getFrame(i);
    if (!b) continue;
    const bmp = await loadBitmap(b);
    ctx.drawImage(bmp, 0, 0, width, height);
    bmp.close();
    next += frameMs;
    await new Promise((r) => setTimeout(r, Math.max(0, next - performance.now())));
    input.onProgress?.((i + 1) / input.frameCount);
  }
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  const type = recorder.mimeType || 'video/webm';
  return {
    blob: new Blob(chunks, { type }),
    mime: type,
    ext: type.includes('mp4') ? 'mp4' : 'webm',
    width,
    height,
    method: 'mediarecorder',
  };
}
