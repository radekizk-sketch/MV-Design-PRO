/**
 * SLD V3 F9.9 — oznaczenie zabezpieczeń ANSI/IEEE C37.2 (SLD_CAD_SPEC_V3 §17,
 * Poprawka A2). Jedno źródło prawdy dla OBECNOŚCI/GABARYTU kolumny adnotacji
 * (`layout/measure.ts`, rezerwacja) i ROZWIĄZANIA kotwicy/toru wyzwalania
 * (`compose/station.ts`/`compose/gpz.ts`, rysunek) — wzorzec
 * `apparatusSequence.ts` (F9.3): jedna funkcja wołana przez OBA miejsca, żeby
 * rezerwacja miejsca i realny rysunek nigdy się nie rozjechały.
 *
 * Dane (§17.2, zero zgadywania):
 *  - Kody przekaźnika: włączone funkcje sterownika pola (WYŁĄCZNIE gdy są) —
 *    adapter (`v2/canvas/enmToSldAdapter.ts` `resolveBayProtectionMarking`)
 *    projektuje 1:1 na `MiniBlockBayDescriptor.protectionMarking.codes`.
 *  - Tor wyzwalania: macierz wyzwoleń sterownika pola (`ProtectionAssignment`)
 *    — adapter rozwiązuje SUROWY ref ENM (`protectionMarking.breakerRef`);
 *    dopasowanie na KONKRETNY aparat w NARYSOWANYM stosie (`device_ref` match)
 *    dzieje się TU (compose zna geometrię/kolejność rysowania, adapter nie) —
 *    `resolveStationProtectionMarking` niżej. Brak dopasowania = brak linii
 *    (nigdy linia do „domyślnego" aparatu, §17.2 dosłownie).
 *  - Kotwica: `ProtectionAssignment.ct_ref` rozwiązany na CT stosu pola, gdy
 *    brak CT — przy wyłączniku (§17.2). Gdy ANI CT ANI wyłącznik nie
 *    rozwiązują się (dane niespójne) — kotwica geometryczna spada na
 *    pierwszy aparat stosu (WYŁĄCZNIE kotwica geometryczna, NIE asercja
 *    połączenia — tor wyzwalania pozostaje nierozwiązany niezależnie). Wysokość
 *    bloku zabezpieczeń wyznacza `lacznikOsiBloku` (`./blokZabezpieczenPola`).
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
 * linked_ref`. Układ pomiarowy, liczba rdzeni i klasy NIE są doklejane do etykiety
 * (odbiór B-02 2026-11-04) — opis pełny w inspektorze pola.
 */

import { GRID } from '../core/grid';
import { measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS, rodzajSymbolu, type SymbolId } from '../symbols/defs';
import type {
  CtRatingAnnotationView,
  MiniBlockBayDescriptor,
  RodzajPrzekladnikaTabliczki,
  VtMountingAnnotationView,
} from '../../v2/model/widokPolStacji';
import { tekstOdniesieniaZrodlaU0 } from '../../v2/model/zrodloNapieciaZerowego';

/** Średnica okręgu miernika „M" — spec §17.3: 24px = 3×GRID (przekaźnik pola rysuje blok
 *  zabezpieczeń — ramkę, `./blokZabezpieczenPola`). */
export const PROTECTION_ANNOTATION_DIAMETER = 3 * GRID;

/**
 * Szczegółowość warstwy adnotacji zabezpieczeń per LOD (spec §17.4, B-1
 * recenzji F9.9) — JEDNA prawda dla `compose/station.ts` i `compose/gpz.ts`
 * (wołający `scene/buildScene.ts` wywodzi wartość z LOD sceny przez
 * `protectionAnnotationDetailForLod` niżej):
 *  - `'full'`        (L2): ramka bloku zabezpieczeń z kodami funkcji, linia
 *                     wyłączania, linie pomiarowe, „52", „M", odniesienia.
 *  - `'circle-only'` (L1, nazwa historyczna): SAMA ramka bloku tego samego
 *                     kształtu BEZ kodów i linia wyłączania; linie pomiarowe,
 *                     „52"/„M" i wiersze nieobecne (§17.4, odbiór B-02 2026-11-04).
 *                     Przekaźnik NIE jest okręgiem (karta JEDNA NOTACJA BLOKU
 *                     ZABEZPIECZEŃ).
 *  - `'none'`        (L0): warstwa adnotacji nieobecna (plan sieci).
 */
