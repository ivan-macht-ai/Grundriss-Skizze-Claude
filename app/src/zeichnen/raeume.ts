import { flaeche, schwerpunkt } from '../geometrie/polygon';
import { dist } from '../geometrie/vec';
import type { Raum } from '../modell/typen';
import { toScreen, type Viewport } from '../ansicht/viewport';

export interface RaumFarben {
  fuell: string;
  linie: string;
  text: string;
  leise: string;
}

export const kommaZahl = (wert: number, stellen = 2): string => wert.toFixed(stellen).replace('.', ',');

export function zeichneRaeume(ctx: CanvasRenderingContext2D, vp: Viewport, raeume: Raum[], farben: RaumFarben): void {
  for (const raum of raeume) {
    const sp = raum.ecken.map((p) => toScreen(vp, p.x, p.y));
    ctx.beginPath();
    sp.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
    ctx.closePath();
    ctx.fillStyle = farben.fuell;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = farben.linie;
    ctx.stroke();

    const c = toScreen(vp, schwerpunkt(raum.ecken).x, schwerpunkt(raum.ecken).y);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = farben.text;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(raum.name, c.x, c.y - 9);
    ctx.fillStyle = farben.leise;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${kommaZahl(flaeche(raum.ecken), 2)} m²`, c.x, c.y + 10);

    // Länge jeder Seite, innen neben der Linie
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = farben.text;
    for (let i = 0; i < raum.ecken.length; i++) {
      const j = (i + 1) % raum.ecken.length;
      const laenge = dist(raum.ecken[i], raum.ecken[j]);
      const a = sp[i];
      const b = sp[j];
      const bild = Math.hypot(b.x - a.x, b.y - a.y);
      if (bild < 52) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      let nx = -(b.y - a.y) / bild;
      let ny = (b.x - a.x) / bild;
      if (nx * (c.x - mx) + ny * (c.y - my) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const text = `${kommaZahl(laenge)} m`;
      // Abstand zur Linie: halbe Textausdehnung in Richtung der Normalen plus etwas Luft
      const abstand = (ctx.measureText(text).width / 2) * Math.abs(nx) + 7 * Math.abs(ny) + 8;
      ctx.fillText(text, mx + nx * abstand, my + ny * abstand);
    }
  }
  ctx.textAlign = 'start';
}
