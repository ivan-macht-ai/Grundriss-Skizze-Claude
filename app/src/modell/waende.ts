// Wände: Umriss um einen Raum, Zwischenwand zwischen zwei Räumen, Dicke lesen (reine Rechenlogik).
import { dist, type P } from '../geometrie/vec';
import type { Raum } from './typen';

export const dickenVon = (raum: Raum): number[] => raum.ecken.map((_, i) => raum.waende?.[i] ?? 0);

/** Liest eine Wanddicke und gibt Meter zurück. Ohne Einheit gilt Zentimeter ("24" = 24 cm). Null ist erlaubt (keine Wand). */
export function leseDicke(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d+(?:[.,]\d+)?)(cm|m|mm)?$/.exec(t);
  if (!m) return null;
  const zahl = parseFloat(m[1].replace(',', '.'));
  const meter = m[2] === 'm' ? zahl : m[2] === 'mm' ? zahl / 1000 : zahl / 100;
  if (!Number.isFinite(meter) || meter > 1) return null;
  return Math.round(meter * 1000) / 1000;
}

/**
 * Außenumriss der Wände: jede Seite wird um ihre Dicke nach außen versetzt, an den Ecken werden die versetzten
 * Linien verschnitten (Gehrung). Die Seiten des Rechts-Rings sind gegen den Uhrzeigersinn, außen ist rechts der Richtung.
 */
export function waendeUmriss(ecken: P[], dicken: number[]): P[] {
  const n = ecken.length;
  const linien = ecken.map((a, i) => {
    const b = ecken[(i + 1) % n];
    const l = dist(a, b) || 1;
    const dx = (b.x - a.x) / l;
    const dy = (b.y - a.y) / l;
    const nx = dy;
    const ny = -dx;
    const d = dicken[i] ?? 0;
    return { px: a.x + nx * d, py: a.y + ny * d, dx, dy, nx, ny, d };
  });
  return ecken.map((v, i) => {
    const vor = linien[(i - 1 + n) % n];
    const nach = linien[i];
    const det = vor.dx * nach.dy - vor.dy * nach.dx;
    if (Math.abs(det) < 1e-9) return { x: v.x + nach.nx * nach.d, y: v.y + nach.ny * nach.d };
    const t = ((nach.px - vor.px) * nach.dy - (nach.py - vor.py) * nach.dx) / det;
    return { x: vor.px + vor.dx * t, y: vor.py + vor.dy * t };
  });
}

export interface Zwischenwand {
  andereId: number;
  /** Seite des gezogenen Raums */
  kante: number;
  /** Seite des anderen Raums */
  andereKante: number;
  /** Heutiger Abstand der beiden Seiten in Metern */
  abstand: number;
  /** Nach außen zeigende Richtung der Seite des gezogenen Raums (zeigt zum anderen Raum) */
  nx: number;
  ny: number;
}

/** Eine Fundstelle: zusätzlich, wie stark sich die Seiten überlappen und ob schon eine passende Wand liegt. */
export interface Fundstelle extends Zwischenwand {
  ueberlapp: number;
  passt: boolean;
}

/**
 * Alle Seiten eines Raums, die einem anderen Raum gegenüberliegen (höchstens `maxAbstand` entfernt, mindestens
 * `minUeberlapp` Überlappung, nur waagerechte und senkrechte Seiten). Je Seite zählt der Nachbar mit der größten Überlappung.
 */
export function nachbarSeiten(raum: Raum, andere: Raum[], maxAbstand = 0.6, minUeberlapp = 0.3): Fundstelle[] {
  const n = raum.ecken.length;
  const treffer: Fundstelle[] = [];
  for (let i = 0; i < n; i++) {
    const a = raum.ecken[i];
    const b = raum.ecken[(i + 1) % n];
    const l = dist(a, b);
    if (l < 1e-9) continue;
    const dx = (b.x - a.x) / l;
    const dy = (b.y - a.y) / l;
    if (Math.abs(dx) > 1e-9 && Math.abs(dy) > 1e-9) continue; // nur waagerecht oder senkrecht
    const nx = dy;
    const ny = -dx;
    let beste: Fundstelle | null = null;
    for (const o of andere) {
      const m = o.ecken.length;
      for (let j = 0; j < m; j++) {
        const c = o.ecken[j];
        const e = o.ecken[(j + 1) % m];
        const lo = dist(c, e);
        if (lo < 1e-9) continue;
        const ex = (e.x - c.x) / lo;
        const ey = (e.y - c.y) / lo;
        if (ex * dx + ey * dy > -0.999) continue; // gegenläufig und parallel
        const s = (c.x - a.x) * nx + (c.y - a.y) * ny;
        if (s < -0.001 || s > maxAbstand) continue;
        const t1 = (c.x - a.x) * dx + (c.y - a.y) * dy;
        const t2 = (e.x - a.x) * dx + (e.y - a.y) * dy;
        const ueberlapp = Math.min(l, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2));
        if (ueberlapp < minUeberlapp) continue;
        const dicke = raum.waende?.[i] ?? 0;
        if (!beste || ueberlapp > beste.ueberlapp) {
          beste = {
            andereId: o.id,
            kante: i,
            andereKante: j,
            abstand: Math.max(0, s),
            nx,
            ny,
            ueberlapp,
            passt: dicke > 0 && Math.abs(dicke - s) < 0.003,
          };
        }
      }
    }
    if (beste) treffer.push(beste);
  }
  return treffer;
}

/** Sucht eine Zwischenwand, nach der gefragt werden soll: die Fundstelle mit der größten Überlappung, an der noch keine passende Wand liegt. */
export function findeZwischenwand(raum: Raum, andere: Raum[], maxAbstand = 0.6, minUeberlapp = 0.3): Zwischenwand | null {
  const offene = nachbarSeiten(raum, andere, maxAbstand, minUeberlapp).filter((f) => !f.passt);
  if (offene.length === 0) return null;
  offene.sort((x, y) => y.ueberlapp - x.ueberlapp);
  const { andereId, kante, andereKante, abstand, nx, ny } = offene[0];
  return { andereId, kante, andereKante, abstand, nx, ny };
}
