import { describe, expect, it } from 'vitest';
import { rasterSchritt } from '../src/ansicht/raster';
import { MAX_SCALE, MIN_SCALE, panBy, toScreen, toWorld, zoomAt } from '../src/ansicht/viewport';

describe('Ansicht', () => {
  const vp = { scale: 100, ox: 50, oy: 400 };

  it('rechnet Welt und Bildschirm hin und zurück um (y zeigt in der Welt nach oben)', () => {
    const s = toScreen(vp, 2, 1.5);
    expect(s).toEqual({ x: 250, y: 250 });
    const w = toWorld(vp, s.x, s.y);
    expect(w.x).toBeCloseTo(2, 10);
    expect(w.y).toBeCloseTo(1.5, 10);
  });

  it('zoomt um den Zeigerpunkt, der Weltpunkt darunter bleibt stehen', () => {
    const vorher = toWorld(vp, 300, 200);
    const neu = zoomAt(vp, 300, 200, 2);
    const nachher = toWorld(neu, 300, 200);
    expect(nachher.x).toBeCloseTo(vorher.x, 10);
    expect(nachher.y).toBeCloseTo(vorher.y, 10);
    expect(neu.scale).toBeCloseTo(200, 10);
  });

  it('begrenzt den Zoom', () => {
    expect(zoomAt(vp, 0, 0, 1e6).scale).toBe(MAX_SCALE);
    expect(zoomAt(vp, 0, 0, 1e-6).scale).toBe(MIN_SCALE);
  });

  it('verschiebt um Pixel', () => {
    expect(panBy(vp, 10, -5)).toEqual({ scale: 100, ox: 60, oy: 395 });
  });

  it('wählt einen Rasterabstand, der auf dem Bildschirm nicht zu eng wird', () => {
    expect(rasterSchritt(200)).toBe(0.1);
    expect(rasterSchritt(100)).toBe(0.5);
    expect(rasterSchritt(20)).toBe(1);
    expect(rasterSchritt(8)).toBe(5);
  });
});
