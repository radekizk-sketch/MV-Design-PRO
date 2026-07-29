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
 *
 * F10.4 (SLD_CAD_SPEC_V3 §18.3, CT opisany — część BEZ-DOMAIN): okrąg CT
 * (`symbolId==='currentTransformer'`) toru głównego dostaje etykietę
 * identyfikator+przekładnia, WYŁĄCZNIE gdy `Measurement.rating` obecny dla
 * TEGO aparatu (adapter projektuje `MiniBlockBayDescriptor.
 * ctRatingAnnotations`, jedna pozycja per CT z ratingiem — `resolveBayCtRating
 * Annotations`, `v2/canvas/enmToSldAdapter.ts`). Dopasowanie na aparat
 * NARYSOWANEGO stosu — TA SAMA reguła co miernik: `measurementRef ===
 * linked_ref`. F10.6 (D3, DOMAIN): układ pomiarowy (3×CT fazowe / przekładnik
 * sumujący Ferranti-I0, `Measurement.ct_arrangement`) dokleja TRZECI człon do
 * etykiety (`ctArrangementLabelText` niżej), GDY dane obecne — glif
 * `currentTransformer` sam pozostaje jeden niezależnie od danych (spec §18.3
 * dopuszcza „wariant symbolu LUB adnotacji"; wybrano adnotację — zero nowego
 * glifu).
 */

