/**
 * SLD V3 — INDEKS PRZESTRZENNY PROSTOKĄTÓW (karta S9-9, audyt
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` wiersz S9-9).
 *
 * ROLA. Dwa mechanizmy sceny zadają DOKŁADNIE to samo pytanie — „czy ten
 * prostokąt zachodzi na COKOLWIEK ze zbioru": silnik etykiet przy budowie
 * sceny (`layout/declutter.ts`) i plan etykiet przy skali kamery
 * (`canvas/labelLegibility.ts`). Obie liczyły odpowiedź przeglądem LINIOWYM
 * całego zbioru, więc koszt rósł kwadratowo z liczbą etykiet: na sieci 160
 * stacji plan etykiet kosztował 0,94 s — a liczony jest w ścieżce GESTU
 * (zależność `useMemo` od skali kamery), czyli KAŻDY klik kółka myszy blokował
 * wątek na ~1 s (pomiar S9-9, tabela „przed").
 *
 * MECHANIZM. Jednorodna siatka komórek: prostokąt trafia do każdej komórki,
 * którą pokrywa; zapytanie odwiedza wyłącznie komórki pokryte próbnikiem.
 *
 * SEMANTYKA NIETKNIĘTA — to optymalizacja, nie zmiana reguły. Predykat
 * `anyOverlap` zwraca DOKŁADNIE to samo, co `rects.some((r) => rectsOverlap(probe, r))`:
 *  - indeks jest wyłącznie FILTREM KANDYDATÓW — każdy kandydat i tak przechodzi
 *    przez `rectsOverlap` (to samo źródło prawdy o zachodzeniu, jedna funkcja);
 *  - żadna para zachodząca nie może zostać pominięta: `rectsOverlap` jest
 *    testem OTWARTYM (ostre `<`), więc część wspólna zachodzących prostokątów
 *    ma niezerowe pole, a komórka zawierająca dowolny jej punkt jest pokryta
 *    przez OBA prostokąty — więc obecna w zbiorze komórek obu;
 *  - wynik jest wartością logiczną, więc NIE zależy od kolejności odwiedzania
 *    kandydatów (w przeciwieństwie do „pierwszego trafionego").
 * Konsekwencja: wyjście `declutterLabels` i `planSceneLabels` jest BAJTOWO
 * identyczne przed i po (pin: `__tests__/rectIndex.test.ts` — równoważność z
 * przeglądem liniowym na iloczynie cech + odciski scen w
 * `scene/__tests__/kosztSceny.test.ts`).
 *
 * DETERMINIZM. Czysta arytmetyka, zero DOM/losowości/czasu. Rozmiar komórki i
 * układ kubełków wpływają WYŁĄCZNIE na koszt, nigdy na wynik.
 */

import { rectsOverlap, type V3Rect } from './grid';

/**
 * Bok komórki [px świata]. Dobrany POMIAREM (S9-9): przy 64 rośnie koszt
 * wstawiania długich przęseł magistrali, przy 512 rośnie liczba kandydatów.
 * Wartość NIE wpływa na wynik — wyłącznie na czas.
 */
const CELL = 128;

/**
 * Górna granica liczby komórek na jeden prostokąt. Przęsło magistrali sieci
 * 160 stacji ma ~66 tys. px szerokości, czyli ~520 komórek — mieści się.
 * Prostokąt większy (np. degeneracja układu) idzie do listy przeglądanej
 * ZAWSZE: koszt wstawiania zostaje ograniczony, a predykat bez zmian.
 */
const MAX_CELLS_PER_RECT = 4096;

/** Przesunięcie indeksu komórki do liczb nieujemnych — klucz płaski musi być
 *  różnowartościowy dla współrzędnych ujemnych (scena ma ujemne marginesy). */
const CELL_BIAS = 1 << 20;
const CELL_SPAN = 1 << 21;

/** Klucz płaski komórki. Różnowartościowy dla |cx|,|cy| < 2^20; poza tym
 *  zakresem prostokąt trafia do listy zawsze przeglądanej (patrz `add`). */
function cellKey(cx: number, cy: number): number {
  return (cx + CELL_BIAS) * CELL_SPAN + (cy + CELL_BIAS);
}

function withinKeyRange(c: number): boolean {
  return c > -CELL_BIAS && c < CELL_BIAS;
}

