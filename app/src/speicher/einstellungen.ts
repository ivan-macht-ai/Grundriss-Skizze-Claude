// Kleine Einstellungen im Gerät (localStorage). Jeder Zugriff ist abgesichert: Der Browser kann ihn verweigern.
import { STANDARD_TOLERANZEN, type Toleranzen } from '../config/toleranzen';
import { STANDARD_SERVER, type CrmKunde, type ServerEinstellungen } from '../senden/client';

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

const SCHLUESSEL_SERVER = 'skizze.server.v1';
const SCHLUESSEL_KUNDEN = 'skizze.kundenliste.v1';

export function ladeServer(): ServerEinstellungen {
  const g = ladeJson<Partial<ServerEinstellungen>>(SCHLUESSEL_SERVER) ?? {};
  return {
    adresse: typeof g.adresse === 'string' ? g.adresse : STANDARD_SERVER.adresse,
    geheimwort: typeof g.geheimwort === 'string' ? g.geheimwort : STANDARD_SERVER.geheimwort,
    marken: typeof g.marken === 'string' ? g.marken : STANDARD_SERVER.marken,
  };
}

export function speichereServer(e: ServerEinstellungen): void {
  speichereJson(SCHLUESSEL_SERVER, e);
}

export interface KundenCache {
  zeit: number;
  kunden: CrmKunde[];
}

export function ladeKundenCache(): KundenCache | null {
  const g = ladeJson<KundenCache>(SCHLUESSEL_KUNDEN);
  return g && typeof g.zeit === 'number' && Array.isArray(g.kunden) ? g : null;
}

export function speichereKundenCache(c: KundenCache): void {
  speichereJson(SCHLUESSEL_KUNDEN, c);
}

const SCHLUESSEL_ANZEIGE = 'skizze.anzeige.v1';

export interface Anzeige {
  /** Maße auf dem Bildschirm zeigen (im PDF stehen sie immer) */
  masse: boolean;
  /** Kunden aus dem CRM und Senden verwenden */
  crm: boolean;
}

/** Wer schon einen Server eingetragen hat, behält die CRM-Funktionen; sonst sind sie zunächst ausgeblendet. */
export function ladeAnzeige(): Anzeige {
  const g = ladeJson<Partial<Anzeige>>(SCHLUESSEL_ANZEIGE) ?? {};
  return {
    masse: typeof g.masse === 'boolean' ? g.masse : true,
    crm: typeof g.crm === 'boolean' ? g.crm : ladeServer().adresse.trim() !== '',
  };
}

export function speichereAnzeige(a: Anzeige): void {
  speichereJson(SCHLUESSEL_ANZEIGE, a);
}