import { GRID, snapUp } from '../core/grid';
import { measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import type {
  CtRatingAnnotationView,
  MiniBlockBayDescriptor,
  VtMountingAnnotationView,
} from '../../v2/renderer/MiniBlockRmuRenderer';

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

type ProtectionAwareBay = Pick<
  MiniBlockBayDescriptor,
  'protectionMarking' | 'meteringMeasurementRef' | 'ctRatingAnnotations' | 'vtMountingAnnotations'
>;

/**
 * Czy pole NIESIE dane adnotacji zabezpieczeń (§17.2/§17.3: „kolumna istnieje
 * TYLKO dla pól z danymi") — kody przekaźnika NIEPUSTE, rozwiązany miernik,
 * (F10.4, §18.3) co najmniej jedna adnotacja przekładni CT, LUB (CTVT-RENDER,
 * §20.2) co najmniej jedna adnotacja montażu VT. Jedna prawda dla
 * `layout/measure.ts` (rezerwacja) i `compose/station.ts` (rysunek).
 */
export function bayHasProtectionAnnotation(bay: ProtectionAwareBay): boolean {
  return (
    (bay.protectionMarking?.codes.length ?? 0) > 0
    || bay.meteringMeasurementRef != null
    || (bay.ctRatingAnnotations?.length ?? 0) > 0
    || (bay.vtMountingAnnotations?.length ?? 0) > 0
  );
}

/** Etykieta PL układu pomiarowego CT (§18.3, F10.6, D3) — `null` gdy dana
 *  niedostarczona (adnotacja pozostaje bez członu układu, zero zgadywania). */
export function ctArrangementLabelText(
  arrangement: CtRatingAnnotationView['arrangement'] | null | undefined,
): string | null {
  if (arrangement === '3xCT') return '3×CT';
  if (arrangement === 'ferranti') return 'Ferranti-I0';
  return null;
}

/** Etykieta PL liczby rdzeni CT (§20.2, CTVT-RENDER) — `null` gdy dana
 *  niedostarczona LUB niepoprawna (≤0). „N rdz." = N rdzeni (uzwojeń wtórnych,
 *  IEC 61869-2). Zero zgadywania: człon dokleja się WYŁĄCZNIE dla realnej danej
 *  `Measurement.ct_cores`. */
export function ctCoresLabelText(cores: number | null | undefined): string | null {
  if (cores == null || !Number.isFinite(cores) || cores <= 0) return null;
  return `${cores} rdz.`;
}

/**
 * Tekst etykiety adnotacji CT (§18.3: „identyfikator aparatu i przekładnię,
 * np. «T1 · 300/5»") — separator „·" jak w pełnej liście kodów §17.3/podpisie
 * linii §19.2 (spójna typografia adnotacji). F10.6 (D3): gdy `arrangement`
 * obecny, doklejony jako trzeci człon („T1 · 300/5 · 3×CT"). CTVT-RENDER
 * (CTVT-MODEL/V12K-176): gdy `cores` obecne, doklejone jako KOLEJNY człon
 * („T1 · 300/5 · 3×CT · 2 rdz.") — brak `cores` pozostawia tekst F10.4/F10.6
 * bez zmian (zero dryfu bez danych). JEDNA funkcja dla rezerwacji szerokości
 * (`ctRatingAnnotationsWidth` niżej) i rysunku (`resolveCtRatingAnnotations`
 * niżej) — zero rozjazdu tekst↔szerokość.
 */
export function ctRatingLabelText(
  entry: Pick<CtRatingAnnotationView, 'identifier' | 'ratioText' | 'arrangement' | 'cores'>,
): string {
  const members = [`${entry.identifier} · ${entry.ratioText}`];
  const arrangementLabel = ctArrangementLabelText(entry.arrangement);
  if (arrangementLabel) members.push(arrangementLabel);
  const coresLabel = ctCoresLabelText(entry.cores);
  if (coresLabel) members.push(coresLabel);
  return members.join(' · ');
}

/** Etykieta PL montażu VT (§20.2, CTVT-RENDER) — `bus`⇒„szynowy",
 *  `cable`⇒„kablowy". Dana producenta/projektowa `Measurement.vt_mounting`. */
export function vtMountingLabelText(
  mounting: VtMountingAnnotationView['mounting'],
): string {
  return mounting === 'bus' ? 'szynowy' : 'kablowy';
}

/**
 * Tekst etykiety adnotacji montażu VT (§20.2, CTVT-RENDER) — „identyfikator ·
 * montaż" (np. „V1 · kablowy"), separator „·" spójny z etykietą CT. JEDNA
 * funkcja dla rezerwacji szerokości (`vtMountingAnnotationsWidth` niżej) i
 * rysunku (`resolveVtMountingAnnotations` niżej).
 */
export function vtMountingAnnotationLabelText(
  entry: Pick<VtMountingAnnotationView, 'identifier' | 'mounting'>,
): string {
  return `${entry.identifier} · ${vtMountingLabelText(entry.mounting)}`;
}

/**
 * Szerokość DODATKOWA na adnotacje przekładni CT (§18.3, F10.4) — 0, gdy
 * pole nie niesie żadnego `ctRatingAnnotations` (zero zmian geometrii dla
 * pól bez danych). Inaczej `GRID` (prześwit od toru głównego) + najszerszy
 * pojedynczy tekst „identyfikator · przekładnia" spośród adnotacji pola
 * (zwykle jedna pozycja — jeden CT toru głównego; wiele pozycji to defensywa
 * na przyszłość, np. strefa 87T z 2×CT, F10.6). DODAWANA (nie max()owana) do
 * `protectionAnnotationColumnWidth` niżej — adnotacja CT zajmuje WŁASNE pasmo
 * tuż za torem głównym (`compose/station.ts`, zaczep
 * `stackLeftX+planFootprint.width`, TA SAMA krawędź co sidecar oznaczenia
 * funkcyjnego pola), podczas gdy okrąg przekaźnika/miernik/pełna lista kodów
 * są PRAWO-wyrównane do końca CAŁEJ rezerwacji — dwa różne pasma tej samej
 * kolumny, oba muszą się zmieścić jednocześnie (SUMA, nie MAX).
 */
export function ctRatingAnnotationsWidth(bay: ProtectionAwareBay): number {
  const entries = bay.ctRatingAnnotations ?? [];
  if (entries.length === 0) return 0;
  const maxWidth = Math.max(
    ...entries.map((entry) => measureLabelWidth(ctRatingLabelText(entry), PROTECTION_FULL_LIST_LABEL_CLASS)),
  );
  return GRID + maxWidth;
}

/**
 * Szerokość DODATKOWA na adnotacje montażu VT (§20.2, CTVT-RENDER) — 0, gdy
 * pole nie niesie żadnego `vtMountingAnnotations` (zero zmian geometrii dla pól
 * bez danych). Inaczej `GRID` (prześwit) + najszerszy tekst „identyfikator ·
 * montaż" pola. Etykieta VT leży w TYM SAMYM lewym paśmie co adnotacja CT
 * (zaczep `stackLeftX+planFootprint.width`, placement 'right') — VT i CT
 * kotwiczą na RÓŻNYCH aparatach (różne Y), więc pasmo musi zmieścić SZERSZY z
 * dwóch (`Math.max` w `protectionAnnotationColumnWidth` niżej, nie suma).
 */
export function vtMountingAnnotationsWidth(bay: ProtectionAwareBay): number {
  const entries = bay.vtMountingAnnotations ?? [];
  if (entries.length === 0) return 0;
  const maxWidth = Math.max(
    ...entries.map((entry) => measureLabelWidth(vtMountingAnnotationLabelText(entry), PROTECTION_FULL_LIST_LABEL_CLASS)),
  );
  return GRID + maxWidth;
}

/**
 * Szerokość DODATKOWA kolumny pola (spec §5.1, §17.3) — GRID (prześwit od
 * stosu/oznacznika) + max(gabaryt okręgu, szerokość pełnej listy kodów gdy
 * >2 funkcji — R-2: pełna lista MUSI być na rysunku, więc measure MUSI ją
 * zarezerwować; `snapUp + GRID` = zapas na `snapToGrid` pozycji etykiety,
 * żeby prostokąt nigdy nie wystawał poza rezerwację) + (F10.4, §18.3)
 * `ctRatingAnnotationsWidth` (pasmo ODRĘBNE, zsumowane — patrz docstring
 * wyżej). TYLKO gdy pole niesie dane (§17.2/§18.3). Zero, gdy brak danych
 * (zero zmian geometrii dla pól bez adnotacji — zgodne z „brak danych = brak
 * oznaczenia"; fixtura referencyjna: 0 `measurements` ⇒ ta gałąź bez zmian).
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
  const hasRelayOrMeter = (bay.protectionMarking?.codes.length ?? 0) > 0 || bay.meteringMeasurementRef != null;
  const relayMeterWidth = hasRelayOrMeter ? GRID + Math.max(PROTECTION_ANNOTATION_DIAMETER, fullListWidth) : 0;
  // CTVT-RENDER (§20.2): adnotacja CT i VT leżą w TYM SAMYM lewym paśmie
  // (różne Y — różne aparaty), więc pasmo = SZERSZA z dwóch (max, nie suma);
  // dla pola bez VT `vtMountingAnnotationsWidth===0` ⇒ max = szerokość CT
  // (zero regresji dla pól CT-only, baseline'y nietknięte).
  const leftBandWidth = Math.max(ctRatingAnnotationsWidth(bay), vtMountingAnnotationsWidth(bay));
  return relayMeterWidth + leftBandWidth;
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
  /** F10.5 (spec §20.1): aparat CT, do którego prowadzi linia POMIAROWA
   *  (sygnał prądowy CT→przekaźnik) — ODDZIELNE od `anchor` (ten opisuje
   *  WYŁĄCZNIE pozycjonowanie geometryczne okręgu, `anchor === ctAnchor`
   *  gdy `ctAnchor` niepusty, ale `anchor` MOŻE spaść na `tripTarget`/
   *  fallback gdy `ct_ref` nierozwiązywalny — patrz `fallbackAnchor` niżej).
   *  `null` gdy `ProtectionAssignment.ct_ref` nierozwiązywalny na aparat
   *  `currentTransformer` NARYSOWANEGO stosu — wołający NIE rysuje linii
   *  pomiarowej i zgłasza `bay.protection.measurement_link_unresolved`
   *  (wzorzec `tripTarget`/`bay.protection.trip_link_unresolved` wyżej). */
  readonly ctAnchor: PlacedStackDevice | null;
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

  return { codes, anchor, tripTarget, ctAnchor };
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

/** Adnotacja CT rozstrzygnięta na aparat NARYSOWANEGO stosu (§18.3, F10.4). */
export interface ResolvedCtRatingAnnotation {
  /** Aparat CT toru głównego, do którego przypięta jest ta adnotacja. */
  readonly device: PlacedStackDevice;
  /** Gotowy tekst „identyfikator · przekładnia" (`ctRatingLabelText`). */
  readonly text: string;
  /** W5 (§12–15/uwaga 7): przeznaczenie CT z danych (`Measurement.purpose`) —
   *  wariant CT NIE dokładany do `text` (kanał geometrycznie neutralny),
   *  przenoszony na `OwnedLabel.ctPurpose` → `data-ct-purpose`. `undefined`
   *  gdy dana niedostarczona (uczciwy brak). */
  readonly purpose?: 'protection' | 'metering' | 'combined';
}

/**
 * Rozstrzyga adnotacje przekładni CT (§18.3, F10.4) na już zbudowanym stosie —
 * dopasowanie KAŻDEJ pozycji `ctRatingAnnotations` na aparat
 * `symbolId==='currentTransformer'` przez `measurementRef === linked_ref`
 * (TA SAMA reguła co `resolveMeterAnchor`). Pozycje bez dopasowania w stosie
 * są POMIJANE (zero zgadywania — adnotacja NIE jest rysowana bez
 * jednoznacznej kotwicy geometrycznej; symetryczne do `resolveMeterAnchor`
 * zwracającego `null`, tu zbiorczo przez filtrację).
 */
export function resolveCtRatingAnnotations(
  ctRatingAnnotations: readonly CtRatingAnnotationView[] | undefined,
  stack: readonly PlacedStackDevice[],
): readonly ResolvedCtRatingAnnotation[] {
  if (!ctRatingAnnotations || ctRatingAnnotations.length === 0) return [];
  const result: ResolvedCtRatingAnnotation[] = [];
  for (const entry of ctRatingAnnotations) {
    const device = stack.find(
      (d) => d.symbolId === 'currentTransformer' && d.linkedRef === entry.measurementRef,
    );
    if (!device) continue;
    result.push({ device, text: ctRatingLabelText(entry), purpose: entry.purpose });
  }
  return result;
}

/** Adnotacja montażu VT rozstrzygnięta na aparat NARYSOWANEGO stosu (§20.2,
 *  CTVT-RENDER). */
export interface ResolvedVtMountingAnnotation {
  /** Aparat VT toru bocznego, do którego przypięta jest ta adnotacja. */
  readonly device: PlacedStackDevice;
  /** Gotowy tekst „identyfikator · montaż" (`vtMountingAnnotationLabelText`). */
  readonly text: string;
}

/**
 * Rozstrzyga adnotacje montażu VT (§20.2, CTVT-RENDER) na już zbudowanym
 * stosie — dopasowanie KAŻDEJ pozycji `vtMountingAnnotations` na aparat
 * `symbolId==='voltageTransformer'` przez `measurementRef === linked_ref` (TA
 * SAMA reguła co `resolveMeterAnchor`/`resolveCtRatingAnnotations`; VT jest
 * aparatem BOCZNYM, ale i tak żyje w `stack.instances` z `linkedRef`). Pozycje
 * bez dopasowania są POMIJANE (zero zgadywania — adnotacja NIE jest rysowana
 * bez jednoznacznej kotwicy geometrycznej).
 */
export function resolveVtMountingAnnotations(
  vtMountingAnnotations: readonly VtMountingAnnotationView[] | undefined,
  stack: readonly PlacedStackDevice[],
): readonly ResolvedVtMountingAnnotation[] {
  if (!vtMountingAnnotations || vtMountingAnnotations.length === 0) return [];
  const result: ResolvedVtMountingAnnotation[] = [];
  for (const entry of vtMountingAnnotations) {
    const device = stack.find(
      (d) => d.symbolId === 'voltageTransformer' && d.linkedRef === entry.measurementRef,
    );
    if (!device) continue;
    result.push({ device, text: vtMountingAnnotationLabelText(entry) });
  }
  return result;
}

export { centerOf as protectionDeviceCenter };
