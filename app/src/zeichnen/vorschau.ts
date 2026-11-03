import { huelle } from '../pdf/grundriss';
import type { Raum } from '../modell/typen';

const NS = 'http://www.w3.org/2000/svg';

/** Kleines Vorschaubild einer Skizze für die Liste (Umrisse der Räume). */
export function vorschauSvg(raeume: Raum[], breite = 76, hoehe = 56): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${breite} ${hoehe}`);
  svg.setAttribute('width', String(breite));
  svg.setAttribute('height', String(hoehe));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('vorschau');
  if (raeume.length === 0) return svg;
  const h = huelle(raeume);
  const bw = Math.max(0.01, h.maxX - h.minX);
  const bh = Math.max(0.01, h.maxY - h.minY);
  const rand = 5;
  const s = Math.min((breite - 2 * rand) / bw, (hoehe - 2 * rand) / bh);
  const x0 = (breite - bw * s) / 2 - h.minX * s;
  const y0 = (hoehe + bh * s) / 2 + h.minY * s;
  for (const r of raeume) {
    const pfad = document.createElementNS(NS, 'path');
    const d = r.ecken.map((p, i) => `${i === 0 ? 'M' : 'L'}${(x0 + p.x * s).toFixed(1)} ${(y0 - p.y * s).toFixed(1)}`).join(' ');
    pfad.setAttribute('d', `${d} Z`);
    svg.append(pfad);
  }
  return svg;
}
