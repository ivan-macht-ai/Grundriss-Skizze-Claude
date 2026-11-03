// Hilfen für Tests: erzeugt künstlich verwackelte Striche, wie eine Hand sie zeichnen würde.
import type { P } from '../src/geometrie/vec';

/** Kleiner Zufallsgenerator mit festem Startwert, damit Tests immer gleich laufen. */
export function zufall(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StrichOptionen {
  /** Wackeln quer zur Linie in Metern (größter Ausschlag) */
  rauschen?: number;
  seed?: number;
  /** Startpunkt auf dem Umfang als Anteil 0..1 */
  start?: number;
  /** Lücke am Ende als Anteil des Umfangs (Strich hört zu früh auf) */
  luecke?: number;
  /** Überlappung am Ende als Anteil des Umfangs (Strich läuft über den Start hinaus) */
  ueberlapp?: number;
  /** Ecken abrunden mit diesem Radius in Metern */
  rund?: number;
  /** Drehung des Ganzen in Grad */
  drehung?: number;
  schritt?: number;
}

function drehe(p: P, grad: number): P {
  const r = (grad * Math.PI) / 180;
  return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) };
}

/** Ecken mit dem Radius r (Meter) abrunden: Kurve von kurz vor der Ecke bis kurz dahinter. */
function abrunden(ring: P[], r: number): P[] {
  const aus: P[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const v = ring[i];
    const p = ring[(i - 1 + n) % n];
    const q = ring[(i + 1) % n];
    const lp = Math.hypot(p.x - v.x, p.y - v.y);
    const lq = Math.hypot(q.x - v.x, q.y - v.y);
    const rp = Math.min(r, 0.4 * lp);
    const rq = Math.min(r, 0.4 * lq);
    const a = { x: v.x + ((p.x - v.x) / lp) * rp, y: v.y + ((p.y - v.y) / lp) * rp };
    const b = { x: v.x + ((q.x - v.x) / lq) * rq, y: v.y + ((q.y - v.y) / lq) * rq };
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      aus.push({
        x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * v.x + t * t * b.x,
        y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * v.y + t * t * b.y,
      });
    }
  }
  return aus;
}

/** Strich entlang des Umfangs eines Vielecks, mit Wackeln. */
export function strichUmVieleck(ecken: P[], o: StrichOptionen = {}): P[] {
  const rnd = zufall(o.seed ?? 1);
  const ring = o.rund ? abrunden(ecken, o.rund) : ecken;
  const kanten = ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length] }));
  const laengen = kanten.map((k) => Math.hypot(k.b.x - k.a.x, k.b.y - k.a.y));
  const umfang = laengen.reduce((s, l) => s + l, 0);
  const schritt = o.schritt ?? 0.03;
  const gesamt = umfang * (1 - (o.luecke ?? 0) + (o.ueberlapp ?? 0));
  const start = (o.start ?? 0) * umfang;
  const aus: P[] = [];
  let langsam = 0; // langsames Schlängeln wie bei einer Hand
  for (let s = 0; s <= gesamt; s += schritt) {
    let pos = (start + s) % umfang;
    let i = 0;
    while (pos > laengen[i]) {
      pos -= laengen[i];
      i++;
    }
    const k = kanten[i];
    const t = pos / laengen[i];
    const x = k.a.x + (k.b.x - k.a.x) * t;
    const y = k.a.y + (k.b.y - k.a.y) * t;
    const nx = -(k.b.y - k.a.y) / laengen[i];
    const ny = (k.b.x - k.a.x) / laengen[i];
    langsam = langsam * 0.92 + (rnd() - 0.5) * 0.35;
    const w = (o.rauschen ?? 0) * Math.max(-1, Math.min(1, langsam * 2 + (rnd() - 0.5) * 0.6));
    aus.push(drehe({ x: x + nx * w, y: y + ny * w }, o.drehung ?? 0));
  }
  return aus;
}

export const rechteck = (b: number, h: number, x = 0, y = 0): P[] => [
  { x, y },
  { x: x + b, y },
  { x: x + b, y: y + h },
  { x, y: y + h },
];

export const lForm: P[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 1.5 },
  { x: 2, y: 1.5 },
  { x: 2, y: 3 },
  { x: 0, y: 3 },
];

export const uForm: P[] = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 5, y: 3 },
  { x: 3.5, y: 3 },
  { x: 3.5, y: 1 },
  { x: 1.5, y: 1 },
  { x: 1.5, y: 3 },
  { x: 0, y: 3 },
];

export const mitSchraege: P[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 2 },
  { x: 3, y: 3 },
  { x: 0, y: 3 },
];

export function kreis(r: number, n = 120): P[] {
  const aus: P[] = [];
  for (let i = 0; i <= n; i++) aus.push({ x: r * Math.cos((i / n) * 2 * Math.PI), y: r * Math.sin((i / n) * 2 * Math.PI) });
  return aus;
}

export function gekritzel(seed: number): P[] {
  const rnd = zufall(seed);
  const aus: P[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 200; i++) {
    x += (rnd() - 0.5) * 0.4;
    y += (rnd() - 0.5) * 0.4;
    aus.push({ x, y });
  }
  return aus;
}