export type ProtectionAnnotationDetail = 'full' | 'circle-only' | 'none';

export function protectionAnnotationDetailForLod(lod: 0 | 1 | 2): ProtectionAnnotationDetail {
  if (lod === 2) return 'full';
  if (lod === 1) return 'circle-only';
  return 'none';
}

/** Odstęp kolejnych wierszy pełnej listy kodów [px świata] — dwa rastry: wiersze t4
 *  przyciągane do siatki nie nachodzą na siebie. */
export const ODSTEP_WIERSZY_KODOW_EAZ = 2 * GRID;

/** Klasa typograficzna pełnej listy kodów — t4 (8px, „adnotacje",
 *  `core/text.ts`), ta sama co „52" (§17.3 „etykieta 8 px"). */
export const PROTECTION_FULL_LIST_LABEL_CLASS = 't4' as const;

/**
 * Odniesienia obwodów spoza pola w bloku zabezpieczeń — dziś źródło napięcia zerowego 3U₀
 * funkcji 67N: obwód okrężny „Z, Zz" z przekładnika pola pomiaru napięcia (ENEA Z.10 s.89,
 * Z.11.1 s.91, Z.17 s.97), potwierdzony w modelu (`MiniBlockBayDescriptor.zrodloU0`). Na
 * schemacie głównym odniesienie TEKSTOWE, nie przewód przez rozdzielnicę (decyzja właściciela
 * 2026-10-29 pkt 4). JEDNA lista dla rezerwacji kolumny i rysunku (GPZ i stacje); puste, gdy
 * pole nie rysuje przekaźnika (brak kodów funkcji).
 */
export function odniesieniaPrzekaznikaPola(
  bay: Pick<MiniBlockBayDescriptor, 'zrodloU0'>,
  codes: readonly string[],
): readonly string[] {
  if (codes.length === 0) return [];
  const tekst = tekstOdniesieniaZrodlaU0(bay.zrodloU0);
  return tekst ? [tekst] : [];
}

/**
 * Kody funkcji BLOKU ZABEZPIECZEŃ pola (GPZ i stacje, z powiązaniami obwodów wtórnych i bez), w DWÓCH
 * KOLUMNACH pionowych wewnątrz prostokątnej ramki — odbiór właściciela 2026-11-04 (wizualizacja
 * zaakceptowana, korekta v2): blok BEZ okręgu przekaźnika, wewnątrz ramki WSZYSTKIE kody funkcji
 * pola (bez ukrywania, bez licznika) w kolejności danych (`Bay.protection_codes`), wypełnienie
 * kolumnami (najpierw lewa, z góry w dół): lewa ma ⌈n/2⌉ kodów, prawa resztę, liczba wierszy
 * ⌈n/2⌉. Kody są wyłącznie na LOD2 (`ProtectionAnnotationDetail` `'full'`); na LOD1 zostaje
 * ramka tego samego kształtu bez kodów, na LOD0 bloku nie ma. Nastawy i opis funkcji — inspektor
 * pola („Zabezpieczenia i automatyka”).
 */
export function kolumnyKodowBloku(codes: readonly string[]): readonly [readonly string[], readonly string[]] {
  const wLewej = Math.ceil(codes.length / 2);
  return [codes.slice(0, wLewej), codes.slice(wLewej)];
}

/** Odstęp kolumn kodów bloku zabezpieczeń [px świata] — oczko między tuszem kolumn. */
export const ODSTEP_KOLUMN_KODOW_EAZ = GRID;

