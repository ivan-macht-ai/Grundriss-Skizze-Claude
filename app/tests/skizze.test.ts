import { describe, expect, it } from 'vitest';
import { leseSkizzenDatei, neueSkizze, pruefeSkizze, skizzeZuDatei, type Skizze } from '../src/modell/skizze';
import { lForm, rechteck } from './hilfen';

const beispiel = (): Skizze => ({
  ...neueSkizze(1_700_000_000_000),
  name: 'Keller Müller',
  kunde: { name: 'Max Müller', adresse: 'Weg 1', nummer: 'K-1' },
  raeume: [
    {
      id: 1,
      name: 'Heizraum',
      form: 'Rechteck',
      ecken: rechteck(4, 3),
      waende: [0.24, 0.24, 0.24, 0],
      oeffnungen: [{ id: 1, art: 'tuer', kante: 0, abstand: 1, breite: 0.885, anschlag: 'links', aufschlag: 'innen' }],
    },
    { id: 2, name: 'Flur', form: 'L-Form', ecken: lForm },
  ],
  naechsteId: 3,
});

describe('Sicherungsdatei', () => {
  it('Hin und zurück ohne Verlust', () => {
    const s = beispiel();
    const zurueck = leseSkizzenDatei(skizzeZuDatei(s));
    expect(zurueck).toEqual(s);
  });

  it('lehnt kaputte Dateien mit verständlichen Meldungen ab', () => {
    expect(leseSkizzenDatei('{kaputt')).toContain('beschädigt');
    expect(leseSkizzenDatei('42')).toContain('keine Skizzen-Datei');
    expect(leseSkizzenDatei('{"format":"anderes","version":1}')).toContain('keine Skizzen-Datei');
    expect(leseSkizzenDatei('{"format":"grundriss-skizze","version":99,"skizze":{}}')).toContain('neueren Version');
    expect(leseSkizzenDatei('{"format":"grundriss-skizze","version":1}')).toContain('keine Skizze');
  });

  it('lehnt ungültige Räume, Zahlen und Öffnungen ab', () => {
    const rein = (veraendere: (s: Skizze) => void) => {
      const s = beispiel();
      veraendere(s);
      return leseSkizzenDatei(skizzeZuDatei(s));
    };
    expect(typeof rein((s) => (s.raeume[0].ecken = s.raeume[0].ecken.slice(0, 2)))).toBe('string');
    expect(typeof rein((s) => (s.raeume[0].ecken[0].x = 1e9))).toBe('string');
    expect(typeof rein((s) => (s.raeume[0].waende = [1, 2]))).toBe('string');
    expect(typeof rein((s) => (s.raeume[0].oeffnungen![0].kante = 9))).toBe('string');
    expect(typeof rein((s) => (s.raeume[0].oeffnungen![0].breite = -1))).toBe('string');
    expect(typeof rein((s) => ((s.raeume[0].oeffnungen![0] as { art: string }).art = 'dach'))).toBe('string');
  });

  it('NaN und Unendlich werden nicht akzeptiert (JSON macht daraus null)', () => {
    const s = beispiel();
    s.raeume[0].ecken[1].y = NaN;
    expect(typeof leseSkizzenDatei(skizzeZuDatei(s))).toBe('string');
  });

  it('fehlende optionale Felder bekommen Standardwerte', () => {
    const s = pruefeSkizze({ raeume: [{ id: 5, name: 'R', form: 'Rechteck', ecken: rechteck(2, 2) }] }, false);
    if (typeof s === 'string') throw new Error(s);
    expect(s.naechsteId).toBe(6);
    expect(s.kunde).toEqual({ name: '', adresse: '', nummer: '' });
    expect(s.name.startsWith('Skizze')).toBe(true);
    expect(s.id.length).toBeGreaterThan(5);
  });
});
