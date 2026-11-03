// Türen und Fenster: Platzieren, Suchen, Prüfen (reine Rechenlogik).
import { abstandPunktStrecke, dist, type P } from '../geometrie/vec';
import type { Oeffnung, Raum } from './typen';

export const STANDARD_TUER = 0.885;
export const STANDARD_FENSTER = 1.0;
export const MIN_BREITE = 0.3;
export const RAND_ZUR_ECKE = 0.05;
const RASTER = 0.05;

export interface Kante {
  a: P;
  b: P;
  laenge: number;
  /** Richtung der Seite */
  dx: number;
  dy: number;
  /** Nach außen zeigende Normale (Räume sind gegen den Uhrzeigersinn, außen ist rechts der Richtung) */
  nx: number;
  ny: number;
}

export function kante(raum: Raum, i: number): Kante {
  const a = raum.ecken[i];
  const b = raum.ecken[(i + 1) % raum.ecken.length];
  const laenge = dist(a, b);
  const l = laenge || 1;
  const dx = (b.x - a.x) / l;
  const dy = (b.y - a.y) / l;
  return { a, b, laenge, dx, dy, nx: dy, ny: -dx };
}

/** Anfangs- und Endpunkt der Öffnung auf der inneren Wandkante. */
export function oeffnungsSegment(raum: Raum, o: Oeffnung): { p0: P; p1: P } {
  const k = kante(raum, o.kante);
  return {
    p0: { x: k.a.x + k.dx * o.abstand, y: k.a.y + k.dy * o.abstand },
    p1: { x: k.a.x + k.dx * (o.abstand + o.breite), y: k.a.y + k.dy * (o.abstand + o.breite) },
  };
}

export interface KantenTreffer {
  raum: Raum;
  kante: number;
  /** Position entlang der Seite in Metern ab ihrem Anfang */
  t: number;
  abstandZurKante: number;
}

/** Findet die Seite (waagerecht, senkrecht oder schräg), die dem Punkt am nächsten liegt, aber höchstens `toleranz` entfernt. */
export function findeKante(raeume: Raum[], wx: number, wy: number, toleranz: number): KantenTreffer | null {
  let beste: KantenTreffer | null = null;
  const p = { x: wx, y: wy };
  for (const raum of raeume) {
    for (let i = 0; i < raum.ecken.length; i++) {
      const k = kante(raum, i);
      if (k.laenge < 1e-9) continue;
      const d = abstandPunktStrecke(p, k.a, k.b);
      if (d <= toleranz && (!beste || d < beste.abstandZurKante)) {
        const t = (wx - k.a.x) * k.dx + (wy - k.a.y) * k.dy;
        beste = { raum, kante: i, t: Math.max(0, Math.min(k.laenge, t)), abstandZurKante: d };
      }
    }
  }
  return beste;
}

export interface OeffnungsTreffer {
  raum: Raum;
  oeffnung: Oeffnung;
}

/** Findet die Öffnung, die dem Punkt am nächsten liegt (höchstens `toleranz` von ihrer Wandkante entfernt). */
export function findeOeffnung(raeume: Raum[], wx: number, wy: number, toleranz: number): OeffnungsTreffer | null {
  let beste: (OeffnungsTreffer & { d: number }) | null = null;
  const p = { x: wx, y: wy };
  for (const raum of raeume) {
    for (const o of raum.oeffnungen ?? []) {
      const { p0, p1 } = oeffnungsSegment(raum, o);
      const d = abstandPunktStrecke(p, p0, p1);
      if (d <= toleranz && (!beste || d < beste.d)) beste = { raum, oeffnung: o, d };
    }
  }
  return beste ? { raum: beste.raum, oeffnung: beste.oeffnung } : null;
}

/** Prüft eine Öffnung. Gibt eine Meldung zurück, wenn sie nicht passt, sonst null. */
export function pruefeOeffnung(raum: Raum, o: Oeffnung): string | null {
  const k = kante(raum, o.kante);
  if (!(o.breite >= MIN_BREITE)) return `Die Breite muss mindestens ${String(MIN_BREITE * 100)} cm sein.`;
  if (o.abstand < RAND_ZUR_ECKE - 1e-9) return 'Zu nah an der Ecke. Lass mindestens 5 cm Abstand zur Ecke.';
  if (o.abstand + o.breite > k.laenge - RAND_ZUR_ECKE + 1e-9) return 'Die Öffnung ist zu breit für diese Seite.';
  for (const q of raum.oeffnungen ?? []) {
    if (q.id === o.id || q.kante !== o.kante) continue;
    if (o.abstand < q.abstand + q.breite && q.abstand < o.abstand + o.breite) return 'Hier liegt schon eine andere Öffnung.';
  }
  return null;
}

/** Neue Öffnung, mittig an der Stelle t der Seite. Gibt eine Meldung zurück, wenn kein Platz ist. */
export function neueOeffnung(raum: Raum, kanteIndex: number, t: number, art: 'tuer' | 'fenster'): Oeffnung | string {
  const k = kante(raum, kanteIndex);
  const breite = art === 'tuer' ? STANDARD_TUER : STANDARD_FENSTER;
  if (breite + 2 * RAND_ZUR_ECKE > k.laenge) return 'Diese Seite ist zu kurz für die Öffnung.';
  const gewuenscht = t - breite / 2;
  const abstand = Math.min(Math.max(Math.round(gewuenscht / RASTER) * RASTER, RAND_ZUR_ECKE), k.laenge - breite - RAND_ZUR_ECKE);
  const id = Math.max(0, ...(raum.oeffnungen ?? []).map((q) => q.id)) + 1;
  const o: Oeffnung = { id, art, kante: kanteIndex, abstand: Math.round(abstand * 1000) / 1000, breite, anschlag: 'links', aufschlag: 'innen' };
  return pruefeOeffnung(raum, o) ?? o;
}

/** Nach einer Maßänderung am Raum: Öffnungen verschieben sich, wenn sie nicht mehr passen; zu breite fallen weg. */
export function passeOeffnungenAn(raum: Raum): void {
  if (!raum.oeffnungen) return;
  raum.oeffnungen = raum.oeffnungen
    .map((o) => {
      const k = kante(raum, o.kante);
      if (o.breite + 2 * RAND_ZUR_ECKE > k.laenge) return null;
      const abstand = Math.min(Math.max(o.abstand, RAND_ZUR_ECKE), k.laenge - o.breite - RAND_ZUR_ECKE);
      return { ...o, abstand: Math.round(abstand * 1000) / 1000 };
    })
    .filter((o): o is Oeffnung => o !== null);
  if (raum.oeffnungen.length === 0) delete raum.oeffnungen;
}

/** Verschiebt eine Öffnung entlang ihrer Seite, sodass der Griffpunkt bei `t` bleibt. Rastet auf 5 cm. Gibt die neue Lage zurück. */
export function verschiebeOeffnung(raum: Raum, o: Oeffnung, t: number, griffVersatz: number): number {
  const k = kante(raum, o.kante);
  const gewuenscht = t - griffVersatz - o.breite / 2;
  let abstand = Math.min(Math.max(Math.round(gewuenscht / RASTER) * RASTER, RAND_ZUR_ECKE), k.laenge - o.breite - RAND_ZUR_ECKE);
  // Nicht in eine andere Öffnung auf derselben Seite hineinschieben
  for (const q of raum.oeffnungen ?? []) {
    if (q.id === o.id || q.kante !== o.kante) continue;
    if (abstand < q.abstand + q.breite && q.abstand < abstand + o.breite) {
      abstand = o.abstand;
      break;
    }
  }
  return Math.round(abstand * 1000) / 1000;
}
