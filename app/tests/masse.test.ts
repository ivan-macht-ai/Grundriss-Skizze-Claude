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
