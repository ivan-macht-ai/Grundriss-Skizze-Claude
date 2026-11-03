import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { MM_ZU_PUNKT, meterZuPunkt, seitenGroesse } from './blatt';

type Punkt = [number, number];

const SCHWARZ = rgb(0.1, 0.1, 0.1);
const LINIE = 0.35 * MM_ZU_PUNKT; // 0,35 mm Strichstärke
const NENNER = 50;

/** Muster-PDF: ein Rechteck 4,00 x 3,00 m und ein L-Raum, A4 quer, Maßstab 1:50. */
export async function erzeugeMusterPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Muster-Grundriss 1:50');
  pdf.setProducer('Grundriss-Skizze');
  const { breite, hoehe } = seitenGroesse(true);
  const seite = pdf.addPage([breite, hoehe]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Ursprung der Zeichnung: 25 mm vom linken Rand, 72 mm vom unteren Rand
  const x0 = 25 * MM_ZU_PUNKT;
  const y0 = 72 * MM_ZU_PUNKT;
  const p = (xm: number, ym: number): Punkt => [x0 + meterZuPunkt(xm, NENNER), y0 + meterZuPunkt(ym, NENNER)];

  // Raum 1: Rechteck 4,00 x 3,00 m
  vieleck(seite, [p(0, 0), p(4, 0), p(4, 3), p(0, 3)]);
  text(seite, fett, 'Raum 1', p(1.4, 1.6), 10);
  text(seite, font, '12,00 m²', p(1.45, 1.25), 9);
  bemassung(seite, font, p(0, 0), p(4, 0), 0.5, '4,00 m');
  bemassung(seite, font, p(0, 0), p(0, 3), -0.5, '3,00 m');

  // Raum 2: L-Form, rechts daneben
  const ox = 5.5;
  const l: Punkt[] = [p(ox, 0), p(ox + 4, 0), p(ox + 4, 1.5), p(ox + 2, 1.5), p(ox + 2, 3), p(ox, 3)];
  vieleck(seite, l);
  text(seite, fett, 'Raum 2 (L-Form)', p(ox + 0.3, 1.1), 10);
  bemassung(seite, font, p(ox, 0), p(ox + 4, 0), 0.5, '4,00 m');
  bemassung(seite, font, p(ox + 4, 0), p(ox + 4, 1.5), 0.5, '1,50 m');
  bemassung(seite, font, p(ox, 0), p(ox, 3), -0.5, '3,00 m');

  massstabsbalken(seite, font, 25 * MM_ZU_PUNKT, 25 * MM_ZU_PUNKT);
  schriftkopf(seite, font, fett, breite);
  return pdf.save();
}

function vieleck(seite: PDFPage, punkte: Punkt[]): void {
  for (let i = 0; i < punkte.length; i++) {
    const [ax, ay] = punkte[i];
    const [bx, by] = punkte[(i + 1) % punkte.length];
    seite.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: LINIE * 2, color: SCHWARZ });
  }
}

function text(seite: PDFPage, font: PDFFont, s: string, [x, y]: Punkt, groesse: number): void {
  seite.drawText(s, { x, y, size: groesse, font, color: SCHWARZ });
}

/** Maßlinie parallel zur Strecke a-b, `abstandM` Meter (Wirklichkeit) daneben, mit Endstrichen und Text. */
function bemassung(seite: PDFPage, font: PDFFont, a: Punkt, b: Punkt, abstandM: number, beschriftung: string): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  // Positiver Abstand: rechts der Richtung a->b (waagerecht nach rechts = unten, senkrecht nach oben = rechts)
  const nx = dy / len;
  const ny = -dx / len;
  const off = meterZuPunkt(abstandM, NENNER);
  const a2: Punkt = [a[0] + nx * off, a[1] + ny * off];
  const b2: Punkt = [b[0] + nx * off, b[1] + ny * off];
  const duenn = 0.18 * MM_ZU_PUNKT;
  seite.drawLine({ start: { x: a2[0], y: a2[1] }, end: { x: b2[0], y: b2[1] }, thickness: duenn, color: SCHWARZ });
  for (const [q, q2] of [[a, a2], [b, b2]] as const) {
    seite.drawLine({ start: { x: q[0], y: q[1] }, end: { x: q2[0], y: q2[1] }, thickness: duenn, color: SCHWARZ });
    // Schrägstrich als Endmarke
    const t = 2 * MM_ZU_PUNKT;
    seite.drawLine({
      start: { x: q2[0] - t * (dx / len) - t * nx, y: q2[1] - t * (dy / len) - t * ny },
      end: { x: q2[0] + t * (dx / len) + t * nx, y: q2[1] + t * (dy / len) + t * ny },
      thickness: duenn * 2,
      color: SCHWARZ,
    });
  }
  const mitte: Punkt = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2];
  const gr = 8;
  const w = font.widthOfTextAtSize(beschriftung, gr);
  const waagerecht = Math.abs(dy) < Math.abs(dx);
  seite.drawText(beschriftung, {
    x: waagerecht ? mitte[0] - w / 2 : off > 0 ? mitte[0] + gr + 2 : mitte[0] - 3,
    y: waagerecht ? mitte[1] + (off > 0 ? -gr - 2 : 3) : mitte[1] - w / 2,
    size: gr,
    font,
    color: SCHWARZ,
    rotate: waagerecht ? undefined : degrees(90),
  });
}

function massstabsbalken(seite: PDFPage, font: PDFFont, x: number, y: number): void {
  const meter = [0, 1, 2];
  const hoeheBalken = 2 * MM_ZU_PUNKT;
  for (let i = 0; i < meter.length - 1; i++) {
    const bx = x + meterZuPunkt(meter[i], NENNER);
    const bw = meterZuPunkt(1, NENNER);
    seite.drawRectangle({
      x: bx,
      y,
      width: bw,
      height: hoeheBalken,
      borderColor: SCHWARZ,
      borderWidth: LINIE,
      color: i % 2 === 0 ? SCHWARZ : rgb(1, 1, 1),
    });
  }
  for (const m of meter) {
    seite.drawText(`${m}`, { x: x + meterZuPunkt(m, NENNER) - 2, y: y + hoeheBalken + 3, size: 8, font, color: SCHWARZ });
  }
  seite.drawText('m', { x: x + meterZuPunkt(2, NENNER) + 6, y: y + hoeheBalken + 3, size: 8, font, color: SCHWARZ });
  seite.drawText(`Maßstab 1:${NENNER}`, { x, y: y - 11, size: 9, font, color: SCHWARZ });
}

function schriftkopf(seite: PDFPage, font: PDFFont, fett: PDFFont, seitenBreite: number): void {
  const rand = 10 * MM_ZU_PUNKT;
  const breite = 110 * MM_ZU_PUNKT;
  const hoehe = 24 * MM_ZU_PUNKT;
  const x = seitenBreite - rand - breite;
  const y = rand;
  seite.drawRectangle({ x, y, width: breite, height: hoehe, borderColor: SCHWARZ, borderWidth: LINIE });
  seite.drawText('Muster-Grundriss', { x: x + 6, y: y + hoehe - 14, size: 11, font: fett, color: SCHWARZ });
  seite.drawText('Kunde: (Muster)   Kundennummer: 0000', { x: x + 6, y: y + hoehe - 28, size: 8, font, color: SCHWARZ });
  seite.drawText('Maßstab 1:50   A4 quer', { x: x + 6, y: y + 8, size: 8, font, color: SCHWARZ });
}
