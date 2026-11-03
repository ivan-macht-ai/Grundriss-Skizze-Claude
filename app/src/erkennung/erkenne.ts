// Formenerkennung: aus einem groben Strich wird ein sauberes Vieleck mit Kanten nur in 0°, 45°, 90°, 135°.
// Ablauf siehe PLAN.md, Abschnitt 3.3. Alle Zahlen kommen aus config/toleranzen.ts.

import type { Toleranzen } from '../config/toleranzen';
import { flaeche, flaecheMitVorzeichen, istEinfach } from '../geometrie/polygon';
import { abstandPunktStrecke, dist, pfadLaenge, umgrenzung, type P } from '../geometrie/vec';

/** Größte erlaubte Krümmung einer Seite: Streuung der Strichpunkte um ihre Ausgleichsgerade als Anteil der Seitenlänge. */
const GERADHEIT_ANTEIL = 0.06;

export type Ergebnis = { ok: true; ecken: P[]; form: string } | { ok: false; grund: string };

const fehler = (grund: string): Ergebnis => ({ ok: false, grund });

/** Punkte in gleichen Abständen neu abtasten. */
export function abtasten(pts: P[], schritt: number): P[] {
  const aus: P[] = [pts[0]];
  let rest = schritt;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let l = dist(a, b);
    while (l >= rest && l > 0) {
      const t = rest / l;
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      aus.push(a);
      l = dist(a, b);
      rest = schritt;
    }
    rest -= l;
  }
  if (dist(aus[aus.length - 1], pts[pts.length - 1]) > schritt * 0.25) aus.push(pts[pts.length - 1]);
  return aus;
}

/** Wackler beruhigen (gleitender Mittelwert, Anfang und Ende bleiben stehen). */
export function glaette(pts: P[], fenster = 2): P[] {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let k = -fenster; k <= fenster; k++) {
      const q = pts[i + k];
      if (q) {
        sx += q.x;
        sy += q.y;
        n++;
      }
    }
    return { x: sx / n, y: sy / n };
  });
}