/** Szerokość kolumny kodów pismem listy (najszerszy kod); 0 = kolumna pusta. */
export function szerokoscKolumnyKodow(kolumna: readonly string[]): number {
  return kolumna.length > 0 ? Math.max(...kolumna.map((k) => measureLabelWidth(k, PROTECTION_FULL_LIST_LABEL_CLASS))) : 0;
}

type ProtectionAwareBay = Pick<
  MiniBlockBayDescriptor,
  'protectionMarking' | 'meteringMeasurementRef' | 'ctRatingAnnotations' | 'vtMountingAnnotations' | 'zrodloU0'
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

/**
 * Tekst etykiety adnotacji przekładnika (§18.3: „identyfikator aparatu i przekładnię, np.
 * «T1 · 300/5»”). Odbiór B-02 właściciela 2026-11-04 (pkt 6 i 8): na schemacie WYŁĄCZNIE krótka
 * przekładnia („200–400/5”, „15/√3 / 0,1/√3 kV”); klasy dokładności, wybrany zaczep, układ
 * pomiarowy i liczba rdzeni są w inspektorze pola, nie poszerzają pola na schemacie. JEDNA
 * funkcja dla rezerwacji kolumny przekładni (`tekstyOpisowPrzekladnika` niżej →
 * `./kolumnaOpisowPola`) i rysunku (`resolveCtRatingAnnotations` niżej) — zero rozjazdu tekst↔szerokość.
 */
