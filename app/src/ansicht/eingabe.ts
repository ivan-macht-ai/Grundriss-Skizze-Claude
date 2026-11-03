// Eingabe über Pointer-Events: Stift, Finger und Maus über eine Schnittstelle.
// Regeln:
//  - Werkzeug "Zeichnen": Stift und Maus zeichnen. Ein Finger zeichnet nur, solange noch kein Stift gesehen wurde.
//  - Werkzeug "Verschieben": Stift, Finger und Maus verschieben die Ansicht.
//  - Zwei Finger verschieben und zoomen immer.
//  - Solange der Stift aufliegt, werden Finger ignoriert (Handballen).
//  - Maus: Umschalt + ziehen verschiebt; Mausrad zoomt; Trackpad-Wischen verschiebt.

import { panBy, toWorld, zoomAt, type Viewport } from './viewport';

export interface Strich {
  punkte: { x: number; y: number }[];
  art: 'pen' | 'touch' | 'mouse';
}

export type Werkzeug = 'zeichnen' | 'hand';

export interface EingabeZustand {
  werkzeug: Werkzeug;
  stiftGesehen: boolean;
  handballenIgnoriert: number;
  letzteArt: string;
}

export interface EingabeHaken {
  holeAnsicht(): Viewport;
  setzeAnsicht(vp: Viewport): void;
  neuerStrich(s: Strich): void;
  zeichneNeu(): void;
  zustandGeaendert(): void;
  zeigerBewegt(weltX: number, weltY: number): void;
}

interface Zeiger {
  art: string;
  x: number;
  y: number;
}

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

  const lokal = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const beendeStrich = (behalten: boolean) => {
    if (strich && behalten && strich.punkte.length >= 2) haken.neuerStrich(strich);
    strich = null;
    strichId = null;
    haken.zeichneNeu();
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

    if (e.pointerType === 'touch' && zweiFinger().length >= 2) {
      // Zweiter Finger: laufenden Strich verwerfen, Geste starten
      if (strich) beendeStrich(false);
      verschiebeId = null;
      startGeste();
      haken.zustandGeaendert();
      return;
    }
    const verschiebt =
      zustand.werkzeug === 'hand' ||
      (e.pointerType === 'mouse' && e.shiftKey) ||
      (e.pointerType === 'touch' && zustand.stiftGesehen);
    if (verschiebt) {
      verschiebeId = e.pointerId;
    } else {
      const w = toWorld(haken.holeAnsicht(), p.x, p.y);
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
    zeiger.delete(e.pointerId);
    if (zweiFinger().length < 2) {
      letzteMitte = null;
      letzterAbstand = 0;
    }
    haken.zustandGeaendert();
  };
  canvas.addEventListener('pointerup', (e) => ende(e, false));
  canvas.addEventListener('pointercancel', (e) => ende(e, true));

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      // Trackpad-Wischen (Nachkommastellen oder seitlich) verschiebt; Mausrad und Zwei-Finger-Spreizen zoomen.
      const trackpadWischen = !e.ctrlKey && (e.deltaX !== 0 || !Number.isInteger(e.deltaY));
      if (trackpadWischen) {
        haken.setzeAnsicht(panBy(haken.holeAnsicht(), -e.deltaX, -e.deltaY));
      } else {
        haken.setzeAnsicht(zoomAt(haken.holeAnsicht(), px, py, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
      }
    },
    { passive: false },
  );

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return { aktuellerStrich: () => strich };
}
