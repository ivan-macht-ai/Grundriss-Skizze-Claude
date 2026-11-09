// Gemeinsame Bemaßung für Bildschirm und PDF: Maßketten an Seiten mit Öffnungen und Wanddicken.
import type { Raum } from './typen';
import { kante } from './oeffnungen';
import { dickenVon } from './waende';

/** Positionen entlang einer Seite, an denen die Maßkette ihre Striche hat: Anfang, Anfang und Ende jeder Öffnung, Ende. */
export function kettenPunkte(raum: Raum, kanteIndex: number): number[] {
  const l = kante(raum, kanteIndex).laenge;
  const oeff = (raum.oeffnungen ?? []).filter((o) => o.kante === kanteIndex).sort((a, b) => a.abstand - b.abstand);
  const punkte = [0];
  for (const o of oeff) punkte.push(o.abstand, o.abstand + o.breite);
  punkte.push(l);
  // Punkte, die (fast) zusammenfallen, zählen nur einmal: Öffnung bis an die Ecke ergibt kein Maß der Länge 0
  return punkte.filter((p, i) => i === 0 || p - punkte[i - 1] > 0.0005);
}

/** Das längste Stück der Seite ohne Öffnung (dort steht die Wanddicke), mindestens `minLaenge` lang. */
export function laengstesFreiesStueck(raum: Raum, kanteIndex: number, minLaenge = 0.4): { t0: number; t1: number } | null {
  const l = kante(raum, kanteIndex).laenge;
  const oeff = (raum.oeffnungen ?? []).filter((o) => o.kante === kanteIndex).sort((a, b) => a.abstand - b.abstand);
  const stuecke: { t0: number; t1: number }[] = [];
  let pos = 0;
  for (const o of oeff) {
    if (o.abstand > pos) stuecke.push({ t0: pos, t1: o.abstand });
    pos = Math.max(pos, o.abstand + o.breite);
  }
  if (pos < l) stuecke.push({ t0: pos, t1: l });
  stuecke.sort((a, b) => b.t1 - b.t0 - (a.t1 - a.t0));
  const best = stuecke[0];
  return best && best.t1 - best.t0 >= minLaenge ? best : null;
}

/** Wanddicke einer Seite in Zentimetern als Text: 0,24 -> "24", 0,115 -> "11,5". */
export const zeigeCm = (meter: number): string => String(Math.round(meter * 1000) / 10).replace('.', ',');

export const wandDicke = (raum: Raum, kanteIndex: number): number => dickenVon(raum)[kanteIndex] ?? 0;

/** Maß als Text, auf den Millimeter genau: "0,41" wenn volle Zentimeter, sonst "0,885". */
export function zeigeMasse(meter: number): string {
  const mm = Math.round(meter * 1000);
  const text = mm % 10 === 0 ? (mm / 1000).toFixed(2) : (mm / 1000).toFixed(3);
  return text.replace('.', ',');
}

/**
 * Teilstücke einer Maßkette in Metern, auf den Millimeter gerundet. Gerundet wird jede Position für sich und
 * dann die Differenz gebildet: Die Teilstücke ergeben dadurch immer genau das gerundete Gesamtmaß.
 */
export function kettenMasse(punkte: number[]): number[] {
  const mm = punkte.map((p) => Math.round(p * 1000));
  return mm.slice(1).map((p, i) => (p - mm[i]) / 1000);
}