export function ctRatingLabelText(entry: Pick<CtRatingAnnotationView, 'identifier' | 'ratioText'>): string {
  return entry.identifier ? `${entry.identifier} · ${entry.ratioText}` : entry.ratioText;
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
 * funkcja dla rezerwacji kolumny przekładni (`tekstyOpisowPrzekladnika` niżej) i
 * rysunku (`resolveVtMountingAnnotations` niżej).
 */
export function vtMountingAnnotationLabelText(
  entry: Pick<VtMountingAnnotationView, 'identifier' | 'mounting'>,
): string {
  return `${entry.identifier} · ${vtMountingLabelText(entry.mounting)}`;
}

/** Rekord aparatu pola niosący powiązania obwodów wtórnych (podzbiór `BayPrimaryDeviceView`). */
interface AparatZPowiazaniamiObwodow {
  readonly funkcjeEazZasilane?: readonly string[];
  readonly funkcjeEazWylaczajace?: readonly string[];
  /** Porty aparatu w modelu — układ powiązań prowadzi linie z zacisków wtórnych aparatów. */
  readonly ports?: readonly unknown[];
}

/**
 * Czy pole rysuje przekaźnik w układzie POWIĄZAŃ OBWODÓW WTÓRNYCH (karta UX-04/POLE-LINIOWE-
 * WZORZEC, korekta P0 pkt 6): aparaty pola niosą porty w modelu i co najmniej jeden niesie
 * powiązanie (`funkcje_eaz_zasilane` albo `funkcje_eaz_wylaczajace`) z funkcją EAZ pola. JEDEN predykat
 * rezerwacji szerokości kolumny (`szerokoscPrzekaznikaZPowiazaniami`) i rysunku (`compose/
 * gpz.ts`) — oba czytają te same rekordy modelu, nie narysowany stos.
 */
export function czyPrzekaznikZPowiazaniamiObwodow(
  codes: readonly string[],
  aparaty: readonly AparatZPowiazaniamiObwodow[] | undefined,
): boolean {
  if (codes.length === 0) return false;
  // Układ powiązań rysuje linie pomiarowe i linię wyłączania z ZACISKÓW WTÓRNYCH aparatów toru
  // (porty modelu). Pole, którego aparaty nie niosą portów (`gpz.bay.ports.absent`), nie ma
  // zacisków — zostaje przy adnotacji przekaźnika z kotwicą przekładnika (okrąg, tor wyzwalania,
  // linia pomiarowa), zamiast układu powiązań z nazwanym brakiem każdego odejścia. Od karty
  // OCHRONA-JEDNO-ZRODLO powiązania wynikają z wejść i macierzy wyzwoleń sterownika pola, więc
  // mają je także pola bez wzorca producenta (bez geometrii portów).
  if (!(aparaty ?? []).some((a) => (a.ports?.length ?? 0) > 0)) return false;
  const funkcjePola = new Set(codes);
  return (aparaty ?? []).some(
    (a) => czyPowiazany(a.funkcjeEazZasilane, funkcjePola) || czyPowiazany(a.funkcjeEazWylaczajace, funkcjePola),
  );
}

/** Liczba źródeł pomiaru przekaźnika pola wg rekordów modelu — aparaty z powiązaniem
 *  `funkcje_eaz_zasilane` z funkcją pola; TEN SAM predykat co źródła linii pomiarowych
 *  (`resolveStationProtectionMarking::zrodlaPomiaru`). Wejście rezerwacji szerokości. */
export function liczbaZrodelPomiaruPola(
  codes: readonly string[],
  aparaty: readonly AparatZPowiazaniamiObwodow[] | undefined,
): number {
  const funkcjePola = new Set(codes);
  return (aparaty ?? []).filter((a) => czyPowiazany(a.funkcjeEazZasilane, funkcjePola)).length;
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
  /** Karta UX-04/POLE-LINIOWE-WZORZEC (obwody wtórne): kody funkcji EAZ zasilanych z aparatu
   *  (`BayPrimaryDevice.funkcje_eaz_zasilane`) — źródło linii pomiarowej. */
  readonly funkcjeEazZasilane?: readonly string[];
  /** Kody funkcji EAZ wyłączających aparat (`BayPrimaryDevice.funkcje_eaz_wylaczajace`) —
   *  cel linii wyłączania. */
  readonly funkcjeEazWylaczajace?: readonly string[];
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
   *  WYŁĄCZNIE kotwicę geometryczną, `anchor === ctAnchor`
   *  gdy `ctAnchor` niepusty, ale `anchor` MOŻE spaść na `tripTarget`/
   *  fallback gdy `ct_ref` nierozwiązywalny — patrz `fallbackAnchor` niżej).
   *  `null` gdy `ProtectionAssignment.ct_ref` nierozwiązywalny na aparat
   *  `currentTransformer` NARYSOWANEGO stosu — wołający NIE rysuje linii
   *  pomiarowej i zgłasza `bay.protection.measurement_link_unresolved`
   *  (wzorzec `tripTarget`/`bay.protection.trip_link_unresolved` wyżej). */
  readonly ctAnchor: PlacedStackDevice | null;
  /** Karta UX-04/POLE-LINIOWE-WZORZEC (obwody wtórne): aparaty NARYSOWANEGO stosu, które
   *  zasilają funkcje EAZ pola (`funkcjeEazZasilane` ∩ `codes` ≠ ∅ — rdzeń przekładnika
   *  prądowego, uzwojenie przekładnika napięciowego, przekładnik Ferrantiego), w kolejności
   *  stosu. Źródła linii pomiarowych do wejścia pomiarowego przekaźnika; puste = model nie
   *  niesie powiązań (pole bez obwodów wtórnych szablonu). */
  readonly zrodlaPomiaru: readonly PlacedStackDevice[];
}

