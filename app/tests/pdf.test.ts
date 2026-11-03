import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { meterZuPapierMm, meterZuPunkt, seitenGroesse } from '../src/pdf/blatt';
import { erzeugeMusterPdf } from '../src/pdf/musterPdf';

describe('PDF-Maße', () => {
  it('4 m bei 1:50 sind 80 mm auf dem Papier', () => {
    expect(meterZuPapierMm(4, 50)).toBeCloseTo(80, 10);
    expect(meterZuPunkt(4, 50)).toBeCloseTo((80 * 72) / 25.4, 10);
  });

  it('A4 quer ist 297 x 210 mm', () => {
    const { breite, hoehe } = seitenGroesse(true);
    expect((breite * 25.4) / 72).toBeCloseTo(297, 6);
    expect((hoehe * 25.4) / 72).toBeCloseTo(210, 6);
  });
});

describe('Muster-PDF', () => {
  it('ist ein gültiges PDF mit einer Seite A4 quer', async () => {
    const bytes = await erzeugeMusterPdf();
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect((width * 25.4) / 72).toBeCloseTo(297, 1);
    expect((height * 25.4) / 72).toBeCloseTo(210, 1);
  });

  it('enthält Linien, keine Bilder (Vektor-PDF)', async () => {
    const bytes = await erzeugeMusterPdf();
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).not.toContain('/Subtype /Image');
  });
});
