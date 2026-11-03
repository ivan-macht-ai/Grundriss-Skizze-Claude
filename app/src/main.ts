import './styles.css';
import { verbindeEingabe, type EingabeZustand, type Strich } from './ansicht/eingabe';
import { zeichneRaster, type RasterFarben } from './ansicht/raster';
import { startAnsicht, toScreen, type Viewport } from './ansicht/viewport';
import { erzeugeMusterPdf } from './pdf/musterPdf';

const canvas = document.getElementById('flaeche') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const statusZeile = document.getElementById('status')!;
const btnFinger = document.getElementById('btn-finger') as HTMLButtonElement;

let breite = 0;
let hoehe = 0;
let vp: Viewport = { scale: 100, ox: 40, oy: 400 };
const striche: Strich[] = [];
let zeigerWelt: { x: number; y: number } | null = null;
let geplant = false;

const zustand: EingabeZustand = {
  fingerZeichnet: true,
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
  for (const s of [...striche, ...(eingabe.aktuellerStrich() ? [eingabe.aktuellerStrich()!] : [])]) {
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

function aktualisiereStatus(): void {
  const pos = zeigerWelt
    ? `x ${zeigerWelt.x.toFixed(2).replace('.', ',')} m, y ${zeigerWelt.y.toFixed(2).replace('.', ',')} m`
    : '–';
  const art: Record<string, string> = { pen: 'Stift', touch: 'Finger', mouse: 'Maus', '–': '–' };
  statusZeile.textContent =
    `Zeiger: ${pos}   |   Eingabe: ${art[zustand.letzteArt] ?? zustand.letzteArt}` +
    `   |   Handballen ignoriert: ${zustand.handballenIgnoriert}   |   Striche: ${striche.length}`;
  btnFinger.textContent = zustand.fingerZeichnet ? 'Finger: zeichnet' : 'Finger: verschiebt';
  btnFinger.setAttribute('aria-pressed', String(zustand.fingerZeichnet));
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
      aktualisiereStatus();
    },
    zeichneNeu: plane,
    zustandGeaendert: aktualisiereStatus,
    zeigerBewegt: (x, y) => {
      zeigerWelt = { x, y };
      aktualisiereStatus();
    },
  },
  zustand,
);

document.getElementById('btn-zurueck')!.addEventListener('click', () => {
  striche.pop();
  aktualisiereStatus();
  plane();
});
document.getElementById('btn-loeschen')!.addEventListener('click', () => {
  striche.length = 0;
  aktualisiereStatus();
  plane();
});
btnFinger.addEventListener('click', () => {
  zustand.fingerZeichnet = !zustand.fingerZeichnet;
  aktualisiereStatus();
});
document.getElementById('btn-ansicht')!.addEventListener('click', () => {
  vp = startAnsicht(breite, hoehe);
  plane();
});

// Muster-PDF: Download-Versuch und Anzeige im Fenster (Download kann in der Vorschau gesperrt sein).
const fenster = document.getElementById('pdf-fenster')!;
const rahmen = document.getElementById('pdf-rahmen') as HTMLIFrameElement;
const hinweis = document.getElementById('pdf-hinweis')!;
let pdfUrl: string | null = null;

document.getElementById('btn-pdf')!.addEventListener('click', async () => {
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
document.getElementById('pdf-zu')!.addEventListener('click', () => {
  fenster.hidden = true;
  rahmen.removeAttribute('src');
});

window.addEventListener('resize', passeGroesseAn);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', plane);
passeGroesseAn();
aktualisiereStatus();