/** Czy aparat niesie powiązanie z którąkolwiek funkcją pola. */
function czyPowiazany(kody: readonly string[] | undefined, funkcjePola: ReadonlySet<string>): boolean {
  return (kody ?? []).some((kod) => funkcjePola.has(kod));
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

  // Cel linii wyłączania: wyłącznik wskazany przez `ProtectionAssignment.breaker_ref`, a gdy
  // pole go nie niesie — wyłącznik, który model wiąże z funkcjami EAZ pola
  // (`funkcje_eaz_wylaczajace`, materializowane z obwodów wtórnych szablonu). Nigdy wyłącznik
  // domyślny (§17.2): bez powiązania w modelu linia nie powstaje.
  const funkcjePola = new Set(codes);
  const tripTarget =
    (breakerRef && stack.find((d) => rodzajSymbolu(d.symbolId) === 'breaker' && d.deviceRef === breakerRef))
    || stack.find((d) => rodzajSymbolu(d.symbolId) === 'breaker' && czyPowiazany(d.funkcjeEazWylaczajace, funkcjePola))
    || null;
  const zrodlaPomiaru = stack.filter((d) => czyPowiazany(d.funkcjeEazZasilane, funkcjePola));
  const ctAnchor =
    (ctRef && stack.find((d) => rodzajSymbolu(d.symbolId) === 'currentTransformer' && d.deviceRef === ctRef)) || null;

  // §17.2: kotwica przy CT (rozwiązanym), gdy brak CT — przy wyłączniku.
  // Gdy ŻADNE z dwóch nie rozwiązuje się na aparat stosu (dane niespójne —
  // sterownik pola wskazuje aparaty, które nie pasują do TEGO
  // pola), blok NADAL musi się gdzieś narysować (kody SĄ, §17.2 „brak danych
  // = brak oznaczenia" nie dotyczy tego przypadku — dane SĄ, tylko link jest
  // złamany) — pada na pierwszy aparat WYŁĄCZNIKA stosu jeśli istnieje,
  // inaczej pierwszy element stosu. To WYŁĄCZNIE pozycjonowanie geometryczne
  // (nie asercja połączenia) — `tripTarget` pozostaje `null` niezależnie.
  const fallbackAnchor = stack.find((d) => rodzajSymbolu(d.symbolId) === 'breaker') ?? stack[0];
  const anchor = ctAnchor ?? tripTarget ?? fallbackAnchor;

  return { codes, anchor, tripTarget, ctAnchor, zrodlaPomiaru };
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
        (rodzajSymbolu(d.symbolId) === 'currentTransformer' || rodzajSymbolu(d.symbolId) === 'voltageTransformer') &&
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
  /** Przyrostek refu etykiety (`#<przyrostek>-<deviceRef>`) — `przyrostekTabliczkiPrzekladnika`. */
  readonly przyrostek: string;
}

/** Symbol stosu (rodzaj semantyczny), na którym kotwiczy tabliczka przekładnika danego rodzaju —
 *  jedno źródło dla rozstrzygnięcia kotwicy i sondy sceny (`ctAnnotationGaps`). */
export const SYMBOL_TABLICZKI_PRZEKLADNIKA: Readonly<Record<RodzajPrzekladnikaTabliczki, SymbolId>> = {
  CT: 'currentTransformer',
  VT: 'voltageTransformer',
  CORE_BALANCE_CT: 'qetCoreBalanceCt',
};

/** Przyrostek refu etykiety tabliczki przekładnika: `ct-rating` (prądowy i pomiar CT),
 *  `vt-rating` (napięciowy), `cbct-rating` (Ferrantiego). */
export const PRZYROSTEK_TABLICZKI_PRZEKLADNIKA: Readonly<Record<RodzajPrzekladnikaTabliczki, string>> = {
  CT: 'ct-rating',
  VT: 'vt-rating',
  CORE_BALANCE_CT: 'cbct-rating',
};

/** Aparat pola w dopasowaniu opisów przekładnika (rekord stosu albo specyfikacji pola). */
type AparatOpisuPrzekladnika = Pick<PlacedStackDevice, 'symbolId' | 'deviceRef' | 'linkedRef'>;

/** Tabliczka przekładnika `entry` należy do aparatu `d` — rodzaj symbolu przekładnika
 *  (`SYMBOL_TABLICZKI_PRZEKLADNIKA`) i klucz: `deviceRef` wpisu z tabliczki aparatu albo
 *  `measurementRef` = `linked_ref` aparatu. JEDEN predykat rysunku (`resolveCtRatingAnnotations`)
 *  i rezerwacji kolumny przekładni (`tekstyOpisowPrzekladnika`). */
