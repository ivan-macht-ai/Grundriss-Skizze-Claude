import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { arbeiteAb, baueFormData, holeKunden, normalisiereAdresse, sendeAuftrag, suche, STANDARD_SERVER, type Ablage, type Auftrag, type CrmKunde, type ServerEinstellungen } from '../src/senden/client';

const auftrag = (id = 'a1', erstellt = 1): Auftrag => ({
  id,
  skizzeId: 's1',
  erstellt,
  felder: { skizzen_name: 'Keller', kunde_name: 'Max', notizen: 'Zähler links' },
  pdf: new Blob(['%PDF-1.7 test'], { type: 'application/pdf' }),
  bild: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
  quelle: '{"format":"grundriss-skizze"}',
  status: 'wartet',
  versuche: 0,
});

interface Anfrage {
  methode: string;
  url: string;
  auth?: string;
  inhaltsart?: string;
  koerper: string;
}

let server: Server | null = null;
afterEach(() => new Promise<void>((ok) => (server ? server.close(() => ok()) : ok())).then(() => (server = null)));

async function starteServer(antwort: (a: Anfrage) => { status: number; json?: unknown }): Promise<{ einst: ServerEinstellungen; anfragen: Anfrage[] }> {
  const anfragen: Anfrage[] = [];
  server = createServer((req: IncomingMessage, res) => {
    const teile: Buffer[] = [];
    req.on('data', (c: Buffer) => teile.push(c));
    req.on('end', () => {
      const a: Anfrage = { methode: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization, inhaltsart: req.headers['content-type'], koerper: Buffer.concat(teile).toString('utf8') };
      anfragen.push(a);
      const r = antwort(a);
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(r.json === undefined ? '' : JSON.stringify(r.json));
    });
  });
  await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  return { einst: { ...STANDARD_SERVER, adresse: `http://127.0.0.1:${port}/`, geheimwort: 'geheim' }, anfragen };
}

describe('Server-Adresse', () => {
  it('prüft und vereinheitlicht', () => {
    expect(normalisiereAdresse('https://server.example:5444/')).toBe('https://server.example:5444');
    expect(normalisiereAdresse('  http://192.168.1.5:8081/app/ ')).toBe('http://192.168.1.5:8081/app');
    expect(normalisiereAdresse('')).toBeNull();
    expect(normalisiereAdresse('ftp://x')).toBeNull();
    expect(normalisiereAdresse('kein link')).toBeNull();
  });
});

