import './styles.css';
import { verbindeEingabe, type EingabeZustand, type OeffnungsRef, type Strich, type Werkzeug } from './ansicht/eingabe';
import { zeichneRaster, type RasterFarben } from './ansicht/raster';
import { passeAn, startAnsicht, toScreen, zoomAt, type Viewport } from './ansicht/viewport';
import { STANDARD_TOLERANZEN, TOLERANZ_BESCHREIBUNG, type Toleranzen } from './config/toleranzen';
import { erkenneRaum } from './erkennung/erkenne';
import { flaeche, schwerpunkt } from './geometrie/polygon';
import { dist } from './geometrie/vec';
import { ausrichten, punktImVieleck, seitenName, setzeKantenlaenge, verschiebeRaum } from './modell/bearbeiten';
import { dickenVon, findeZwischenwand, leseDicke, nachbarSeiten, type Zwischenwand } from './modell/waende';
import type { Raum } from './modell/typen';
import { findeKante, findeOeffnung, kante as seitenKante, neueOeffnung, passeOeffnungenAn, pruefeOeffnung, verschiebeOeffnung } from './modell/oeffnungen';
import type { Oeffnung } from './modell/typen';
import { leseBreite, leseLaenge, zeigeLaenge } from './modell/zahlen';
import { macheVerschiebbar } from './oberflaeche/verschiebbar';
import { erzeugeGrundrissPdf, huelle, type Kunde } from './pdf/grundriss';
import { leseSkizzenDatei, neueId, neueSkizze, skizzeZuDatei, type Skizze } from './modell/skizze';
import { alleSkizzen, bitteUmDauerhaftenSpeicher, ladeSkizze, loescheSkizze, speichereSkizze } from './speicher/idb';
import { vorschauSvg } from './zeichnen/vorschau';
import { ladeJson, ladeToleranzen, speichereJson, speichereToleranzen } from './speicher/einstellungen';
import { kommaZahl, zeichneRaeume } from './zeichnen/raeume';

const canvas = document.getElementById('flaeche') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const buehne = document.getElementById('buehne')!;
const statusZeile = document.getElementById('status')!;
const toast = document.getElementById('toast')!;
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;
const btnZurueck = btn('btn-zurueck');
const btnVor = btn('btn-vor');
const btnLoeschen = btn('btn-loeschen');
const loeschenText = document.getElementById('loeschen-text')!;
const werkzeugKnoepfe = [...document.querySelectorAll<HTMLButtonElement>('[data-werkzeug]')];

let breite = 0;
let hoehe = 0;
let vp: Viewport = { scale: 100, ox: 40, oy: 400 };
let raeume: Raum[] = [];
let skizze: Skizze = neueSkizze();
let speicherStatus = '';
let speicherZeit: number | undefined;
let speicherOffen = false;
let auswahlId: number | null = null;
let auswahlOeffnung: OeffnungsRef | null = null;
let naechsteId = 1;
let toleranzen: Toleranzen = ladeToleranzen();
let zeigerWelt: { x: number; y: number } | null = null;
let geplant = false;
let loeschenScharf: number | undefined;
let toastZeit: number | undefined;

// Verlauf: jeder Schritt ist eine vollständige Kopie der Räume (bis 100 Schritte), für Zurück und Vor.
const MAX_SCHRITTE = 100;
let verlauf: string[] = ['[]'];
let verlaufPos = 0;

const zustand: EingabeZustand = {
  werkzeug: 'zeichnen',
  stiftGesehen: false,
  handballenIgnoriert: 0,
  abgebrochen: 0,
  radAnzahl: 0,
  radLetzte: '–',
  beruehrungen: 0,
  letzteArt: '–',
};

