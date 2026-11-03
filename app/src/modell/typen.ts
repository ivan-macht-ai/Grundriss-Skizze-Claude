import type { P } from '../geometrie/vec';

/** Ein Raum: geschlossenes Vieleck (Innenmaß), Ecken gegen den Uhrzeigersinn, Meter, y nach oben. */
export interface Raum {
  id: number;
  name: string;
  ecken: P[];
  /** Nur zur Anzeige: Rechteck, L-Form usw. */
  form: string;
}
