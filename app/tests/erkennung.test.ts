import { describe, expect, it } from 'vitest';
import { STANDARD_TOLERANZEN } from '../src/config/toleranzen';
import { erkenneRaum } from '../src/erkennung/erkenne';
import { flaeche, istEinfach } from '../src/geometrie/polygon';
import { umgrenzung } from '../src/geometrie/vec';
import { ellipse, gekritzel, kreis, lForm, mitSchraege, rechteck, strichUmVieleck, uForm } from './hilfen';

const T = STANDARD_TOLERANZEN;

function erwarteRaum(strich: ReturnType<typeof strichUmVieleck>, ecken: number, sollFlaeche: number, tol = 0.12) {
  const e = erkenneRaum(strich, T);
  if (!e.ok) throw new Error(`nicht erkannt: ${e.grund}`);
  expect(e.ecken.length).toBe(ecken);
  expect(Math.abs(flaeche(e.ecken) - sollFlaeche) / sollFlaeche).toBeLessThan(tol);
  expect(istEinfach(e.ecken)).toBe(true);
  return e;
}

describe('Hilfsfunktionen der Geometrie', () => {
  it('erkennt eine Schleife (Schmetterling) als nicht einfach', () => {
    expect(istEinfach([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }])).toBe(false);
    expect(istEinfach(rechteck(2, 2))).toBe(true);
  });
});

describe('Raumerkennung: gute Fälle', () => {
  it('sauberes Rechteck 4 x 3 m', () => {
    const e = erwarteRaum(strichUmVieleck(rechteck(4, 3)), 4, 12, 0.02);
    expect(e.form).toBe('Rechteck');
    const b = umgrenzung(e.ecken);
    expect(b.maxX - b.minX).toBeCloseTo(4, 1);
    expect(b.maxY - b.minY).toBeCloseTo(3, 1);
  });

  it('wackeliges Rechteck, mehrere Zufallsstriche', () => {
    for (let seed = 1; seed <= 12; seed++) {
      erwarteRaum(strichUmVieleck(rechteck(4, 3), { rauschen: 0.06, seed, start: (seed % 7) / 7 }), 4, 12, 0.08);
    }
  });

  it('Rechteck mit abgerundeten Ecken', () => {
    for (let seed = 1; seed <= 5; seed++) erwarteRaum(strichUmVieleck(rechteck(4, 3), { rund: 0.3, rauschen: 0.03, seed }), 4, 12, 0.1);
  });

  it('Strich hört zu früh auf (Lücke) und Strich läuft über den Anfang hinaus', () => {
    erwarteRaum(strichUmVieleck(rechteck(4, 3), { luecke: 0.08, rauschen: 0.03, seed: 3 }), 4, 12, 0.1);
    erwarteRaum(strichUmVieleck(rechteck(4, 3), { ueberlapp: 0.08, rauschen: 0.03, seed: 4 }), 4, 12, 0.1);
  });

  it('leicht gedrehtes Rechteck (5°) wird gerade gerichtet', () => {
    const e = erwarteRaum(strichUmVieleck(rechteck(4, 3), { drehung: 5, rauschen: 0.03, seed: 2 }), 4, 12, 0.1);
    for (let i = 0; i < 4; i++) {
      const a = e.ecken[i];
      const b = e.ecken[(i + 1) % 4];
      expect(Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThan(1e-6);
    }
  });

  it('L-Form', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const e = erwarteRaum(strichUmVieleck(lForm, { rauschen: 0.05, seed, start: seed / 9 }), 6, 9, 0.1);
      expect(e.form).toBe('L-Form');
    }
  });

  it('U-Form (Flur)', () => {
    for (let seed = 1; seed <= 4; seed++) erwarteRaum(strichUmVieleck(uForm, { rauschen: 0.05, seed }), 8, 15 - 4, 0.12);
  });

  it('Form mit 45°-Schräge', () => {
    const e = erwarteRaum(strichUmVieleck(mitSchraege, { rauschen: 0.04, seed: 5 }), 5, 4 * 3 - 0.5 * 1 * 1 - 0, 0.12);
    expect(e.form).toBe('Form mit Schräge');
  });

  it('Maße liegen auf dem Raster', () => {
    const e = erkenneRaum(strichUmVieleck(rechteck(4, 3), { rauschen: 0.05, seed: 8 }), T);
    if (!e.ok) throw new Error(e.grund);
    for (const p of e.ecken) {
      expect(Math.abs(p.x / T.raster - Math.round(p.x / T.raster))).toBeLessThan(1e-6);
      expect(Math.abs(p.y / T.raster - Math.round(p.y / T.raster))).toBeLessThan(1e-6);
    }
  });

  it('Ecken laufen gegen den Uhrzeigersinn, egal in welche Richtung gezeichnet wurde', () => {
    const vor = strichUmVieleck(rechteck(4, 3));
    const e1 = erkenneRaum(vor, T);
    const e2 = erkenneRaum([...vor].reverse(), T);
    if (!e1.ok || !e2.ok) throw new Error('nicht erkannt');
    expect(flaeche(e1.ecken)).toBeCloseTo(flaeche(e2.ecken), 6);
  });
});

