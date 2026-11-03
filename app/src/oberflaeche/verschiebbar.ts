// Macht eine schwebende Leiste verschiebbar: am Griff anfassen und ziehen. Die Position wird im Gerät gemerkt.
import { ladeJson, loescheSchluessel, speichereJson } from '../speicher/einstellungen';

interface Position {
  left: number;
  top: number;
}

export interface Verschiebbar {
  zuruecksetzen(): void;
  einpassen(): void;
}

export function macheVerschiebbar(el: HTMLElement, griff: HTMLElement, buehne: HTMLElement, schluessel: string): Verschiebbar {
  const speicherSchluessel = `skizze.leiste.${schluessel}`;

  const setze = (left: number, top: number) => {
    const b = buehne.getBoundingClientRect();
    const maxLeft = Math.max(0, b.width - el.offsetWidth);
    const maxTop = Math.max(0, b.height - el.offsetHeight);
    el.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
    el.style.top = `${Math.min(Math.max(0, top), maxTop)}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
  };

  const einpassen = () => {
    if (!el.style.left) return;
    setze(parseFloat(el.style.left), parseFloat(el.style.top));
  };

  const gespeichert = ladeJson<Position>(speicherSchluessel);
  if (gespeichert && Number.isFinite(gespeichert.left) && Number.isFinite(gespeichert.top)) setze(gespeichert.left, gespeichert.top);

  let start: { px: number; py: number; left: number; top: number } | null = null;
  griff.style.touchAction = 'none';
  griff.addEventListener('pointerdown', (e) => {
    const r = el.getBoundingClientRect();
    const b = buehne.getBoundingClientRect();
    start = { px: e.clientX, py: e.clientY, left: r.left - b.left, top: r.top - b.top };
    griff.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  griff.addEventListener('pointermove', (e) => {
    if (!start) return;
    setze(start.left + e.clientX - start.px, start.top + e.clientY - start.py);
  });
  const ende = () => {
    if (!start) return;
    start = null;
    speichereJson(speicherSchluessel, { left: parseFloat(el.style.left), top: parseFloat(el.style.top) });
  };
  griff.addEventListener('pointerup', ende);
  griff.addEventListener('pointercancel', ende);

  return {
    einpassen,
    zuruecksetzen: () => {
      for (const k of ['left', 'top', 'right', 'bottom', 'transform'] as const) el.style[k] = '';
      loescheSchluessel(speicherSchluessel);
    },
  };
}
