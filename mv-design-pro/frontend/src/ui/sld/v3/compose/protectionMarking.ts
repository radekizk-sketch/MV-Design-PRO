/**
 * SLD V3 F9.9 — oznaczenie zabezpieczeń ANSI/IEEE C37.2 (SLD_CAD_SPEC_V3 §17,
 * Poprawka A2). Jedno źródło prawdy dla OBECNOŚCI/GABARYTU kolumny adnotacji
 * (`layout/measure.ts`, rezerwacja) i ROZWIĄZANIA kotwicy/toru wyzwalania
 * (`compose/station.ts`/`compose/gpz.ts`, rysunek) — wzorzec
 * `apparatusSequence.ts` (F9.3): jedna funkcja wołana przez OBA miejsca, żeby
 * rezerwacja miejsca i realny rysunek nigdy się nie rozjechały.
 *
 * Dane (§17.2, zero zgadywania):
 *  - Kody przekaźnika: `Bay.protection_codes` (WYŁĄCZNIE gdy niepuste) —
 *    adapter (`v2/canvas/enmToSldAdapter.ts` `resolveBayProtectionMarking`)
 *    projektuje 1:1 na `MiniBlockBayDescriptor.protectionMarking.codes`.
 *  - Tor wyzwalania: `Bay.protection_ref` → `ProtectionAssignment.breaker_ref`
 *    — adapter rozwiązuje SUROWY ref ENM (`protectionMarking.breakerRef`);
 *    dopasowanie na KONKRETNY aparat w NARYSOWANYM stosie (`device_ref` match)
 *    dzieje się TU (compose zna geometrię/kolejność rysowania, adapter nie) —
 *    `resolveStationProtectionMarking` niżej. Brak dopasowania = brak linii
 *    (nigdy linia do „domyślnego" aparatu, §17.2 dosłownie).
 *  - Kotwica: `ProtectionAssignment.ct_ref` rozwiązany na CT stosu pola, gdy
 *    brak CT — przy wyłączniku (§17.2). Gdy ANI CT ANI wyłącznik nie
 *    rozwiązują się (dane niespójne) — kotwica geometryczna spada na
 *    pierwszy aparat stosu (WYŁĄCZNIE pozycjonowanie okręgu, NIE asercja
 *    połączenia — tor wyzwalania pozostaje nierozwiązany niezależnie).
 *  - Miernik: `Measurement.purpose==='metering'` z `bay_ref` — adapter
 *    projektuje `meteringMeasurementRef` (ref pomiaru), TU dopasowywany na
 *    aparat CT/VT stosu przez `BayPrimaryDevice.linked_ref` (wzorzec
 *    potwierdzony w `backend/src/application/field_read_model.py:488`:
 *    `linked_ref=measurement.ref_id` dla aparatów pomiarowych pola).
 */

