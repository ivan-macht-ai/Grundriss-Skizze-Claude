// Eingabe über Pointer-Events: Stift, Finger und Maus über eine Schnittstelle.
// Regeln:
//  - Zwei Finger verschieben und zoomen immer (Werkzeug egal).
//  - Werkzeug "Zeichnen": Stift und Maus zeichnen. Ein Finger zeichnet nur, solange noch kein Stift gesehen wurde,
//    danach verschiebt er die Ansicht.
//  - Werkzeug "Auswählen": Raum antippen wählt ihn, Ziehen verschiebt ihn, Doppeltippen öffnet das Bearbeiten.
//    Ziehen auf leerer Fläche verschiebt die Ansicht.
//  - Solange der Stift aufliegt, werden Finger ignoriert (Handballen).
//  - Touchpad und Mausrad: verschieben in alle Richtungen. Zoomen: Spreizen, Strg + Rad oder Zoomknöpfe.
//  - Maus: Umschalt + ziehen verschiebt ebenfalls die Ansicht.

import { panBy, toWorld, zoomAt, type Viewport } from './viewport';

export interface Strich {
  punkte: { x: number; y: number }[];
  art: 'pen' | 'touch' | 'mouse';
}

export type Werkzeug = 'zeichnen' | 'auswaehlen';

export interface EingabeZustand {
  werkzeug: Werkzeug;
  stiftGesehen: boolean;
  handballenIgnoriert: number;
  /** Wie oft der Browser eine Berührung selbst übernommen hat (zum Beispiel zum Scrollen der Seite) */
  abgebrochen: number;
  /** Mausrad-/Touchpad-Ereignisse: Anzahl und zuletzt gemeldete Werte (zur Fehlersuche) */
  radAnzahl: number;
  radLetzte: string;
  /** Berührungen, die gerade auf der Fläche liegen */
  beruehrungen: number;
  letzteArt: string;
}

export interface EingabeHaken {
  holeAnsicht(): Viewport;
  setzeAnsicht(vp: Viewport): void;
  neuerStrich(s: Strich): void;
  zeichneNeu(): void;
  zustandGeaendert(): void;
  zeigerBewegt(weltX: number, weltY: number): void;
  /** Auswählen: welcher Raum liegt an dieser Stelle (oberster) oder keiner */
  findeRaum(weltX: number, weltY: number): number | null;
  waehleRaum(id: number | null): void;
  startBewegung(id: number): void;
  /** Gesamte Verschiebung seit dem Start in Metern */
  bewegung(dx: number, dy: number): void;
  endeBewegung(bewegt: boolean): void;
  abbruchBewegung(): void;
  doppeltippe(id: number): void;
}

interface Zeiger {
  art: string;
  x: number;
  y: number;
}

const TIPP_WEG = 6; // Pixel: weniger Bewegung zählt als Tippen
const DOPPEL_ZEIT = 420; // Millisekunden
const DOPPEL_WEG = 28; // Pixel

