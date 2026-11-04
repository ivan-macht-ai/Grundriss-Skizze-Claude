// Türen und Fenster so zeichnen, wie sie in einer Bauzeichnung stehen:
//  - Fenster: Wandöffnung mit Fensterlinien (innen, Mitte, außen)
//  - Tür: Wandöffnung, Türblatt und Aufschlagbogen
import { dickenVon } from '../modell/waende';
import { kante } from '../modell/oeffnungen';
import type { Raum } from '../modell/typen';
import { toScreen, type Viewport } from '../ansicht/viewport';
import { kommaZahl } from './raeume';

export interface OeffnungsFarben {
  flaeche: string;
  linie: string;
  auswahl: string;
  text: string;
}

export function zeichneOeffnungen(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  raum: Raum,
  farben: OeffnungsFarben,
  gewaehlteId: number | null,
  kantenMitBreitenzahl: Set<number> = new Set(),
): void {
  const dicken = dickenVon(raum);
  for (const o of raum.oeffnungen ?? []) {
    const k = kante(raum, o.kante);
    const px = 1 / vp.scale; // ein Bildschirmpixel in Metern
    const wand = dicken[o.kante];
    // Stärke der Darstellung: die Wanddicke, mindestens 9 Pixel (damit man bei fehlender Wand etwas sieht)
    const mindest = 9 * px;
    const innen = wand >= mindest ? 0 : -mindest / 2;
    const aussen = wand >= mindest ? wand : mindest / 2;
    const t0 = o.abstand;
    const t1 = o.abstand + o.breite;
    // Punkt: t Meter entlang der Seite, s Meter nach außen
    const welt = (t: number, s: number) => ({ x: k.a.x + k.dx * t + k.nx * s, y: k.a.y + k.dy * t + k.ny * s });
    const bild = (t: number, s: number) => {
      const w = welt(t, s);
      return toScreen(vp, w.x, w.y);
    };
    const gewaehlt = o.id === gewaehlteId;
    const farbe = gewaehlt ? farben.auswahl : farben.linie;

    // Wand und Raumlinie in der Öffnung wegnehmen
    const rand = 2.5 * px;
    const ecken = [bild(t0, Math.min(innen, 0) - rand), bild(t1, Math.min(innen, 0) - rand), bild(t1, aussen + rand), bild(t0, aussen + rand)];
    ctx.beginPath();
    ecken.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
    ctx.closePath();
    ctx.fillStyle = farben.flaeche;
    ctx.fill();

    ctx.strokeStyle = farbe;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    const linie = (t0_: number, s0: number, t1_: number, s1: number, breite: number) => {
      const a = bild(t0_, s0);
      const b = bild(t1_, s1);
      ctx.lineWidth = breite;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    // Seitenwände der Öffnung (Laibung)
    linie(t0, innen, t0, aussen, gewaehlt ? 3 : 2.5);
    linie(t1, innen, t1, aussen, gewaehlt ? 3 : 2.5);

    if (o.art === 'fenster') {
      linie(t0, innen, t1, innen, 2);
      linie(t0, aussen, t1, aussen, 2);
      linie(t0, (innen + aussen) / 2, t1, (innen + aussen) / 2, 1);
    } else {
      // Tür: Scharnier von innen gesehen links oder rechts. Von innen auf die Wand gesehen liegt links in Richtung der Seite.
      const scharnierT = o.anschlag === 'links' ? t1 : t0;
      const zu = o.anschlag === 'links' ? -1 : 1; // Richtung vom Scharnier zur anderen Laibung entlang der Seite
      const aufRichtung = o.aufschlag === 'innen' ? -1 : 1; // nach innen = gegen die Außennormale
      const h = welt(scharnierT, 0);
      const spitze = { x: h.x + k.nx * aufRichtung * o.breite, y: h.y + k.ny * aufRichtung * o.breite };
      // Aufschlagbogen: von der geschlossenen Lage entlang der Wand bis zur geöffneten Lage senkrecht dazu
      const a0 = Math.atan2(k.dy * zu, k.dx * zu);
      const a1 = Math.atan2(k.ny * aufRichtung, k.nx * aufRichtung);
      let diff = a1 - a0;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 14; i++) {
        const w = a0 + (diff * i) / 14;
        const q = toScreen(vp, h.x + Math.cos(w) * o.breite, h.y + Math.sin(w) * o.breite);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      const hs = toScreen(vp, h.x, h.y);
      const ss = toScreen(vp, spitze.x, spitze.y);
      ctx.lineWidth = gewaehlt ? 3.5 : 3;
      ctx.beginPath();
      ctx.moveTo(hs.x, hs.y);
      ctx.lineTo(ss.x, ss.y);
      ctx.stroke();
    }

    // Breite in Metern, außen neben der Wand: nur dort, wo keine Maßkette steht (Seite mit Nachbarraum)
    if (!kantenMitBreitenzahl.has(o.kante)) continue;
    const text = kommaZahl(o.breite, 3);
    ctx.font = '11px system-ui, sans-serif';
    const halb = (ctx.measureText(text).width / 2) * Math.abs(k.nx) + 6 * Math.abs(k.ny);
    const tm = bild((t0 + t1) / 2, aussen);
    const ex = tm.x + k.nx * (7 + halb);
    const ey = tm.y - k.ny * (7 + halb); // Bildschirm: y läuft nach unten
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = farben.flaeche;
    ctx.strokeText(text, ex, ey);
    ctx.fillStyle = farben.text;
    ctx.fillText(text, ex, ey);
    ctx.textAlign = 'start';
  }
}
