import { describe, expect, it } from 'vitest';
import { flaeche } from '../src/geometrie/polygon';
import type { Raum } from '../src/modell/typen';
import { findeZwischenwand, leseDicke, nachbarSeiten, waendeUmriss } from '../src/modell/waende';
import { lForm, rechteck } from './hilfen';

const raum = (id: number, ecken: ReturnType<typeof rechteck>, waende?: number[]): Raum => ({ id, name: `Raum ${id}`, ecken, form: 'Rechteck', waende });

describe('Wanddicke lesen', () => {
  it('ohne Einheit sind es Zentimeter', () => {
    expect(leseDicke('24')).toBe(0.24);
    expect(leseDicke('11,5')).toBe(0.115);
    expect(leseDicke('24 cm')).toBe(0.24);
    expect(leseDicke('0,24 m')).toBe(0.24);
    expect(leseDicke('240mm')).toBe(0.24);
    expect(leseDicke('0')).toBe(0);
  });
  it('lehnt Unsinn und zu dicke Wände ab', () => {
    expect(leseDicke('')).toBeNull();
    expect(leseDicke('dick')).toBeNull();
    expect(leseDicke('250')).toBeNull(); // 2,5 m Wand
  });
});

describe('Umriss der Wände', () => {
  it('gleiche Dicke außen: Rechteck wächst an jeder Seite um die Dicke', () => {
    const u = waendeUmriss(rechteck(4, 3), [0.24, 0.24, 0.24, 0.24]);
    expect(flaeche(u)).toBeCloseTo((4 + 0.48) * (3 + 0.48), 6);
    expect(Math.min(...u.map((p) => p.x))).toBeCloseTo(-0.24, 9);
    expect(Math.max(...u.map((p) => p.y))).toBeCloseTo(3.24, 9);
  });
  it('unterschiedliche Dicken werden an den Ecken verschnitten', () => {
    // unten 0,30 m, rechts 0,10 m, oben und links ohne Wand
    const u = waendeUmriss(rechteck(4, 3), [0.3, 0.1, 0, 0]);
    expect(Math.min(...u.map((p) => p.y))).toBeCloseTo(-0.3, 9);
    expect(Math.max(...u.map((p) => p.x))).toBeCloseTo(4.1, 9);
    expect(flaeche(u)).toBeCloseTo(4.1 * 3.3, 6);
  });
  it('ohne Dicken bleibt der Raum, wie er ist', () => {
    const u = waendeUmriss(lForm, lForm.map(() => 0));
    expect(flaeche(u)).toBeCloseTo(flaeche(lForm), 9);
  });
  it('L-Form: Fläche wächst, Ecken bleiben rechtwinklig', () => {
    const u = waendeUmriss(lForm, lForm.map(() => 0.2));
    expect(flaeche(u)).toBeGreaterThan(flaeche(lForm));
    for (let i = 0; i < u.length; i++) {
      const a = u[i];
      const b = u[(i + 1) % u.length];
      expect(Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThan(1e-9);
    }
  });
});

describe('Zwischenwand erkennen', () => {
  const links = raum(1, rechteck(4, 3));

  it('zwei Räume, die sich berühren: erkannt, Abstand 0', () => {
    const rechts = raum(2, rechteck(3, 3, 4, 0));
    const z = findeZwischenwand(rechts, [links]);
    expect(z).not.toBeNull();
    expect(z!.andereId).toBe(1);
    expect(z!.abstand).toBeCloseTo(0, 9);
  });

  it('kleiner Spalt (0,12 m): erkannt mit diesem Abstand', () => {
    const rechts = raum(2, rechteck(3, 3, 4.12, 0));
    const z = findeZwischenwand(rechts, [links]);
    expect(z!.abstand).toBeCloseTo(0.12, 9);
  });

  it('Normale zeigt zum Nachbarn, damit der Raum von ihm weg verschoben werden kann', () => {
    const rechts = raum(2, rechteck(3, 3, 4, 0));
    const z = findeZwischenwand(rechts, [links])!;
    expect(z.nx).toBeCloseTo(-1, 9); // linke Seite des rechten Raums zeigt nach links, zum Nachbarn
    expect(z.ny).toBeCloseTo(0, 9);
  });

  it('zu weit weg oder zu wenig Überlappung: keine Zwischenwand', () => {
    expect(findeZwischenwand(raum(2, rechteck(3, 3, 5, 0)), [links])).toBeNull(); // 1 m Abstand
    expect(findeZwischenwand(raum(2, rechteck(3, 3, 4, 2.9)), [links])).toBeNull(); // nur 0,1 m Überlappung
  });

  it('Wand liegt schon passend: keine erneute Abfrage', () => {
    const rechts = raum(2, rechteck(3, 3, 4.115, 0), [0, 0, 0, 0.115]);
    // Seite 3 des Rechtecks ist die linke Seite
    expect(findeZwischenwand(rechts, [links])).toBeNull();
  });

  it('Räume übereinander (waagerechte Seiten) werden auch erkannt', () => {
    const oben = raum(2, rechteck(4, 2, 0, 3.1));
    const z = findeZwischenwand(oben, [links]);
    expect(z).not.toBeNull();
    expect(z!.abstand).toBeCloseTo(0.1, 9);
  });

  it('nachbarSeiten meldet auch Seiten mit passender Wand (für den Haken "Wände um den Raum")', () => {
    const rechts = raum(2, rechteck(3, 3, 4.115, 0), [0, 0, 0, 0.115]);
    const f = nachbarSeiten(rechts, [links]);
    expect(f).toHaveLength(1);
    expect(f[0].kante).toBe(3);
    expect(f[0].passt).toBe(true);
  });
});
