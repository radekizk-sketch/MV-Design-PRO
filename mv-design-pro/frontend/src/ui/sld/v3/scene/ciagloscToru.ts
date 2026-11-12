/**
 * SLD V3 — WYROCZNIA CIĄGŁOŚCI TORU ENERGII NA SCENIE (karta K11-B §0.3,
 * po karcie SLD-SKALA-I-NAWIGACJA — jedna scena niezależna od skali).
 *
 * Dyrektywa właściciela z oceny ekranu 2/10, wymóg 3: tor przepływu energii
 * i aparaty ciągłości elektrycznej (odłącznik/wyłącznik w torze) nie znikają
 * nigdy — od źródła przez magistralę do stacji tor pozostaje wyrysowany.
 * Od karty SLD-SKALA-I-NAWIGACJA (R1) kanwa ma JEDNĄ scenę na migawkę,
 * niezależną od skali kamery; skala steruje wyłącznie gęstością NAPISÓW
 * (`canvas/gestoscInformacji.ts`), a elementy toru nie mają klasy informacji
 * i są rysowane przy każdej skali. Wymóg 3 sprowadza się więc do ciągłości
 * toru TEJ JEDNEJ sceny — a niezależność sceny od skali pilnuje strażnik
 * `scripts/sld_scena_niezalezna_od_skali_guard.py`.
 *
 * ---------------------------------------------------------------------------
 * CO TA WYROCZNIA SPRAWDZA (i dlaczego dokładnie to)
 * ---------------------------------------------------------------------------
 * Trzy asercje, po jednej na możliwy sposób przerwania toru:
 *
 *  1. TOR GŁÓWNY ISTNIEJE — zbiór odcinków korytarza magistrali
 *     (`kind==='snTrunk'`) jest NIEPUSTY. Łapie „scena wycina magistralę".
 *  2. APARATY CIĄGŁOŚCI ISTNIEJĄ — zbiór łączników w torze (wyłącznik/
 *     odłącznik/rozłącznik/bezpiecznik/punkt NO) jest NIEPUSTY. Łapie „scena
 *     wycina łączniki" (rysunek bez łącznika kłamie o możliwości odcięcia).
 *  3. CIĄGŁOŚĆ ŹRÓDŁO→STACJA — dla KAŻDEJ stacji obecnej na scenie istnieje
 *     ścieżka WYRYSOWANYCH elementów od symbolu źródła (sieć zewnętrzna) do
 *     co najmniej jednego elementu tej stacji. Łapie „scena rysuje stacje, ale
 *     gubi odcinki, które je łączą" — najgroźniejszy przypadek, bo wygląda
 *     poprawnie na pierwszy rzut oka.
 *
 * Spójność liczy WSPÓŁDZIELONY `sceneConnectivityIndex` (`buildScene.ts`) —
 * te same reguły dotyku odcinków/portów/stosu pola, których używa
 * `source_connectivity_probe` (spec §14.1). Zero drugiej definicji „połączone".
 *
 * ZERO FIZYKI: wyłącznie topologia rysunku (współrzędne z konstrukcji sceny).
 * Wyrocznia nie czyta impedancji, mocy, wyniku solvera ani STANU łącznika —
 * łącznik otwarty jest dla niej tak samo „wyrysowany" jak zamknięty (rysunek
 * ma pokazywać tor, a stan jest treścią, nie widocznością).
 */
import { sceneConnectivityIndex, type SceneV3 } from './buildScene';
import type { PreviewSegmentKind } from '../compose/preview';
import { CONTINUITY_APPARATUS_SYMBOL_IDS, type SymbolId } from '../symbols/defs';

/**
 * Klasy ODCINKÓW niosące prąd (tor mocy). Deklaracja JAWNA i zamknięta —
 * czyta ją także strażnik statyczny `scripts/sld_scena_niezalezna_od_skali_guard.py`,
 * dla którego jest to kontrakt: usunięcie klasy z tej listy (np. `snTrunk`)
 * to zmiana wymagająca świadomej decyzji, nie cicha edycja.
 */
export const CURRENT_PATH_SEGMENT_KINDS: readonly PreviewSegmentKind[] = [
  'snTrunk',
  'sn',
  'lv',
  'bus',
  'busGpz',
];

