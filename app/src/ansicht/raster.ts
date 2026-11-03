import { toScreen, toWorld, type Viewport } from './viewport';

export interface RasterFarben {
  fein: string;
  grob: string;
  text: string;
  achse: string;
}

const SCHRITTE = [0.1, 0.5, 1, 5, 10];
// Jede wievielte Feinlinie wird zur Hauptlinie (0,1 m -> jede 10., also 1 m usw.)
const HAUPT_ALLE: Record<number, number> = { 0.1: 10, 0.5: 2, 1: 5, 5: 2, 10: 5 };

/** Kleinster Linienabstand in Metern, der auf dem Bildschirm noch mindestens `minPixel` breit ist. */
export function rasterSchritt(scale: number, minPixel = 14): number {
  for (const s of SCHRITTE) if (s * scale >= minPixel) return s;
  return SCHRITTE[SCHRITTE.length - 1];
}

export function zeichneRaster(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  breite: number,
  hoehe: number,
  farben: RasterFarben,
): void {
  const schritt = rasterSchritt(vp.scale);
  const haupt = HAUPT_ALLE[schritt] ?? 5;
  const links = toWorld(vp, 0, 0);
  const rechts = toWorld(vp, breite, hoehe);
  const xMin = Math.floor(links.x / schritt);
  const xMax = Math.ceil(rechts.x / schritt);
  const yMin = Math.floor(rechts.y / schritt);
  const yMax = Math.ceil(links.y / schritt);

  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = farben.text;

  for (let i = xMin; i <= xMax; i++) {
    const istHaupt = i % haupt === 0;
    const x = Math.round(toScreen(vp, i * schritt, 0).x) + 0.5;
    ctx.strokeStyle = i === 0 ? farben.achse : istHaupt ? farben.grob : farben.fein;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, hoehe);
    ctx.stroke();
    if (istHaupt) ctx.fillText(`${trim(i * schritt)} m`, x + 3, 3);
  }
  for (let j = yMin; j <= yMax; j++) {
    const istHaupt = j % haupt === 0;
    const y = Math.round(toScreen(vp, 0, j * schritt).y) + 0.5;
    ctx.strokeStyle = j === 0 ? farben.achse : istHaupt ? farben.grob : farben.fein;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(breite, y);
    ctx.stroke();
    if (istHaupt && j !== 0) ctx.fillText(`${trim(j * schritt)} m`, 3, y + 3);
  }
}

function trim(wert: number): string {
  return String(Math.round(wert * 100) / 100).replace('.', ',');
}
