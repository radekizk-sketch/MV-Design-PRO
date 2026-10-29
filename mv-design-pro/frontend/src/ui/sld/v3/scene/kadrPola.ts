/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — KADR POLA: wycinek sceny `buildSceneV3` obejmujący jedno
 * pole SN (aparaty, przewody port → port, zejście z szyny, odgałęzienia, etykiety aparatów)
 * wraz z szyną, z której pole schodzi.
 *
 * Po co: okno pola (powierzchnia „Pole SN", inspektor pola) pokazuje rysunek pola. Dawniej
 * robił to osobny komponent z własnymi współrzędnymi, własnymi kształtami aparatów i własną
 * (odwrotną do konwencji SCADA) kolorystyką stanu — druga ścieżka rysunku tego samego pola
 * obok kanwy `SldCanvasV3`. Kadr NIE układa niczego: bierze elementy JUŻ policzone przez
 * scenę kanwy (ten sam ENM, ta sama kompozycja, te same glify QET z ramką stanu), więc okno
 * pola i kanwa nie mogą się rozjechać.
 *
 * Przynależność do pola — JEDEN predykat (`czyElementPola`): `ownerRef` równy refowi pola
 * (symbole aparatów) albo zaczynający się od `<pole>#` (przewody, zejście, odgałęzienia,
 * etykiety aparatów). Szyna sekcji jest kontekstem — dołączana, gdy przecina kadr; obcina ją
 * `viewBox`.
 */
import type { OwnedLabel } from '../layout/labels';
import type { RouteVertex } from '../layout/route';
import type { V3Rect } from '../core/grid';
import { GRID } from '../core/grid';
import { klasaWagiOdcinka, type PreviewSegment, type PreviewSymbol } from '../compose/preview';
import { SYMBOL_DEFS } from '../symbols/defs';
import { RAMKA_SCADA_MARGINES } from '../symbols/glyphs';
import type { SceneV3 } from './buildScene';

/** Margines kadru wokół elementów pola (jednostki świata). */
export const MARGINES_KADRU_POLA = 2 * GRID;

export interface KadrPola {
  readonly symbols: readonly PreviewSymbol[];
  /** Odcinki pola oraz szyna sekcji przecinająca kadr (kontekst). */
  readonly segments: readonly PreviewSegment[];
  readonly labels: readonly OwnedLabel[];
  /** Prostokąt kadru we współrzędnych świata sceny (`viewBox`). */
  readonly rect: V3Rect;
}

/** Czy element sceny należy do pola `bayRef` (patrz nagłówek). */
export function czyElementPola(ownerRef: string | undefined, bayRef: string): boolean {
  return ownerRef === bayRef || (ownerRef?.startsWith(`${bayRef}#`) ?? false);
}

const SZYNY = new Set(['bus', 'busGpz']);

function rozszerz(rect: V3Rect | null, x: number, y: number, width = 0, height = 0): V3Rect {
  if (!rect) return { x, y, width, height };
  const x0 = Math.min(rect.x, x);
  const y0 = Math.min(rect.y, y);
  const x1 = Math.max(rect.x + rect.width, x + width);
  const y1 = Math.max(rect.y + rect.height, y + height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function odcinekPrzecina(points: readonly RouteVertex[], r: V3Rect): boolean {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    if (x0 <= r.x + r.width && x1 >= r.x && y0 <= r.y + r.height && y1 >= r.y) return true;
  }
  return false;
}

/**
 * Kadr pola `bayRef` ze sceny. `null` = scena nie ma żadnego symbolu tego pola (pole bez
 * aparatów i bez gałęzi aparatu w modelu albo pole spoza rysunku) — wołający pokazuje
 * jawny stan „brak rysunku", nie zmyślony schemat.
 */
export function kadrPolaZeSceny(scene: SceneV3, bayRef: string): KadrPola | null {
  const symbols = scene.symbols.filter((s) => czyElementPola(s.meta?.ownerRef, bayRef));
  if (symbols.length === 0) return null;
  const wlasneOdcinki = scene.segments.filter((s) => czyElementPola(s.meta?.ownerRef, bayRef));
  const labels = scene.labels.filter((l) => czyElementPola(l.ownerRef, bayRef));

  let rect: V3Rect | null = null;
  for (const s of symbols) {
    const def = SYMBOL_DEFS[s.symbolId];
    // Ramka stanu SCADA wystaje o margines poza gabaryt — kadr ją mieści.
    rect = rozszerz(
      rect,
      s.x - RAMKA_SCADA_MARGINES,
      s.y - RAMKA_SCADA_MARGINES,
      def.width + 2 * RAMKA_SCADA_MARGINES,
      def.height + 2 * RAMKA_SCADA_MARGINES,
    );
  }
  for (const seg of wlasneOdcinki) for (const p of seg.points) rect = rozszerz(rect, p.x, p.y);
  for (const l of labels) rect = rozszerz(rect, l.rect.x, l.rect.y, l.rect.width, l.rect.height);
  const kadr: V3Rect = {
    x: rect!.x - MARGINES_KADRU_POLA,
    y: rect!.y - MARGINES_KADRU_POLA,
    width: rect!.width + 2 * MARGINES_KADRU_POLA,
    height: rect!.height + 2 * MARGINES_KADRU_POLA,
  };
  const szyny = scene.segments.filter(
    (s) => !czyElementPola(s.meta?.ownerRef, bayRef) && SZYNY.has(klasaWagiOdcinka(s.meta)) && odcinekPrzecina(s.points, kadr),
  );
  return { symbols, segments: [...szyny, ...wlasneOdcinki], labels, rect: kadr };
}
