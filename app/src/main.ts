import './styles.css';
import { verbindeEingabe, type EingabeZustand, type Strich, type Werkzeug } from './ansicht/eingabe';
import { zeichneRaster, type RasterFarben } from './ansicht/raster';
import { startAnsicht, toScreen, zoomAt, type Viewport } from './ansicht/viewport';
import { STANDARD_TOLERANZEN, TOLERANZ_BESCHREIBUNG, type Toleranzen } from './config/toleranzen';
import { erkenneRaum } from './erkennung/erkenne';
import { flaeche, schwerpunkt } from './geometrie/polygon';
import { dist } from './geometrie/vec';
import { ausrichten, punktImVieleck, seitenName, setzeKantenlaenge, verschiebeRaum } from './modell/bearbeiten';
import type { Raum } from './modell/typen';
import { leseLaenge, zeigeLaenge } from './modell/zahlen';
import { macheVerschiebbar } from './oberflaeche/verschiebbar';
import { erzeugeMusterPdf } from './pdf/musterPdf';
import { ladeToleranzen, speichereToleranzen } from './speicher/einstellungen';
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
let auswahlId: number | null = null;
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
  letzteArt: '–',
};

function farbe(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function zeigeHinweis(text: string, fehler: boolean): void {
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
}

function ladeVerlauf(): void {
  raeume = JSON.parse(verlauf[verlaufPos]) as Raum[];
  if (auswahlId !== null && !raeume.some((r) => r.id === auswahlId)) auswahlId = null;
  aktualisiere();
  plane();
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
    },
    auswahlId,
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
    `   |   Handballen ignoriert: ${zustand.handballenIgnoriert}   |   Räume: ${raeume.length}`;
  btnZurueck.disabled = verlaufPos === 0;
  btnVor.disabled = verlaufPos >= verlauf.length - 1;
  btnLoeschen.disabled = raeume.length === 0;
  loeschenText.textContent = auswahlId !== null ? 'Raum löschen' : loeschenScharf !== undefined ? 'Sicher?' : 'Alles löschen';
  for (const k of werkzeugKnoepfe) k.setAttribute('aria-pressed', String(k.dataset.werkzeug === zustand.werkzeug));
  canvas.classList.toggle('zeiger', zustand.werkzeug === 'auswaehlen');
  if (raeume.length === 0 || auswahlId !== null) entschaerfeLoeschen(false);
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
}

// Raum ziehen
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
      if (bewegt && ziehOriginal) merke();
      ziehOriginal = null;
      aktualisiere();
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
    if (zustand.werkzeug === 'zeichnen') auswahlId = null;
    else if (raeume.length > 0) zeigeHinweis('Raum antippen und ziehen. Zweimal tippen: benennen und Maße ändern.', false);
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

// Raum bearbeiten: Name und Maße von Hand
const raumDialog = document.getElementById('raum-dialog')!;
const raumName = document.getElementById('raum-name') as HTMLInputElement;
const raumSeiten = document.getElementById('raum-seiten')!;
const raumFehler = document.getElementById('raum-fehler')!;
let bearbeiteId: number | null = null;
let seitenFelder: { index: number; feld: HTMLInputElement; alt: number }[] = [];

function oeffneRaumDialog(id: number): void {
  const raum = raeume.find((r) => r.id === id);
  if (!raum) return;
  bearbeiteId = id;
  auswahlId = id;
  raumName.value = raum.name;
  raumFehler.hidden = true;
  raumSeiten.textContent = '';
  seitenFelder = [];
  const mitte = schwerpunkt(raum.ecken);
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
      klein.textContent = 'Schräge: ergibt sich aus den anderen Seiten';
      label.append(klein);
    }
    zeile.append(label, feld);
    raumSeiten.append(zeile);
    if (name !== 'Schräge') seitenFelder.push({ index: i, feld, alt: laenge });
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

btn('raum-abbrechen').addEventListener('click', schliesseRaumDialog);
btn('raum-uebernehmen').addEventListener('click', () => {
  const raum = raeume.find((r) => r.id === bearbeiteId);
  if (!raum) return schliesseRaumDialog();
  const zeigeFehler = (text: string) => {
    raumFehler.textContent = text;
    raumFehler.hidden = false;
  };
  let ecken = raum.ecken;
  for (const s of seitenFelder) {
    const neu = leseLaenge(s.feld.value);
    if (neu === null) return zeigeFehler(`Seite ${s.index + 1}: „${s.feld.value}“ ist keine Länge. Schreibe zum Beispiel 4,20.`);
    if (Math.abs(neu - s.alt) < 0.0005) continue;
    const ergebnis = setzeKantenlaenge(ecken, s.index, neu);
    if (!ergebnis) return zeigeFehler(`Seite ${s.index + 1}: Mit ${zeigeLaenge(neu)} m passt die Form nicht mehr.`);
    ecken = ergebnis;
  }
  const name = raumName.value.trim() || raum.name;
  const geaendert = ecken !== raum.ecken || name !== raum.name;
  if (geaendert) {
    raum.ecken = ecken;
    raum.name = name;
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

// Muster-PDF: Download-Versuch und Anzeige im Fenster (Download kann in der Vorschau gesperrt sein).
const fenster = document.getElementById('pdf-fenster')!;
const rahmen = document.getElementById('pdf-rahmen') as HTMLIFrameElement;
const hinweis = document.getElementById('pdf-hinweis')!;
let pdfUrl: string | null = null;

btn('btn-pdf').addEventListener('click', async () => {
  hinweis.textContent = 'PDF wird erzeugt …';
  fenster.hidden = false;
  try {
    const bytes = await erzeugeMusterPdf();
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    rahmen.src = pdfUrl;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = 'muster-grundriss-1zu50.pdf';
    a.click();
    hinweis.textContent =
      'Wird das PDF hier nicht angezeigt, erlaubt dieser Browser die Anzeige nicht. Das Herunterladen läuft dann über die installierte App.';
  } catch (fehler) {
    hinweis.textContent = `PDF konnte nicht erzeugt werden: ${(fehler as Error).message}`;
  }
});
btn('pdf-zu').addEventListener('click', () => {
  fenster.hidden = true;
  rahmen.removeAttribute('src');
});

window.addEventListener('resize', passeGroesseAn);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', plane);
passeGroesseAn();
aktualisiere();
