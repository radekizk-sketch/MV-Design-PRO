/**
 * SLD V3 — SILNIK ETYKIET Z ROZSTRZYGANIEM KOLIZJI (SCHEMAT-10 S2, V12K-135;
 * audyt `docs/sld/AUDYT_SCHEMATOW_OD_ZERA_2026-07.md` §1 D2 + §3 wiersz
 * „Etykiety": „przegrany tekst NIE renderuje się na tym LOD zamiast nachodzić").
 *
 * ROLA. Model rezerwacji miejsca (`layout/labels.ts`) rozwiązuje slotami
 * właścicieli, których rezerwacje są rozłączne Z KONSTRUKCJI. Ale scena dokłada
 * etykiety spoza tego modelu (zakończenia torów, otwarte końce biegów) o
 * geometrii stałej, a inne sieci niż fixtura odniesienia mogą wprowadzić
 * gęstości, których rezerwacje nie przewidziały. `declutterLabels` jest
 * CENTRALNYM, deterministycznym mechanizmem, który na PEŁNYM zbiorze etykiet
 * sceny + bboxach symboli rozstrzyga pozostałe kolizje: przegrany (etykieta o
 * NIŻSZYM priorytecie) NIE jest renderowany na tym LOD, zamiast nachodzić.
 *
 * PRIORYTETY (audyt §3: „S-id > nazwa stacji > moc > parametry"). Symbol
 * (tor elektryczny/aparatura) ZAWSZE wygrywa z etykietą — „tor elektryczny nie
 * znika" (audyt §3, sonda `lod_path_probe`): etykieta nachodząca na JAKIKOLWIEK
 * symbol jest odrzucana niezależnie od priorytetu.
 *
 * DETERMINIZM (spec §P7). Wejście → wyjście czyste i deterministyczne:
 * porządek rozstrzygania to (priorytet malejąco, y rosnąco, x rosnąco,
 * ownerRef rosnąco) — bez losowości/Date/DOM. Ocalałe zwracane w ORYGINALNEJ
 * kolejności wejścia (stabilność względem reszty potoku sceny). Na scenie
 * poprawnie zbudowanej (rezerwacje rozłączne, zero kolizji — jak fixtura
 * odniesienia) mechanizm jest TOŻSAMOŚCIĄ (nie odrzuca niczego), więc nie
 * zmienia istniejącego renderu ani goldenów — działa dopiero, gdy kolizja
 * FAKTYCZNIE wystąpi (regresja rezerwacji albo gęstsza sieć).
 */

import { rectsOverlap, type V3Rect } from '../core/grid';
import type { OwnedLabel, OwnerKind } from './labels';

/**
 * Ranga priorytetu etykiety (wyższa = zachowywana wcześniej). Kolejność wprost
 * z audytu §3 „S-id > nazwa stacji > moc > parametry", uzupełniona o markery
 * operacyjne (stan łącznika NO, numer zabezpieczenia, napięcie szyny) — małe,
 * krytyczne semantycznie, więc chronione przed odrzuceniem przez opisy.
 *
 * `station-name` niesie na L0 KOD stacji (S-id), na L1+ nazwę — oba to warstwa
 * TOŻSAMOŚCI (najwyższa wśród tekstu). `der` to MOC. `segment-*` to PARAMETRY
 * (typ·przekrój·długość) — najniżej wśród treści merytorycznej. Adnotacje
 * pomocnicze (podpis kierunku, rola pola, odbiór nN) — najniżej.
 */
export const LABEL_PRIORITY: Readonly<Record<OwnerKind, number>> = {
  'station-name': 100, // tożsamość: S-id (L0) / nazwa stacji (L1+)
  'busbar-voltage': 95, // tożsamość szyny (napięcie/sekcja)
  'no-point': 90, // marker stanu łączeniowego (NOP) — operacyjny
  'branch-point': 88, // ODG-RYSUNEK: nazwa punktu odgałęźnego — tożsamość obiektu ENM na torze
  protection: 85, // numer urządzenia zabezpieczeniowego (ANSI 52)
  der: 70, // MOC źródła (audyt §3 „moc")
  apparatus: 60, // identyfikator aparatu (Q/QE/T)
  'field-role': 55, // rola pola (pole liniowe/…)
  'port-caption': 40, // podpis kierunku (kier./odg.)
  'segment-span': 30, // PARAMETRY przęsła poziomego (typ·przekrój·długość)
  'segment-lateral': 30, // PARAMETRY przęsła pionowego
  'lv-load': 25, // odbiór zagregowany nN / granica modelu
};

