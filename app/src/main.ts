import './styles.css';
import { verbindeEingabe, type EingabeZustand, type Strich, type Werkzeug } from './ansicht/eingabe';
import { zeichneRaster, type RasterFarben } from './ansicht/raster';
import { startAnsicht, toScreen, zoomAt, type Viewport } from './ansicht/viewport';
import { STANDARD_TOLERANZEN, TOLERANZ_BESCHREIBUNG, type Toleranzen } from './config/toleranzen';
import { erkenneRaum } from './erkennung/erkenne';
import { flaeche } from './geometrie/polygon';
import type { Raum } from './modell/typen';
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
const raeume: Raum[] = [];
const vorgemerkt: Raum[] = [];
let naechsteId = 1;
let toleranzen: Toleranzen = ladeToleranzen();
let zeigerWelt: { x: number; y: number } | null = null;
let geplant = false;
let loeschenScharf: number | undefined;
let toastZeit: number | undefined;

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
  zeichneRaeume(ctx, vp, raeume, {
    fuell: farbe('--raum-fuell'),
    linie: farbe('--strich'),
    text: farbe('--text'),
    leise: farbe('--text-leise'),
  });

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
  btnZurueck.disabled = raeume.length === 0;
  btnVor.disabled = vorgemerkt.length === 0;
  btnLoeschen.disabled = raeume.length === 0;
  for (const k of werkzeugKnoepfe) k.setAttribute('aria-pressed', String(k.dataset.werkzeug === zustand.werkzeug));
  canvas.classList.toggle('hand', zustand.werkzeug === 'hand');
  if (raeume.length === 0) entschaerfeLoeschen();
}

function entschaerfeLoeschen(): void {
  window.clearTimeout(loeschenScharf);
  loeschenScharf = undefined;
  btnLoeschen.classList.remove('scharf');
  loeschenText.textContent = 'Löschen';
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
  vorgemerkt.length = 0;
  zeigeHinweis(`${e.form} erkannt, ${kommaZahl(flaeche(e.ecken), 2)} m²`, false);
  aktualisiere();
  plane();
}

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
  },
  zustand,
);

for (const k of werkzeugKnoepfe) {
  k.addEventListener('click', () => {
    zustand.werkzeug = k.dataset.werkzeug as Werkzeug;
    aktualisiere();
  });
}
btnZurueck.addEventListener('click', () => {
  const r = raeume.pop();
  if (r) vorgemerkt.push(r);
  aktualisiere();
  plane();
});
btnVor.addEventListener('click', () => {
  const r = vorgemerkt.pop();
  if (r) raeume.push(r);
  aktualisiere();
  plane();
});
// Löschen braucht zwei Tipps (die Vorschau erlaubt keine Rückfrage-Fenster)
btnLoeschen.addEventListener('click', () => {
  if (loeschenScharf === undefined) {
    btnLoeschen.classList.add('scharf');
    loeschenText.textContent = 'Sicher?';
    loeschenScharf = window.setTimeout(entschaerfeLoeschen, 3000);
    return;
  }
  raeume.length = 0;
  vorgemerkt.length = 0;
  entschaerfeLoeschen();
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
