// Erzeugt aus dem Build (dist/) eine einzelne HTML-Datei für die veröffentlichte Vorschau.
// Aufruf: node scripts/vorschau.mjs <Zieldatei>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ziel = process.argv[2];
if (!ziel) {
  console.error('Zieldatei fehlt');
  process.exit(1);
}
const dist = new URL('../dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
// Nur das Hauptprogramm (das, was index.html lädt). Nachgeladene Teile (Offline-Speicher) laufen in der Vorschau nicht.
const haupt = /<script[^>]*src="\.\/assets\/([^"]+\.js)"/.exec(html)?.[1];
if (!haupt) throw new Error('Hauptprogramm in index.html nicht gefunden');
const js = readFileSync(join(dist, 'assets', haupt), 'utf8');
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n');

// Das Ersatzzeichen U+FFFD (kommt in der PDF-Bibliothek vor) wird als Escape geschrieben; bedeutet im Code dasselbe.
const jsSicher = js.replace(/<\/script>/g, '<\\/script>').replaceAll('\uFFFD', '\\uFFFD');

const titel = /<title>(.*?)<\/title>/.exec(html)?.[1] ?? 'Grundriss-Skizze';
const body = /<body>([\s\S]*?)<\/body>/.exec(html)?.[1]
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();
if (!body) throw new Error('body nicht gefunden');

const seite = `<title>${titel}</title>
<style>${css}</style>
${body}
<script type="module">${jsSicher}</script>
`;
writeFileSync(ziel, seite);
console.log(`Vorschau geschrieben: ${ziel} (${(seite.length / 1024).toFixed(0)} KB)`);
