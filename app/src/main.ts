import './styles.css';
import { verbindeEingabe, type EingabeZustand, type Strich, type Werkzeug } from './ansicht/eingabe';
import { zeichneRaster, type RasterFarben } from './ansicht/raster';
import { startAnsicht, toScreen, zoomAt, type Viewport } from './ansicht/viewport';
import { erzeugeMusterPdf } from './pdf/musterPdf';

const canvas = document.getElementById('flaeche') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const statusZeile = document.getElementById('status')!;
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;
const btnZurueck = btn('btn-zurueck');
const btnVor = btn('btn-vor');
const btnLoeschen = btn('btn-loeschen');
const loeschenText = document.getElementById('loeschen-text')!;
const werkzeugKnoepfe = [...document.querySelectorAll<HTMLButtonElement>('[data-werkzeug]')];

let breite = 0;
let hoehe = 0;
let vp: Viewport = { scale: 100, ox: 40, oy: 400 };
const striche: Strich[] = [];
const vorgemerkt: Strich[] = [];
let zeigerWelt: { x: number; y: number } | null = null;
let geplant = false;
let loeschenScharf: number | undefined;

const zustand: EingabeZustand = {
  werkzeug: 'zeichnen',
  stiftGesehen: false,
  handballenIgnoriert: 0,
  letzteArt: '–',
};

function farbe(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
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

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = farbe('--strich');
  const laufend = eingabe.aktuellerStrich();
  for (const s of laufend ? [...striche, laufend] : striche) {
    if (s.punkte.length < 2) continue;
    ctx.beginPath();
    s.punkte.forEach((p, i) => {
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
    `   |   Handballen ignoriert: ${zustand.handballenIgnoriert}   |   Striche: ${striche.length}`;
  btnZurueck.disabled = striche.length === 0;
  btnVor.disabled = vorgemerkt.length === 0;
  btnLoeschen.disabled = striche.length === 0;
  for (const k of werkzeugKnoepfe) k.setAttribute('aria-pressed', String(k.dataset.werkzeug === zustand.werkzeug));
  canvas.classList.toggle('hand', zustand.werkzeug === 'hand');
  if (striche.length === 0) entschaerfeLoeschen();
}

function waehleWerkzeug(w: Werkzeug): void {
  zustand.werkzeug = w;
  aktualisiere();
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

const eingabe = verbindeEingabe(
  canvas,
  {
    holeAnsicht: () => vp,
    setzeAnsicht: (neu) => {
      vp = neu;
      plane();
    },
    neuerStrich: (s) => {
      striche.push(s);
      vorgemerkt.length = 0;
      aktualisiere();
    },
    zeichneNeu: plane,
    zustandGeaendert: aktualisiere,
    zeigerBewegt: (x, y) => {
      zeigerWelt = { x, y };
      aktualisiere();
    },
  },
  zustand,
);

for (const k of werkzeugKnoepfe) k.addEventListener('click', () => waehleWerkzeug(k.dataset.werkzeug as Werkzeug));

btnZurueck.addEventListener('click', () => {
  const s = striche.pop();
  if (s) vorgemerkt.push(s);
  aktualisiere();
  plane();
});
btnVor.addEventListener('click', () => {
  const s = vorgemerkt.pop();
  if (s) striche.push(s);
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
  striche.length = 0;
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
