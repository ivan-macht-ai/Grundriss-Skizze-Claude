// Vorschaubild der Zeichnung als PNG (für die Ansicht im CRM). Zeichnet die Räume hell auf weißem Grund, ohne Raster.
import { passeAn } from '../ansicht/viewport';
import { huelle } from '../pdf/grundriss';
import type { Raum } from '../modell/typen';
import { zeichneRaeume } from './raeume';

export async function erzeugeVorschauBild(raeume: Raum[], breite = 1600, hoehe = 1000): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = breite;
  canvas.height = hoehe;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Zeichenfläche nicht verfügbar');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, breite, hoehe);
  const vp = passeAn(huelle(raeume), breite, hoehe, 130);
  // Etwas größere Schrift und Linien als am Bildschirm, damit das Bild verkleinert lesbar bleibt
  zeichneRaeume(
    ctx,
    vp,
    raeume,
    { fuell: 'rgba(11,107,87,0.10)', linie: '#12312a', text: '#1c2321', leise: '#5b6663', auswahl: '#0b6b57', wand: '#55625e', flaeche: '#ffffff' },
    null,
    null,
  );
  return new Promise<Blob>((ok, fehler) => canvas.toBlob((b) => (b ? ok(b) : fehler(new Error('Bild konnte nicht erzeugt werden'))), 'image/png'));
}
