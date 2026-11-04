import { describe, expect, it } from 'vitest';
import { neueSkizze, type Skizze } from '../src/modell/skizze';
import { grundText, inhaltsStempel, neueVersion, pruefeVersion, zuLoeschen, type Version } from '../src/modell/versionen';
import { rechteck } from './hilfen';

const skizze = (): Skizze => ({
  ...neueSkizze(1_700_000_000_000),
  raeume: [{ id: 1, name: 'Keller', form: 'Rechteck', ecken: rechteck(4, 3) }],
  naechsteId: 2,
});

describe('Versionen', () => {
  it('Version ist eine unabhängige Kopie', () => {
    const s = skizze();
    const v = neueVersion(s, 'manuell');
    s.raeume[0].name = 'geändert';
    s.raeume[0].ecken[0].x = 99;
    s.kunde.name = 'anders';
    expect(v.raeume[0].name).toBe('Keller');
    expect(v.raeume[0].ecken[0].x).toBe(0);
    expect(v.kunde.name).toBe('');
  });

  it('Stempel ändert sich nur bei Änderungen', () => {
    const s = skizze();
    const a = inhaltsStempel(s);
    expect(inhaltsStempel(skizze())).toBe(inhaltsStempel(skizze())); // gleiche Inhalte
    s.raeume[0].name = 'Heizraum';
    expect(inhaltsStempel(s)).not.toBe(a);
  });

  it('Aufräumen: behält die neuesten automatischen, von Hand gespeicherte nie', () => {
    const s = skizze();
    const liste: Version[] = [];
    for (let i = 0; i < 35; i++) liste.push(neueVersion(s, 'schliessen', 1000 + i));
    liste.push(neueVersion(s, 'manuell', 1)); // sehr alt, aber von Hand
    liste.push(neueVersion(s, 'vor-wiederherstellung', 2));
    const weg = zuLoeschen(liste, 30);
    expect(weg).toHaveLength(5);
    const geloescht = liste.filter((v) => weg.includes(v.id));
    expect(geloescht.every((v) => v.grund === 'schliessen')).toBe(true);
    expect(Math.max(...geloescht.map((v) => v.zeit))).toBe(1004); // die fünf ältesten (1000 bis 1004)
  });

  it('prüft Versionen aus dem Speicher, kaputte werden zu null', () => {
    const v = neueVersion(skizze(), 'pdf');
    expect(pruefeVersion(JSON.parse(JSON.stringify(v)))?.raeume).toHaveLength(1);
    expect(pruefeVersion(null)).toBeNull();
    expect(pruefeVersion({ ...v, grund: 'unbekannt' })).toBeNull();
    expect(pruefeVersion({ ...v, raeume: [{ id: 1 }] })).toBeNull();
    expect(pruefeVersion({ ...v, zeit: 'gestern' })).toBeNull();
  });

  it('jeder Grund hat einen Text', () => {
    for (const g of ['schliessen', 'wechsel', 'pdf', 'senden', 'manuell', 'vor-wiederherstellung'] as const) expect(grundText(g).length).toBeGreaterThan(3);
  });
});