function farbe(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function zeigeHinweis(text: string, fehler: boolean): void {
  // Der Hinweis sitzt oben. Liegt dort eine Leiste (und unten nicht), wandert er nach unten.
  const kanten = leisten.map((l) => l.kante());
  const obenBelegt = kanten.filter((k) => k === 'oben').length;
  const untenBelegt = kanten.filter((k) => k === 'unten').length;
  toast.classList.toggle('unten', obenBelegt > untenBelegt);
  toast.textContent = text;
  toast.classList.toggle('fehler', fehler);
  toast.hidden = false;
  window.clearTimeout(toastZeit);
  toastZeit = window.setTimeout(() => (toast.hidden = true), fehler ? 4500 : 2800);
}

function merke(): void {
  verlauf = verlauf.slice(0, verlaufPos + 1);
  verlauf.push(JSON.stringify(raeume));
  if (verlauf.length > MAX_SCHRITTE + 1) verlauf.shift();
  verlaufPos = verlauf.length - 1;
  planeSpeichern();
}

function ladeVerlauf(): void {
  raeume = JSON.parse(verlauf[verlaufPos]) as Raum[];
  if (auswahlId !== null && !raeume.some((r) => r.id === auswahlId)) auswahlId = null;
  if (auswahlOeffnung && !raeume.find((r) => r.id === auswahlOeffnung!.raumId)?.oeffnungen?.some((o) => o.id === auswahlOeffnung!.id)) auswahlOeffnung = null;
  aktualisiere();
  plane();
  planeSpeichern();
}

function passeGroesseAn(): void {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const erstes = breite === 0;
  breite = r.width;
  hoehe = r.height;
  canvas.width = Math.round(breite * dpr);
  canvas.height = Math.round(hoehe * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (erstes) vp = startAnsicht(breite, hoehe);
  leisten.forEach((l) => l.einpassen());
  plane();
}

function plane(): void {
  if (geplant) return;
  geplant = true;
  requestAnimationFrame(() => {
    geplant = false;
    zeichne();
  });
}

function zeichne(): void {
  ctx.clearRect(0, 0, breite, hoehe);
  const farben: RasterFarben = {
    fein: farbe('--raster-fein'),
    grob: farbe('--raster-grob'),
    text: farbe('--raster-text'),
    achse: farbe('--raster-achse'),
  };
  zeichneRaster(ctx, vp, breite, hoehe, farben);
  zeichneRaeume(
    ctx,
    vp,
    raeume,
    {
      fuell: farbe('--raum-fuell'),
      linie: farbe('--strich'),
      text: farbe('--text'),
      leise: farbe('--text-leise'),
      auswahl: farbe('--akzent'),
      wand: farbe('--wand'),
      flaeche: farbe('--flaeche'),
    },
    auswahlId,
    auswahlOeffnung,
  );

  const laufend = eingabe.aktuellerStrich();
  if (laufend && laufend.punkte.length >= 2) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = farbe('--stift');
    ctx.beginPath();
    laufend.punkte.forEach((p, i) => {
      const q = toScreen(vp, p.x, p.y);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
  }
}

function aktualisiere(): void {
  const pos = zeigerWelt
    ? `x ${zeigerWelt.x.toFixed(2).replace('.', ',')} m, y ${zeigerWelt.y.toFixed(2).replace('.', ',')} m`
    : '–';
  const art: Record<string, string> = { pen: 'Stift', touch: 'Finger', mouse: 'Maus', '–': '–' };
  statusZeile.textContent =
    `Zeiger: ${pos}   |   Eingabe: ${art[zustand.letzteArt] ?? zustand.letzteArt}` +
    `   |   ${speicherStatus || 'Noch nichts zu speichern'}   |   Handballen ignoriert: ${zustand.handballenIgnoriert}   |   Berührungen: ${zustand.beruehrungen}   |   Vom Browser abgebrochen: ${zustand.abgebrochen}   |   Rad: ${zustand.radAnzahl} (${zustand.radLetzte})   |   Räume: ${raeume.length}`;
  btnZurueck.disabled = verlaufPos === 0;
  btnVor.disabled = verlaufPos >= verlauf.length - 1;
  btnLoeschen.disabled = raeume.length === 0;
  loeschenText.textContent =
    auswahlOeffnung !== null ? 'Öffnung löschen' : auswahlId !== null ? 'Raum löschen' : loeschenScharf !== undefined ? 'Sicher?' : 'Alles löschen';
  for (const k of werkzeugKnoepfe) k.setAttribute('aria-pressed', String(k.dataset.werkzeug === zustand.werkzeug));
  canvas.classList.toggle('zeiger', zustand.werkzeug === 'auswaehlen');
  if (raeume.length === 0 || auswahlId !== null || auswahlOeffnung !== null) entschaerfeLoeschen(false);
}

function entschaerfeLoeschen(neuZeichnen = true): void {
  window.clearTimeout(loeschenScharf);
  const warScharf = loeschenScharf !== undefined;
  loeschenScharf = undefined;
  btnLoeschen.classList.remove('scharf');
  if (warScharf && neuZeichnen) aktualisiere();
}

function zoomMitte(faktor: number): void {
  vp = zoomAt(vp, breite / 2, hoehe / 2, faktor);
  plane();
}

/** Ein fertiger Strich wird zu einem Raum, wenn die Erkennung ihn versteht; sonst gibt es einen Hinweis. */
function strichFertig(s: Strich): void {
  const e = erkenneRaum(s.punkte, toleranzen);
  if (!e.ok) {
    zeigeHinweis(e.grund, true);
    plane();
    return;
  }
  const raum: Raum = { id: naechsteId, name: `Raum ${naechsteId}`, ecken: e.ecken, form: e.form };
  naechsteId++;
  raeume.push(raum);
  auswahlId = null;
  merke();
  zeigeHinweis(`${e.form} erkannt, ${kommaZahl(flaeche(e.ecken), 2)} m²`, false);
  aktualisiere();
  plane();
  pruefeZwischenwand(raum.id);
}

// Raum und Öffnung ziehen
let oeffnungZiehen: { ref: OeffnungsRef; abstandAlt: number; griffVersatz: number } | null = null;
let ziehOriginal: { id: number; ecken: Raum['ecken'] } | null = null;

const eingabe = verbindeEingabe(
  canvas,
  {
    holeAnsicht: () => vp,
    setzeAnsicht: (neu) => {
      vp = neu;
      plane();
    },
    neuerStrich: strichFertig,
    zeichneNeu: plane,
    zustandGeaendert: aktualisiere,
    zeigerBewegt: (x, y) => {
      zeigerWelt = { x, y };
      aktualisiere();
    },
    findeRaum: (x, y) => {
      for (let i = raeume.length - 1; i >= 0; i--) if (punktImVieleck({ x, y }, raeume[i].ecken)) return raeume[i].id;
      return null;
    },
    waehleRaum: (id) => {
      auswahlId = id;
      auswahlOeffnung = null;
      aktualisiere();
      plane();
    },
    findeOeffnung: (x, y) => {
      const t = findeOeffnung(raeume, x, y, Math.max(0.12, 16 / vp.scale));
      return t ? { raumId: t.raum.id, id: t.oeffnung.id } : null;
    },
    waehleOeffnung: (ref) => {
      auswahlOeffnung = ref;
      auswahlId = null;
      aktualisiere();
      plane();
    },
    startOeffnungsBewegung: (ref, x, y) => {
      const raum = raeume.find((r) => r.id === ref.raumId);
      const o = raum?.oeffnungen?.find((q) => q.id === ref.id);
      if (!raum || !o) return;
      const k = seitenKante(raum, o.kante);
      const t = (x - k.a.x) * k.dx + (y - k.a.y) * k.dy;
      oeffnungZiehen = { ref, abstandAlt: o.abstand, griffVersatz: t - (o.abstand + o.breite / 2) };
    },
    oeffnungsBewegung: (x, y) => {
      if (!oeffnungZiehen) return;
      const raum = raeume.find((r) => r.id === oeffnungZiehen!.ref.raumId);
      const o = raum?.oeffnungen?.find((q) => q.id === oeffnungZiehen!.ref.id);
      if (!raum || !o) return;
      const k = seitenKante(raum, o.kante);
      const t = (x - k.a.x) * k.dx + (y - k.a.y) * k.dy;
      o.abstand = verschiebeOeffnung(raum, o, t, oeffnungZiehen.griffVersatz);
      plane();
    },
    endeOeffnungsBewegung: (bewegt) => {
      if (bewegt && oeffnungZiehen) merke();
      oeffnungZiehen = null;
      aktualisiere();
    },
    abbruchOeffnungsBewegung: () => {
      if (oeffnungZiehen) {
        const raum = raeume.find((r) => r.id === oeffnungZiehen!.ref.raumId);
        const o = raum?.oeffnungen?.find((q) => q.id === oeffnungZiehen!.ref.id);
        if (o) o.abstand = oeffnungZiehen.abstandAlt;
      }
      oeffnungZiehen = null;
      plane();
    },
    doppeltippeOeffnung: (ref) => oeffneOeffnungDialog(ref),
    platziere: (art, x, y) => {
      const treffer = findeKante(raeume, x, y, Math.max(0.15, 28 / vp.scale));
      if (!treffer) {
        zeigeHinweis('Tippe genau auf eine Wand, also auf die Seite eines Raums.', true);
        return;
      }
      const ergebnis = neueOeffnung(treffer.raum, treffer.kante, treffer.t, art);
      if (typeof ergebnis === 'string') {
        zeigeHinweis(ergebnis, true);
        return;
      }
      treffer.raum.oeffnungen = [...(treffer.raum.oeffnungen ?? []), ergebnis];
      auswahlOeffnung = { raumId: treffer.raum.id, id: ergebnis.id };
      auswahlId = null;
      merke();
      zeigeHinweis(`${art === 'tuer' ? 'Tür' : 'Fenster'} eingefügt. Zum Ändern: Werkzeug Auswählen, doppelt tippen.`, false);
      aktualisiere();
      plane();
    },
    startBewegung: (id) => {
      const r = raeume.find((q) => q.id === id);
      ziehOriginal = r ? { id, ecken: r.ecken } : null;
    },
    bewegung: (dx, dy) => {
      if (!ziehOriginal) return;
      const r = raeume.find((q) => q.id === ziehOriginal!.id);
      if (!r) return;
      const andere = raeume.filter((q) => q.id !== r.id).map((q) => q.ecken);
      const k = ausrichten(ziehOriginal.ecken, andere, dx, dy, 14 / vp.scale);
      r.ecken = verschiebeRaum(ziehOriginal.ecken, k.dx, k.dy);
      plane();
    },
    endeBewegung: (bewegt) => {
      const bewegterRaum = bewegt && ziehOriginal ? ziehOriginal.id : null;
      if (bewegterRaum !== null) merke();
      ziehOriginal = null;
      aktualisiere();
      if (bewegterRaum !== null) pruefeZwischenwand(bewegterRaum);
    },
    abbruchBewegung: () => {
      if (ziehOriginal) {
        const r = raeume.find((q) => q.id === ziehOriginal!.id);
        if (r) r.ecken = ziehOriginal.ecken;
      }
      ziehOriginal = null;
      plane();
    },
    doppeltippe: (id) => oeffneRaumDialog(id),
  },
  zustand,
);

for (const k of werkzeugKnoepfe) {
  k.addEventListener('click', () => {
    zustand.werkzeug = k.dataset.werkzeug as Werkzeug;
    auswahlId = null;
    auswahlOeffnung = null;
    if (zustand.werkzeug === 'auswaehlen' && raeume.length > 0) zeigeHinweis('Raum oder Tür antippen und ziehen. Zweimal tippen: ändern.', false);
    else if (zustand.werkzeug === 'tuer' || zustand.werkzeug === 'fenster') zeigeHinweis('Tippe auf eine Wand, um eine Öffnung einzufügen.', false);
    aktualisiere();
    plane();
  });
}
btnZurueck.addEventListener('click', () => {
  if (verlaufPos > 0) verlaufPos--;
  ladeVerlauf();
});
btnVor.addEventListener('click', () => {
  if (verlaufPos < verlauf.length - 1) verlaufPos++;
  ladeVerlauf();
});
// Gewählter Raum: ein Tipp löscht ihn (mit Zurück rückgängig). Ohne Auswahl: alles löschen, mit zwei Tipps.
btnLoeschen.addEventListener('click', () => {
  if (auswahlOeffnung !== null) {
    const raum = raeume.find((r) => r.id === auswahlOeffnung!.raumId);
    if (raum) {
      raum.oeffnungen = (raum.oeffnungen ?? []).filter((o) => o.id !== auswahlOeffnung!.id);
      if (raum.oeffnungen.length === 0) delete raum.oeffnungen;
    }
    auswahlOeffnung = null;
    merke();
    aktualisiere();
    plane();
    return;
  }
  if (auswahlId !== null) {
    raeume = raeume.filter((r) => r.id !== auswahlId);
    auswahlId = null;
    merke();
    aktualisiere();
    plane();
    return;
  }
  if (loeschenScharf === undefined) {
    btnLoeschen.classList.add('scharf');
    loeschenScharf = window.setTimeout(() => entschaerfeLoeschen(), 3000);
    aktualisiere();
    return;
  }
  raeume = [];
  entschaerfeLoeschen(false);
  merke();
  aktualisiere();
  plane();
});
btn('btn-plus').addEventListener('click', () => zoomMitte(1.3));
btn('btn-minus').addEventListener('click', () => zoomMitte(1 / 1.3));
btn('btn-ansicht').addEventListener('click', () => {
  vp = startAnsicht(breite, hoehe);
  plane();
});

// Verschiebbare Leisten
const leisten = [
  macheVerschiebbar(document.getElementById('leiste-werkzeuge')!, document.getElementById('griff-werkzeuge')!, buehne, 'werkzeuge'),
  macheVerschiebbar(document.getElementById('leiste-zoom')!, document.getElementById('griff-zoom')!, buehne, 'zoom'),
];

// Raum bearbeiten: Name, Maße und Wände von Hand
const raumDialog = document.getElementById('raum-dialog')!;
const raumName = document.getElementById('raum-name') as HTMLInputElement;
const raumSeiten = document.getElementById('raum-seiten')!;
const raumFehler = document.getElementById('raum-fehler')!;
const raumWaende = document.getElementById('raum-waende') as HTMLInputElement;
let bearbeiteId: number | null = null;
let laengenFelder: { index: number; feld: HTMLInputElement; alt: number }[] = [];
let wandFelder: HTMLInputElement[] = [];

/** Zentimeter mit Komma, ohne unnötige Nachkommastellen: 0,24 -> "24", 0,115 -> "11,5" */
const zeigeCm = (meter: number): string => String(Math.round(meter * 1000) / 10).replace('.', ',');

function oeffneRaumDialog(id: number): void {
  const raum = raeume.find((r) => r.id === id);
  if (!raum) return;
  bearbeiteId = id;
  auswahlId = id;
  raumName.value = raum.name;
  raumFehler.hidden = true;
  raumSeiten.textContent = '';
  laengenFelder = [];
  wandFelder = [];
  const mitte = schwerpunkt(raum.ecken);
  const dicken = dickenVon(raum);
  raumWaende.checked = dicken.some((d) => d > 0.0005);
  raum.ecken.forEach((p, i) => {
    const q = raum.ecken[(i + 1) % raum.ecken.length];
    const laenge = dist(p, q);
    const name = seitenName(raum.ecken, i, mitte);
    const zeile = document.createElement('div');
    zeile.className = 'seiten-zeile';
    const label = document.createElement('label');
    const feldId = `seite-${i}`;
    label.htmlFor = feldId;
    label.textContent = `Seite ${i + 1}, ${name}`;
    const feld = document.createElement('input');
    feld.type = 'text';
    feld.id = feldId;
    feld.inputMode = 'decimal';
    feld.autocomplete = 'off';
    feld.value = `${zeigeLaenge(laenge)} m`;
    if (name === 'Schräge') {
      feld.disabled = true;
      const klein = document.createElement('small');
      klein.textContent = 'Schräge: Länge ergibt sich aus den anderen Seiten';
      label.append(klein);
    }
    const wand = document.createElement('input');
    wand.type = 'text';
    wand.className = 'wand-feld';
    wand.id = `wand-${i}`;
    wand.inputMode = 'decimal';
    wand.autocomplete = 'off';
    wand.value = zeigeCm(dicken[i]);
    wand.setAttribute('aria-label', `Wanddicke Seite ${i + 1} in Zentimetern`);
    zeile.append(label, feld, wand);
    raumSeiten.append(zeile);
    if (name !== 'Schräge') laengenFelder.push({ index: i, feld, alt: laenge });
    wandFelder.push(wand);
  });
  raumDialog.hidden = false;
  plane();
  window.setTimeout(() => raumName.select(), 50);
}

function schliesseRaumDialog(): void {
  raumDialog.hidden = true;
  bearbeiteId = null;
  aktualisiere();
  plane();
}

// Haken "Wände um den Raum": setzt alle Seiten auf den Vorschlag oder auf null
raumWaende.addEventListener('change', () => {
  const raum = raeume.find((r) => r.id === bearbeiteId);
  // Seiten, an denen ein Nachbarraum liegt, bekommen keine eigene Außenwand (dort entsteht die Zwischenwand)
  const beiNachbar = new Set(
    raum ? nachbarSeiten(raum, raeume.filter((r) => r.id !== raum.id), 0.7).map((f) => f.kante) : [],
  );
  wandFelder.forEach((f, i) => {
    f.value = raumWaende.checked && !beiNachbar.has(i) ? zeigeCm(toleranzen.wandAussen) : '0';
  });
});

btn('raum-abbrechen').addEventListener('click', schliesseRaumDialog);
btn('raum-uebernehmen').addEventListener('click', () => {
  const raum = raeume.find((r) => r.id === bearbeiteId);
  if (!raum) return schliesseRaumDialog();
  const zeigeFehler = (text: string) => {
    raumFehler.textContent = text;
    raumFehler.hidden = false;
  };
  let ecken = raum.ecken;
  for (const s of laengenFelder) {
    const neu = leseLaenge(s.feld.value);
    if (neu === null) return zeigeFehler(`Seite ${s.index + 1}: „${s.feld.value}“ ist keine Länge. Schreibe zum Beispiel 4,20.`);
    if (Math.abs(neu - s.alt) < 0.0005) continue;
    const ergebnis = setzeKantenlaenge(ecken, s.index, neu);
    if (!ergebnis) return zeigeFehler(`Seite ${s.index + 1}: Mit ${zeigeLaenge(neu)} m passt die Form nicht mehr.`);
    ecken = ergebnis;
  }
  const dicken: number[] = [];
  for (let i = 0; i < wandFelder.length; i++) {
    const d = leseDicke(wandFelder[i].value);
    if (d === null) return zeigeFehler(`Seite ${i + 1}: „${wandFelder[i].value}“ ist keine Wanddicke. Schreibe zum Beispiel 24 (Zentimeter).`);
    dicken.push(d);
  }
  const waende = dicken.some((d) => d > 0.0005) ? dicken : undefined;
  const name = raumName.value.trim() || raum.name;
  const wandAlt = JSON.stringify(raum.waende ?? null);
  const geaendert = ecken !== raum.ecken || name !== raum.name || JSON.stringify(waende ?? null) !== wandAlt;
  if (geaendert) {
    raum.ecken = ecken;
    raum.name = name;
    raum.waende = waende;
    passeOeffnungenAn(raum);
    merke();
  }
  schliesseRaumDialog();
});
btn('raum-loeschen').addEventListener('click', () => {
  raeume = raeume.filter((r) => r.id !== bearbeiteId);
  auswahlId = null;
  merke();
  schliesseRaumDialog();
});
raumName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btn('raum-uebernehmen').click();
});

// Tür oder Fenster bearbeiten
const oeffnungDialog = document.getElementById('oeffnung-dialog')!;
const oBreite = document.getElementById('oeffnung-breite') as HTMLInputElement;
const oAbstand = document.getElementById('oeffnung-abstand') as HTMLInputElement;
const oAnschlag = document.getElementById('oeffnung-anschlag') as HTMLSelectElement;
const oAufschlag = document.getElementById('oeffnung-aufschlag') as HTMLSelectElement;
const oFehler = document.getElementById('oeffnung-fehler')!;
let bearbeiteOeffnung: OeffnungsRef | null = null;

function oeffneOeffnungDialog(ref: OeffnungsRef): void {
  const raum = raeume.find((r) => r.id === ref.raumId);
  const o = raum?.oeffnungen?.find((q) => q.id === ref.id);
  if (!raum || !o) return;
  bearbeiteOeffnung = ref;
  auswahlOeffnung = ref;
  const tuer = o.art === 'tuer';
  document.getElementById('oeffnung-titel')!.textContent = tuer ? 'Tür bearbeiten' : 'Fenster bearbeiten';
  document.getElementById('oeffnung-ort')!.textContent = `${raum.name}, Seite ${o.kante + 1}, ${seitenName(raum.ecken, o.kante, schwerpunkt(raum.ecken))}. Maße in Metern oder Zentimetern, zum Beispiel 88,5 oder 1,01 m.`;
  oBreite.value = `${zeigeLaenge(o.breite)} m`;
  oAbstand.value = `${zeigeLaenge(o.abstand)} m`;
  oAnschlag.value = o.anschlag;
  oAufschlag.value = o.aufschlag;
  document.getElementById('zeile-anschlag')!.hidden = !tuer;
  document.getElementById('zeile-aufschlag')!.hidden = !tuer;
  oFehler.hidden = true;
  oeffnungDialog.hidden = false;
  plane();
  window.setTimeout(() => oBreite.select(), 50);
}

function schliesseOeffnungDialog(): void {
  oeffnungDialog.hidden = true;
  bearbeiteOeffnung = null;
  aktualisiere();
  plane();
}

btn('oeffnung-abbrechen').addEventListener('click', schliesseOeffnungDialog);
btn('oeffnung-uebernehmen').addEventListener('click', () => {
  const raum = raeume.find((r) => r.id === bearbeiteOeffnung?.raumId);
  const o = raum?.oeffnungen?.find((q) => q.id === bearbeiteOeffnung?.id);
  if (!raum || !o) return schliesseOeffnungDialog();
  const fehler = (text: string) => {
    oFehler.textContent = text;
    oFehler.hidden = false;
  };
  const breite = leseBreite(oBreite.value);
  if (breite === null) return fehler(`„${oBreite.value}“ ist keine Breite. Schreibe zum Beispiel 88,5.`);
  const abstand = leseLaenge(oAbstand.value);
  if (abstand === null) return fehler(`„${oAbstand.value}“ ist kein Abstand. Schreibe zum Beispiel 0,50.`);
  const neu: Oeffnung = { ...o, breite, abstand, anschlag: oAnschlag.value as Oeffnung['anschlag'], aufschlag: oAufschlag.value as Oeffnung['aufschlag'] };
  const meldung = pruefeOeffnung(raum, neu);
  if (meldung) return fehler(meldung);
  if (JSON.stringify(neu) !== JSON.stringify(o)) {
    raum.oeffnungen = (raum.oeffnungen ?? []).map((q) => (q.id === o.id ? neu : q));
    merke();
  }
  schliesseOeffnungDialog();
});
btn('oeffnung-loeschen').addEventListener('click', () => {
  const raum = raeume.find((r) => r.id === bearbeiteOeffnung?.raumId);
  if (raum) {
    raum.oeffnungen = (raum.oeffnungen ?? []).filter((q) => q.id !== bearbeiteOeffnung?.id);
    if (raum.oeffnungen.length === 0) delete raum.oeffnungen;
  }
  auswahlOeffnung = null;
  merke();
  schliesseOeffnungDialog();
});
[oBreite, oAbstand].forEach((f) =>
  f.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn('oeffnung-uebernehmen').click();
  }),
);