export function verbindeEingabe(
  canvas: HTMLCanvasElement,
  haken: EingabeHaken,
  zustand: EingabeZustand,
): { aktuellerStrich: () => Strich | null } {
  const zeiger = new Map<number, Zeiger>();
  let strich: Strich | null = null;
  let strichId: number | null = null;
  let stiftAuf = false;
  let verschiebeId: number | null = null;
  let letzteMitte: { x: number; y: number } | null = null;
  let letzterAbstand = 0;

  // Raum ziehen (Werkzeug Auswählen)
  let bewegId: number | null = null; // Zeiger-ID
  let bewegRaum: number | null = null;
  let bewegStart: { sx: number; sy: number; wx: number; wy: number } | null = null;
  let bewegt = false;
  let letzterTipp: { zeit: number; sx: number; sy: number; raum: number } | null = null;

  const lokal = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const beendeStrich = (behalten: boolean) => {
    if (strich && behalten && strich.punkte.length >= 2) haken.neuerStrich(strich);
    strich = null;
    strichId = null;
    haken.zeichneNeu();
  };

  const brecheBewegungAb = () => {
    if (bewegRaum !== null) haken.abbruchBewegung();
    bewegId = null;
    bewegRaum = null;
    bewegStart = null;
    bewegt = false;
  };

  const zweiFinger = (): Zeiger[] => [...zeiger.values()].filter((z) => z.art === 'touch');

  const startGeste = () => {
    const f = zweiFinger();
    if (f.length >= 2) {
      letzteMitte = { x: (f[0].x + f[1].x) / 2, y: (f[0].y + f[1].y) / 2 };
      letzterAbstand = Math.hypot(f[0].x - f[1].x, f[0].y - f[1].y);
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    zustand.letzteArt = e.pointerType;
    if (e.pointerType === 'pen') {
      stiftAuf = true;
      zustand.stiftGesehen = true;
    }
    if (e.pointerType === 'touch' && stiftAuf) {
      zustand.handballenIgnoriert++;
      haken.zustandGeaendert();
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    const p = lokal(e);
    zeiger.set(e.pointerId, { art: e.pointerType, x: p.x, y: p.y });
    zustand.beruehrungen = zeiger.size;

    if (e.pointerType === 'touch' && zweiFinger().length >= 2) {
      // Zweiter Finger: laufenden Strich oder Raumzug verwerfen, Geste starten
      if (strich) beendeStrich(false);
      brecheBewegungAb();
      verschiebeId = null;
      startGeste();
      haken.zustandGeaendert();
      return;
    }

    const w = toWorld(haken.holeAnsicht(), p.x, p.y);
    if (zustand.werkzeug === 'auswaehlen') {
      if (e.pointerType === 'mouse' && e.shiftKey) {
        verschiebeId = e.pointerId;
      } else {
        const treffer = haken.findeRaum(w.x, w.y);
        haken.waehleRaum(treffer);
        if (treffer !== null) {
          bewegId = e.pointerId;
          bewegRaum = treffer;
          bewegStart = { sx: p.x, sy: p.y, wx: w.x, wy: w.y };
          bewegt = false;
          haken.startBewegung(treffer);
        } else {
          verschiebeId = e.pointerId;
        }
      }
    } else if ((e.pointerType === 'mouse' && e.shiftKey) || (e.pointerType === 'touch' && zustand.stiftGesehen)) {
      verschiebeId = e.pointerId;
    } else {
      strich = { punkte: [w], art: e.pointerType === 'pen' ? 'pen' : e.pointerType === 'touch' ? 'touch' : 'mouse' };
      strichId = e.pointerId;
    }
    haken.zustandGeaendert();
  });

  canvas.addEventListener('pointermove', (e) => {
    const z = zeiger.get(e.pointerId);
    const p = lokal(e);
    const wp = toWorld(haken.holeAnsicht(), p.x, p.y);
    haken.zeigerBewegt(wp.x, wp.y);
    if (!z) return;
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    z.x = p.x;
    z.y = p.y;

    const f = zweiFinger();
    if (z.art === 'touch' && f.length >= 2 && letzteMitte) {
      const mitte = { x: (f[0].x + f[1].x) / 2, y: (f[0].y + f[1].y) / 2 };
      const abstand = Math.hypot(f[0].x - f[1].x, f[0].y - f[1].y);
      let vp = panBy(haken.holeAnsicht(), mitte.x - letzteMitte.x, mitte.y - letzteMitte.y);
      if (letzterAbstand > 0 && abstand > 0) vp = zoomAt(vp, mitte.x, mitte.y, abstand / letzterAbstand);
      letzteMitte = mitte;
      letzterAbstand = abstand;
      haken.setzeAnsicht(vp);
      return;
    }
    if (e.pointerId === bewegId && bewegStart) {
      if (!bewegt && Math.hypot(p.x - bewegStart.sx, p.y - bewegStart.sy) > TIPP_WEG) bewegt = true;
      if (bewegt) haken.bewegung(wp.x - bewegStart.wx, wp.y - bewegStart.wy);
      return;
    }
    if (e.pointerId === verschiebeId) {
      haken.setzeAnsicht(panBy(haken.holeAnsicht(), dx, dy));
      return;
    }
    if (strich && e.pointerId === strichId) {
      const ereignisse = e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e];
      for (const ev of ereignisse) {
        const q = lokal(ev);
        strich.punkte.push(toWorld(haken.holeAnsicht(), q.x, q.y));
      }
      haken.zeichneNeu();
    }
  });

  const ende = (e: PointerEvent, abbruch: boolean) => {
    if (e.pointerType === 'pen') stiftAuf = false;
    if (e.pointerId === strichId) beendeStrich(!abbruch);
    if (e.pointerId === verschiebeId) verschiebeId = null;
    if (e.pointerId === bewegId && bewegRaum !== null && bewegStart) {
      const raum = bewegRaum;
      const start = bewegStart;
      const warBewegt = bewegt;
      bewegId = null;
      bewegRaum = null;
      bewegStart = null;
      bewegt = false;
      if (abbruch) haken.abbruchBewegung();
      else {
        haken.endeBewegung(warBewegt);
        if (!warBewegt) {
          // Tippen; zwei Tipps kurz hintereinander auf denselben Raum öffnen das Bearbeiten
          const jetzt = performance.now();
          const l = letzterTipp;
          if (
            l &&
            l.raum === raum &&
            jetzt - l.zeit < DOPPEL_ZEIT &&
            Math.hypot(l.sx - start.sx, l.sy - start.sy) < DOPPEL_WEG
          ) {
            letzterTipp = null;
            haken.doppeltippe(raum);
          } else letzterTipp = { zeit: jetzt, sx: start.sx, sy: start.sy, raum };
        }
      }
    }
    zeiger.delete(e.pointerId);
    zustand.beruehrungen = zeiger.size;
    if (zweiFinger().length < 2) {
      letzteMitte = null;
      letzterAbstand = 0;
    }
    haken.zustandGeaendert();
  };
  canvas.addEventListener('pointerup', (e) => ende(e, false));
  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'touch') zustand.abgebrochen++;
    ende(e, true);
  });

  // Mausrad und Touchpad: Zwei Finger auf dem Touchpad (und das Mausrad) verschieben die Ansicht in alle Richtungen.
  // Zoomen geht mit Spreizen auf dem Touchpad, Strg + Mausrad oder den Zoomknöpfen.
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zustand.radAnzahl++;
      zustand.radLetzte = `x ${Math.round(e.deltaX)}, y ${Math.round(e.deltaY)}${e.ctrlKey ? ', Strg' : ''}`;
      haken.zustandGeaendert();
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey) {
        // Spreizen auf dem Touchpad meldet sich als Strg + Rad. Große Sprünge (Mausrad) werden gedeckelt.
        const d = Math.max(-40, Math.min(40, e.deltaY));
        haken.setzeAnsicht(zoomAt(haken.holeAnsicht(), px, py, Math.exp(-d * 0.01)));
      } else {
        // Zeilen- oder Seitenmodus (manche Mäuse) in Pixel umrechnen
        const faktor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
        const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
        haken.setzeAnsicht(panBy(haken.holeAnsicht(), -dx * faktor, -dy * faktor));
      }
    },
    { passive: false },
  );

  // Verhindert, dass die Seite beim Wischen mit zwei Fingern (auch nach oben/unten) mitscrollt oder zoomt.
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return { aktuellerStrich: () => strich };
}
