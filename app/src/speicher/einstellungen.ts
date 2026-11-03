// Kleine Einstellungen im Gerät (localStorage). Jeder Zugriff ist abgesichert: Der Browser kann ihn verweigern.
import { STANDARD_TOLERANZEN, type Toleranzen } from '../config/toleranzen';

const SCHLUESSEL_TOLERANZ = 'skizze.toleranzen.v1';

export function ladeToleranzen(): Toleranzen {
  try {
    const roh = localStorage.getItem(SCHLUESSEL_TOLERANZ);
    if (!roh) return { ...STANDARD_TOLERANZEN };
    const gespeichert = JSON.parse(roh) as Partial<Toleranzen>;
    const t = { ...STANDARD_TOLERANZEN };
    for (const k of Object.keys(t) as (keyof Toleranzen)[]) {
      const v = gespeichert[k];
      if (typeof v === 'number' && Number.isFinite(v)) t[k] = v;
    }
    return t;
  } catch {
    return { ...STANDARD_TOLERANZEN };
  }
}

export function speichereToleranzen(t: Toleranzen): void {
  try {
    localStorage.setItem(SCHLUESSEL_TOLERANZ, JSON.stringify(t));
  } catch {
    /* ohne Speicher läuft die App weiter, die Werte gelten dann nur bis zum Schließen */
  }
}

export function ladeJson<T>(schluessel: string): T | null {
  try {
    const roh = localStorage.getItem(schluessel);
    return roh ? (JSON.parse(roh) as T) : null;
  } catch {
    return null;
  }
}

export function speichereJson(schluessel: string, wert: unknown): void {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
  } catch {
    /* siehe oben */
  }
}

export function loescheSchluessel(schluessel: string): void {
  try {
    localStorage.removeItem(schluessel);
  } catch {
    /* siehe oben */
  }
}
