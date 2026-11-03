// Erzeugt die App-Symbole (PNG) ohne Fremdbibliothek: grüne Fläche mit weißem L-förmigem Grundriss.
// Aufruf: node scripts/icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const GRUEN = [11, 107, 87, 255];
const WEISS = [255, 255, 255, 255];

function png(size, zeichne) {
  const px = Buffer.alloc(size * size * 4);
  const setze = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    px.set(c, (y * size + x) * 4);
  };
  const rechteck = (x0, y0, x1, y1, c) => {
    for (let y = Math.round(y0 * size); y < Math.round(y1 * size); y++)
      for (let x = Math.round(x0 * size); x < Math.round(x1 * size); x++) setze(x, y, c);
  };
  rechteck(0, 0, 1, 1, GRUEN);
  zeichne(rechteck);
  const roh = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    roh[y * (size * 4 + 1)] = 0;
    px.copy(roh, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const chunk = (typ, daten) => {
    const laenge = Buffer.alloc(4);
    laenge.writeUInt32BE(daten.length);
    const t = Buffer.from(typ);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, daten])) >>> 0);
    return Buffer.concat([laenge, t, daten, crc]);
  };
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(size, 0);
  kopf.writeUInt32BE(size, 4);
  kopf[8] = 8;
  kopf[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', kopf),
    chunk('IDAT', deflateSync(roh)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// L-förmiger Grundriss als Umriss aus Balken, liegt im sicheren Bereich (maskable) in der Mitte
function grundriss(rechteck) {
  const d = 0.055; // Linienstärke
  const [a, b, c, e, f] = [0.24, 0.76, 0.54, 0.5, 0.76];
  rechteck(a, a, b, a + d, WEISS); // oben
  rechteck(a, a, a + d, f, WEISS); // links
  rechteck(a, f - d, c, f, WEISS); // unten (kurz)
  rechteck(c - d, e, c, f, WEISS); // Innenecke senkrecht
  rechteck(c - d, e - d, b, e, WEISS); // Innenecke waagerecht
  rechteck(b - d, a, b, e, WEISS); // rechts
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const [name, groesse] of [['icon-180.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]]) {
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), png(groesse, grundriss));
  console.log('geschrieben:', name);
}
