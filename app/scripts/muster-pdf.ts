// Schreibt das Muster-PDF in eine Datei. Aufruf: npx vite-node scripts/muster-pdf.ts <Zieldatei>
import { writeFileSync } from 'node:fs';
import { erzeugeMusterPdf } from '../src/pdf/musterPdf';

const ziel = process.argv[2] ?? 'muster.pdf';
writeFileSync(ziel, await erzeugeMusterPdf());
console.log(`Geschrieben: ${ziel}`);
