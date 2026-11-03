import type { P } from '../geometrie/vec';

/** Eine Tür oder ein Fenster in einer Seite eines Raums. Maße in Metern. */
export interface Oeffnung {
  id: number;
  art: 'tuer' | 'fenster';
  /** Seite des Raums (Ecke kante bis Ecke kante+1) */
  kante: number;
  /** Abstand vom Anfang der Seite bis zum Anfang der Öffnung */
  abstand: number;
  breite: number;
  /** Von innen gesehen: Wo sitzt das Scharnier? (nur Tür) */
  anschlag: 'links' | 'rechts';
  /** Öffnet die Tür in den Raum hinein oder nach außen? (nur Tür) */
  aufschlag: 'innen' | 'aussen';
}

/** Ein Raum: geschlossenes Vieleck (Innenmaß), Ecken gegen den Uhrzeigersinn, Meter, y nach oben. */
export interface Raum {
  id: number;
  name: string;
  ecken: P[];
  /** Nur zur Anzeige: Rechteck, L-Form usw. */
  form: string;
  /** Wanddicke je Seite in Metern (Seite i = Ecke i bis Ecke i+1), nach außen angetragen. 0 oder fehlend = keine Wand. */
  waende?: number[];
  oeffnungen?: Oeffnung[];
}
