import { flaeche, schwerpunkt } from '../geometrie/polygon';
import { dist } from '../geometrie/vec';
import type { Raum } from '../modell/typen';
import { dickenVon, nachbarSeiten, waendeUmriss } from '../modell/waende';
import { kante as seitenKante } from '../modell/oeffnungen';
import { kettenMasse, kettenPunkte, laengstesFreiesStueck, zeigeCm, zeigeMasse } from '../modell/masse';
import { zeichneOeffnungen } from './oeffnungen';
import { toScreen, type Viewport } from '../ansicht/viewport';

export interface RaumFarben {
  fuell: string;
  linie: string;
  text: string;
  leise: string;
  auswahl: string;
  wand: string;
  flaeche: string;
}

export const kommaZahl = (wert: number, stellen = 2): string => wert.toFixed(stellen).replace('.', ',');

export function zeichneRaeume(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  raeume: Raum[],
  farben: RaumFarben,
  auswahlId: number | null,
  auswahlOeffnung: { raumId: number; id: number } | null = null,
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

    zeichneOeffnungen(
      ctx,
      vp,
      raum,
      { flaeche: farben.flaeche, linie: farben.linie, auswahl: farben.auswahl, text: farben.text },
      auswahlOeffnung && auswahlOeffnung.raumId === raum.id ? auswahlOeffnung.id : null,
      nachbarn,
    );

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

    // Wanddicke in Zentimetern, in der Wand (auf dem längsten Stück ohne Öffnung)
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillStyle = farben.flaeche;
    for (let i = 0; i < raum.ecken.length; i++) {
      const d = dicken[i];
      const wandPx = d * vp.scale;
      const k = seitenKante(raum, i);
      const stueck = laengstesFreiesStueck(raum, i, 0.4);
      const text = zeigeCm(d);
      if (!stueck || wandPx < 11 || (Math.abs(k.dx) > 1e-9 && Math.abs(k.dy) > 1e-9)) continue;
      const senkrecht = Math.abs(k.nx) > 0.7; // Wand läuft senkrecht: Zahl muss in die Breite der Wand passen
      const breiteText = ctx.measureText(text).width;
      if (senkrecht && breiteText + 3 > wandPx) continue;
      if (Math.abs(stueck.t1 - stueck.t0) * vp.scale < breiteText + 8 && !senkrecht) continue;
      const t = (stueck.t0 + stueck.t1) / 2;
      const q = toScreen(vp, k.a.x + k.dx * t + k.nx * (d / 2), k.a.y + k.dy * t + k.ny * (d / 2));
      ctx.fillText(text, q.x, q.y);
    }

    // Maße außerhalb: Seiten mit Türen oder Fenstern bekommen eine Maßkette (Abstand, Breite, Abstand)
    // und darunter das Gesamtmaß. Seiten ohne Öffnung nur das Gesamtmaß.
    ctx.font = '12px system-ui, sans-serif';
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
      const wandPx = dicken[i] * vp.scale;
      const punkte = kettenPunkte(raum, i);
      const v1 = 20 + wandPx;
      if (punkte.length > 2) {
        const breiteMax = Math.max(...kettenMasse(punkte).map((t) => ctx.measureText(zeigeMasse(t)).width));
        // Kurze Stücke bekommen ihre Zahl eine Zeile weiter außen: Platz für zwei Zeilen zusätzlich
        masskette(ctx, a, b, laenge, punkte, nx, ny, v1, wandPx, farben, (_q, seg) => zeigeMasse(seg), false);
        masskette(ctx, a, b, laenge, [0, laenge], nx, ny, v1 + 26 + 28 * Math.abs(ny) + Math.abs(nx) * breiteMax, wandPx, farben, (_q, seg) => `${zeigeMasse(seg)} m`, true);
      } else {
        masskette(ctx, a, b, laenge, [0, laenge], nx, ny, v1, wandPx, farben, (_q, seg) => `${zeigeMasse(seg)} m`, true);
      }
    }
  }
  ctx.textAlign = 'start';
}

/** Eine Maßlinie parallel zur Seite a-b mit Hilfslinien, Endstrichen und Zahlen für jedes Teilstück. */
function masskette(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  laenge: number,
  positionen: number[],
  nx: number,
  ny: number,
  versatz: number,
  wandPx: number,
  farben: RaumFarben,
  text: (index: number, teilLaenge: number) => string,
  _immerBeschriften: boolean,
): void {
  const bild = Math.hypot(b.x - a.x, b.y - a.y);
  const tx = (b.x - a.x) / bild;
  const ty = (b.y - a.y) / bild;
  const punkt = (t: number, abstand: number) => ({
    x: a.x + ((b.x - a.x) * t) / laenge + nx * abstand,
    y: a.y + ((b.y - a.y) * t) / laenge + ny * abstand,
  });
  ctx.lineWidth = 1;
  ctx.strokeStyle = farben.leise;
  ctx.beginPath();
  const erstes = punkt(positionen[0], versatz);
  const letztes = punkt(positionen[positionen.length - 1], versatz);
  ctx.moveTo(erstes.x, erstes.y);
  ctx.lineTo(letztes.x, letztes.y);
  for (const t of positionen) {
    // Hilfslinie von der Außenseite der Wand zur Maßlinie, Endstrich schräg
    const von = punkt(t, wandPx + 4);
    const bis = punkt(t, versatz + 4);
    ctx.moveTo(von.x, von.y);
    ctx.lineTo(bis.x, bis.y);
    const m = punkt(t, versatz);
    ctx.moveTo(m.x - (tx + nx) * 4, m.y - (ty + ny) * 4);
    ctx.lineTo(m.x + (tx + nx) * 4, m.y + (ty + ny) * 4);
  }
  ctx.stroke();
  ctx.fillStyle = farben.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Jedes Teilstück bekommt seine Zahl. Passt sie nicht neben das Stück, rückt sie eine Zeile weiter nach außen
  // (abwechselnd erste und zweite Zeile, damit sich kurze Nachbarstücke nicht überdecken) und ein Strich zeigt, wohin sie gehört.
  const teile = kettenMasse(positionen);
  let kurzZaehler = 0;
  for (let q = 0; q < teile.length; q++) {
    const beschriftung = text(q, teile[q]);
    const breite = ctx.measureText(beschriftung).width;
    const teilPx = (bild * teile[q]) / laenge;
    // Platz entlang der Maßlinie, den die Zahl braucht: bei waagerechter Linie ihre Breite, bei senkrechter ihre Höhe
    const noetig = breite * Math.abs(tx) + 14 * Math.abs(ty) + 6;
    const mitte = (positionen[q] + positionen[q + 1]) / 2;
    const extra = teilPx >= noetig ? 0 : (kurzZaehler++ % 2 === 0 ? 14 : 28);
    const abstand = versatz + (breite / 2) * Math.abs(nx) + 8 * Math.abs(ny) + 6 + extra;
    if (extra > 0) {
      const von = punkt(mitte, versatz);
      const bis = punkt(mitte, versatz + extra + 2);
      ctx.beginPath();
      ctx.moveTo(von.x, von.y);
      ctx.lineTo(bis.x, bis.y);
      ctx.stroke();
    }
    const m = punkt(mitte, abstand);
    ctx.fillText(beschriftung, m.x, m.y);
  }
}
