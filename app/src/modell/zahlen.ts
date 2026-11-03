// Eingaben von Hand lesen: "4,20", "4.2", "420" (= 4,20 m), "420 cm", "4,2 m".

/** Liest eine Länge und gibt Meter zurück, oder null, wenn der Text keine Länge ist. */
export function leseLaenge(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d+(?:[.,]\d+)?)(cm|m|mm)?$/.exec(t);
  if (!m) return null;
  const zahl = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(zahl)) return null;
  let meter: number;
  if (m[2] === 'cm') meter = zahl / 100;
  else if (m[2] === 'mm') meter = zahl / 1000;
  else if (m[2] === 'm') meter = zahl;
  else meter = !/[.,]/.test(m[1]) && zahl >= 30 ? zahl / 100 : zahl; // "420" meint 4,20 m
  return Math.round(meter * 1000) / 1000;
}

export const zeigeLaenge = (meter: number): string => meter.toFixed(2).replace('.', ',');
