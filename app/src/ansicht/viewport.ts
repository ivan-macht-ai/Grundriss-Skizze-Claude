// Ansicht: rechnet zwischen Weltkoordinaten (Meter, y nach oben) und Bildschirm (Pixel, y nach unten).

export interface Viewport {
  /** Pixel pro Meter */
  scale: number;
  /** Bildschirmposition des Weltpunkts (0, 0) */
  ox: number;
  oy: number;
}

export const MIN_SCALE = 8;
export const MAX_SCALE = 1500;

export function toScreen(vp: Viewport, wx: number, wy: number): { x: number; y: number } {
  return { x: vp.ox + wx * vp.scale, y: vp.oy - wy * vp.scale };
}

export function toWorld(vp: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - vp.ox) / vp.scale, y: (vp.oy - sy) / vp.scale };
}

/** Zoomt um einen Bildschirmpunkt, sodass der Weltpunkt darunter an derselben Stelle bleibt. */
export function zoomAt(vp: Viewport, sx: number, sy: number, factor: number): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, vp.scale * factor));
  const real = scale / vp.scale;
  return { scale, ox: sx - (sx - vp.ox) * real, oy: sy - (sy - vp.oy) * real };
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { scale: vp.scale, ox: vp.ox + dx, oy: vp.oy + dy };
}

/** Ansicht, die den Weltpunkt (0, 0) unten links mit etwas Rand zeigt. */
export function startAnsicht(breite: number, hoehe: number): Viewport {
  const scale = Math.min(breite, hoehe) / 8;
  return { scale, ox: Math.min(60, breite * 0.08), oy: hoehe - Math.min(60, hoehe * 0.1) };
}
