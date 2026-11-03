import { describe, expect, it } from 'vitest';
import { findeKante, findeOeffnung, neueOeffnung, oeffnungsSegment, passeOeffnungenAn, pruefeOeffnung, verschiebeOeffnung } from '../src/modell/oeffnungen';
import type { Oeffnung, Raum } from '../src/modell/typen';
import { leseBreite } from '../src/modell/zahlen';
import { rechteck } from './hilfen';

const raum = (oeffnungen?: Oeffnung[]): Raum => ({ id: 1, name: 'Raum 1', ecken: rechteck(4, 3), form: 'Rechteck', oeffnungen });
const tuer = (kante: number, abstand: number, id = 1): Oeffnung => ({ id, art: 'tuer', kante, abstand, breite: 0.885, anschlag: 'links', aufschlag: 'innen' });

describe('Breite lesen', () => {
  it('ab 3 ohne Einheit gilt Zentimeter, darunter Meter', () => {
    expect(leseBreite('88,5')).toBe(0.885);
    expect(leseBreite('90')).toBe(0.9);
    expect(leseBreite('0,885')).toBe(0.885);
    expect(leseBreite('1,01')).toBe(1.01);
    expect(leseBreite('101 cm')).toBe(1.01);
    expect(leseBreite('2,5 m')).toBe(2.5);
    expect(leseBreite('zwei')).toBeNull();
  });
});

describe('Seite und Öffnung finden', () => {
  it('findet die Seite nahe am Tippen und die Stelle darauf', () => {
    const t = findeKante([raum()], 1.5, 0.05, 0.1);
    expect(t).not.toBeNull();
    expect(t!.kante).toBe(0); // untere Seite
    expect(t!.t).toBeCloseTo(1.5, 9);
  });
  it('findet nichts, wenn zu weit weg', () => {
    expect(findeKante([raum()], 1.5, 1, 0.1)).toBeNull();
  });
  it('findet eine Öffnung', () => {
    const r = raum([tuer(0, 1)]);
    expect(findeOeffnung([r], 1.4, 0.02, 0.1)?.oeffnung.id).toBe(1);
    expect(findeOeffnung([r], 3, 0.02, 0.1)).toBeNull();
  });
  it('Segment liegt auf der Wandkante', () => {
    const { p0, p1 } = oeffnungsSegment(raum(), tuer(1, 0.5)); // rechte Seite, nach oben
    expect(p0).toEqual({ x: 4, y: 0.5 });
    expect(p1.y).toBeCloseTo(0.5 + 0.885, 9);
  });
});

describe('Neue Öffnung', () => {
  it('Tür mittig an der Tippstelle, auf 5 cm gerastet, mit Standardbreite', () => {
    const o = neueOeffnung(raum(), 0, 2, 'tuer');
    if (typeof o === 'string') throw new Error(o);
    expect(o.breite).toBe(0.885);
    expect(o.abstand).toBeCloseTo(1.55, 9); // 2 - 0,4425 = 1,5575 -> 1,55
    expect(o.art).toBe('tuer');
  });
  it('rückt von der Ecke weg, wenn man in der Ecke tippt', () => {
    const o = neueOeffnung(raum(), 0, 0.1, 'fenster');
    if (typeof o === 'string') throw new Error(o);
    expect(o.abstand).toBe(0.05);
  });
  it('zu kurze Seite: Meldung', () => {
    const klein: Raum = { id: 1, name: 'k', ecken: rechteck(0.9, 3), form: 'Rechteck' };
    expect(typeof neueOeffnung(klein, 0, 0.45, 'tuer')).toBe('string');
  });
  it('belegte Stelle: Meldung', () => {
    const r = raum([tuer(0, 1.5)]);
    expect(neueOeffnung(r, 0, 1.9, 'tuer')).toBe('Hier liegt schon eine andere Öffnung.');
  });
});

describe('Prüfen, Verschieben, Anpassen', () => {
  it('prüft Ränder und Breite', () => {
    const r = raum();
    expect(pruefeOeffnung(r, { ...tuer(0, 0.01) })).toContain('Ecke');
    expect(pruefeOeffnung(r, { ...tuer(0, 3.5) })).toContain('zu breit');
    expect(pruefeOeffnung(r, { ...tuer(0, 1), breite: 0.1 })).toContain('Breite');
    expect(pruefeOeffnung(r, tuer(0, 1))).toBeNull();
  });
  it('verschieben bleibt in den Grenzen und läuft nicht in andere Öffnungen', () => {
    const r = raum([tuer(0, 0.5, 1), tuer(0, 2.5, 2)]);
    const o = r.oeffnungen![0];
    expect(verschiebeOeffnung(r, o, -5, 0)).toBe(0.05);
    expect(verschiebeOeffnung(r, o, 2.8, 0)).toBe(0.5); // würde in die zweite Tür laufen: bleibt stehen
    expect(verschiebeOeffnung(r, o, 1.5, 0)).toBeCloseTo(1.05, 9);
  });
  it('nach Verkürzen der Seite rutschen Öffnungen zurück, zu breite fallen weg', () => {
    const r: Raum = { id: 1, name: 'r', ecken: rechteck(2, 3), form: 'Rechteck', oeffnungen: [tuer(0, 1.5, 1), { ...tuer(1, 0.1, 2), breite: 3.5 }] };
    passeOeffnungenAn(r);
    expect(r.oeffnungen).toHaveLength(1);
    expect(r.oeffnungen![0].abstand).toBeCloseTo(2 - 0.885 - 0.05, 9);
  });
});