/**
 * Zakres indeksów komórek pokrywanych przez bok prostokąta `[start, start+size]`
 * — DOMKNIĘTY, po obu krańcach, także gdy `size` jest zerowy lub ujemny.
 *
 * DLACZEGO DOMKNIĘTY (dowód braku pominięć). `rectsOverlap` to koniunkcja
 * `a.x < b.x+b.width` i `b.x < a.x+a.width`, czyli warunek OTWARTY — ale
 * NIE jest równoważny przecięciu otwartych przedziałów: prostokąt o zerowej
 * szerokości (odcinek pionowy) MOŻE zachodzić, gdy leży ściśle wewnątrz
 * drugiego. Z obu nierówności wynika jednak, że przedziały DOMKNIĘTE
 * `[min(x, x+w), max(x, x+w)]` obu prostokątów mają punkt wspólny — a `Math.floor`
 * jest niemalejący, więc komórka tego punktu należy do zakresów obu. Stąd:
 * każda para zachodząca dzieli komórkę, czyli indeks nie może pominąć trafienia.
 *
 * Pierwsza wersja tej karty pomijała prostokąty zdegenerowane („nie mogą zajść
 * na nic") — założenie FAŁSZYWE, wykryte testem iloczynu cech
 * (`__tests__/rectIndex.test.ts`) zanim kod trafił do gałęzi.
 */
function zakresKomorek(start: number, size: number): readonly [number, number] {
  const a = start;
  const b = start + size;
  return [Math.floor(Math.min(a, b) / CELL), Math.floor(Math.max(a, b) / CELL)];
}

export interface RectIndex {
  /** Dodaje prostokąt do zbioru. */
  add(rect: V3Rect): void;
  /** `true` ⟺ `probe` zachodzi (wg `rectsOverlap`) na którykolwiek prostokąt zbioru. */
  anyOverlap(probe: V3Rect): boolean;
}

class UniformGridRectIndex implements RectIndex {
  private readonly cells = new Map<number, V3Rect[]>();
  /** Prostokąty spoza siatki (zbyt rozległe lub poza zakresem klucza) —
   *  przeglądane przy KAŻDYM zapytaniu, więc predykat pozostaje pełny. */
  private readonly zawsze: V3Rect[] = [];

  add(rect: V3Rect): void {
    const [cx0, cx1] = zakresKomorek(rect.x, rect.width);
    const [cy0, cy1] = zakresKomorek(rect.y, rect.height);
    const liczbaKomorek = (cx1 - cx0 + 1) * (cy1 - cy0 + 1);
    if (
      !Number.isFinite(liczbaKomorek)
      || liczbaKomorek > MAX_CELLS_PER_RECT
      || !withinKeyRange(cx0) || !withinKeyRange(cx1)
      || !withinKeyRange(cy0) || !withinKeyRange(cy1)
    ) {
      this.zawsze.push(rect);
      return;
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = cellKey(cx, cy);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(rect);
        else this.cells.set(key, [rect]);
      }
    }
  }

  anyOverlap(probe: V3Rect): boolean {
    for (const r of this.zawsze) {
      if (rectsOverlap(probe, r)) return true;
    }
    const [cx0, cx1] = zakresKomorek(probe.x, probe.width);
    const [cy0, cy1] = zakresKomorek(probe.y, probe.height);
    const liczbaKomorek = (cx1 - cx0 + 1) * (cy1 - cy0 + 1);
    if (
      !Number.isFinite(liczbaKomorek)
      || liczbaKomorek > MAX_CELLS_PER_RECT
      || !withinKeyRange(cx0) || !withinKeyRange(cx1)
      || !withinKeyRange(cy0) || !withinKeyRange(cy1)
    ) {
      // PRÓBNIK ROZLEGŁY albo poza zakresem klucza ⇒ przegląd zajętych komórek
      // zamiast wyliczania zakresu. Ta gałąź NIE jest ostrożnością na zapas:
      // bez niej próbnik 10⁷ × 10⁷ px świata kazał przejść 6·10⁹ komórek
      // (zmierzone: 77 s na jednym zapytaniu przy PUSTYM indeksie) — koszt
      // zapytania rósł z POLEM próbnika zamiast z zawartością zbioru.
      // Wykryte testem `__tests__/rectIndex.test.ts` przed scaleniem.
      // Przegląd jest ograniczony rozmiarem indeksu, a predykat pozostaje pełny.
      for (const bucket of this.cells.values()) {
        for (const r of bucket) if (rectsOverlap(probe, r)) return true;
      }
      return false;
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const bucket = this.cells.get(cellKey(cx, cy));
        if (bucket === undefined) continue;
        for (const r of bucket) {
          if (rectsOverlap(probe, r)) return true;
        }
      }
    }
    return false;
  }
}

/** Pusty indeks (do zbiorów budowanych przyrostowo — np. „już zajęte"). */
export function createRectIndex(): RectIndex {
  return new UniformGridRectIndex();
}

/** Indeks zbudowany z gotowego zbioru (np. przeszkody sceny). */
export function buildRectIndex(rects: readonly V3Rect[]): RectIndex {
  const index = new UniformGridRectIndex();
  for (const r of rects) index.add(r);
  return index;
}
