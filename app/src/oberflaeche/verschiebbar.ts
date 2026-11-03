// Macht eine schwebende Leiste verschiebbar: am Griff anfassen und ziehen.
// Schon beim Ziehen springt sie an die nächste Kante der Zeichenfläche. An der linken oder rechten Kante steht sie
// senkrecht, an der oberen oder unteren Kante waagerecht. Die Position wird im Gerät gemerkt.
import { ladeJson, loescheSchluessel, speichereJson } from '../speicher/einstellungen';

export type Kante = 'links' | 'rechts' | 'oben' | 'unten';

interface Platz {
  kante: Kante;
  /** Lage entlang der Kante, 0 = Anfang, 1 = Ende */
  anteil: number;
}

export interface Verschiebbar {
  zuruecksetzen(): void;
  einpassen(): void;
  /** An welcher Kante die Leiste gerade sitzt (null: Ausgangsplatz, links oder rechts, senkrecht) */
  kante(): Kante | null;
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

  let platz = ladeJson<Platz>(speicherSchluessel);
  const gueltig = (p: Platz | null): p is Platz =>
    !!p && ['links', 'rechts', 'oben', 'unten'].includes(p.kante) && Number.isFinite(p.anteil);
  if (gueltig(platz)) andocken(platz);

  const einpassen = () => {
    if (gueltig(platz)) andocken(platz);
    else if (el.style.left) frei(parseFloat(el.style.left), parseFloat(el.style.top));
  };

  // Beim Ziehen springt die Leiste sofort an die Kante, die dem Finger am nächsten ist, und stellt sich passend ein.
  const platzAusZeiger = (e: PointerEvent): Platz => {
    const b = buehne.getBoundingClientRect();
    const px = e.clientX - b.left;
    const py = e.clientY - b.top;
    const abstaende: [Kante, number][] = [['links', px], ['rechts', b.width - px], ['oben', py], ['unten', b.height - py]];
    abstaende.sort((x, y) => x[1] - y[1]);
    const kante = abstaende[0][0];
    const entlang = kante === 'links' || kante === 'rechts'
      ? (py - el.offsetHeight / 2 - RAND) / Math.max(1, b.height - el.offsetHeight - 2 * RAND)
      : (px - el.offsetWidth / 2 - RAND) / Math.max(1, b.width - el.offsetWidth - 2 * RAND);
    return { kante, anteil: Math.min(1, Math.max(0, entlang)) };
  };

  let zieht = false;
  griff.style.touchAction = 'none';
  griff.addEventListener('pointerdown', (e) => {
    zieht = true;
    griff.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  griff.addEventListener('pointermove', (e) => {
    if (!zieht) return;
    platz = platzAusZeiger(e);
    andocken(platz);
  });
  const ende = () => {
    if (!zieht) return;
    zieht = false;
    if (gueltig(platz)) speichereJson(speicherSchluessel, platz);
  };
  griff.addEventListener('pointerup', ende);
  griff.addEventListener('pointercancel', ende);

  return {
    kante: () => (gueltig(platz) ? platz.kante : null),
    einpassen,
    zuruecksetzen: () => {
      platz = null;
      el.classList.remove('waagerecht');
      for (const k of ['left', 'top', 'right', 'bottom', 'transform'] as const) el.style[k] = '';
      loescheSchluessel(speicherSchluessel);
    },
  };
}
