// Dibuja un fotograma de la cámara con la hora sobreimpresa.
import { formatClock, formatDateShort, formatTimeOfDay } from '../lib/time';

export interface OverlayInfo {
  now: Date;
  studiedMs: number;
  subject: string;
  watermark: boolean;
}

const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';
const SANS = '"Inter Variable", system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  info: OverlayInfo,
) {
  ctx.drawImage(source, 0, 0, width, height);

  const u = height / 720; // escala respecto a 720p
  const pad = 18 * u;
  const margin = 24 * u;

  const time = formatTimeOfDay(info.now);
  const line2 = `${formatDateShort(info.now)}  ·  ${formatClock(info.studiedMs)} estudiado`;
  const line3 = info.subject.trim();

  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${44 * u}px ${MONO}`;
  const w1 = ctx.measureText(time).width;
  ctx.font = `500 ${17 * u}px ${SANS}`;
  const w2 = ctx.measureText(line2).width;
  const w3 = line3 ? ctx.measureText(line3).width : 0;

  const boxW = Math.max(w1, w2, w3) + pad * 2;
  const boxH = (line3 ? 122 : 98) * u;
  const x = margin;
  const y = height - margin - boxH;

  ctx.fillStyle = 'rgba(11, 11, 13, 0.62)';
  roundRect(ctx, x, y, boxW, boxH, 14 * u);
  ctx.fill();
  ctx.fillStyle = '#F2B441';
  ctx.fillRect(x, y + 16 * u, 3 * u, boxH - 32 * u);

  ctx.fillStyle = '#F4F4F5';
  ctx.font = `600 ${44 * u}px ${MONO}`;
  ctx.fillText(time, x + pad, y + 56 * u);
  ctx.fillStyle = 'rgba(244, 244, 245, 0.78)';
  ctx.font = `500 ${17 * u}px ${SANS}`;
  ctx.fillText(line2, x + pad, y + 84 * u);
  if (line3) {
    ctx.fillStyle = '#F2B441';
    ctx.fillText(line3, x + pad, y + 108 * u);
  }

  if (info.watermark) {
    ctx.font = `600 ${16 * u}px ${SANS}`;
    const label = 'Foco';
    const lw = ctx.measureText(label).width;
    const wx = width - margin - lw;
    const wy = height - margin - 6 * u;
    ctx.fillStyle = 'rgba(244, 244, 245, 0.55)';
    ctx.fillText(label, wx, wy);
    ctx.fillStyle = 'rgba(242, 180, 65, 0.85)';
    ctx.beginPath();
    ctx.arc(wx - 10 * u, wy - 5.5 * u, 4 * u, 0, Math.PI * 2);
    ctx.fill();
  }
}