// Zwischenwand: Räume liegen nah beieinander, die App fragt nach der Dicke der Wand dazwischen
const wandDialog = document.getElementById('wand-dialog')!;
const wandDicke = document.getElementById('wand-dicke') as HTMLInputElement;
const wandFehler = document.getElementById('wand-fehler')!;
let wandAngebot: { raumId: number; z: Zwischenwand } | null = null;

function pruefeZwischenwand(id: number): void {
  const raum = raeume.find((r) => r.id === id);
  if (!raum) return;
  const z = findeZwischenwand(raum, raeume.filter((r) => r.id !== id));
  if (!z) return;
  const nachbar = raeume.find((r) => r.id === z.andereId);
  if (!nachbar) return;
  wandAngebot = { raumId: id, z };
  document.getElementById('wand-text')!.textContent = `${raum.name} liegt direkt an ${nachbar.name}. Wie dick ist die Wand dazwischen? Die Wand gehört zu ${raum.name}, der Abstand der Räume passt sich an.`;
  wandDicke.value = zeigeCm(z.abstand > 0.02 ? z.abstand : toleranzen.wandInnen);
  wandFehler.hidden = true;
  wandDialog.hidden = false;
  window.setTimeout(() => wandDicke.select(), 50);
}

function schliesseWandDialog(): void {
  wandDialog.hidden = true;
  wandAngebot = null;
}

