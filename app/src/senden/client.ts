// Mit dem Server reden (Schnittstelle: docs/SCHNITTSTELLE.md). Reine Logik ohne Oberfläche, mit eingespieltem fetch testbar.

export interface ServerEinstellungen {
  /** Adresse des Servers, zum Beispiel https://ivanserver.tail149f79.ts.net:5444 */
  adresse: string;
  /** Optionales Geheimwort (Header Authorization: Bearer ...) */
  geheimwort: string;
  /** Marken, nach denen Kunden geholt werden, durch Komma getrennt */
  marken: string;
}

export const STANDARD_SERVER: ServerEinstellungen = { adresse: '', geheimwort: '', marken: 'Angebot, Besuch' };

export interface Auftrag {
  id: string;
  skizzeId: string;
  erstellt: number;
  /** Textfelder wie in der Schnittstelle beschrieben */
  felder: Record<string, string>;
  pdf: Blob;
  bild: Blob;
  /** Quelldatei der Skizze (JSON-Text) */
  quelle: string;
  status: 'wartet' | 'fehler';
  versuche: number;
  fehler?: string;
  letzterVersuch?: number;
}

export type Ergebnis =
  | { art: 'ok'; crmId?: string }
  | { art: 'dauerhaft'; meldung: string }
  | { art: 'spaeter'; meldung: string };

