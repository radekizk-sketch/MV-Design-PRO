/**
 * SLD V3 — OBRYS ARKUSZA: jedno źródło prawdy o tym, gdzie kończy się rysunek.
 *
 * DLACZEGO OSOBNY MODUŁ (karta RAMKA-TNIE-PODPISY, reguła KLASA §3
 * „predykaty parami"). Rozmiar etykiety miał do tej karty DWA niezależne
 * źródła prawdy:
 *
 *   · REZERWACJA — `layout/measure.ts` → `layout/labels.ts`
 *     (`labelReservationRect`) → `scene.bbox` → `sheetSizeFor` → prostokąt
 *     `sld-sheet-border` rysowany przez `sheet/Frame.tsx`. Liczona pismem
 *     NATURALNYM klasy typograficznej;
 *   · MALOWANIE — `canvas/labelLegibility.ts`, które przy skali poniżej progu
 *     czytelności POWIĘKSZA pismo (do 9× dla klasy `t1`), żeby napis miał na
 *     ekranie `MIN_READABLE_LABEL_SCREEN_PX`.
 *
 * Zgadzały się wyłącznie tam, gdzie powiększenie nie działa. POMIAR stanu
 * przed (fixtura 53 stacji, kadr 1800×1100, `scripts/pomiar_ramka.tsx`):
 * dolna krawędź arkusza L0 = 5195, rezerwacja nazwy stacji ostatniego wiersza
 * kończy się DOKŁADNIE na 5195 (zero luzu), a malowany napis przy skali
 * dopasowania 0,181 sięga 5231,7 — czyli **36,7 j.św. POD ramką**, która
 * przechodzi wtedy przez środek liter „S51"/„S52"/„S53". Ta sama klasa defektu
 * na trzech krawędziach i obu sieciach fixturowych: prawa −282 j. (L2 @0,30,
 * podpis pola „FT1 · transformatorowe"), lewa −39,5 j. (L0, opis zbiorczy GPZ
 * przy KAŻDEJ skali roboczej — tam pismo nie jest nawet powiększane, tylko
 * tekst jest szerszy od własnego slotu), dół −52,3 j. (długi ciąg, L0 @fit).
 *
 * ROZSTRZYGNIĘCIE: obrys arkusza mieszka TUTAJ i jest czytany przez OBIE
 * strony pary — `sheet/Frame.tsx` (rysuje ramkę) i `canvas/labelLegibility.ts`
 * (plan malowania nie wypuszcza tuszu poza obrys, a napis, który się nie
 * mieści, trafia do licznika „Ukryto N opisów" — tak samo jak napis odrzucony
 * przez sufit proporcji). Moduł jest CZYSTY (bez React/DOM), żeby mógł go
 * importować zarówno plan etykiet, jak i tor eksportu, bez cyklu przez
 * komponent kanwy.
 */

import type { V3Rect } from '../core/grid';
import type { SceneV3 } from '../scene/buildScene';

/** Rozmiar obszaru rysunku [j.św.] — bez marginesu ramki (`FRAME_MARGIN`). */
export interface SheetOutline {
  readonly width: number;
  readonly height: number;
}

/**
 * Rozmiar arkusza (spec §2/§10) obejmujący cały bbox sceny. Arkusz zaczyna się
 * w (0,0), więc rozmiarem jest PRAWA-DOLNA krawędź bboxa (`scene.bbox` jest
 * unią prostokątów symboli, odcinków, REZERWACJI etykiet i ramy strefy GPZ —
 * patrz `scene/buildScene.ts` sekcja 9).
 *
 * SCHEMAT-10 S4 (V12K-135/136, D12 reszta): `v3/export/exportFrame.ts` reużywa
 * DOKŁADNIE tę samą formułę dla kadru fit-do-treści eksportu (0 duplikacji
 * marginesu treści).
 */
export function sheetSizeFor(scene: SceneV3): SheetOutline {
  return {
    width: Math.max(scene.bbox.x + scene.bbox.width, 0),
    height: Math.max(scene.bbox.y + scene.bbox.height, 0),
  };
}

/**
 * Czy prostokąt (TUSZ napisu, glif, cokolwiek malowanego) mieści się w obrysie
 * arkusza. Tolerancja 1e-9 — rezerwacje dotykają krawędzi DOKŁADNIE (nazwa
 * stacji ostatniego wiersza kończy się na `bbox.height` co do jednostki), więc
 * porównanie bez tolerancji odrzucałoby napisy stojące legalnie na krawędzi
 * przez błąd arytmetyki zmiennoprzecinkowej.
 */
export function rectWithinSheet(rect: V3Rect, sheet: SheetOutline): boolean {
  const eps = 1e-9;
  return (
    rect.x >= -eps &&
    rect.y >= -eps &&
    rect.x + rect.width <= sheet.width + eps &&
    rect.y + rect.height <= sheet.height + eps
  );
}
