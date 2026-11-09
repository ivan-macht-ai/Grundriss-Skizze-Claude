import { describe, expect, it } from 'vitest';
import { kettenPunkte, laengstesFreiesStueck, zeigeCm } from '../src/modell/masse';
import type { Oeffnung, Raum } from '../src/modell/typen';
import { rechteck } from './hilfen';

const tuer = (id: number, kante: number, abstand: number, breite = 0.885): Oeffnung => ({ id, art: 'tuer', kante, abstand, breite, anschlag: 'links', aufschlag: 'innen' });
const raum = (oeffnungen?: Oeffnung[]): Raum => ({ id: 1, name: 'r', ecken: rechteck(4, 3), form: 'Rechteck', oeffnungen });

describe('Maßkette', () => {
  it('ohne Öffnung nur Anfang und Ende', () => {
    expect(kettenPunkte(raum(), 0)).toEqual([0, 4]);
  });
  it('Tür in der Mitte: links Abstand, Breite, rechts Abstand', () => {
    const p = kettenPunkte(raum([tuer(1, 0, 1.5)]), 0);
    expect(p).toHaveLength(4);
    expect(p[0]).toBe(0);
    expect(p[1]).toBe(1.5);
    expect(p[2]).toBeCloseTo(2.385, 9);
    expect(p[3]).toBe(4);
  });
  it('mehrere Öffnungen sind sortiert, andere Seiten zählen nicht', () => {
    const p = kettenPunkte(raum([tuer(1, 0, 3, 0.5), tuer(2, 0, 0.5, 0.8), tuer(3, 1, 1)]), 0);
    expect(p).toEqual([0, 0.5, 1.3, 3, 3.5, 4]);
  });
  it('Öffnung bis an die Ecke ergibt kein Maß der Länge null', () => {
    const p = kettenPunkte(raum([tuer(1, 0, 0, 0.9)]), 0);
    expect(p).toEqual([0, 0.9, 4]);
  });
});

describe('Wanddicke und freies Stück', () => {
  it('längstes freies Stück liegt neben der Öffnung', () => {
    const s = laengstesFreiesStueck(raum([tuer(1, 0, 0.3, 0.9)]), 0);
    expect(s).toEqual({ t0: 1.2, t1: 4 });
  });
  it('ohne Öffnung ist es die ganze Seite', () => {
    expect(laengstesFreiesStueck(raum(), 1)).toEqual({ t0: 0, t1: 3 });
  });
  it('zu kurze Reste: kein Platz für die Zahl', () => {
    expect(laengstesFreiesStueck(raum([tuer(1, 0, 0.2, 3.6)]), 0)).toBeNull();
  });
  it('Zentimeter als Text', () => {
    expect(zeigeCm(0.24)).toBe('24');
    expect(zeigeCm(0.115)).toBe('11,5');
    expect(zeigeCm(0.3)).toBe('30');
  });
});

import { kettenMasse, zeigeMasse } from '../src/modell/masse';

describe('Maße auf den Millimeter', () => {
  it('Text: volle Zentimeter mit zwei Stellen, sonst drei', () => {
    expect(zeigeMasse(0.41)).toBe('0,41');
    expect(zeigeMasse(0.885)).toBe('0,885');
    expect(zeigeMasse(0.705)).toBe('0,705');
    expect(zeigeMasse(2)).toBe('2,00');
    expect(zeigeMasse(1.5)).toBe('1,50');
    expect(zeigeMasse(0.1 + 0.2)).toBe('0,30'); // Gleitkomma-Rauschen verschwindet
    expect(zeigeMasse(3.2449999)).toBe('3,245');
  });

  it('der Fall aus dem Bild: 0,41 + 0,885 + 0,705 = 2,00', () => {
    const teile = kettenMasse([0, 0.41, 0.41 + 0.885, 2]);
    expect(teile.map(zeigeMasse)).toEqual(['0,41', '0,885', '0,705']);
    const summe = teile.reduce((a, b) => a + b, 0);
    expect(zeigeMasse(summe)).toBe('2,00');
  });

  it('die gezeigten Teilmaße ergeben immer genau das gezeigte Gesamtmaß', () => {
    let seed = 12345;
    const zufall = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 500; n++) {
      const laenge = Math.round((0.5 + zufall() * 9) * 1000) / 1000;
      const innen = Array.from({ length: Math.floor(zufall() * 5) }, () => Math.round(zufall() * laenge * 1000) / 1000).sort((a, b) => a - b);
      const punkte = [0, ...innen, laenge];
      const mm = kettenMasse(punkte).map((t) => Math.round(parseFloat(zeigeMasse(t).replace(',', '.')) * 1000));
      expect(mm.reduce((a, b) => a + b, 0)).toBe(Math.round(parseFloat(zeigeMasse(laenge).replace(',', '.')) * 1000));
    }
  });
});
