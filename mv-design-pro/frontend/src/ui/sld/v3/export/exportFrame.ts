/**
 * SCHEMAT-10 S4 (V12K-135/136) — kadr fit-do-treści eksportu (D12 „reszta").
 *
 * D12 (audyt §1 „martwe kadry"): S1 naprawiła footprint kolumn layoutu per
 * LOD (`engine/sld-layout/layoutEngine.ts`) — treść WEWNĄTRZ sceny już nie
 * tonie w pustce zarezerwowanej pod L0. Ta karta naprawia OSTATNIE ogniwo:
 * kadr WIDOCZNY na eksporcie. `SldCanvasV3.tsx` renderuje korzeń `<svg
 * viewBox={viewBox}>`, gdzie `viewBox` pochodzi z KAMERY (pan/zoom
 * użytkownika, dopasowanej do rozmiaru KONTENERA ekranu — `camera.ts`
 * `computeInitialCameraState`/`fitToView`). Kontener ekranu ma DOWOLNY
 * aspect ratio (panel przeglądarki) — jeśli różni się od aspektu treści,
 * fit-to-view zostawia pasy martwego tła po bokach/górze/dole. To jest
 * OK na ekranie (interaktywna kamera, użytkownik może dopasować), ale
 * NIEPOŻĄDANE w PLIKU eksportu (statyczny, ma pokazywać WYŁĄCZNIE treść).
 *
 * Naprawa: eksport IGNORUJE kamerę i liczy WŁASNY kadr wprost z bboxa sceny
 * — DOKŁADNIE ta sama formuła co `SheetFrame` (`sheet/Frame.tsx`) używa dla
 * WŁASNEGO wewnętrznego `<svg>` (`svgWidth = sheetSize.width + 2×margines`)
 * — więc kadr zewnętrzny (ten moduł) i ramka wewnętrzna (`SheetFrame`)
 * kończą z IDENTYCZNYMI wymiarami: zero dodatkowego marginesu do
 * kalibrowania, zero rozjazdu między „co widać" i „co jest".
 */
import { sheetSizeFor } from '../sheet/outline';
import { FRAME_MARGIN } from '../sheet/Frame';
import type { SceneV3 } from '../scene/buildScene';

export interface ContentFitFrame {
  /** `viewBox` SVG gotowy do wstawienia (`"0 0 width height"`). */
  readonly viewBox: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Kadr = bbox treści (`sheetSizeFor`, TA SAMA funkcja co `SheetFrame` własny
 * rozmiar) + margines ramki (`FRAME_MARGIN`, TA SAMA stała). Czysta funkcja
 * — zero DOM, testowalna na samej scenie.
 */
export function computeContentFitFrame(scene: SceneV3): ContentFitFrame {
  const sheetSize = sheetSizeFor(scene);
  const width = sheetSize.width + FRAME_MARGIN * 2;
  const height = sheetSize.height + FRAME_MARGIN * 2;
  return { viewBox: `0 0 ${width} ${height}`, width, height };
}

/**
 * Miara „martwych pól" (audyt D12: dead ≤20% kadru na L0/L1 ⇔ ten stosunek
 * ≥ 0,8) — powierzchnia treści (bbox sceny) do powierzchni kadru
 * (bbox treści + margines ramki). Margines jest stałą MAŁĄ (2×32px) względem
 * typowej sieci SN (setki-tysiące px) — stosunek rośnie do 1 wraz z
 * rozmiarem sieci, więc próg 0,8 jest zapasem, nie granicą ledwo spełnioną.
 */
export function contentFitRatio(scene: SceneV3): number {
  const frame = computeContentFitFrame(scene);
  const contentArea = Math.max(scene.bbox.width, 0) * Math.max(scene.bbox.height, 0);
  const frameArea = frame.width * frame.height;
  if (frameArea <= 0) return 0;
  return contentArea / frameArea;
}

/**
 * Nadpisuje `viewBox`/`width`/`height` węzła SVG na kadr fit-do-treści —
 * mutacja WYŁĄCZNIE atrybutów XML (nigdy `style`, więc zero ryzyka
 * normalizacji CSSOM, patrz `exportPalette.ts` nagłówek dla analogicznego
 * zagadnienia). Wołający MUSI dostarczyć KLON (nie żywy węzeł ekranu) —
 * kadr eksportu nie może zmieniać kamery/pan/zoom użytkownika oglądającego
 * kanwę (`SldCanvasV3Workspace.handleExportSvg` klonuje przed wywołaniem).
 */
export function applyContentFitFrame(svgEl: SVGSVGElement, scene: SceneV3): void {
  const frame = computeContentFitFrame(scene);
  svgEl.setAttribute('viewBox', frame.viewBox);
  svgEl.setAttribute('width', String(frame.width));
  svgEl.setAttribute('height', String(frame.height));
}