describe('Skizze senden', () => {
  it('schickt alle Felder und Dateien mit Geheimwort und erkennt Erfolg', async () => {
    const { einst, anfragen } = await starteServer(() => ({ status: 200, json: { ok: true, crm_id: 'tw-42' } }));
    const erg = await sendeAuftrag(auftrag(), einst);
    expect(erg).toEqual({ art: 'ok', crmId: 'tw-42' });
    const a = anfragen[0];
    expect(a.methode).toBe('POST');
    expect(a.url).toBe('/api/skizzen');
    expect(a.auth).toBe('Bearer geheim');
    expect(a.inhaltsart).toContain('multipart/form-data');
    for (const name of ['auftrag_id', 'skizzen_id', 'skizzen_name', 'kunde_name', 'notizen', 'pdf', 'bild', 'quelle']) expect(a.koerper).toContain(`name="${name}"`);
    expect(a.koerper).toContain('%PDF-1.7 test');
    expect(a.koerper).toContain('Zähler links');
  });

  it('ohne Geheimwort kein Header', async () => {
    const { einst, anfragen } = await starteServer(() => ({ status: 200, json: { ok: true } }));
    await sendeAuftrag(auftrag(), { ...einst, geheimwort: '' });
    expect(anfragen[0].auth).toBeUndefined();
  });

  it('ordnet Fehlercodes richtig ein', async () => {
    const codes: [number, string][] = [[400, 'dauerhaft'], [401, 'dauerhaft'], [413, 'dauerhaft'], [422, 'dauerhaft'], [500, 'spaeter'], [502, 'spaeter'], [503, 'spaeter']];
    for (const [status, art] of codes) {
      const { einst } = await starteServer(() => ({ status, json: { ok: false, fehler: 'Text vom Server' } }));
      expect((await sendeAuftrag(auftrag(), einst)).art, `Code ${status}`).toBe(art);
      await new Promise<void>((ok) => server!.close(() => ok()));
      server = null;
    }
  });

  it('Text des Servers kommt beim Nutzer an; 401 nennt das Geheimwort', async () => {
    const a = await starteServer(() => ({ status: 400, json: { ok: false, fehler: 'Die Quelldatei ist beschädigt.' } }));
    expect(await sendeAuftrag(auftrag(), a.einst)).toEqual({ art: 'dauerhaft', meldung: 'Die Quelldatei ist beschädigt.' });
    await new Promise<void>((ok) => server!.close(() => ok()));
    server = null;
    const b = await starteServer(() => ({ status: 401 }));
    const erg = await sendeAuftrag(auftrag(), b.einst);
    expect(erg.art === 'dauerhaft' && erg.meldung).toContain('Geheimwort');
  });

  it('Server nicht erreichbar oder Adresse fehlt', async () => {
    expect((await sendeAuftrag(auftrag(), { ...STANDARD_SERVER, adresse: 'http://127.0.0.1:1' })).art).toBe('spaeter');
    expect((await sendeAuftrag(auftrag(), STANDARD_SERVER)).art).toBe('dauerhaft');
  });

  it('Zeitlimit wird zu "später"', async () => {
    const { einst } = await starteServer(() => ({ status: 200, json: { ok: true } }));
    const langsam = (u: string, i?: RequestInit) => new Promise<Response>((_ok, fehler) => i?.signal?.addEventListener('abort', () => fehler(new Error('abgebrochen'))) ?? u);
    expect((await sendeAuftrag(auftrag(), einst, langsam, 30)).art).toBe('spaeter');
  });

  it('FormData enthält Dateinamen und Typen', () => {
    const f = baueFormData(auftrag());
    expect((f.get('pdf') as File).name).toBe('grundriss.pdf');
    expect((f.get('bild') as File).type).toBe('image/png');
    expect((f.get('quelle') as File).type).toBe('application/json');
  });
});

describe('Kunden holen', () => {
  it('fragt mit Marken, prüft und sortiert die Antwort', async () => {
    const { einst, anfragen } = await starteServer(() => ({
      status: 200,
      json: {
        ok: true,
        kunden: [
          { crm_id: 'b', name: 'Zander', adresse: 'Weg 2', nummer: '', marken: ['Besuch'] },
          { crm_id: 'a', name: 'Ärmel', adresse: 'Weg 1', nummer: 'K-7', marken: ['Angebot', 'Besuch'] },
          { crm_id: '', name: 'ohne ID' },
          { name: 'ohne crm_id' },
          { crm_id: 'x', name: '   ' },
          'kaputt',
        ],
      },
    }));
    const erg = await holeKunden({ ...einst, marken: 'Angebot, Besuch' });
    if ('fehler' in erg) throw new Error(erg.fehler);
    expect(erg.kunden.map((k) => k.name)).toEqual(['Ärmel', 'Zander']);
    expect(anfragen[0].url).toBe('/api/kunden?marke=Angebot%2CBesuch');
    expect(anfragen[0].auth).toBe('Bearer geheim');
    expect(erg.kunden[0]).toEqual({ crmId: 'a', name: 'Ärmel', adresse: 'Weg 1', nummer: 'K-7', marken: ['Angebot', 'Besuch'] });
  });

  it('Fehler werden verständlich gemeldet', async () => {
    const a = await starteServer(() => ({ status: 401 }));
    expect(await holeKunden(a.einst)).toEqual({ fehler: 'Der Server hat das Geheimwort nicht angenommen.' });
    await new Promise<void>((ok) => server!.close(() => ok()));
    server = null;
    const b = await starteServer(() => ({ status: 200, json: { ok: true } }));
    expect('fehler' in (await holeKunden(b.einst))).toBe(true);
    expect('fehler' in (await holeKunden({ ...STANDARD_SERVER }))).toBe(true);
    expect('fehler' in (await holeKunden({ ...STANDARD_SERVER, adresse: 'http://127.0.0.1:1' }))).toBe(true);
  });

  it('Suche in Name, Adresse und Nummer', () => {
    const liste: CrmKunde[] = [
      { crmId: '1', name: 'Max Müller', adresse: 'Gartenweg 5, München', nummer: 'K-100', marken: [] },
      { crmId: '2', name: 'Eva Schmidt', adresse: 'Hauptstraße 1, Ulm', nummer: '', marken: [] },
    ];
    expect(suche(liste, 'müller')).toHaveLength(1);
    expect(suche(liste, 'ulm')[0].crmId).toBe('2');
    expect(suche(liste, 'k-100')[0].crmId).toBe('1');
    expect(suche(liste, '  ')).toHaveLength(2);
    expect(suche(liste, 'nichts')).toHaveLength(0);
  });
});