function czyTabliczkaAparatu(entry: CtRatingAnnotationView, d: AparatOpisuPrzekladnika): boolean {
  return (
    rodzajSymbolu(d.symbolId) === SYMBOL_TABLICZKI_PRZEKLADNIKA[entry.rodzajPrzekladnika ?? 'CT']
    && (entry.deviceRef !== undefined
      ? d.deviceRef === entry.deviceRef
      : entry.measurementRef !== null && d.linkedRef === entry.measurementRef)
  );
}

/** Montaż VT `entry` należy do aparatu `d` (przekładnik napięciowy, `linked_ref` = pomiar). JEDEN
 *  predykat rysunku (`resolveVtMountingAnnotations`) i rezerwacji (`tekstyOpisowPrzekladnika`). */
function czyMontazVtAparatu(entry: VtMountingAnnotationView, d: AparatOpisuPrzekladnika): boolean {
  return rodzajSymbolu(d.symbolId) === 'voltageTransformer' && d.linkedRef === entry.measurementRef;
}

/**
 * Teksty opisów przekładnika na kolumnę przekładni pola (wzorzec właściciela 2026-11-05,
 * `./kolumnaOpisowPola`): tabliczki (`ctRatingLabelText`) i montaż VT
 * (`vtMountingAnnotationLabelText`) wpisów pola, które należą do aparatu `aparat` — te same
 * predykaty co rysunek (`resolveCtRatingAnnotations`, `resolveVtMountingAnnotations`), więc
 * kolumna mieści każdy opis, który rysunek postawi.
 */
export function tekstyOpisowPrzekladnika(
  bay: Pick<ProtectionAwareBay, 'ctRatingAnnotations' | 'vtMountingAnnotations'>,
  aparat: AparatOpisuPrzekladnika,
): readonly string[] {
  return [
    ...(bay.ctRatingAnnotations ?? []).filter((e) => czyTabliczkaAparatu(e, aparat)).map(ctRatingLabelText),
    ...(bay.vtMountingAnnotations ?? []).filter((e) => czyMontazVtAparatu(e, aparat)).map(vtMountingAnnotationLabelText),
  ];
}

/**
 * Rozstrzyga adnotacje przekładni CT (§18.3, F10.4) na już zbudowanym stosie —
 * dopasowanie KAŻDEJ pozycji `ctRatingAnnotations` na aparat rodzaju
 * `currentTransformer`: adnotacja z pomiaru przez `measurementRef === linked_ref`
 * (TA SAMA reguła co `resolveMeterAnchor`), adnotacja z tabliczki aparatu (karta
 * UX-04/POLE-LINIOWE-WZORZEC, §11.7 pkt 6) przez `deviceRef` tego aparatu; pozycja bez
 * żadnego z dwóch kluczy nie dopasowuje się nigdzie. Pozycje bez dopasowania w stosie
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
    // Adnotacja z tabliczki aparatu (§11.7 pkt 6) kotwiczy na TYM aparacie (`deviceRef`),
    // adnotacja z pomiaru — na aparacie wskazującym pomiar (`linked_ref`).
    const device = stack.find((d) => czyTabliczkaAparatu(entry, d));
    if (!device) continue;
    result.push({
      device,
      text: ctRatingLabelText(entry),
      purpose: entry.purpose,
      przyrostek: PRZYROSTEK_TABLICZKI_PRZEKLADNIKA[entry.rodzajPrzekladnika ?? 'CT'],
    });
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
    const device = stack.find((d) => czyMontazVtAparatu(entry, d));
    if (!device) continue;
    result.push({ device, text: vtMountingAnnotationLabelText(entry) });
  }
  return result;
}

export { centerOf as protectionDeviceCenter };