btn('wand-nein').addEventListener('click', schliesseWandDialog);
btn('wand-ja').addEventListener('click', () => {
  if (!wandAngebot) return schliesseWandDialog();
  const t = leseDicke(wandDicke.value);
  if (t === null || t < 0.02 || t > 0.6) {
    wandFehler.textContent = 'Schreibe die Dicke in Zentimetern, zum Beispiel 11,5 (zwischen 2 und 60).';
    wandFehler.hidden = false;
    return;
  }
  const raum = raeume.find((r) => r.id === wandAngebot!.raumId);
  if (raum) {
    const { z } = wandAngebot;
    // Raum so verschieben, dass zwischen den Innenseiten genau die Wanddicke liegt
    raum.ecken = verschiebeRaum(raum.ecken, -z.nx * (t - z.abstand), -z.ny * (t - z.abstand));
    const dicken = dickenVon(raum);
    dicken[z.kante] = t;
    raum.waende = dicken;
    merke();
  }
  schliesseWandDialog();
  aktualisiere();
  plane();
});
wandDicke.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btn('wand-ja').click();
});

// Einstellungen der Erkennung
const dialog = document.getElementById('einstellungen')!;
const reglerBox = document.getElementById('regler')!;

function baueRegler(): void {
  reglerBox.textContent = '';
  for (const b of TOLERANZ_BESCHREIBUNG) {
    const zeile = document.createElement('div');
    zeile.className = 'regler-zeile';
    const id = `regler-${b.schluessel}`;
    const kopf = document.createElement('label');
    kopf.htmlFor = id;
    const name = document.createElement('span');
    name.textContent = b.name;
    const wert = document.createElement('output');
    kopf.append(name, wert);
    const eingabeFeld = document.createElement('input');
    eingabeFeld.type = 'range';
    eingabeFeld.id = id;
    eingabeFeld.min = String(b.min);
    eingabeFeld.max = String(b.max);
    eingabeFeld.step = String(b.schritt);
    const zeigeWert = () => {
      const anzeige = Number(eingabeFeld.value);
      wert.textContent = `${String(anzeige).replace('.', ',')}${b.einheit}`;
    };
    eingabeFeld.value = String(Math.round(toleranzen[b.schluessel] * b.anzeigeFaktor * 100) / 100);
    zeigeWert();
    eingabeFeld.addEventListener('input', () => {
      toleranzen = { ...toleranzen, [b.schluessel]: Number(eingabeFeld.value) / b.anzeigeFaktor };
      speichereToleranzen(toleranzen);
      zeigeWert();
    });
    const hilfe = document.createElement('p');
    hilfe.className = 'regler-hilfe';
    hilfe.textContent = b.hilfe;
    zeile.append(kopf, eingabeFeld, hilfe);
    reglerBox.append(zeile);
  }
}
btn('btn-einstellungen').addEventListener('click', () => {
  baueRegler();
  dialog.hidden = false;
});
btn('einstellungen-zu').addEventListener('click', () => (dialog.hidden = true));
btn('toleranz-standard').addEventListener('click', () => {
  toleranzen = { ...STANDARD_TOLERANZEN };
  speichereToleranzen(toleranzen);
  baueRegler();
});
btn('leisten-standard').addEventListener('click', () => {
  leisten.forEach((l) => l.zuruecksetzen());
});