export interface CrmKunde {
  crmId: string;
  name: string;
  adresse: string;
  nummer: string;
  marken: string[];
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Prüft die Server-Adresse und macht sie einheitlich (ohne Schrägstrich am Ende). Gibt null zurück, wenn sie nicht brauchbar ist. */
export function normalisiereAdresse(roh: string): string | null {
  const t = roh.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

const kopf = (e: ServerEinstellungen): Record<string, string> => (e.geheimwort ? { Authorization: `Bearer ${e.geheimwort}` } : {});

export function baueFormData(a: Auftrag): FormData {
  const f = new FormData();
  f.append('auftrag_id', a.id);
  f.append('skizzen_id', a.skizzeId);
  for (const [k, v] of Object.entries(a.felder)) f.append(k, v);
  f.append('pdf', a.pdf, 'grundriss.pdf');
  f.append('bild', a.bild, 'grundriss.png');
  f.append('quelle', new Blob([a.quelle], { type: 'application/json' }), 'skizze.json');
  return f;
}

async function lesenAlsJson(antwort: Response): Promise<Record<string, unknown>> {
  try {
    const d: unknown = await antwort.json();
    return typeof d === 'object' && d !== null ? (d as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function mitZeitlimit<T>(f: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await f(c.signal);
  } finally {
    clearTimeout(t);
  }
}

/** Schickt einen Auftrag. 'spaeter' heißt: nicht aufgeben, später erneut versuchen. 'dauerhaft': Nutzer muss etwas ändern. */
export async function sendeAuftrag(a: Auftrag, e: ServerEinstellungen, fetchFn: FetchFn = (u, i) => fetch(u, i), zeitlimitMs = 90_000): Promise<Ergebnis> {
  const basis = normalisiereAdresse(e.adresse);
  if (!basis) return { art: 'dauerhaft', meldung: 'Die Server-Adresse fehlt oder ist ungültig. Trage sie in den Einstellungen ein.' };
  let antwort: Response;
  try {
    antwort = await mitZeitlimit((signal) => fetchFn(`${basis}/api/skizzen`, { method: 'POST', body: baueFormData(a), headers: kopf(e), signal }), zeitlimitMs);
  } catch {
    return { art: 'spaeter', meldung: 'Der Server ist gerade nicht erreichbar.' };
  }
  const daten = await lesenAlsJson(antwort);
  if (antwort.status === 200 && daten.ok !== false) return { art: 'ok', crmId: typeof daten.crm_id === 'string' ? daten.crm_id : undefined };
  const fehlerText = typeof daten.fehler === 'string' ? daten.fehler : '';
  if (antwort.status === 401 || antwort.status === 403) return { art: 'dauerhaft', meldung: 'Der Server hat das Geheimwort nicht angenommen. Prüfe es in den Einstellungen.' };
  if (antwort.status === 413) return { art: 'dauerhaft', meldung: fehlerText || 'Die Skizze ist für den Server zu groß.' };
  if (antwort.status >= 400 && antwort.status < 500) return { art: 'dauerhaft', meldung: fehlerText || `Der Server hat die Skizze abgelehnt (Code ${antwort.status}).` };
  return { art: 'spaeter', meldung: `Der Server hatte ein Problem (Code ${antwort.status}).` };
}

function pruefeKunde(roh: unknown): CrmKunde | null {
  if (typeof roh !== 'object' || roh === null) return null;
  const k = roh as Record<string, unknown>;
  if (typeof k.crm_id !== 'string' || !k.crm_id || typeof k.name !== 'string' || !k.name.trim()) return null;
  const text = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');
  return {
    crmId: k.crm_id.slice(0, 100),
    name: k.name.trim().slice(0, 160),
    adresse: text(k.adresse, 240),
    nummer: text(k.nummer, 80),
    marken: Array.isArray(k.marken) ? k.marken.filter((m): m is string => typeof m === 'string').slice(0, 20).map((m) => m.slice(0, 60)) : [],
  };
}

/** Holt die Kunden mit den gewünschten Marken vom Server. */
export async function holeKunden(e: ServerEinstellungen, fetchFn: FetchFn = (u, i) => fetch(u, i), zeitlimitMs = 30_000): Promise<{ kunden: CrmKunde[] } | { fehler: string }> {
  const basis = normalisiereAdresse(e.adresse);
  if (!basis) return { fehler: 'Die Server-Adresse fehlt oder ist ungültig. Trage sie in den Einstellungen ein.' };
  const marken = e.marken.split(',').map((m) => m.trim()).filter(Boolean);
  const url = `${basis}/api/kunden${marken.length ? `?marke=${encodeURIComponent(marken.join(','))}` : ''}`;
  let antwort: Response;
  try {
    antwort = await mitZeitlimit((signal) => fetchFn(url, { headers: kopf(e), signal }), zeitlimitMs);
  } catch {
    return { fehler: 'Der Server ist gerade nicht erreichbar. Die gespeicherte Kundenliste bleibt nutzbar.' };
  }
  if (antwort.status === 401 || antwort.status === 403) return { fehler: 'Der Server hat das Geheimwort nicht angenommen.' };
  if (!antwort.ok) return { fehler: `Der Server hat die Kundenliste nicht geliefert (Code ${antwort.status}).` };
  const daten = await lesenAlsJson(antwort);
  if (!Array.isArray(daten.kunden)) return { fehler: 'Die Antwort des Servers ist unvollständig.' };
  const kunden: CrmKunde[] = [];
  for (const roh of daten.kunden.slice(0, 5000)) {
    const k = pruefeKunde(roh);
    if (k) kunden.push(k);
  }
  return { kunden: kunden.sort((a, b) => a.name.localeCompare(b.name, 'de')) };
}

/** Filtert eine Kundenliste nach Suchtext (Name, Adresse, Nummer). */
export function suche(kunden: CrmKunde[], text: string): CrmKunde[] {
  const t = text.trim().toLowerCase();
  if (!t) return kunden;
  return kunden.filter((k) => `${k.name} ${k.adresse} ${k.nummer}`.toLowerCase().includes(t));
}

// ------------------------------------------------------------------ Warteschlange

export interface Ablage {
  liste(): Promise<Auftrag[]>;
  entferne(id: string): Promise<void>;
  speichere(a: Auftrag): Promise<void>;
}

export interface Bericht {
  gesendet: number;
  fehler: number;
  offen: number;
  /** Meldung für den Nutzer, wenn etwas schiefging */
  meldung?: string;
}

/**
 * Arbeitet die Warteschlange der Reihe nach ab. Bei "später" (Netz weg, Serverfehler) wird abgebrochen,
 * damit nicht alle Aufträge nacheinander scheitern. "Dauerhaft" markiert den Auftrag als Fehler und macht mit dem nächsten weiter.
 */
export async function arbeiteAb(ablage: Ablage, e: ServerEinstellungen, senden: typeof sendeAuftrag = sendeAuftrag, jetzt = () => Date.now()): Promise<Bericht> {
  const alle = (await ablage.liste()).sort((a, b) => a.erstellt - b.erstellt);
  const bericht: Bericht = { gesendet: 0, fehler: 0, offen: 0 };
  let abgebrochen = false;
  for (const a of alle) {
    if (a.status === 'fehler') {
      bericht.fehler++;
      continue;
    }
    if (abgebrochen) {
      bericht.offen++;
      continue;
    }
    const erg = await senden(a, e);
    if (erg.art === 'ok') {
      await ablage.entferne(a.id);
      bericht.gesendet++;
    } else if (erg.art === 'dauerhaft') {
      await ablage.speichere({ ...a, status: 'fehler', fehler: erg.meldung, versuche: a.versuche + 1, letzterVersuch: jetzt() });
      bericht.fehler++;
      bericht.meldung = erg.meldung;
    } else {
      await ablage.speichere({ ...a, versuche: a.versuche + 1, fehler: erg.meldung, letzterVersuch: jetzt() });
      bericht.offen++;
      bericht.meldung = erg.meldung;
      abgebrochen = true;
    }
  }
  return bericht;
}
