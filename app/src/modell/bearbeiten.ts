// Räume bearbeiten (reine Rechenlogik, ohne Oberfläche).
import { istEinfach } from '../geometrie/polygon';
import { dist, type P } from '../geometrie/vec';

const KLEINSTE_KANTE = 0.1;

export const achsenparallel = (a: P, b: P): boolean => Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9;

/**
 * Ändert die Länge der Seite i. Die Wand am Ende der Seite wandert mit (beide Ecken der folgenden Seite).
 * Nur für waagerechte und senkrechte Seiten; sonst null. Ergibt sich keine gültige Form, ebenfalls null.
 */
export function setzeKantenlaenge(ecken: P[], i: number, neueLaenge: number): P[] | null {
  const n = ecken.length;
  const a = ecken[i];
  const b = ecken[(i + 1) % n];
  if (!achsenparallel(a, b) || !(neueLaenge >= KLEINSTE_KANTE)) return null;
  const alt = dist(a, b);
  if (alt < 1e-9) return null;
  const dx = (b.x - a.x) / alt;
  const dy = (b.y - a.y) / alt;
  const delta = neueLaenge - alt;
  const neu = ecken.map((p) => ({ ...p }));
  const verschiebe = (k: number) => {
    neu[k] = { x: ecken[k].x + dx * delta, y: ecken[k].y + dy * delta };
  };
  verschiebe((i + 1) % n);
  const c = ecken[(i + 2) % n];
  // Ist die folgende Seite waagerecht/senkrecht, wandert die ganze Wand mit, sonst nur die Ecke (Schräge ändert sich)
  if (achsenparallel(b, c) && n > 3) verschiebe((i + 2) % n);
  const gerundet = neu.map((p) => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }));
  for (let k = 0; k < n; k++) if (dist(gerundet[k], gerundet[(k + 1) % n]) < KLEINSTE_KANTE) return null;
  return istEinfach(gerundet) ? gerundet : null;
}

export function verschiebeRaum(ecken: P[], dx: number, dy: number): P[] {
  return ecken.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Ist der Punkt im Vieleck (Strahlverfahren)? */
export function punktImVieleck(p: P, poly: P[]): boolean {
  let innen = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) innen = !innen;
  }
  return innen;
}

/**
 * Rastet einen verschobenen Raum an anderen Räumen ein: Liegt eine senkrechte oder waagerechte Seite
 * nahe an einer Seite eines anderen Raums, wird sie bündig gesetzt. Gibt die korrigierte Verschiebung zurück.
 */
export function ausrichten(bewegt: P[], andere: P[][], dx: number, dy: number, schwelle: number): { dx: number; dy: number } {
  const suche = (eigene: number[], fremde: number[], d: number): number => {
    let beste = 0;
    let bestD = schwelle;
    for (const e of eigene) {
      for (const f of fremde) {
        const abw = f - (e + d);
        if (Math.abs(abw) < bestD) {
          bestD = Math.abs(abw);
          beste = abw;
        }
      }
    }
    return d + beste;
  };
  const fremdX = andere.flatMap((r) => r.map((p) => p.x));
  const fremdY = andere.flatMap((r) => r.map((p) => p.y));
  return { dx: suche(bewegt.map((p) => p.x), fremdX, dx), dy: suche(bewegt.map((p) => p.y), fremdY, dy) };
}

/** Beschreibt eine Seite in Worten: "oben", "links" usw., sonst "Schräge". */
export function seitenName(ecken: P[], i: number, mitte: P): string {
  const a = ecken[i];
  const b = ecken[(i + 1) % ecken.length];
  if (Math.abs(a.y - b.y) < 1e-9) return a.y >= mitte.y ? 'oben' : 'unten';
  if (Math.abs(a.x - b.x) < 1e-9) return a.x >= mitte.x ? 'rechts' : 'links';
  return 'Schräge';
}