// ---------------------------------------------------------------- Skizzen speichern und öffnen
const skizzenName = document.getElementById('skizzen-name')!;
const skDialog = document.getElementById('skizzen-dialog')!;
const skName = document.getElementById('skizze-name') as HTMLInputElement;
const skKunde = document.getElementById('skizze-kunde') as HTMLInputElement;
const skAdresse = document.getElementById('skizze-adresse') as HTMLInputElement;
const skNummer = document.getElementById('skizze-nummer') as HTMLInputElement;
const skListe = document.getElementById('skizzen-liste')!;
const skMeldung = document.getElementById('skizzen-meldung')!;
const skDatei = document.getElementById('skizze-datei') as HTMLInputElement;
const speicherInfo = document.getElementById('speicher-info')!;
const uhrzeit = (): string => new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function aktualisiereKopf(): void {
  skizzenName.textContent = skizze.name;
}

/** Schreibt die Skizze ins Gerät. Fehler werden angezeigt, die App läuft weiter. */
async function speichereJetzt(): Promise<void> {
  window.clearTimeout(speicherZeit);
  speicherOffen = false;
  skizze.raeume = raeume;
  skizze.naechsteId = naechsteId;
  skizze.geaendert = Date.now();
  try {
    await speichereSkizze(skizze);
    speichereJson('skizze.letzte', skizze.id); // beim nächsten Start diese Skizze wieder öffnen
    speicherStatus = `Gespeichert ${uhrzeit()}`;
  } catch {
    speicherStatus = 'NICHT GESPEICHERT (Speicher des Geräts nicht verfügbar)';
  }
  aktualisiere();
}