describe('Raumerkennung: Striche, die kein Raum sind', () => {
  it('Kreis wird abgelehnt', () => {
    expect(erkenneRaum(kreis(1.5), T).ok).toBe(false);
  });
  it('Gekritzel wird abgelehnt', () => {
    for (let seed = 1; seed <= 5; seed++) expect(erkenneRaum(gekritzel(seed), T).ok).toBe(false);
  });
  it('offene Form (drei Seiten) wird abgelehnt mit Hinweis', () => {
    const e = erkenneRaum(strichUmVieleck(rechteck(4, 3), { luecke: 0.3, seed: 2 }), T);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toContain('geschlossen');
  });
  it('winziger Strich wird abgelehnt', () => {
    expect(erkenneRaum(strichUmVieleck(rechteck(0.2, 0.2)), T).ok).toBe(false);
  });
  it('stark schiefes Rechteck (22°) wird abgelehnt', () => {
    expect(erkenneRaum(strichUmVieleck(rechteck(4, 3), { drehung: 22 }), T).ok).toBe(false);
  });
});

describe('Toleranzen wirken', () => {
  it('höhere Winkel-Toleranz erkennt ein stärker gedrehtes Rechteck', () => {
    const strich = strichUmVieleck(rechteck(4, 3), { drehung: 18, rauschen: 0.02 });
    expect(erkenneRaum(strich, { ...T, winkel: 10 }).ok).toBe(false);
    expect(erkenneRaum(strich, { ...T, winkel: 21 }).ok).toBe(true);
  });
});

describe('Nachbesserungen aus der Prüfung', () => {
  it('lange schmale Flure werden erkannt', () => {
    for (const [b, h] of [[8, 1.2], [10, 1.5], [12, 2], [12, 1.5]] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const e = erkenneRaum(strichUmVieleck(rechteck(b, h), { rauschen: 0.04, seed, start: seed / 7 }), T);
        if (!e.ok) throw new Error(`${b}x${h} seed ${seed}: ${e.grund}`);
        expect(e.ecken.length).toBe(4);
      }
    }
  });

  it('kleine echte Nische (1 x 1 m in 8 x 6 m) bleibt erhalten', () => {
    const mitNische = [
      { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 4.5, y: 6 }, { x: 4.5, y: 5 }, { x: 3.5, y: 5 }, { x: 3.5, y: 6 }, { x: 0, y: 6 },
    ];
    const e = erkenneRaum(strichUmVieleck(mitNische, { rauschen: 0.03, seed: 2 }), T);
    if (!e.ok) throw new Error(e.grund);
    expect(e.ecken.length).toBe(8);
  });

  it('Strich, der über den Anfang hinausläuft (15 %), wird gekappt und erkannt', () => {
    for (let seed = 1; seed <= 6; seed++) {
      erwarteRaum(strichUmVieleck(rechteck(4, 3), { ueberlapp: 0.15, rauschen: 0.03, seed, start: seed / 8 }), 4, 12, 0.1);
    }
  });

  it('Ellipse mit normalem Seitenverhältnis wird abgelehnt', () => {
    expect(erkenneRaum(ellipse(2, 1.5), T).ok).toBe(false);
  });

  it('bekannte Grenze: eine sehr flache Ellipse (4 x 1,2 m) gilt als Sechseck mit Schrägen', () => {
    const e = erkenneRaum(ellipse(2, 0.6), T);
    expect(e.ok).toBe(true);
  });

  it('ungültige Punkte (NaN, Unendlich) bringen nichts zum Absturz', () => {
    const strich = strichUmVieleck(rechteck(4, 3), { rauschen: 0.03, seed: 1 });
    strich.splice(10, 0, { x: NaN, y: 1 }, { x: Infinity, y: 2 });
    const e = erkenneRaum(strich, T);
    expect(e.ok).toBe(true);
  });
});