describe('Warteschlange', () => {
  const speicher = (start: Auftrag[]): Ablage & { daten: Map<string, Auftrag> } => {
    const daten = new Map(start.map((a) => [a.id, a]));
    return {
      daten,
      liste: async () => [...daten.values()],
      entferne: async (id) => void daten.delete(id),
      speichere: async (a) => void daten.set(a.id, a),
    };
  };
  const einst = { ...STANDARD_SERVER, adresse: 'http://x' };

  it('sendet der Reihe nach und räumt Gesendetes weg', async () => {
    const s = speicher([auftrag('b', 2), auftrag('a', 1)]);
    const reihenfolge: string[] = [];
    const b = await arbeiteAb(s, einst, async (a) => (reihenfolge.push(a.id), { art: 'ok' }));
    expect(reihenfolge).toEqual(['a', 'b']);
    expect(b).toEqual({ gesendet: 2, fehler: 0, offen: 0 });
    expect(s.daten.size).toBe(0);
  });

  it('Netz weg: bricht ab, behält alles, zählt Versuche', async () => {
    const s = speicher([auftrag('a', 1), auftrag('b', 2), auftrag('c', 3)]);
    let n = 0;
    const b = await arbeiteAb(s, einst, async () => (n++, { art: 'spaeter', meldung: 'Der Server ist gerade nicht erreichbar.' }), () => 99);
    expect(n).toBe(1); // nicht alle drei probieren
    expect(b).toMatchObject({ gesendet: 0, fehler: 0, offen: 3 });
    expect(s.daten.get('a')).toMatchObject({ versuche: 1, status: 'wartet', letzterVersuch: 99 });
    expect(s.daten.get('b')?.versuche).toBe(0);
  });

  it('dauerhafter Fehler: markiert nur diesen Auftrag, macht mit dem nächsten weiter', async () => {
    const s = speicher([auftrag('a', 1), auftrag('b', 2)]);
    const b = await arbeiteAb(s, einst, async (a) => (a.id === 'a' ? { art: 'dauerhaft', meldung: 'kaputt' } : { art: 'ok' }));
    expect(b).toMatchObject({ gesendet: 1, fehler: 1, meldung: 'kaputt' });
    expect(s.daten.get('a')).toMatchObject({ status: 'fehler', fehler: 'kaputt' });
    expect(s.daten.has('b')).toBe(false);
  });

  it('Aufträge mit Fehler werden nicht von selbst erneut gesendet', async () => {
    const s = speicher([{ ...auftrag('a', 1), status: 'fehler', fehler: 'alt' }]);
    let n = 0;
    const b = await arbeiteAb(s, einst, async () => (n++, { art: 'ok' }));
    expect(n).toBe(0);
    expect(b.fehler).toBe(1);
  });
});