/** Speichert kurz nach der letzten Änderung (nicht bei jedem Strich). */
function planeSpeichern(): void {
  speicherOffen = true;
  speicherStatus = 'Speichert …';
  window.clearTimeout(speicherZeit);
  speicherZeit = window.setTimeout(() => void speichereJetzt(), 700);
  aktualisiere();
}

function sofortSpeichernFallsOffen(): void {
  if (speicherOffen) void speichereJetzt();
}

/** Vor dem Wechsel zu einer anderen Skizze: nur speichern, wenn es etwas Ungespeichertes gibt (keine leeren Skizzen anlegen). */
async function speichereFallsOffen(): Promise<void> {
  if (speicherOffen) await speichereJetzt();
}
window.addEventListener('pagehide', sofortSpeichernFallsOffen);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sofortSpeichernFallsOffen();
});

function oeffneSkizze(s: Skizze): void {
  skizze = s;
  raeume = s.raeume;
  naechsteId = s.naechsteId;
  verlauf = [JSON.stringify(raeume)];
  verlaufPos = 0;
  auswahlId = null;
  auswahlOeffnung = null;
  vp = raeume.length > 0 ? passeAn(huelle(raeume), breite, hoehe) : startAnsicht(breite, hoehe);
  speichereJson('skizze.letzte', s.id);
  speicherStatus = '';
  aktualisiereKopf();
  aktualisiere();
  plane();
}