/** Priorytet etykiety wg jej `ownerKind` (audyt §3). */
export function labelPriority(label: OwnedLabel): number {
  return LABEL_PRIORITY[label.ownerKind];
}

/** Pozycja rozstrzygania: priorytet + geometria + tożsamość właściciela.
 *  Wyodrębnione z `resolutionOrder`, żeby warstwa renderu (KD-11,
 *  `canvas/labelLegibility.ts`) rozstrzygała kolizje etykiet POWIĘKSZONYCH
 *  DOKŁADNIE tym samym porządkiem — jedna reguła pierwszeństwa w systemie,
 *  nie dwie. */
export interface LabelResolutionKey {
  readonly priority: number;
  readonly rect: V3Rect;
  readonly ownerRef: string;
}

/**
 * Deterministyczny klucz sortowania rozstrzygania: priorytet malejąco, potem
 * geometria (y, x) i `ownerRef` rosnąco — pełny porządek liniowy (brak remisów
 * zależnych od kolejności wejścia), warunek determinizmu.
 */
export function labelResolutionOrder(a: LabelResolutionKey, b: LabelResolutionKey): number {
  if (a.priority !== b.priority) return b.priority - a.priority; // wyższy priorytet pierwszy
  if (a.rect.y !== b.rect.y) return a.rect.y - b.rect.y;
  if (a.rect.x !== b.rect.x) return a.rect.x - b.rect.x;
  return a.ownerRef < b.ownerRef ? -1 : a.ownerRef > b.ownerRef ? 1 : 0;
}

function resolutionOrder(a: OwnedLabel, b: OwnedLabel): number {
  return labelResolutionOrder(
    { priority: labelPriority(a), rect: a.rect, ownerRef: a.ownerRef },
    { priority: labelPriority(b), rect: b.rect, ownerRef: b.ownerRef },
  );
}

export interface DeclutterResult {
  /** Etykiety ocalałe (renderowane), w ORYGINALNEJ kolejności wejścia. */
  readonly kept: readonly OwnedLabel[];
  /** Etykiety odrzucone (nie renderowane na tym LOD), w kolejności odrzucania. */
  readonly dropped: readonly OwnedLabel[];
}

/**
 * Rozstrzyga kolizje na PEŁNYM zbiorze etykiet sceny + bboxach symboli.
 * Zachłannie w porządku priorytetu (`resolutionOrder`): etykieta jest
 * zachowywana, gdy jej bbox NIE przecina (`rectsOverlap`, tolerancja 0) ani
 * żadnego bboxu symbolu, ani żadnej JUŻ zachowanej etykiety; w przeciwnym
 * razie jest odrzucana (przegrany o niższym/równym priorytecie ustępuje).
 * Symbol zawsze wygrywa — „tor elektryczny nie znika".
 */
export function declutterLabels(
  labels: readonly OwnedLabel[],
  symbolRects: readonly V3Rect[],
): DeclutterResult {
  const ordered = [...labels].sort(resolutionOrder);
  const keptRects: V3Rect[] = [];
  const keptSet = new Set<OwnedLabel>();
  const dropped: OwnedLabel[] = [];

  for (const label of ordered) {
    const hitsSymbol = symbolRects.some((r) => rectsOverlap(label.rect, r));
    const hitsKept = keptRects.some((r) => rectsOverlap(label.rect, r));
    if (hitsSymbol || hitsKept) {
      dropped.push(label);
      continue;
    }
    keptRects.push(label.rect);
    keptSet.add(label);
  }

  // Ocalałe w oryginalnej kolejności wejścia (stabilność potoku/determinizm).
  const kept = labels.filter((l) => keptSet.has(l));
  return { kept, dropped };
}
