import { flaeche, schwerpunkt } from '../geometrie/polygon';
import { dist } from '../geometrie/vec';
import type { Raum } from '../modell/typen';
import { dickenVon, nachbarSeiten, waendeUmriss } from '../modell/waende';
import { toScreen, type Viewport } from '../ansicht/viewport';

export interface RaumFarben {
  fuell: string;
  linie: string;
  text: string;
  leise: string;
  auswahl: string;
  wand: string;
}

export const kommaZahl = (wert: number, stellen = 2): string => wert.toFixed(stellen).replace('.', ',');

export function zeichneRaeume(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  raeume: Raum[],
  farben: RaumFarben,
  auswahlId: number | null,
): void {
  for (const raum of raeume) {
    const gewaehlt = raum.id === auswahlId;
    const sp = raum.ecken.map((p) => toScreen(vp, p.x, p.y));
    const dicken = dickenVon(raum);
    // An Seiten mit Nachbarraum würden sich die Maßlinien überlagern: dort keine Maßlinie
    const nachbarn = new Set(nachbarSeiten(raum, raeume.filter((q) => q.id !== raum.id), 0.7).map((f) => f.kante));

    // Wände: Fläche zwischen Außenumriss und Raum (Löcher-Füllung), dahinter liegt der Raum
    if (dicken.some((d) => d > 0.0005)) {
      const aussen = waendeUmriss(raum.ecken, dicken).map((p) => toScreen(vp, p.x, p.y));
      ctx.beginPath();
      aussen.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.closePath();
      sp.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.closePath();
      ctx.fillStyle = farben.wand;
      ctx.fill('evenodd');
    }

    ctx.beginPath();
    sp.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
    ctx.closePath();
    ctx.fillStyle = farben.fuell;
    ctx.fill();
    ctx.lineWidth = gewaehlt ? 4.5 : 3;
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = gewaehlt ? farben.auswahl : farben.linie;
    ctx.stroke();

    const sw = schwerpunkt(raum.ecken);
    const c = toScreen(vp, sw.x, sw.y);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = farben.text;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(raum.name, c.x, c.y - 9);
    ctx.fillStyle = farben.leise;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${kommaZahl(flaeche(raum.ecken), 2)} m²`, c.x, c.y + 10);

    // Maße außerhalb: Maßlinie mit Endstrichen, Zahl daneben
    ctx.font = '12px system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.strokeStyle = farben.leise;
    for (let i = 0; i < raum.ecken.length; i++) {
      const j = (i + 1) % raum.ecken.length;
      const laenge = dist(raum.ecken[i], raum.ecken[j]);
      const a = sp[i];
      const b = sp[j];
      const bild = Math.hypot(b.x - a.x, b.y - a.y);
      if (bild < 52 || nachbarn.has(i)) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      let nx = -(b.y - a.y) / bild;
      let ny = (b.x - a.x) / bild;
      if (nx * (c.x - mx) + ny * (c.y - my) > 0) {
        nx = -nx;
        ny = -ny;
      }
      const versatz = 20 + dicken[i] * vp.scale;
      const ax = a.x + nx * versatz;
      const ay = a.y + ny * versatz;
      const bx = b.x + nx * versatz;
      const by = b.y + ny * versatz;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      // Hilfslinien von den Ecken zur Maßlinie
      ctx.moveTo(a.x + nx * 4, a.y + ny * 4);
      ctx.lineTo(ax + nx * 4, ay + ny * 4);
      ctx.moveTo(b.x + nx * 4, b.y + ny * 4);
      ctx.lineTo(bx + nx * 4, by + ny * 4);
      // Endstriche (schräg)
      const tx = (b.x - a.x) / bild;
      const ty = (b.y - a.y) / bild;
      for (const [qx, qy] of [[ax, ay], [bx, by]]) {
        ctx.moveTo(qx - (tx + nx) * 4, qy - (ty + ny) * 4);
        ctx.lineTo(qx + (tx + nx) * 4, qy + (ty + ny) * 4);
      }
      ctx.stroke();
      const text = `${kommaZahl(laenge)} m`;
      const abstand = versatz + (ctx.measureText(text).width / 2) * Math.abs(nx) + 8 * Math.abs(ny) + 6;
      ctx.fillStyle = farben.text;
      ctx.fillText(text, mx + nx * abstand, my + ny * abstand);
    }
  }
  ctx.textAlign = 'start';
}
