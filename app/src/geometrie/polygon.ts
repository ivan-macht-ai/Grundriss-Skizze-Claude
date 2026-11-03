import type { P } from './vec';

/** Fläche mit Vorzeichen (positiv bei Gegenuhrzeigersinn, y nach oben). */
export function flaecheMitVorzeichen(poly: P[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const flaeche = (poly: P[]): number => Math.abs(flaecheMitVorzeichen(poly));

export function schwerpunkt(poly: P[]): P {
  const a = flaecheMitVorzeichen(poly);
  if (Math.abs(a) < 1e-9) {
    const n = poly.length;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const k = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

const kreuz = (o: P, a: P, b: P): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Schneiden sich die Strecken a-b und c-d echt (Berührung an Endpunkten zählt nicht)? */
export function streckenKreuzen(a: P, b: P, c: P, d: P): boolean {
  const d1 = kreuz(a, b, c);
  const d2 = kreuz(a, b, d);
  const d3 = kreuz(c, d, a);
  const d4 = kreuz(c, d, b);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}

/** Keine Selbstüberschneidung: kein Paar nicht benachbarter Kanten kreuzt sich. */
export function istEinfach(poly: P[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (streckenKreuzen(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}
