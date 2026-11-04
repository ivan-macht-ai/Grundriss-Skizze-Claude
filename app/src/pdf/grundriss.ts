// Das fertige PDF: alles, was gezeichnet wurde, als Vektorlinien im Maßstab auf A4.
// Nur Linien und Text, keine Bilder. Wände und Öffnungen als Umrisse (gut zu importieren), Maße außerhalb.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { schwerpunkt, flaeche } from '../geometrie/polygon';
import { dist, umgrenzung, type P } from '../geometrie/vec';
import type { Oeffnung, Raum } from '../modell/typen';
import { kante } from '../modell/oeffnungen';
import { dickenVon, nachbarSeiten, waendeUmriss } from '../modell/waende';
import { MM_ZU_PUNKT, seitenGroesse } from './blatt';

export const MASSSTAB_KANDIDATEN = [20, 25, 50, 100, 200] as const;

const RAND_MM = 10;
const KOPF_MM = 24; // Höhe des Schriftkopfs
const FUSS_MM = RAND_MM + KOPF_MM + 4; // freier Streifen unten für Schriftkopf und Maßstabsbalken
const MASSRAND_MM = 15; // Platz rund um die Zeichnung für Maßlinien
const SCHWARZ = rgb(0.08, 0.08, 0.08);
const GRAU = rgb(0.35, 0.35, 0.35);

export interface Kunde {
  name: string;
  adresse: string;
  nummer: string;
}

export interface PdfOptionen {
  quer: boolean;
  nenner: number | 'auto';
  kunde: Kunde;
  datum: string;
}

export interface Layout {
  nenner: number;
  /** Punkt pro Meter (Wirklichkeit) */
  skala: number;
  /** Weltpunkt (Meter) -> PDF-Punkt */
  pt: (x: number, y: number) => P;
  passt: boolean;
  hinweis?: string;
}

