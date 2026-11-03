// Macht eine schwebende Leiste verschiebbar: am Griff anfassen und ziehen.
// Beim Loslassen rastet sie an der nächsten Kante der Zeichenfläche ein. An der linken oder rechten Kante steht sie
// senkrecht, an der oberen oder unteren Kante waagerecht. Die Position wird im Gerät gemerkt.
import { ladeJson, loescheSchluessel, speichereJson } from '../speicher/einstellungen';

type Kante = 'links' | 'rechts' | 'oben' | 'unten';

interface Platz {
  kante: Kante;
  /** Lage entlang der Kante, 0 = Anfang, 1 = Ende */
  anteil: number;
}

export interface Verschiebbar {
  zuruecksetzen(): void;
  einpassen(): void;
}

const RAND = 10;

export function macheVerschiebbar(el: HTMLElement, griff: HTMLElement, buehne: HTMLElement, schluessel: string): Verschiebbar {
  const speicherSchluessel = `skizze.leiste.v2.${schluessel}`;

  const frei = (left: number, top: number) => {
    const b = buehne.getBoundingClientRect();
    el.style.left = `${Math.min(Math.max(0, left), Math.max(0, b.width - el.offsetWidth))}px`;
    el.style.top = `${Math.min(Math.max(0, top), Math.max(0, b.height - el.offsetHeight))}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
  };

  /** Setzt die Leiste an eine Kante (mit passender Ausrichtung) und an die Stelle entlang der Kante. */
  const andocken = (platz: Platz) => {
    const b = buehne.getBoundingClientRect();
    el.classList.toggle('waagerecht', platz.kante === 'oben' || platz.kante === 'unten');
    const breiteEl = el.offsetWidth;
    const hoeheEl = el.offsetHeight;
    const anteil = Math.min(1, Math.max(0, platz.anteil));
    if (platz.kante === 'links' || platz.kante === 'rechts') {
      const top = RAND + anteil * Math.max(0, b.height - hoeheEl - 2 * RAND);
      frei(platz.kante === 'links' ? RAND : b.width - breiteEl - RAND, top);
    } else {
      const left = RAND + anteil * Math.max(0, b.width - breiteEl - 2 * RAND);
      frei(left, platz.kante === 'oben' ? RAND : b.height - hoeheEl - RAND);
    }
  };

  const aktuellerPlatz = (): Platz => {
    const r = el.getBoundingClientRect();
    const b = buehne.getBoundingClientRect();
    const links = r.left - b.left;
    const oben = r.top - b.top;
    const rechts = b.width - (links + r.width);
    const unten = b.height - (oben + r.height);
    const kanten: [Kante, number][] = [['links', links], ['rechts', rechts], ['oben', oben], ['unten', unten]];
    kanten.sort((a, c) => a[1] - c[1]);
    const kante = kanten[0][0];
    const entlang = kante === 'links' || kante === 'rechts'
      ? oben / Math.max(1, b.height - r.height)
      : links / Math.max(1, b.width - r.width);
    return { kante, anteil: entlang };
  };

  let platz = ladeJson<Platz>(speicherSchluessel);
  const gueltig = (p: Platz | null): p is Platz =>
    !!p && ['links', 'rechts', 'oben', 'unten'].includes(p.kante) && Number.isFinite(p.anteil);
  if (gueltig(platz)) andocken(platz);

  const einpassen = () => {
    if (gueltig(platz)) andocken(platz);
    else if (el.style.left) frei(parseFloat(el.style.left), parseFloat(el.style.top));
  };

  let start: { px: number; py: number; left: number; top: number } | null = null;
  griff.style.touchAction = 'none';
  griff.addEventListener('pointerdown', (e) => {
    const r = el.getBoundingClientRect();
    const b = buehne.getBoundingClientRect();
    start = { px: e.clientX, py: e.clientY, left: r.left - b.left, top: r.top - b.top };
    // Während des Ziehens bleibt die Leiste, wie sie ist; der aktuelle Ort wird fest gesetzt.
    frei(start.left, start.top);
    griff.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  griff.addEventListener('pointermove', (e) => {
    if (!start) return;
    frei(start.left + e.clientX - start.px, start.top + e.clientY - start.py);
  });
  const ende = () => {
    if (!start) return;
    start = null;
    platz = aktuellerPlatz();
    andocken(platz);
    speichereJson(speicherSchluessel, platz);
  };
  griff.addEventListener('pointerup', ende);
  griff.addEventListener('pointercancel', ende);

  return {
    einpassen,
    zuruecksetzen: () => {
      platz = null;
      el.classList.remove('waagerecht');
      for (const k of ['left', 'top', 'right', 'bottom', 'transform'] as const) el.style[k] = '';
      loescheSchluessel(speicherSchluessel);
    },
  };
}
