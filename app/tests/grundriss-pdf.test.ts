import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Raum } from '../src/modell/typen';
import { MM_ZU_PUNKT } from '../src/pdf/blatt';
import { abstandMm, berechneLayout, erzeugeGrundrissPdf, streckenOhne } from '../src/pdf/grundriss';
import { rechteck } from './hilfen';

const raum = (b: number, h: number, extra: Partial<Raum> = {}): Raum => ({ id: 1, name: 'Keller', ecken: rechteck(b, h), form: 'Rechteck', ...extra });
const kunde = { name: 'Max Muster', adresse: 'Hauptstraße 1, 12345 Ort', nummer: 'K-1001' };

const hex = (text: string) => Buffer.from(text, 'latin1').toString('hex').toUpperCase();

/** Entpackt alle Inhaltsströme der PDF und gibt sie als Text zurück (Textstellen stehen dort als Hex-Zeichenfolgen). */
function inhalt(bytes: Uint8Array): string {
  const b = Buffer.from(bytes);
  let aus = '';
  let pos = 0;
  for (;;) {
    const start = b.indexOf('stream', pos, 'latin1');
    if (start < 0) break;
    let von = start + 6;
    if (b[von] === 0x0d) von++;
    if (b[von] === 0x0a) von++;
    const ende = b.indexOf('endstream', von, 'latin1');
    if (ende < 0) break;
    try {
      aus += inflateSync(b.subarray(von, ende)).toString('latin1') + '\n';
    } catch {
      /* kein komprimierter Strom */
    }
    pos = ende + 9;
  }
  return aus;
}

describe('Maßstab und Lage', () => {
  it('4 m sind bei 1:50 genau 80 mm auf dem Papier', () => {
    const l = berechneLayout([raum(4, 3)], true, 50);
    const a = l.pt(0, 0);
    const b = l.pt(4, 0);
    expect(abstandMm(a, b)).toBeCloseTo(80, 6);
    expect(abstandMm(l.pt(0, 0), l.pt(0, 3))).toBeCloseTo(60, 6);
    expect(l.passt).toBe(true);
  });

  it('Automatik wählt den größten Maßstab, der passt', () => {
    expect(berechneLayout([raum(4, 3)], true, 'auto').nenner).toBe(25);
    expect(berechneLayout([raum(10, 6)], true, 'auto').nenner).toBe(50);
    expect(berechneLayout([raum(20, 12)], true, 'auto').nenner).toBe(100);
  });

  it('zu große Zeichnung: Hinweis, kleinster Maßstab', () => {
    const l = berechneLayout([raum(60, 40)], true, 'auto');
    expect(l.nenner).toBe(200);
    expect(l.passt).toBe(false);
    expect(l.hinweis).toContain('1:200');
  });

  it('fester Maßstab, der nicht passt: Hinweis mit Vorschlag', () => {
    const l = berechneLayout([raum(10, 6)], true, 20);
    expect(l.passt).toBe(false);
    expect(l.hinweis).toContain('Vorschlag: 1:50');
    expect(l.nenner).toBe(20);
  });

  it('Zeichnung liegt mittig im freien Bereich des Blatts', () => {
    const l = berechneLayout([raum(4, 3)], true, 50);
    const links = l.pt(0, 0).x / MM_ZU_PUNKT;
    const rechts = 297 - l.pt(4, 0).x / MM_ZU_PUNKT;
    expect(links).toBeCloseTo(rechts, 5);
  });

  it('Wände vergrößern die Hülle und damit den Platzbedarf', () => {
    const ohne = berechneLayout([raum(10, 6)], true, 'auto');
    const mit = berechneLayout([raum(10, 6, { waende: [1, 1, 1, 1] })], true, 'auto');
    expect(mit.nenner).toBeGreaterThanOrEqual(ohne.nenner);
  });
});

describe('Strecken ohne Öffnungen', () => {
  it('schneidet Öffnungen heraus', () => {
    expect(streckenOhne(0, 4, [[1, 2]])).toEqual([[0, 1], [2, 4]]);
    expect(streckenOhne(0, 4, [[0, 1], [3, 4]])).toEqual([[1, 3]]);
    expect(streckenOhne(0, 4, [[1, 2], [1.5, 3]])).toEqual([[0, 1], [3, 4]]);
    expect(streckenOhne(0, 4, [])).toEqual([[0, 4]]);
  });
});

describe('PDF erzeugen', () => {
  it('gültiges PDF, eine Seite A4 quer, Linien statt Bilder', async () => {
    const r = raum(4, 3, {
      waende: [0.24, 0.24, 0.24, 0.24],
      oeffnungen: [
        { id: 1, art: 'tuer', kante: 0, abstand: 1, breite: 0.885, anschlag: 'links', aufschlag: 'innen' },
        { id: 2, art: 'fenster', kante: 2, abstand: 1.5, breite: 1, anschlag: 'links', aufschlag: 'innen' },
      ],
    });
    const erg = await erzeugeGrundrissPdf([r], { quer: true, nenner: 'auto', kunde, datum: '03.11.2026' });
    const text = new TextDecoder('latin1').decode(erg.bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).not.toContain('/Subtype /Image');
    const doc = await PDFDocument.load(erg.bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect((width * 25.4) / 72).toBeCloseTo(297, 1);
    expect((height * 25.4) / 72).toBeCloseTo(210, 1);
    expect(erg.nenner).toBe(50); // mit Wänden (4,48 x 3,48 m) passt 1:25 nicht mehr auf das Blatt
  });

  it('hoch und quer, fester Maßstab wird übernommen', async () => {
    const erg = await erzeugeGrundrissPdf([raum(4, 3)], { quer: false, nenner: 50, kunde, datum: 'heute' });
    const doc = await PDFDocument.load(erg.bytes);
    const { width, height } = doc.getPage(0).getSize();
    expect(height).toBeGreaterThan(width);
    expect(erg.nenner).toBe(50);
  });

  it('Raumname, Kundendaten und Maßstab stehen im PDF', async () => {
    const erg = await erzeugeGrundrissPdf([raum(4, 3)], { quer: true, nenner: 50, kunde, datum: '03.11.2026' });
    const text = inhalt(erg.bytes);
    for (const s of ['Keller', 'Max Muster', 'K-1001', 'Maßstab 1:50', '03.11.2026']) expect(text).toContain(hex(s));
  });

  it('seltsame Zeichen im Namen bringen nichts zum Absturz', async () => {
    const r = raum(4, 3, { name: 'Küche 🍳 日本' });
    const erg = await erzeugeGrundrissPdf([r], { quer: true, nenner: 50, kunde: { name: 'Ärger & Co. 😀', adresse: 'x'.repeat(300), nummer: '' }, datum: 'd' });
    expect(erg.bytes.length).toBeGreaterThan(1000);
  });

  it('mehrere Räume mit Zwischenwand und leere Skizze', async () => {
    const a = raum(4, 3);
    const b: Raum = { id: 2, name: 'Flur', ecken: rechteck(2, 3, 4.115, 0), form: 'Rechteck', waende: [0, 0, 0, 0.115] };
    const erg = await erzeugeGrundrissPdf([a, b], { quer: true, nenner: 'auto', kunde, datum: 'd' });
    expect(erg.bytes.length).toBeGreaterThan(1000);
  });
});