// APARATY CIĄGŁOŚCI ELEKTRYCZNEJ — definicja w `symbols/defs.ts` (jedno źródło dla tej
// wyroczni i dla `buildScene.ts`, który nie może importować tego modułu bez cyklu).
export { CONTINUITY_APPARATUS_SYMBOL_IDS } from '../symbols/defs';

export type PathContinuityGapReason =
  | 'brak-toru-glownego'
  | 'brak-aparatow-ciaglosci'
  | 'brak-zrodla'
  | 'stacja-odcieta';

export interface PathContinuityGap {
  readonly reason: PathContinuityGapReason;
  /** Ref elementu, którego dotyczy brak (stacja) albo opis klasy braku. */
  readonly detail: string;
}

/** Tożsamość STACJI z refu właściciela: `stn/<hash>/...` → `stn/<hash>`.
 *  Stacja rozpada się na szynę + pola + aparaty — wszystkie dzielą ten
 *  prefiks. `null` = element nie należy do żadnej stacji (GPZ, magistrala
 *  między stacjami). */
export function stationKeyOfOwnerRef(ownerRef: string | undefined): string | null {
  if (!ownerRef) return null;
  const parts = ownerRef.split('/');
  if (parts.length < 2 || parts[0] !== 'stn' || parts[1].length === 0) return null;
  return `${parts[0]}/${parts[1]}`;
}

/**
 * Braki ciągłości toru na SCENIE. Pusta lista = wymóg 3 karty K11-B spełniony.
 */
export function pathContinuityGaps(scene: SceneV3): readonly PathContinuityGap[] {
  const gaps: PathContinuityGap[] = [];

  // (1) Tor główny.
  const trunkSegments = scene.segments.filter((s) => s.meta?.kind === 'snTrunk');
  if (trunkSegments.length === 0) {
    gaps.push({ reason: 'brak-toru-glownego', detail: "zero odcinków kind==='snTrunk'" });
  }

  // (2) Aparaty ciągłości.
  const continuitySet = new Set<SymbolId>(CONTINUITY_APPARATUS_SYMBOL_IDS);
  const continuityApparatus = scene.symbols.filter((s) => continuitySet.has(s.symbolId));
  if (continuityApparatus.length === 0) {
    gaps.push({
      reason: 'brak-aparatow-ciaglosci',
      detail: `zero symboli z ${CONTINUITY_APPARATUS_SYMBOL_IDS.join('/')}`,
    });
  }

  // (3) Ciągłość źródło→stacja.
  const sourceIndices: number[] = [];
  scene.symbols.forEach((s, i) => {
    if (s.meta?.elementKind === 'source') sourceIndices.push(i);
  });
  const stationKeys = new Set<string>();
  for (const symbol of scene.symbols) {
    const key = stationKeyOfOwnerRef(symbol.meta?.ownerRef);
    if (key) stationKeys.add(key);
  }
  if (sourceIndices.length === 0) {
    // Sieć bez źródła (projekt w budowie) — nie ma od czego liczyć ciągłości;
    // zgłaszamy TYLKO gdy są stacje, które ktoś powinien zasilać (uczciwie:
    // pusty projekt nie jest naruszeniem).
    if (stationKeys.size > 0) {
      gaps.push({ reason: 'brak-zrodla', detail: `${stationKeys.size} stacji bez symbolu źródła na scenie` });
    }
    return gaps;
  }

  const connectivity = sceneConnectivityIndex(scene);
  const sourceRoots = new Set<number>(sourceIndices.map((i) => connectivity.symbolRoot(i)));
  const reachableStations = new Set<string>();
  scene.symbols.forEach((symbol, i) => {
    const key = stationKeyOfOwnerRef(symbol.meta?.ownerRef);
    if (key && sourceRoots.has(connectivity.symbolRoot(i))) reachableStations.add(key);
  });
  scene.segments.forEach((segment, i) => {
    const key = stationKeyOfOwnerRef(segment.meta?.ownerRef);
    if (key && sourceRoots.has(connectivity.segmentRoot(i))) reachableStations.add(key);
  });
  for (const key of [...stationKeys].sort()) {
    if (!reachableStations.has(key)) {
      gaps.push({ reason: 'stacja-odcieta', detail: key });
    }
  }
  return gaps;
}

/** Wymóg 3 karty K11-B spełniony dla tej sceny. */
export function isPathContinuous(scene: SceneV3): boolean {
  return pathContinuityGaps(scene).length === 0;
}
