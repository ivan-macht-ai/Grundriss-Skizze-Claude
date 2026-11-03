// Skizzen im Gerät speichern (IndexedDB). Jeder Aufruf kann scheitern (privater Modus, gesperrter Speicher):
// Aufrufer fangen Fehler ab und zeigen "Nicht gespeichert".
import { pruefeSkizze, type Skizze } from '../modell/skizze';

const DB_NAME = 'grundriss-skizze';
const STORE = 'skizzen';
let dbPromise: Promise<IDBDatabase> | null = null;

function oeffne(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((ok, fehler) => {
      if (typeof indexedDB === 'undefined') return fehler(new Error('IndexedDB nicht verfügbar'));
      const anfrage = indexedDB.open(DB_NAME, 1);
      anfrage.onupgradeneeded = () => {
        anfrage.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      anfrage.onsuccess = () => ok(anfrage.result);
      anfrage.onerror = () => fehler(anfrage.error ?? new Error('Speicher konnte nicht geöffnet werden'));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

async function anfrage<T>(modus: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await oeffne();
  return new Promise<T>((ok, fehler) => {
    const tx = db.transaction(STORE, modus);
    const r = f(tx.objectStore(STORE));
    tx.oncomplete = () => ok(r.result);
    tx.onerror = () => fehler(tx.error ?? new Error('Speichern fehlgeschlagen'));
    tx.onabort = () => fehler(tx.error ?? new Error('Speichern abgebrochen'));
  });
}

export async function speichereSkizze(s: Skizze): Promise<void> {
  await anfrage('readwrite', (st) => st.put(s));
}

export async function ladeSkizze(id: string): Promise<Skizze | null> {
  const roh = await anfrage<unknown>('readonly', (st) => st.get(id));
  if (!roh) return null;
  const s = pruefeSkizze(roh, false);
  return typeof s === 'string' ? null : s;
}

/** Alle gültigen Skizzen, die zuletzt geänderte zuerst. Beschädigte Einträge werden übersprungen. */
export async function alleSkizzen(): Promise<Skizze[]> {
  const liste = await anfrage<unknown[]>('readonly', (st) => st.getAll());
  const aus: Skizze[] = [];
  for (const roh of liste) {
    const s = pruefeSkizze(roh, false);
    if (typeof s !== 'string') aus.push(s);
  }
  return aus.sort((a, b) => b.geaendert - a.geaendert);
}

export async function loescheSkizze(id: string): Promise<void> {
  await anfrage('readwrite', (st) => st.delete(id));
}

/** Bittet den Browser, die Daten dauerhaft zu behalten (nicht von selbst zu löschen). Gibt zurück, ob es gilt. */
export async function bitteUmDauerhaftenSpeicher(): Promise<boolean | null> {
  try {
    if (!navigator.storage) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
