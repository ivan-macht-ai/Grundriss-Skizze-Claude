import { describe, expect, it } from 'vitest';
import { flaeche } from '../src/geometrie/polygon';
import { ausrichten, punktImVieleck, setzeKantenlaenge, verschiebeRaum } from '../src/modell/bearbeiten';
import { leseLaenge } from '../src/modell/zahlen';
import { lForm, mitSchraege, rechteck } from './hilfen';

describe('Länge lesen', () => {
  it('versteht Komma, Punkt und Einheiten', () => {
    expect(leseLaenge('4,20')).toBe(4.2);
    expect(leseLaenge('4.2')).toBe(4.2);
    expect(leseLaenge('420')).toBe(4.2);
    expect(leseLaenge('420 cm')).toBe(4.2);
    expect(leseLaenge('4,2 m')).toBe(4.2);
    expect(leseLaenge('2')).toBe(2);
    expect(leseLaenge('2400mm')).toBe(2.4);
  });
  it('lehnt Unsinn ab', () => {
    expect(leseLaenge('')).toBeNull();
    expect(leseLaenge('abc')).toBeNull();
    expect(leseLaenge('-3')).toBeNull();
    expect(leseLaenge('1,2,3')).toBeNull();
  });
});

describe('Seitenlänge ändern', () => {
  it('Rechteck: Breite 4 -> 5 m, die gegenüberliegende Seite wächst mit', () => {
    const r = setzeKantenlaenge(rechteck(4, 3), 0, 5);
    expect(r).not.toBeNull();
    expect(flaeche(r!)).toBeCloseTo(15, 6);
  });
  it('Rechteck: Höhe 3 -> 2,5 m', () => {
    const r = setzeKantenlaenge(rechteck(4, 3), 1, 2.5);
    expect(flaeche(r!)).toBeCloseTo(10, 6);
  });
  it('L-Form bleibt rechtwinklig und gültig', () => {
    const r = setzeKantenlaenge(lForm, 0, 5);
    expect(r).not.toBeNull();
    for (let i = 0; i < r!.length; i++) {
      const a = r![i];
      const b = r![(i + 1) % r!.length];
      expect(Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThan(1e-9);
    }
  });
  it('lehnt Schrägen und zu kleine Längen ab', () => {
    expect(setzeKantenlaenge(mitSchraege, 2, 2)).toBeNull(); // Seite 2 ist die Schräge
    expect(setzeKantenlaenge(rechteck(4, 3), 0, 0.01)).toBeNull();
  });
});

describe('Verschieben und Einrasten', () => {
  it('verschiebt alle Ecken', () => {
    const r = verschiebeRaum(rechteck(4, 3), 1, -1);
    expect(r[0]).toEqual({ x: 1, y: -1 });
  });
  it('rastet an der Seite eines anderen Raums ein, wenn sie nahe liegt', () => {
    const a = rechteck(4, 3);
    const b = rechteck(3, 3);
    // b links neben a so verschieben, dass seine rechte Kante (x=3) fast an x=0 von a liegt
    const r = ausrichten(b, [a], -3.08, 0.05, 0.15);
    expect(r.dx).toBeCloseTo(-3, 9);
    expect(r.dy).toBeCloseTo(0, 9);
  });
  it('rastet nicht ein, wenn alles weit weg ist', () => {
    const r = ausrichten(rechteck(2, 2, 10, 10), [rechteck(4, 3)], 0.3, 0.3, 0.15);
    expect(r.dx).toBeCloseTo(0.3, 9);
  });
  it('findet Punkte im Vieleck', () => {
    expect(punktImVieleck({ x: 1, y: 1 }, rechteck(4, 3))).toBe(true);
    expect(punktImVieleck({ x: 5, y: 1 }, rechteck(4, 3))).toBe(false);
    expect(punktImVieleck({ x: 3, y: 2.5 }, lForm)).toBe(false); // in der Aussparung der L-Form
    expect(punktImVieleck({ x: 1, y: 2.5 }, lForm)).toBe(true);
  });
});
