// Umrechnungen für das PDF. Alles an einer Stelle: 1 mm = 72 / 25,4 Punkt.

export const MM_ZU_PUNKT = 72 / 25.4;

export const A4_MM = { breite: 210, hoehe: 297 } as const;

/** Seitengröße in Punkt. */
export function seitenGroesse(quer: boolean): { breite: number; hoehe: number } {
  const [b, h] = quer ? [A4_MM.hoehe, A4_MM.breite] : [A4_MM.breite, A4_MM.hoehe];
  return { breite: b * MM_ZU_PUNKT, hoehe: h * MM_ZU_PUNKT };
}

/** Länge in Metern (Wirklichkeit) -> Länge in Punkt auf dem Papier beim Maßstab 1:nenner. */
export function meterZuPunkt(meter: number, nenner: number): number {
  return ((meter * 1000) / nenner) * MM_ZU_PUNKT;
}

/** Länge in Metern (Wirklichkeit) -> Länge in Millimetern auf dem Papier. */
export function meterZuPapierMm(meter: number, nenner: number): number {
  return (meter * 1000) / nenner;
}

export const MASSSTAEBE = [20, 25, 50, 100] as const;
