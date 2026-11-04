// Eine Skizze als Ganzes: Name, Kunde, Räume. Das ist auch das Format der Sicherungsdatei.
import type { Kunde } from '../pdf/grundriss';
import type { Oeffnung, Raum } from './typen';

export const DATEI_FORMAT = 'grundriss-skizze';
export const DATEI_VERSION = 1;
const MAX_RAEUME = 200;

export interface Skizze {
  id: string;
  name: string;
  kunde: Kunde;
  raeume: Raum[];
  naechsteId: number;
  /** Vermerke zur Skizze (gehen mit ans CRM) */
  notizen: string;
  /** Wie oft diese Skizze schon gesendet wurde */
  sendungen: number;
  erstellt: number;
  geaendert: number;
}

export function neueId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function standardName(zeit = new Date()): string {
  return `Skizze ${zeit.toLocaleDateString('de-DE')} ${zeit.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

export function neueSkizze(zeit = Date.now()): Skizze {
  return {
    id: neueId(),
    name: standardName(new Date(zeit)),
    kunde: { name: '', adresse: '', nummer: '' },
    raeume: [],
    naechsteId: 1,
    notizen: '',
    sendungen: 0,
    erstellt: zeit,
    geaendert: zeit,
  };
}

/** Sicherungsdatei: lesbarer Text (JSON) mit Formatkennung und Versionsnummer. */
export function skizzeZuDatei(s: Skizze): string {
  return JSON.stringify({ format: DATEI_FORMAT, version: DATEI_VERSION, skizze: s }, null, 1);
}

const istZahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const istText = (x: unknown, max = 200): x is string => typeof x === 'string' && x.length <= max;

function pruefeOeffnung(o: unknown, kanten: number): Oeffnung | null {
  if (typeof o !== 'object' || o === null) return null;
  const q = o as Record<string, unknown>;
  if (!istZahl(q.id) || (q.art !== 'tuer' && q.art !== 'fenster')) return null;
  if (!istZahl(q.kante) || !Number.isInteger(q.kante) || q.kante < 0 || q.kante >= kanten) return null;
  if (!istZahl(q.abstand) || !istZahl(q.breite) || q.abstand < 0 || q.breite <= 0 || q.breite > 20) return null;
  if (q.anschlag !== 'links' && q.anschlag !== 'rechts') return null;
  if (q.aufschlag !== 'innen' && q.aufschlag !== 'aussen') return null;
  return { id: q.id, art: q.art, kante: q.kante, abstand: q.abstand, breite: q.breite, anschlag: q.anschlag, aufschlag: q.aufschlag };
}

function pruefeRaum(r: unknown): Raum | null {
  if (typeof r !== 'object' || r === null) return null;
  const q = r as Record<string, unknown>;
  if (!istZahl(q.id) || !istText(q.name, 80) || !istText(q.form, 80)) return null;
  if (!Array.isArray(q.ecken) || q.ecken.length < 3 || q.ecken.length > 64) return null;
  const ecken = [];
  for (const p of q.ecken) {
    if (typeof p !== 'object' || p === null) return null;
    const pp = p as Record<string, unknown>;
    if (!istZahl(pp.x) || !istZahl(pp.y) || Math.abs(pp.x) > 1000 || Math.abs(pp.y) > 1000) return null;
    ecken.push({ x: pp.x, y: pp.y });
  }
  const raum: Raum = { id: q.id, name: q.name, form: q.form, ecken };
  if (q.waende !== undefined) {
    if (!Array.isArray(q.waende) || q.waende.length !== ecken.length || !q.waende.every((d) => istZahl(d) && d >= 0 && d <= 1)) return null;
    raum.waende = q.waende as number[];
  }
  if (q.oeffnungen !== undefined) {
    if (!Array.isArray(q.oeffnungen) || q.oeffnungen.length > 200) return null;
    const liste: Oeffnung[] = [];
    for (const o of q.oeffnungen) {
      const ok = pruefeOeffnung(o, ecken.length);
      if (!ok) return null;
      liste.push(ok);
    }
    if (liste.length > 0) raum.oeffnungen = liste;
  }
  return raum;
}

/** Prüft ein gelesenes Objekt (aus Datei oder Speicher). Gibt die bereinigte Skizze oder eine verständliche Meldung zurück. */
export function pruefeSkizze(daten: unknown, mitHuelle = true): Skizze | string {
  let inhalt: unknown = daten;
  if (mitHuelle) {
    if (typeof daten !== 'object' || daten === null) return 'Das ist keine Skizzen-Datei.';
    const h = daten as Record<string, unknown>;
    if (h.format !== DATEI_FORMAT) return 'Das ist keine Skizzen-Datei dieser App.';
    if (!istZahl(h.version) || h.version > DATEI_VERSION) return 'Die Datei stammt aus einer neueren Version der App. Aktualisiere die App und versuche es noch einmal.';
    inhalt = h.skizze;
  }
  if (typeof inhalt !== 'object' || inhalt === null) return 'Die Datei enthält keine Skizze.';
  const s = inhalt as Record<string, unknown>;
  if (!Array.isArray(s.raeume) || s.raeume.length > MAX_RAEUME) return 'Die Skizze ist beschädigt (Räume fehlen oder es sind zu viele).';
  const raeume: Raum[] = [];
  for (const r of s.raeume) {
    const ok = pruefeRaum(r);
    if (!ok) return 'Die Skizze ist beschädigt: Ein Raum hat ungültige Angaben.';
    raeume.push(ok);
  }
  const k = (typeof s.kunde === 'object' && s.kunde !== null ? s.kunde : {}) as Record<string, unknown>;
  const jetzt = Date.now();
  const hoechsteId = Math.max(0, ...raeume.map((r) => r.id));
  return {
    id: istText(s.id, 80) && s.id ? s.id : neueId(),
    name: istText(s.name, 120) && s.name.trim() ? s.name : standardName(),
    kunde: {
      name: istText(k.name, 160) ? k.name : '',
      adresse: istText(k.adresse, 240) ? k.adresse : '',
      nummer: istText(k.nummer, 80) ? k.nummer : '',
      ...(istText(k.crmId, 100) && k.crmId ? { crmId: k.crmId } : {}),
    },
    raeume,
    naechsteId: istZahl(s.naechsteId) && s.naechsteId > hoechsteId ? Math.floor(s.naechsteId) : hoechsteId + 1,
    notizen: istText(s.notizen, 4000) ? s.notizen : '',
    sendungen: istZahl(s.sendungen) && s.sendungen >= 0 ? Math.floor(s.sendungen) : 0,
    erstellt: istZahl(s.erstellt) ? s.erstellt : jetzt,
    geaendert: istZahl(s.geaendert) ? s.geaendert : jetzt,
  };
}

/** Liest Dateitext. Meldungen sind für Nutzer gedacht. */
export function leseSkizzenDatei(text: string): Skizze | string {
  let daten: unknown;
  try {
    daten = JSON.parse(text);
  } catch {
    return 'Die Datei ist beschädigt und lässt sich nicht lesen.';
  }
  return pruefeSkizze(daten, true);
}