/** Ramer-Douglas-Peucker: lässt Punkte weg, solange die Abweichung unter eps bleibt. */
export function rdp(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts;
  let maxD = 0;
  let idx = 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = abstandPunktStrecke(pts[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [a, b];
  const links = rdp(pts.slice(0, idx + 1), eps);
  const rechts = rdp(pts.slice(idx), eps);
  return [...links.slice(0, -1), ...rechts];
}

/** Ecken eines geschlossenen Strichs (Ring): ab dem am weitesten vom Anfang entfernten Punkt in zwei Hälften vereinfachen. */
export function eckenImRing(ring: P[], eps: number): P[] {
  let m = 1;
  let md = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = dist(ring[0], ring[i]);
    if (d > md) {
      md = d;
      m = i;
    }
  }
  const a = rdp(ring.slice(0, m + 1), eps);
  const b = rdp(ring.slice(m), eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Sehr kurze Kanten verschwinden lassen: beide Endpunkte werden zu deren Mitte. */
export function kurzeKantenVerschmelzen(ecken: P[], minKante: number): P[] {
  const e = [...ecken];
  while (e.length > 3) {
    let k = 0;
    let kl = Infinity;
    for (let i = 0; i < e.length; i++) {
      const l = dist(e[i], e[(i + 1) % e.length]);
      if (l < kl) {
        kl = l;
        k = i;
      }
    }
    if (kl >= minKante) break;
    const j = (k + 1) % e.length;
    const mitte = { x: (e[k].x + e[j].x) / 2, y: (e[k].y + e[j].y) / 2 };
    e[k] = mitte;
    e.splice(j, 1);
  }
  return e;
}

/** Ecken mit sehr kleinem Knick (unter ~22°) liegen auf einer geraden Seite und fallen weg, z. B. der Startpunkt des Strichs. */
export function schwacheEckenEntfernen(ecken: P[], knickGrenze = 22.5): P[] {
  const e = [...ecken];
  while (e.length > 3) {
    let k = -1;
    let kw = knickGrenze;
    for (let i = 0; i < e.length; i++) {
      const vor = e[(i - 1 + e.length) % e.length];
      const nach = e[(i + 1) % e.length];
      const w1 = Math.atan2(e[i].y - vor.y, e[i].x - vor.x);
      const w2 = Math.atan2(nach.y - e[i].y, nach.x - e[i].x);
      let d = Math.abs(w2 - w1) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const grad = (d * 180) / Math.PI;
      if (grad < kw) {
        kw = grad;
        k = i;
      }
    }
    if (k < 0) break;
    e.splice(k, 1);
  }
  return e;
}

interface Linie {
  /** 0: waagerecht, 1: 45°, 2: senkrecht, 3: 135° */
  richtung: number;
  /** Versatz entlang der Normalen */
  c: number;
  laenge: number;
  /** Gemessene Versätze der Strichpunkte aus der Seitenmitte (für einen robusten Mittelwert) */
  proben: number[];
}

function median(werte: number[]): number {
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ordnet jeden Strichpunkt der nächsten Kante zu und behält die Punkte aus der Mitte der Kante (ohne die Ecken). */
function mittenPunkte(ecken: P[], pts: P[]): P[][] {
  const n = ecken.length;
  const listen: P[][] = ecken.map(() => []);
  for (const p of pts) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = abstandPunktStrecke(p, ecken[i], ecken[(i + 1) % n]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const a = ecken[best];
    const b = ecken[(best + 1) % n];
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (l2 === 0) continue;
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    if (t >= 0.15 && t <= 0.85) listen[best].push(p);
  }
  return listen;
}

/** Streuung (Standardabweichung) der Punkte quer zu ihrer Ausgleichsgeraden, in Metern. */
function streuungQuer(punkte: P[], gradWinkel: number): number {
  const r = (gradWinkel * Math.PI) / 180;
  const nx = -Math.sin(r);
  const ny = Math.cos(r);
  const werte = punkte.map((p) => nx * p.x + ny * p.y);
  const m = werte.reduce((a, b) => a + b, 0) / werte.length;
  return Math.sqrt(werte.reduce((a, b) => a + (b - m) ** 2, 0) / werte.length);
}

/** Richtung (Grad, 0..180) einer Punktwolke durch Ausgleichsgerade. */
function ausgleichsWinkel(punkte: P[]): number {
  const n = punkte.length;
  const mx = punkte.reduce((s, p) => s + p.x, 0) / n;
  const my = punkte.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of punkte) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const grad = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
  return ((grad % 180) + 180) % 180;
}

const richtungsVektor = (r: number) => ({ x: Math.cos((r * Math.PI) / 4), y: Math.sin((r * Math.PI) / 4) });
const normale = (r: number) => {
  const d = richtungsVektor(r);
  return { x: -d.y, y: d.x };
};

/** Kanten auf 0°/45°/90°/135° einrasten und gleiche Nachbarrichtungen zusammenlegen. */
export function kantenEinrasten(ecken: P[], pts: P[], winkelToleranz: number): Linie[] | string {
  const n = ecken.length;
  const mitte = mittenPunkte(ecken, pts);
  let linien: Linie[] = [];
  for (let i = 0; i < n; i++) {
    const a = ecken[i];
    const b = ecken[(i + 1) % n];
    const l = dist(a, b);
    if (l < 1e-6) continue;
    const punkte = mitte[i];
    let grad =
      punkte.length >= 4 ? ausgleichsWinkel(punkte) : (((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 180 + 180) % 180;
    if (punkte.length >= 6 && streuungQuer(punkte, grad) > GERADHEIT_ANTEIL * l) {
      return 'Das sieht nicht nach geraden Wänden aus. Zeichne die Ecken deutlicher.';
    }
    // Ausgleichswinkel nahe 180° zählt wie 0°
    if (grad > 157.5) grad -= 180;
    const k = Math.round(grad / 45);
    const abweichung = Math.abs(grad - 45 * k);
    if (abweichung > winkelToleranz) return 'Eine Linie ist zu schief. Zeichne sie gerader oder erhöhe die Winkel-Toleranz.';
    const r = ((k % 4) + 4) % 4;
    const nv = normale(r);
    const proben = punkte.map((p) => nv.x * p.x + nv.y * p.y);
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    linien.push({ richtung: r, c: proben.length >= 3 ? median(proben) : nv.x * m.x + nv.y * m.y, laenge: l, proben });
  }
  const verschmelze = (a: Linie, b: Linie): Linie => {
    const l = a.laenge + b.laenge;
    const proben = [...a.proben, ...b.proben];
    return {
      richtung: a.richtung,
      c: proben.length >= 3 ? median(proben) : (a.c * a.laenge + b.c * b.laenge) / l,
      laenge: l,
      proben,
    };
  };
  let geaendert = true;
  while (geaendert && linien.length > 1) {
    geaendert = false;
    const neu: Linie[] = [];
    for (const li of linien) {
      const letzte = neu[neu.length - 1];
      if (letzte && letzte.richtung === li.richtung) {
        neu[neu.length - 1] = verschmelze(letzte, li);
        geaendert = true;
      } else neu.push(li);
    }
    if (neu.length > 1 && neu[0].richtung === neu[neu.length - 1].richtung) {
      const letzte = neu.pop()!;
      neu[0] = verschmelze(neu[0], letzte);
      geaendert = true;
    }
    linien = neu;
  }
  return linien;
}

function schnittpunkt(a: Linie, b: Linie): P | null {
  const na = normale(a.richtung);
  const nb = normale(b.richtung);
  const det = na.x * nb.y - na.y * nb.x;
  if (Math.abs(det) < 1e-9) return null;
  return { x: (a.c * nb.y - b.c * na.y) / det, y: (na.x * b.c - nb.x * a.c) / det };
}

/** Läuft der Strich über seinen Anfang hinaus, wird er am Punkt gekappt, der dem Anfang am nächsten liegt (nur im letzten Viertel). */
export function ueberschussKappen(pts: P[]): P[] {
  const gesamt = pfadLaenge(pts);
  let gelaufen = 0;
  let bestIdx = pts.length - 1;
  let bestD = dist(pts[0], pts[pts.length - 1]);
  for (let i = 1; i < pts.length; i++) {
    gelaufen += dist(pts[i - 1], pts[i]);
    if (gelaufen < 0.75 * gesamt) continue;
    const d = dist(pts[0], pts[i]);
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return pts.slice(0, bestIdx + 1);
}

export function formName(ecken: P[]): string {
  const n = ecken.length;
  let nurAchsenparallel = true;
  for (let i = 0; i < n; i++) {
    const a = ecken[i];
    const b = ecken[(i + 1) % n];
    if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.y - b.y) > 1e-6) nurAchsenparallel = false;
  }
  if (!nurAchsenparallel) return 'Form mit Schräge';
  if (n === 4) return 'Rechteck';
  if (n === 6) return 'L-Form';
  if (n === 8) return 'U- oder T-Form';
  return 'Winkelform';
}

export function erkenneRaum(eingabe: P[], t: Toleranzen): Ergebnis {
  const roh = eingabe.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const l0 = pfadLaenge(roh);
  if (roh.length < 8 || l0 < 4 * t.minKante) return fehler('Der Strich ist zu kurz.');

  // Feste Abstände in Metern (nicht abhängig von der Größe), damit auch kleine Nischen und scharfe Ecken erhalten bleiben.
  const schritt = Math.min(0.05, Math.max(0.02, l0 / 400));
  const pts = ueberschussKappen(glaette(abtasten(roh, schritt), Math.max(1, Math.round(0.1 / schritt))));
  const laenge = pfadLaenge(pts);
  const luecke = dist(pts[0], pts[pts.length - 1]);
  if (luecke > Math.max(0.25, t.schliessen * laenge)) return fehler('Die Form ist nicht geschlossen. Zieh den Strich bis zum Anfang.');

  const box = umgrenzung(pts);
  const diag = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  const ring = [...pts, pts[0]];
  // Sehr kurze Seiten (kleine Rundungen an Ecken) verschwinden; die Grenze wächst mit der Größe der Zeichnung.
  const kurz = Math.max(t.minKante, Math.min(t.rundung * laenge, 0.5));
  const roheEcken = schwacheEckenEntfernen(eckenImRing(ring, Math.min(Math.max(0.04, t.ecken * diag), 0.3)));
  const ecken = schwacheEckenEntfernen(kurzeKantenVerschmelzen(roheEcken, kurz));
  if (ecken.length < 3) return fehler('Keine Ecken gefunden.');

  const linien = kantenEinrasten(ecken, pts, t.winkel);
  if (typeof linien === 'string') return fehler(linien);
  if (linien.length < 3) return fehler('Zu wenige Seiten für einen Raum.');

  // Versatz der Linien auf das Raster runden, dann Ecken als Schnittpunkte neu berechnen.
  const gerundet = linien.map((li) => ({ ...li, c: Math.round(li.c / t.raster) * t.raster }));
  const poly: P[] = [];
  for (let i = 0; i < gerundet.length; i++) {
    const vorher = gerundet[(i - 1 + gerundet.length) % gerundet.length];
    const s = schnittpunkt(vorher, gerundet[i]);
    if (!s) return fehler('Zwei Seiten laufen parallel nebeneinander.');
    poly.push(s);
  }

  const grenze = 0.5 * diag + 1;
  for (const p of poly) {
    if (p.x < box.minX - grenze || p.x > box.maxX + grenze || p.y < box.minY - grenze || p.y > box.maxY + grenze) {
      return fehler('Die Form ist nicht eindeutig. Zeichne sie noch einmal.');
    }
  }
  for (let i = 0; i < poly.length; i++) {
    if (dist(poly[i], poly[(i + 1) % poly.length]) < t.minKante * 0.5) return fehler('Eine Seite ist zu kurz.');
  }
  if (!istEinfach(poly)) return fehler('Die Linien kreuzen sich. Zeichne die Form ohne Überschneidung.');
  if (flaeche(poly) < t.minFlaeche) return fehler('Die Fläche ist zu klein für einen Raum.');

  const ccw = flaecheMitVorzeichen(poly) > 0 ? poly : [...poly].reverse();
  return { ok: true, ecken: ccw, form: formName(ccw) };
}
