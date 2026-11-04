// Versionen einer Skizze: vollständige Kopien (Skizzen sind klein), nichts wird je überschrieben.
import type { Kunde } from '../pdf/grundriss';
import { neueId, pruefeSkizze, type Skizze } from './skizze';
import type { Raum } from './typen';

export type Grund = 'schliessen' | 'wechsel' | 'pdf' | 'manuell' | 'vor-wiederherstellung';

export interface Version {
  id: string;
  skizzeId: string;
  zeit: number;
  grund: Grund;
  name: string;
  kunde: Kunde;
  raeume: Raum[];
  naechsteId: number;
}

export const MAX_AUTOMATISCHE_VERSIONEN = 30;

const GRUENDE: Grund[] = ['schliessen', 'wechsel', 'pdf', 'manuell', 'vor-wiederherstellung'];

export function grundText(g: Grund): string {
  switch (g) {
    case 'schliessen': return 'beim Schließen';
    case 'wechsel': return 'beim Wechseln';
    case 'pdf': return 'beim PDF';
    case 'manuell': return 'von Hand gespeichert';
    case 'vor-wiederherstellung': return 'vor dem Zurückholen';
  }
}

/** Kennzeichen des Inhalts: gleiche Zeichenfolge bedeutet, dass sich nichts geändert hat. */
export const inhaltsStempel = (s: Pick<Skizze, 'name' | 'kunde' | 'raeume'>): string => JSON.stringify([s.name, s.kunde, s.raeume]);

export function neueVersion(s: Skizze, grund: Grund, zeit = Date.now()): Version {
  return {
    id: neueId(),
    skizzeId: s.id,
    zeit,
    grund,
    name: s.name,
    kunde: JSON.parse(JSON.stringify(s.kunde)) as Kunde,
    raeume: JSON.parse(JSON.stringify(s.raeume)) as Raum[],
    naechsteId: s.naechsteId,
  };
}

/** Welche Versionen sollen gelöscht werden? Von Hand gespeicherte und Wiederherstellungs-Sicherungen bleiben immer. */
export function zuLoeschen(versionen: Version[], max = MAX_AUTOMATISCHE_VERSIONEN): string[] {
  const automatisch = versionen.filter((v) => v.grund !== 'manuell' && v.grund !== 'vor-wiederherstellung').sort((a, b) => b.zeit - a.zeit);
  return automatisch.slice(max).map((v) => v.id);
}

/** Prüft eine gelesene Version aus dem Speicher; kaputte Einträge geben null zurück. */
export function pruefeVersion(roh: unknown): Version | null {
  if (typeof roh !== 'object' || roh === null) return null;
  const v = roh as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.skizzeId !== 'string' || typeof v.zeit !== 'number' || !GRUENDE.includes(v.grund as Grund)) return null;
  const inhalt = pruefeSkizze({ id: v.skizzeId, name: v.name, kunde: v.kunde, raeume: v.raeume, naechsteId: v.naechsteId }, false);
  if (typeof inhalt === 'string') return null;
  return { id: v.id, skizzeId: v.skizzeId, zeit: v.zeit, grund: v.grund as Grund, name: inhalt.name, kunde: inhalt.kunde, raeume: inhalt.raeume, naechsteId: inhalt.naechsteId };
}