import { GRID, snapUp } from '../core/grid';
import { measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';

/** Średnica okręgu adnotacji (przekaźnik/miernik) — spec §17.3: 24px = 3×GRID. */
export const PROTECTION_ANNOTATION_DIAMETER = 3 * GRID;

/**
 * Szczegółowość warstwy adnotacji zabezpieczeń per LOD (spec §17.4, B-1
 * recenzji F9.9) — JEDNA prawda dla `compose/station.ts` i `compose/gpz.ts`
 * (wołający `scene/buildScene.ts` wywodzi wartość z LOD sceny przez
 * `protectionAnnotationDetailForLod` niżej):
 *  - `'full'`        (L2): okrąg + kody + tor wyzwalania + „52" + „M" + pełna
 *                     lista kodów (>2, §17.3 zd. 2).
 *  - `'circle-only'` (L1): SAM okrąg przekaźnika BEZ kodów; tor wyzwalania
 *                     ukryty; „52"/„M"/pełna lista nieobecne (§17.4 dosłownie).
 *  - `'none'`        (L0): warstwa adnotacji nieobecna (plan sieci).
 */
export type ProtectionAnnotationDetail = 'full' | 'circle-only' | 'none';

export function protectionAnnotationDetailForLod(lod: 0 | 1 | 2): ProtectionAnnotationDetail {
  if (lod === 2) return 'full';
  if (lod === 1) return 'circle-only';
  return 'none';
}

/**
 * Tekst PEŁNEJ listy kodów (spec §17.3 zdanie 2: „większa liczba funkcji →
 * w okręgu dwie najważniejsze..., pełna lista w etykiecie slotu pola") —
 * `null` gdy kodów ≤2 (okrąg niesie je w całości, slot zbędny — R-2
 * rozstrzygnięcia recenzji F9.9). Separator „·" jak w etykietach przepływu
 * F9.5 (spójna typografia adnotacji).
 */
export function fullCodesListText(codes: readonly string[]): string | null {
  return codes.length > 2 ? codes.join(' · ') : null;
}

/** Klasa typograficzna pełnej listy kodów — t4 (8px, „adnotacje",
 *  `core/text.ts`), ta sama co „52" (§17.3 „etykieta 8 px"). */
export const PROTECTION_FULL_LIST_LABEL_CLASS = 't4' as const;

type ProtectionAwareBay = Pick<MiniBlockBayDescriptor, 'protectionMarking' | 'meteringMeasurementRef'>;

/**
 * Czy pole NIESIE dane adnotacji zabezpieczeń (§17.2/§17.3: „kolumna istnieje
 * TYLKO dla pól z danymi") — kody przekaźnika NIEPUSTE lub rozwiązany
 * miernik. Jedna prawda dla `layout/measure.ts` (rezerwacja) i `compose/
 * station.ts` (rysunek).
 */
export function bayHasProtectionAnnotation(bay: ProtectionAwareBay): boolean {
  return (bay.protectionMarking?.codes.length ?? 0) > 0 || bay.meteringMeasurementRef != null;
}

/**
 * Szerokość DODATKOWA kolumny pola (spec §5.1, §17.3) — GRID (prześwit od
 * stosu/oznacznika) + max(gabaryt okręgu, szerokość pełnej listy kodów gdy
 * >2 funkcji — R-2: pełna lista MUSI być na rysunku, więc measure MUSI ją
 * zarezerwować; `snapUp + GRID` = zapas na `snapToGrid` pozycji etykiety,
 * żeby prostokąt nigdy nie wystawał poza rezerwację). TYLKO gdy pole niesie
 * dane (§17.2). Zero, gdy brak danych (zero zmian geometrii dla pól bez
 * zabezpieczeń — zgodne z „brak danych = brak oznaczenia").
 *
 * UWAGA (LOD): rezerwacja jest funkcją DANYCH, nie LOD — measure nie zna
 * LOD (kontrakt F2); na L1 (`'circle-only'`) kolumna jest zarezerwowana w
 * pełnej szerokości mimo że rysuje się sam okrąg — nadmiar to pusta
 * przestrzeń (bez kolizji z konstrukcji), nie defekt.
 */
export function protectionAnnotationColumnWidth(bay: ProtectionAwareBay): number {
  if (!bayHasProtectionAnnotation(bay)) return 0;
  const fullList = fullCodesListText(bay.protectionMarking?.codes ?? []);
  const fullListWidth = fullList
    ? snapUp(measureLabelWidth(fullList, PROTECTION_FULL_LIST_LABEL_CLASS)) + GRID
    : 0;
  return GRID + Math.max(PROTECTION_ANNOTATION_DIAMETER, fullListWidth);
}

/**
 * Aparat już umieszczony w stosie — podzbiór strukturalny `ComposedSymbolInstance`
 * (`compose/station.ts`); import typu wprost tworzyłby cykl (station.ts
 * importuje TEN plik), więc podzbiór strukturalny wystarczający do
 * dopasowania referencji ENM.
 */
export interface PlacedStackDevice {
  readonly symbolId: SymbolId;
  readonly deviceRef?: string;
  readonly linkedRef?: string;
  readonly x: number;
  readonly y: number;
}

function centerOf(device: PlacedStackDevice): { readonly x: number; readonly y: number } {
  const def = SYMBOL_DEFS[device.symbolId];
  return { x: device.x + def.width / 2, y: device.y + def.height / 2 };
}

export interface ResolvedProtectionMarking {
  readonly codes: readonly string[];
  /** Punkt zaczepienia OKRĘGU (§17.2/§17.3) — ZAWSZE obecny gdy `codes`
   *  niepuste i stos niepusty (pozycjonowanie geometryczne — patrz nagłówek
   *  pliku, gałąź „dane niespójne"). */
  readonly anchor: PlacedStackDevice;
  /** Aparat WYŁĄCZNIKA, do którego prowadzi tor wyzwalania — `null` gdy
   *  `ProtectionAssignment.breaker_ref` nierozwiązywalny na aparat NARYSOWANEGO
   *  stosu (§17.2: „nigdy linia do domyślnego aparatu") — wołający NIE rysuje
   *  linii i zgłasza `bay.protection.trip_link_unresolved`. */
  readonly tripTarget: PlacedStackDevice | null;
}

/**
 * Rozstrzyga adnotację zabezpieczeń JEDNEGO pola na już zbudowanym stosie
 * (spec §17.2/§17.3) — `null` gdy pole nie niesie kodów LUB stos jest pusty
 * (nie powinno się zdarzyć — obrona, nie fabrykacja).
 */
export function resolveStationProtectionMarking(
  bay: Pick<MiniBlockBayDescriptor, 'protectionMarking'>,
  stack: readonly PlacedStackDevice[],
): ResolvedProtectionMarking | null {
  const codes = bay.protectionMarking?.codes ?? [];
  if (codes.length === 0 || stack.length === 0) return null;

  const breakerRef = bay.protectionMarking?.breakerRef;
  const ctRef = bay.protectionMarking?.ctRef;

  const tripTarget =
    (breakerRef && stack.find((d) => d.symbolId === 'breaker' && d.deviceRef === breakerRef)) || null;
  const ctAnchor =
    (ctRef && stack.find((d) => d.symbolId === 'currentTransformer' && d.deviceRef === ctRef)) || null;

  // §17.2: kotwica przy CT (rozwiązanym), gdy brak CT — przy wyłączniku.
  // Gdy ŻADNE z dwóch nie rozwiązuje się na aparat stosu (dane niespójne —
  // protection_ref wskazuje na assignment którego refy nie pasują do TEGO
  // pola), okrąg NADAL musi się gdzieś narysować (kody SĄ, §17.2 „brak danych
  // = brak oznaczenia" nie dotyczy tego przypadku — dane SĄ, tylko link jest
  // złamany) — pada na pierwszy aparat WYŁĄCZNIKA stosu jeśli istnieje,
  // inaczej pierwszy element stosu. To WYŁĄCZNIE pozycjonowanie geometryczne
  // (nie asercja połączenia) — `tripTarget` pozostaje `null` niezależnie.
  const fallbackAnchor = stack.find((d) => d.symbolId === 'breaker') ?? stack[0];
  const anchor = ctAnchor ?? tripTarget ?? fallbackAnchor;

  return { codes, anchor, tripTarget };
}

/**
 * Rozstrzyga kotwicę MIERNIKA „M" (§17.2: `Measurement.purpose==='metering'`
 * powiązany z polem) na już zbudowanym stosie — dopasowanie przez
 * `BayPrimaryDevice.linked_ref === Measurement.ref_id` (patrz nagłówek
 * pliku). `null` gdy brak pomiaru dla pola LUB brak dopasowania w stosie
 * (zero zgadywania — miernik NIE jest rysowany bez jednoznacznej kotwicy).
 */
export function resolveMeterAnchor(
  meteringMeasurementRef: string | null | undefined,
  stack: readonly PlacedStackDevice[],
): PlacedStackDevice | null {
  if (!meteringMeasurementRef) return null;
  return (
    stack.find(
      (d) =>
        (d.symbolId === 'currentTransformer' || d.symbolId === 'voltageTransformer') &&
        d.linkedRef === meteringMeasurementRef,
    ) ?? null
  );
}

export { centerOf as protectionDeviceCenter };