function fuelleSkizzenFelder(): void {
  skName.value = skizze.name;
  skKunde.value = skizze.kunde.name;
  skAdresse.value = skizze.kunde.adresse;
  skNummer.value = skizze.kunde.nummer;
}

async function aktualisiereListe(): Promise<void> {
  skListe.textContent = '';
  let liste: Skizze[] = [];
  try {
    liste = await alleSkizzen();
  } catch {
    skMeldung.textContent = 'Der Speicher des Geräts ist nicht verfügbar. Sichere wichtige Skizzen als Datei.';
    return;
  }
  if (liste.length === 0) {
    const leer = document.createElement('p');
    leer.className = 'hilfe';
    leer.textContent = 'Noch keine gespeicherte Skizze. Sobald du etwas zeichnest, wird es automatisch gespeichert.';
    skListe.append(leer);
  }
  for (const s of liste) {
    const zeile = document.createElement('div');
    zeile.className = 'skizzen-zeile';
    const oeffnen = document.createElement('button');
    oeffnen.type = 'button';
    oeffnen.className = `oeffnen${s.id === skizze.id ? ' aktuell' : ''}`;
    const text = document.createElement('span');
    text.className = 'text';
    const titel = document.createElement('strong');
    titel.textContent = s.name;
    const unter = document.createElement('span');
    const flaecheGesamt = s.raeume.reduce((summe, r) => summe + flaeche(r.ecken), 0);
    unter.textContent = `${s.kunde.name ? `${s.kunde.name}, ` : ''}${s.raeume.length} ${s.raeume.length === 1 ? 'Raum' : 'Räume'}, ${kommaZahl(flaecheGesamt, 1)} m², ${new Date(s.geaendert).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`;
    text.append(titel, unter);
    oeffnen.append(vorschauSvg(s.raeume), text);
    oeffnen.addEventListener('click', () => {
      void (async () => {
        if (s.id !== skizze.id) {
          await speichereFallsOffen();
          const frisch = await ladeSkizze(s.id);
          if (frisch) oeffneSkizze(frisch);
        }
        skDialog.hidden = true;
      })();
    });
    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'weg';
    weg.textContent = 'Löschen';
    let scharf: number | undefined;
    weg.addEventListener('click', () => {
      if (scharf === undefined) {
        weg.classList.add('scharf');
        weg.textContent = 'Sicher?';
        scharf = window.setTimeout(() => {
          scharf = undefined;
          weg.classList.remove('scharf');
          weg.textContent = 'Löschen';
        }, 3000);
        return;
      }
      window.clearTimeout(scharf);
      void (async () => {
        try {
          await loescheSkizze(s.id);
        } catch {
          skMeldung.textContent = 'Löschen hat nicht geklappt.';
          return;
        }
        if (s.id === skizze.id) {
          window.clearTimeout(speicherZeit);
          speicherOffen = false;
          oeffneSkizze(neueSkizze());
          fuelleSkizzenFelder();
        }
        skMeldung.textContent = `„${s.name}“ gelöscht.`;
        await aktualisiereListe();
      })();
    });
    zeile.append(oeffnen, weg);
    skListe.append(zeile);
  }
}

async function oeffneSkizzenDialog(): Promise<void> {
  fuelleSkizzenFelder();
  skMeldung.textContent = '';
  skDialog.hidden = false;
  void bitteUmDauerhaftenSpeicher().then((ok) => {
    speicherInfo.textContent =
      ok === true
        ? 'Der Speicher des Geräts ist dauerhaft: Der Browser löscht die Skizzen nicht von selbst.'
        : ok === false
          ? 'Achtung: Der Browser darf die Skizzen löschen, wenn das Gerät Platz braucht. Installiere die App auf dem Home-Bildschirm und sichere wichtige Skizzen als Datei.'
          : 'Ob der Browser die Skizzen dauerhaft behält, lässt sich hier nicht feststellen. Sichere wichtige Skizzen als Datei.';
  });
  await aktualisiereListe();
}

btn('btn-skizzen').addEventListener('click', () => void oeffneSkizzenDialog());
btn('skizzen-zu').addEventListener('click', () => (skDialog.hidden = true));

skName.addEventListener('input', () => {
  skizze.name = skName.value.trim() || skizze.name;
  aktualisiereKopf();
  planeSpeichern();
});
skName.addEventListener('blur', () => {
  if (!skName.value.trim()) skName.value = skizze.name;
});
for (const [feld, schluessel] of [[skKunde, 'name'], [skAdresse, 'adresse'], [skNummer, 'nummer']] as const) {
  feld.addEventListener('input', () => {
    skizze.kunde = { ...skizze.kunde, [schluessel]: feld.value };
    planeSpeichern();
  });
}

btn('skizze-neu').addEventListener('click', () => {
  void (async () => {
    await speichereFallsOffen();
    oeffneSkizze(neueSkizze());
    skDialog.hidden = true;
    zeigeHinweis('Neue Skizze. Zeichne einen Raum.', false);
  })();
});

btn('skizze-sichern').addEventListener('click', () => {
  skizze.raeume = raeume;
  skizze.naechsteId = naechsteId;
  const text = skizzeZuDatei(skizze);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `skizze-${skizze.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skizze'}.json`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  skMeldung.textContent = 'Die Datei wird heruntergeladen. Bewahre sie an einem sicheren Ort auf.';
});