/** Umgrenzung aller Räume samt ihrer Wände, in Metern. */
export function huelle(raeume: Raum[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts: P[] = [];
  for (const r of raeume) pts.push(...waendeUmriss(r.ecken, dickenVon(r)), ...r.ecken);
  return umgrenzung(pts);
}

/** Wählt den Maßstab und berechnet die Lage der Zeichnung auf dem Blatt (mittig im freien Bereich). */
export function berechneLayout(raeume: Raum[], quer: boolean, nenner: number | 'auto'): Layout {
  const { breite, hoehe } = seitenGroesse(quer);
  const blattBreiteMm = breite / MM_ZU_PUNKT;
  const blattHoeheMm = hoehe / MM_ZU_PUNKT;
  const freiB = blattBreiteMm - 2 * RAND_MM;
  const freiH = blattHoeheMm - RAND_MM - FUSS_MM;
  const h = huelle(raeume);
  const bw = h.maxX - h.minX;
  const bh = h.maxY - h.minY;
  const braucht = (n: number) => ({ b: (bw * 1000) / n + 2 * MASSRAND_MM, h: (bh * 1000) / n + 2 * MASSRAND_MM });
  const passtBei = (n: number) => braucht(n).b <= freiB && braucht(n).h <= freiH;
  const erstes = MASSSTAB_KANDIDATEN.find((n) => passtBei(n));

  let n: number;
  let passt = true;
  let hinweis: string | undefined;
  if (nenner === 'auto') {
    n = erstes ?? MASSSTAB_KANDIDATEN[MASSSTAB_KANDIDATEN.length - 1];
    if (!erstes) {
      passt = false;
      hinweis = `Die Zeichnung ist so groß, dass sie auch bei 1:${n} nicht ganz auf das Blatt passt.`;
    }
  } else {
    n = nenner;
    if (!passtBei(n)) {
      passt = false;
      hinweis = erstes
        ? `Bei 1:${n} passt die Zeichnung nicht auf das Blatt. Vorschlag: 1:${erstes}.`
        : `Bei 1:${n} passt die Zeichnung nicht auf das Blatt, und auch kleinere Maßstäbe reichen nicht.`;
    }
  }
  const skala = ((1000 / n) * MM_ZU_PUNKT);
  const freiBpt = freiB * MM_ZU_PUNKT;
  const freiHpt = freiH * MM_ZU_PUNKT;
  const x0 = RAND_MM * MM_ZU_PUNKT + (freiBpt - bw * skala) / 2 - h.minX * skala;
  const y0 = FUSS_MM * MM_ZU_PUNKT + (freiHpt - bh * skala) / 2 - h.minY * skala;
  return { nenner: n, skala, pt: (x, y) => ({ x: x0 + x * skala, y: y0 + y * skala }), passt, hinweis };
}

/** Teilstücke von [von, bis], aus denen die gesperrten Bereiche herausgeschnitten sind. */
export function streckenOhne(von: number, bis: number, sperren: [number, number][]): [number, number][] {
  const sortiert = [...sperren].sort((a, b) => a[0] - b[0]);
  const aus: [number, number][] = [];
  let pos = von;
  for (const [s0, s1] of sortiert) {
    if (s1 <= pos) continue;
    if (s0 > pos) aus.push([pos, Math.min(s0, bis)]);
    pos = Math.max(pos, s1);
    if (pos >= bis) break;
  }
  if (pos < bis) aus.push([pos, bis]);
  return aus.filter(([a, b]) => b - a > 1e-6);
}

const komma = (wert: number, stellen = 2): string => wert.toFixed(stellen).replace('.', ',');

/** Text so kürzen und bereinigen, dass die Standardschrift ihn darstellen kann. */
function sicher(font: PDFFont, text: string, maxBreite?: number): string {
  let aus = '';
  for (const zeichen of text.replace(/\s+/g, ' ')) {
    try {
      font.encodeText(zeichen);
      aus += zeichen;
    } catch {
      aus += '?';
    }
  }
  if (maxBreite === undefined) return aus;
  let kurz = aus;
  while (kurz.length > 1 && font.widthOfTextAtSize(kurz, 8) > maxBreite) kurz = kurz.slice(0, -1);
  return kurz === aus ? aus : `${kurz.trimEnd()}...`;
}

interface Werkzeug {
  page: PDFPage;
  font: PDFFont;
  fett: PDFFont;
  l: Layout;
}

function linie(w: Werkzeug, a: P, b: P, staerkeMm: number, farbe = SCHWARZ): void {
  w.page.drawLine({ start: a, end: b, thickness: staerkeMm * MM_ZU_PUNKT, color: farbe });
}

/** Text waagerecht, Mitte bei (x, y). */
function textMitte(w: Werkzeug, text: string, x: number, y: number, groesse: number, fett = false, farbe = SCHWARZ): void {
  const f = fett ? w.fett : w.font;
  const breite = f.widthOfTextAtSize(text, groesse);
  w.page.drawText(text, { x: x - breite / 2, y: y - groesse * 0.35, size: groesse, font: f, color: farbe });
}

function zeichneRaum(w: Werkzeug, raum: Raum, andere: Raum[]): void {
  const { l } = w;
  const n = l.nenner;
  const mm = (wert: number) => (wert * n) / 1000; // Millimeter auf dem Papier -> Meter in der Wirklichkeit
  const dicken = dickenVon(raum);
  const aussen = waendeUmriss(raum.ecken, dicken);
  const anzahl = raum.ecken.length;
  const minD = mm(1.6);
  const welt = (p: P) => l.pt(p.x, p.y);

  // Wände und Raumlinie: je Seite innen und außen, in den Öffnungen unterbrochen
  for (let i = 0; i < anzahl; i++) {
    const k = kante(raum, i);
    const d = dicken[i];
    const oeff = (raum.oeffnungen ?? []).filter((o) => o.kante === i);
    const sperren: [number, number][] = oeff.map((o) => [o.abstand, o.abstand + o.breite]);
    const punkt = (t: number, s: number): P => welt({ x: k.a.x + k.dx * t + k.nx * s, y: k.a.y + k.dy * t + k.ny * s });
    for (const [t0, t1] of streckenOhne(0, k.laenge, sperren)) linie(w, punkt(t0, 0), punkt(t1, 0), 0.5);
    if (d > 0.0005) {
      const ts = (aussen[i].x - k.a.x) * k.dx + (aussen[i].y - k.a.y) * k.dy;
      const te = (aussen[(i + 1) % anzahl].x - k.a.x) * k.dx + (aussen[(i + 1) % anzahl].y - k.a.y) * k.dy;
      for (const [t0, t1] of streckenOhne(ts, te, sperren)) linie(w, punkt(t0, d), punkt(t1, d), 0.5);
      // Abschluss der Wand an den Enden der Seite
      linie(w, punkt(0, 0), welt(aussen[i]), 0.5);
    }
    for (const o of oeff) zeichneOeffnung(w, raum, o, d, minD, mm);
  }

  // Name und Fläche
  const c = schwerpunkt(raum.ecken);
  const m = l.pt(c.x, c.y);
  textMitte(w, sicher(w.fett, raum.name, 120), m.x, m.y + 4, 10, true);
  textMitte(w, `${komma(flaeche(raum.ecken))} m²`, m.x, m.y - 6, 8, false, GRAU);

  // Maße (Innenlängen) außerhalb der Wand; an Seiten mit Nachbarraum keine, dort würden sie sich überlagern
  const nachbarn = new Set(nachbarSeiten(raum, andere, 0.7).map((f) => f.kante));
  for (let i = 0; i < anzahl; i++) {
    const k = kante(raum, i);
    if (nachbarn.has(i) || k.laenge * 1000 / n < 8) continue; // zu kurz auf dem Papier (unter 8 mm)
    const d = dicken[i];
    // Trägt die Seite Türen oder Fenster, steht dort deren Breite neben der Wand: Maßlinie weiter nach außen
    const traegtOeffnung = (raum.oeffnungen ?? []).some((o) => o.kante === i);
    const D = d + mm(8 + (traegtOeffnung ? Math.abs(k.nx) * 7 + Math.abs(k.ny) * 2.5 : 0));
    const P2 = (t: number, s: number): P => w.l.pt(k.a.x + k.dx * t + k.nx * s, k.a.y + k.dy * t + k.ny * s);
    linie(w, P2(0, d + mm(1.2)), P2(0, D + mm(1.2)), 0.25, GRAU);
    linie(w, P2(k.laenge, d + mm(1.2)), P2(k.laenge, D + mm(1.2)), 0.25, GRAU);
    linie(w, P2(0, D), P2(k.laenge, D), 0.25, GRAU);
    // Endstriche
    for (const t of [0, k.laenge]) {
      const mitte = { x: k.a.x + k.dx * t + k.nx * D, y: k.a.y + k.dy * t + k.ny * D };
      const e = mm(1.2);
      linie(
        w,
        l.pt(mitte.x - (k.dx + k.nx) * e, mitte.y - (k.dy + k.ny) * e),
        l.pt(mitte.x + (k.dx + k.nx) * e, mitte.y + (k.dy + k.ny) * e),
        0.35,
        GRAU,
      );
    }
    const text = komma(k.laenge);
    const tb = w.font.widthOfTextAtSize(text, 7);
    const halb = (tb / 2) * Math.abs(k.nx) + 3 * Math.abs(k.ny);
    const mitteP = P2(k.laenge / 2, D);
    textMitte(w, text, mitteP.x + k.nx * (3 + halb), mitteP.y + k.ny * (3 + halb), 7);
  }
}

function zeichneOeffnung(w: Werkzeug, raum: Raum, o: Oeffnung, d: number, minD: number, mm: (v: number) => number): void {
  const { l } = w;
  const k = kante(raum, o.kante);
  const innen = d >= minD ? 0 : -minD / 2;
  const aussen = d >= minD ? d : minD / 2;
  const t0 = o.abstand;
  const t1 = o.abstand + o.breite;
  const wp = (t: number, s: number): P => ({ x: k.a.x + k.dx * t + k.nx * s, y: k.a.y + k.dy * t + k.ny * s });
  const bild = (t: number, s: number): P => {
    const q = wp(t, s);
    return l.pt(q.x, q.y);
  };
  // Laibungen
  linie(w, bild(t0, innen), bild(t0, aussen), 0.5);
  linie(w, bild(t1, innen), bild(t1, aussen), 0.5);

  if (o.art === 'fenster') {
    linie(w, bild(t0, innen), bild(t1, innen), 0.35);
    linie(w, bild(t0, aussen), bild(t1, aussen), 0.35);
    linie(w, bild(t0, (innen + aussen) / 2), bild(t1, (innen + aussen) / 2), 0.2);
  } else {
    const scharnierT = o.anschlag === 'links' ? t1 : t0;
    const zu = o.anschlag === 'links' ? -1 : 1;
    const auf = o.aufschlag === 'innen' ? -1 : 1;
    const h = wp(scharnierT, 0);
    const spitze = { x: h.x + k.nx * auf * o.breite, y: h.y + k.ny * auf * o.breite };
    const a0 = Math.atan2(k.dy * zu, k.dx * zu);
    const a1 = Math.atan2(k.ny * auf, k.nx * auf);
    let diff = a1 - a0;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    let vor = l.pt(h.x + Math.cos(a0) * o.breite, h.y + Math.sin(a0) * o.breite);
    for (let i = 1; i <= 16; i++) {
      const wi = a0 + (diff * i) / 16;
      const q = l.pt(h.x + Math.cos(wi) * o.breite, h.y + Math.sin(wi) * o.breite);
      linie(w, vor, q, 0.2);
      vor = q;
    }
    linie(w, l.pt(h.x, h.y), l.pt(spitze.x, spitze.y), 0.6);
  }

  // Breite in Metern, außen neben der Wand
  const text = komma(o.breite, 3);
  const tb = w.font.widthOfTextAtSize(text, 6);
  const halb = (tb / 2) * Math.abs(k.nx) + 2.5 * Math.abs(k.ny);
  const m = bild((t0 + t1) / 2, aussen + mm(1.5));
  textMitte(w, text, m.x + k.nx * (2 + halb), m.y + k.ny * (2 + halb), 6, false, GRAU);
}

function massstabsbalken(w: Werkzeug, x: number, y: number): void {
  const n = w.l.nenner;
  const schritt = n <= 50 ? 1 : n <= 100 ? 2 : 5; // Meter je Feld
  const hoehe = 2 * MM_ZU_PUNKT;
  const feld = schritt * w.l.skala;
  for (let i = 0; i < 2; i++) {
    w.page.drawRectangle({
      x: x + i * feld,
      y,
      width: feld,
      height: hoehe,
      borderColor: SCHWARZ,
      borderWidth: 0.35 * MM_ZU_PUNKT,
      color: i % 2 === 0 ? SCHWARZ : rgb(1, 1, 1),
    });
  }
  for (let i = 0; i <= 2; i++) textMitte(w, `${i * schritt}`, x + i * feld, y + hoehe + 5, 7);
  w.page.drawText('m', { x: x + 2 * feld + 5, y: y + hoehe + 2, size: 7, font: w.font, color: SCHWARZ });
  w.page.drawText(`Maßstab 1:${n}`, { x, y: y - 11, size: 9, font: w.font, color: SCHWARZ });
}

function nordpfeil(w: Werkzeug, x: number, y: number): void {
  const h = 14 * MM_ZU_PUNKT;
  linie(w, { x, y }, { x, y: y + h }, 0.4);
  w.page.drawSvgPath(`M ${x} ${-(y + h)} L ${x - 2.2 * MM_ZU_PUNKT} ${-(y + h - 5 * MM_ZU_PUNKT)} L ${x + 2.2 * MM_ZU_PUNKT} ${-(y + h - 5 * MM_ZU_PUNKT)} Z`, {
    x: 0,
    y: 0,
    color: SCHWARZ,
  });
  textMitte(w, 'N', x, y + h + 6, 9, true);
}

function schriftkopf(w: Werkzeug, o: PdfOptionen, seitenBreite: number): void {
  const rand = RAND_MM * MM_ZU_PUNKT;
  const breite = 120 * MM_ZU_PUNKT;
  const hoehe = KOPF_MM * MM_ZU_PUNKT;
  const x = seitenBreite - rand - breite;
  const y = rand;
  w.page.drawRectangle({ x, y, width: breite, height: hoehe, borderColor: SCHWARZ, borderWidth: 0.35 * MM_ZU_PUNKT });
  const spalte2 = x + 72 * MM_ZU_PUNKT;
  w.page.drawLine({ start: { x: spalte2 - 4, y }, end: { x: spalte2 - 4, y: y + hoehe }, thickness: 0.2 * MM_ZU_PUNKT, color: GRAU });
  const maxLinks = spalte2 - x - 14;
  const maxRechts = x + breite - spalte2 - 6;
  const zeile = (text: string, sx: number, sy: number, fett = false, groesse = 8) =>
    w.page.drawText(text, { x: sx, y: sy, size: groesse, font: fett ? w.fett : w.font, color: SCHWARZ });
  zeile('Grundriss', x + 6, y + hoehe - 14, true, 12);
  zeile(`Kunde: ${sicher(w.font, o.kunde.name || '-', maxLinks - 34)}`, x + 6, y + hoehe - 27);
  zeile(`Adresse: ${sicher(w.font, o.kunde.adresse || '-', maxLinks - 42)}`, x + 6, y + hoehe - 38);
  zeile(`Kunden-Nr.: ${sicher(w.font, o.kunde.nummer || '-', maxLinks - 52)}`, x + 6, y + hoehe - 49);
  zeile(`Datum: ${sicher(w.font, o.datum, maxRechts - 30)}`, spalte2, y + hoehe - 14);
  zeile(`Maßstab 1:${w.l.nenner}`, spalte2, y + hoehe - 27, true, 10);
  zeile(`A4 ${o.quer ? 'quer' : 'hoch'}`, spalte2, y + hoehe - 40);
}

export interface PdfErgebnis {
  bytes: Uint8Array;
  nenner: number;
  hinweis?: string;
}

export async function erzeugeGrundrissPdf(raeume: Raum[], opt: PdfOptionen): Promise<PdfErgebnis> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Grundriss ${opt.kunde.name}`.trim());
  pdf.setProducer('Grundriss-Skizze');
  const { breite, hoehe } = seitenGroesse(opt.quer);
  const page = pdf.addPage([breite, hoehe]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);

  const layout = berechneLayout(raeume, opt.quer, opt.nenner);
  const w: Werkzeug = { page, font, fett, l: layout };
  for (const raum of raeume) zeichneRaum(w, raum, raeume.filter((r) => r.id !== raum.id));
  massstabsbalken(w, RAND_MM * MM_ZU_PUNKT, (RAND_MM + 8) * MM_ZU_PUNKT);
  nordpfeil(w, breite - RAND_MM * MM_ZU_PUNKT - 6 * MM_ZU_PUNKT, hoehe - RAND_MM * MM_ZU_PUNKT - 24 * MM_ZU_PUNKT);
  schriftkopf(w, opt, breite);
  return { bytes: await pdf.save(), nenner: layout.nenner, hinweis: layout.hinweis };
}

// Hilfsfunktion für Tests und Anzeige
export const abstandMm = (a: P, b: P): number => dist(a, b) / MM_ZU_PUNKT;
