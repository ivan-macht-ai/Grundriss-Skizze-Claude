// ALLE Toleranzen der Formenerkennung stehen hier und nur hier.
// Die Werte lassen sich in den Einstellungen der App ändern (gespeichert im Gerät).

export interface Toleranzen {
  /** Größte Abweichung einer Kante von 0°/45°/90°/135° in Grad, damit sie einrastet. */
  winkel: number;
  /** Größter Abstand zwischen Strichanfang und Strichende als Anteil der Strichlänge, damit die Form als geschlossen gilt. */
  schliessen: number;
  /** Kürzeste erlaubte Seite in Metern; kürzere Stücke werden mit den Nachbarn verschmolzen. */
  minKante: number;
  /** Maße werden auf dieses Raster gerundet (Meter). */
  raster: number;
  /** Ecken-Empfindlichkeit: erlaubte Abweichung beim Vereinfachen als Anteil der Strichgröße. Kleiner = mehr Ecken. */
  ecken: number;
  /** Kleinste erlaubte Raumfläche in m². */
  minFlaeche: number;
  /** Rundungen an Ecken ignorieren: Seiten kürzer als dieser Anteil der Strichlänge zählen als Rundung und verschwinden. */
  rundung: number;
}

export const STANDARD_TOLERANZEN: Toleranzen = {
  winkel: 15,
  schliessen: 0.12,
  minKante: 0.3,
  raster: 0.05,
  ecken: 0.05,
  minFlaeche: 0.5,
  rundung: 0.06,
};

export interface ToleranzBeschreibung {
  schluessel: keyof Toleranzen;
  name: string;
  hilfe: string;
  min: number;
  max: number;
  schritt: number;
  /** Faktor von der gespeicherten Einheit zur Anzeige (z. B. Meter -> cm) */
  anzeigeFaktor: number;
  einheit: string;
}

export const TOLERANZ_BESCHREIBUNG: ToleranzBeschreibung[] = [
  { schluessel: 'winkel', name: 'Winkel-Toleranz', hilfe: 'Wie schief eine Linie sein darf, damit sie gerade (0°, 45°, 90°) wird.', min: 5, max: 22, schritt: 1, anzeigeFaktor: 1, einheit: '°' },
  { schluessel: 'schliessen', name: 'Schließen', hilfe: 'Wie weit Strichanfang und -ende auseinander liegen dürfen (in % der Strichlänge).', min: 2, max: 30, schritt: 1, anzeigeFaktor: 100, einheit: ' %' },
  { schluessel: 'minKante', name: 'Kürzeste Seite', hilfe: 'Kürzere Stücke werden mit dem Nachbarn verschmolzen.', min: 10, max: 80, schritt: 5, anzeigeFaktor: 100, einheit: ' cm' },
  { schluessel: 'raster', name: 'Rundung der Maße', hilfe: 'Maße werden auf dieses Raster gerundet.', min: 1, max: 20, schritt: 1, anzeigeFaktor: 100, einheit: ' cm' },
  { schluessel: 'ecken', name: 'Ecken-Empfindlichkeit', hilfe: 'Kleiner = die App findet mehr Ecken, größer = sie glättet stärker.', min: 2, max: 15, schritt: 1, anzeigeFaktor: 100, einheit: ' %' },
  { schluessel: 'rundung', name: 'Ecken-Rundung ignorieren', hilfe: 'Abgerundete Ecken werden zu scharfen Ecken. Größer = rundere Ecken sind erlaubt, aber kleine Absätze gehen verloren.', min: 0, max: 12, schritt: 1, anzeigeFaktor: 100, einheit: ' %' },
  { schluessel: 'minFlaeche', name: 'Kleinste Fläche', hilfe: 'Kleinere Formen werden nicht als Raum erkannt.', min: 0.1, max: 3, schritt: 0.1, anzeigeFaktor: 1, einheit: ' m²' },
];