btn('skizze-oeffnen').addEventListener('click', () => skDatei.click());
skDatei.addEventListener('change', () => {
  const datei = skDatei.files?.[0];
  skDatei.value = '';
  if (!datei) return;
  void (async () => {
    if (datei.size > 20 * 1024 * 1024) {
      skMeldung.textContent = 'Die Datei ist zu groß für eine Skizze.';
      return;
    }
    const ergebnis = leseSkizzenDatei(await datei.text());
    if (typeof ergebnis === 'string') {
      skMeldung.textContent = ergebnis;
      return;
    }
    await speichereFallsOffen();
    ergebnis.id = neueId(); // nie eine vorhandene Skizze überschreiben
    ergebnis.geaendert = Date.now();
    try {
      await speichereSkizze(ergebnis);
    } catch {
      /* wird beim nächsten Speichern erneut versucht */
    }
    oeffneSkizze(ergebnis);
    skDialog.hidden = true;
    zeigeHinweis(`„${ergebnis.name}“ geöffnet.`, false);
  })();
});

async function starte(): Promise<void> {
  void bitteUmDauerhaftenSpeicher();
  const letzte = ladeJson<string>('skizze.letzte');
  if (!letzte) return;
  try {
    const gespeichert = await ladeSkizze(letzte);
    // Nur öffnen, wenn in der Zwischenzeit noch nichts gezeichnet wurde
    if (gespeichert && raeume.length === 0 && !speicherOffen) {
      oeffneSkizze(gespeichert);
      zeigeHinweis(`„${gespeichert.name}“ wieder geöffnet.`, false);
    }
  } catch {
    speicherStatus = 'NICHT GESPEICHERT (Speicher des Geräts nicht verfügbar)';
    aktualisiere();
  }
}

// PDF: Kunde, Format und Maßstab wählen, dann erzeugen und anzeigen
const pdfDialog = document.getElementById('pdf-dialog')!;
const pdfFehler = document.getElementById('pdf-dialog-fehler')!;
const kName = document.getElementById('kunde-name') as HTMLInputElement;
const kAdresse = document.getElementById('kunde-adresse') as HTMLInputElement;
const kNummer = document.getElementById('kunde-nummer') as HTMLInputElement;
const pdfFormat = document.getElementById('pdf-format') as HTMLSelectElement;
const pdfMassstab = document.getElementById('pdf-massstab') as HTMLSelectElement;
const fenster = document.getElementById('pdf-fenster')!;
const rahmen = document.getElementById('pdf-rahmen') as HTMLIFrameElement;
const hinweis = document.getElementById('pdf-hinweis')!;
let pdfUrl: string | null = null;

btn('btn-pdf').addEventListener('click', () => {
  kName.value = skizze.kunde.name;
  kAdresse.value = skizze.kunde.adresse;
  kNummer.value = skizze.kunde.nummer;
  pdfFehler.hidden = true;
  pdfDialog.hidden = false;
});
btn('pdf-dialog-zu').addEventListener('click', () => (pdfDialog.hidden = true));

btn('pdf-erzeugen').addEventListener('click', async () => {
  if (raeume.length === 0) {
    pdfFehler.textContent = 'Zeichne zuerst einen Raum, dann gibt es etwas für das PDF.';
    pdfFehler.hidden = false;
    return;
  }
  const kunde: Kunde = { name: kName.value.trim(), adresse: kAdresse.value.trim(), nummer: kNummer.value.trim() };
  skizze.kunde = kunde;
  planeSpeichern();
  const quer = pdfFormat.value === 'quer';
  const nenner = pdfMassstab.value === 'auto' ? 'auto' : Number(pdfMassstab.value);
  pdfDialog.hidden = true;
  hinweis.textContent = 'PDF wird erzeugt …';
  document.getElementById('pdf-titel')!.textContent = 'PDF wird erzeugt …';
  fenster.hidden = false;
  try {
    const erg = await erzeugeGrundrissPdf(raeume, { quer, nenner, kunde, datum: new Date().toLocaleDateString('de-DE') });
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(new Blob([erg.bytes as BlobPart], { type: 'application/pdf' }));
    rahmen.src = pdfUrl;
    document.getElementById('pdf-titel')!.textContent = `A4 ${quer ? 'quer' : 'hoch'}, Maßstab 1:${erg.nenner}`;
    const dateiName = `grundriss-${(kunde.name || 'skizze').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skizze'}-1zu${erg.nenner}.pdf`;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = dateiName;
    a.click();
    hinweis.textContent =
      (erg.hinweis ? `${erg.hinweis} ` : '') +
      'Wird das PDF hier nicht angezeigt, erlaubt dieser Browser die Anzeige nicht. Das Herunterladen läuft dann über die installierte App.';
  } catch (fehler) {
    hinweis.textContent = `PDF konnte nicht erzeugt werden: ${(fehler as Error).message}`;
  }
});
btn('pdf-zu').addEventListener('click', () => {
  fenster.hidden = true;
  rahmen.removeAttribute('src');
});

// Offline-Speicher: nur als eigene Seite über HTTPS oder localhost (installierte App), nicht eingebettet in einer Vorschau.
if ('serviceWorker' in navigator && window.top === window.self && location.protocol.startsWith('http')) {
  import('virtual:pwa-register')
    .then(({ registerSW }) =>
      registerSW({
        onNeedRefresh: () => zeigeHinweis('Neue Version bereit. Schließe die App und öffne sie neu.', false),
        onOfflineReady: () => zeigeHinweis('Fertig für den Betrieb ohne Internet.', false),
      }),
    )
    .catch(() => {
      /* ohne Service Worker läuft die App trotzdem, nur nicht offline */
    });
}

window.addEventListener('resize', passeGroesseAn);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', plane);
passeGroesseAn();
aktualisiereKopf();
aktualisiere();
void starte();
