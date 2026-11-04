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
 * linked_ref`. Układ pomiarowy, liczba rdzeni i klasy NIE są doklejane do etykiety
 * (odbiór B-02 2026-11-04) — opis pełny w inspektorze pola.
 */

import { GRID, snapUp } from '../core/grid';
import { measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS, rodzajSymbolu, type SymbolId } from '../symbols/defs';
import { kodyWOkreguPrzekaznika } from '../symbols/okragPrzekaznika';
import type {
  CtRatingAnnotationView,
  MiniBlockBayDescriptor,
  RodzajPrzekladnikaTabliczki,
  VtMountingAnnotationView,
} from '../../v2/model/widokPolStacji';
import { tekstOdniesieniaZrodlaU0 } from '../../v2/model/zrodloNapieciaZerowego';

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
 * `null` gdy okrąg niesie wszystkie kody (slot zbędny — R-2
 * rozstrzygnięcia recenzji F9.9). Separator „·" jak w etykietach przepływu
 * F9.5 (spójna typografia adnotacji).
 */
export function fullCodesListText(codes: readonly string[]): string | null {
  const wiersze = fullCodesListLines(codes);
  return wiersze.length > 0 ? wiersze.join(' · ') : null;
}

/** Liczba kodów w jednym wierszu pełnej listy funkcji EAZ. */
export const KODY_EAZ_W_WIERSZU = 5;

/** Kody po `KODY_EAZ_W_WIERSZU` w wierszu, w kolejności danych, separator „·". */
function wierszeKodow(codes: readonly string[]): readonly string[] {
  const wiersze: string[] = [];
  for (let i = 0; i < codes.length; i += KODY_EAZ_W_WIERSZU) {
    wiersze.push(codes.slice(i, i + KODY_EAZ_W_WIERSZU).join(' · '));
  }
  return wiersze;
}

/**
 * Wiersze PEŁNEJ listy kodów funkcji (spec §17.3 zd. 2) — po `KODY_EAZ_W_WIERSZU` kodów
 * w wierszu, w kolejności danych; puste, gdy okrąg niesie WSZYSTKIE kody pola
 * (`kodyWOkreguPrzekaznika`, `symbols/okragPrzekaznika.ts` — kod, którego tusz pismem 8 px nie
 * mieści się w okręgu, nie trafia do okręgu, więc pełna lista pojawia się także przy ≤ 2
 * kodach). Karta UX-04/POLE-LINIOWE-WZORZEC (korekta P0 pkt 6): profil EAZ pola liniowego ENEA
 * (15 funkcji Z.11.1) w JEDNYM wierszu odsuwał przekaźnik o szerokość listy od pola — lista
 * w wierszach stoi zwarcie przy przekaźniku. JEDNA funkcja rezerwacji szerokości i rysunku
 * (stacja, GPZ).
 */
export function fullCodesListLines(codes: readonly string[]): readonly string[] {
  if (kodyWOkreguPrzekaznika(codes).length === codes.length) return [];
  return wierszeKodow(codes);
}

/** Odstęp kolejnych wierszy pełnej listy kodów [px świata] — dwa rastry: wiersze t4
 *  przyciągane do siatki nie nachodzą na siebie. */
export const ODSTEP_WIERSZY_KODOW_EAZ = 2 * GRID;

/** Klasa typograficzna pełnej listy kodów — t4 (8px, „adnotacje",
 *  `core/text.ts`), ta sama co „52" (§17.3 „etykieta 8 px"). */
export const PROTECTION_FULL_LIST_LABEL_CLASS = 't4' as const;

/**
 * Odniesienia obwodów spoza pola przy okręgu przekaźnika — dziś źródło napięcia zerowego 3U₀
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
 * Kody funkcji POD okręgiem przekaźnika w układzie powiązań obwodów wtórnych pola GPZ, w DWÓCH
 * KOLUMNACH pionowych — odbiór B-02 właściciela 2026-11-04 (korekta wiążąca): „WSZYSTKIE kody
 * funkcji (51, 50, 51N, ZS i pozostałe — bez ukrywania żadnej, bez licznika) POD kółkiem,
 * pionowo w dwóch kolumnach”. Okrąg nie niesie kodów; kolumny niosą KAŻDY kod pola w kolejności
 * danych (`Bay.protection_codes`), wypełnienie kolumnami (najpierw lewa, z góry w dół): lewa ma
 * ⌈n/2⌉ kodów, prawa resztę. Kody są wyłącznie na LOD2 (`ProtectionAnnotationDetail` `'full'`);
 * na LOD0/LOD1 zostaje sam okrąg przy Q0. Nastawy i opis funkcji — inspektor pola
 * („Zabezpieczenia i automatyka”).
 */
export function kolumnyKodowPodOkregiem(codes: readonly string[]): readonly [readonly string[], readonly string[]] {
  const wLewej = Math.ceil(codes.length / 2);
  return [codes.slice(0, wLewej), codes.slice(wLewej)];
}

/** Odstęp kolumn kodów bloku przekaźnika [px świata] — oczko między tuszem kolumn. */
export const ODSTEP_KOLUMN_KODOW_EAZ = GRID;

/** Szerokość kolumny kodów pismem listy (najszerszy kod); 0 = kolumna pusta. */
export function szerokoscKolumnyKodow(kolumna: readonly string[]): number {
  return kolumna.length > 0 ? Math.max(...kolumna.map((k) => measureLabelWidth(k, PROTECTION_FULL_LIST_LABEL_CLASS))) : 0;
}

/** Margines ramki bloku przekaźnika wokół okręgu i wierszy [px świata] — pół rastru: ramka
 *  nie dotyka tekstu, a wejście lewe i dolne okręgu leżą o pół rastru wewnątrz ramki. */
export const RAMKA_BLOKU_PRZEKAZNIKA_MARGINES = GRID / 2;

/** Szerokość wierszy bloku: dwie kolumny kodów z odstępem albo najszerszy wiersz odniesienia;
 *  0 = blok bez wierszy (sam okrąg). */
export function szerokoscWierszyAdnotacjiPrzekaznika(
  codes: readonly string[],
  odniesienia: readonly string[],
): number {
  const [lewa, prawa] = kolumnyKodowPodOkregiem(codes);
  const kolumny =
    szerokoscKolumnyKodow(lewa) + (prawa.length > 0 ? ODSTEP_KOLUMN_KODOW_EAZ + szerokoscKolumnyKodow(prawa) : 0);
  return Math.max(kolumny, szerokoscKolumnyKodow(odniesienia));
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
 * funkcja dla rezerwacji szerokości (`ctRatingAnnotationsWidth` niżej) i rysunku
 * (`resolveCtRatingAnnotations` niżej) — zero rozjazdu tekst↔szerokość.
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
  const codes = bay.protectionMarking?.codes ?? [];
  const listWidth = szerokoscWierszyAdnotacjiPrzekaznika(codes, odniesieniaPrzekaznikaPola(bay, codes));
  const fullListWidth = listWidth > 0 ? snapUp(listWidth) + GRID : 0;
  const hasRelayOrMeter = (bay.protectionMarking?.codes.length ?? 0) > 0 || bay.meteringMeasurementRef != null;
  const relayMeterWidth = hasRelayOrMeter ? GRID + Math.max(PROTECTION_ANNOTATION_DIAMETER, fullListWidth) : 0;
  // CTVT-RENDER (§20.2): adnotacja CT i VT leżą w TYM SAMYM lewym paśmie
  // (różne Y — różne aparaty), więc pasmo = SZERSZA z dwóch (max, nie suma);
  // dla pola bez VT `vtMountingAnnotationsWidth===0` ⇒ max = szerokość CT
  // (zero regresji dla pól CT-only, baseline'y nietknięte).
  const leftBandWidth = Math.max(ctRatingAnnotationsWidth(bay), vtMountingAnnotationsWidth(bay));
  return relayMeterWidth + leftBandWidth;
}

/** Rekord aparatu pola niosący powiązania obwodów wtórnych (podzbiór `BayPrimaryDeviceView`). */
interface AparatZPowiazaniamiObwodow {
  readonly funkcjeEazZasilane?: readonly string[];
  readonly funkcjeEazWylaczajace?: readonly string[];
}

/**
 * Czy pole rysuje przekaźnik w układzie POWIĄZAŃ OBWODÓW WTÓRNYCH (karta UX-04/POLE-LINIOWE-
 * WZORZEC, korekta P0 pkt 6): co najmniej jeden aparat pola niesie w modelu powiązanie
 * (`funkcje_eaz_zasilane` albo `funkcje_eaz_wylaczajace`) z funkcją EAZ pola. JEDEN predykat
 * rezerwacji szerokości kolumny (`szerokoscPrzekaznikaZPowiazaniami`) i rysunku (`compose/
 * gpz.ts`) — oba czytają te same rekordy modelu, nie narysowany stos.
 */
export function czyPrzekaznikZPowiazaniamiObwodow(
  codes: readonly string[],
  aparaty: readonly AparatZPowiazaniamiObwodow[] | undefined,
): boolean {
  if (codes.length === 0) return false;
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
 * Wejścia pomiarowe przekaźnika z powiązaniami obwodów wtórnych w kolejności przydziału źródłom
 * (od najwyższego odejścia w dół). Linia wyłączania wchodzi od góry (`wylacz`, port N), więc
 * oba wejścia zachodnie są pomiarowe: źródło wyższe — wejście górne, niższe — dolne, trzecie —
 * wejście dolne okręgu przez pas pod okręgiem (nad kolumnami kodów). Piony źródeł stoją na
 * zachód od okręgu, źródło wyższe dalej od okręgu (`pionWejsciaPomiarowego`): pion źródła
 * wyższego kończy się nad poziomem odejścia źródła niższego, a poziome odcinki wejść leżą nad
 * pionami źródeł niższych — linie kolejnych źródeł nie krzyżują się, a żadna nie przecina
 * kolumn kodów pod okręgiem (odbiór B-02 właściciela 2026-11-04, korekta). Dowód
 * w `scene/__tests__/poleLinioweGpz.test.tsx`.
 */
export const WEJSCIA_POMIAROWE_PRZEKAZNIKA = ['pomiar-gorny', 'pomiar-lewy', 'pomiar'] as const;

/** Wejście dolne okręgu (`pomiar`) — źródło dochodzi do niego pasem pod okręgiem: tyle pasów
 *  rezerwuje się między okręgiem a kolumnami kodów, gdy wejście jest zajęte. */
export const PASY_POD_OKREGIEM_WEJSCIA_DOLNEGO = 2;

/** Liczba źródeł pomiaru przyjętych przez wejścia przekaźnika (nadmiar — `missingData`). */
export function liczbaWejscPomiarowychZajetych(liczbaZrodel: number): number {
  return Math.min(liczbaZrodel, WEJSCIA_POMIAROWE_PRZEKAZNIKA.length);
}

/** Odległość pionu źródła `indeks` (0 = najwyższe odejście) od lewej krawędzi okręgu [px świata]
 *  przy `liczbaWejsc` zajętych wejściach: źródło wyższe dalej od okręgu, najniższe o oczko. */
export function pionWejsciaPomiarowego(indeks: number, liczbaWejsc: number): number {
  return (liczbaWejsc - indeks) * GRID;
}

/** Przesunięcie górnej krawędzi pierwszego wiersza kodów pod dolną krawędzią okręgu [px świata]:
 *  wiersze stoją TUŻ pod okręgiem, a gdy zajęte jest wejście dolne — pod pasem jego linii. */
export function odsuniecieKodowPodOkregiem(liczbaWejsc: number): number {
  return liczbaWejsc >= WEJSCIA_POMIAROWE_PRZEKAZNIKA.length ? PASY_POD_OKREGIEM_WEJSCIA_DOLNEGO * GRID : 0;
}

/** Szerokość bloku przekaźnika z powiązaniami od lewej krawędzi okręgu: okrąg albo kolumny kodów
 *  pod nim (z marginesem ramki), co szersze. */
export function szerokoscBlokuPodOkregiem(codes: readonly string[], odniesienia: readonly string[] = []): number {
  const wiersze = szerokoscWierszyAdnotacjiPrzekaznika(codes, odniesienia);
  return wiersze > 0
    ? Math.max(PROTECTION_ANNOTATION_DIAMETER, snapUp(wiersze + RAMKA_BLOKU_PRZEKAZNIKA_MARGINES))
    : PROTECTION_ANNOTATION_DIAMETER;
}

/**
 * Szerokość części przekaźnikowej kolumny pola w układzie powiązań obwodów wtórnych — prześwit
 * od pasma adnotacji (GRID), piony wejść pomiarowych na zachód od okręgu (po oczku na zajęte
 * wejście, co najmniej jedno) i blok (okrąg z kolumnami kodów pod nim,
 * `szerokoscBlokuPodOkregiem`). Ta sama arytmetyka co rysunek (`compose/gpz.ts`).
 */
export function szerokoscPrzekaznikaZPowiazaniami(
  codes: readonly string[],
  odniesienia: readonly string[] = [],
  liczbaZrodel = 1,
): number {
  return GRID + Math.max(1, liczbaWejscPomiarowychZajetych(liczbaZrodel)) * GRID + szerokoscBlokuPodOkregiem(codes, odniesienia);
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
   *  WYŁĄCZNIE pozycjonowanie geometryczne okręgu, `anchor === ctAnchor`
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
  // protection_ref wskazuje na assignment którego refy nie pasują do TEGO
  // pola), okrąg NADAL musi się gdzieś narysować (kody SĄ, §17.2 „brak danych
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
    const rodzaj = entry.rodzajPrzekladnika ?? 'CT';
    const device = stack.find(
      (d) =>
        rodzajSymbolu(d.symbolId) === SYMBOL_TABLICZKI_PRZEKLADNIKA[rodzaj] &&
        (entry.deviceRef !== undefined
          ? d.deviceRef === entry.deviceRef
          : entry.measurementRef !== null && d.linkedRef === entry.measurementRef),
    );
    if (!device) continue;
    result.push({
      device,
      text: ctRatingLabelText(entry),
      purpose: entry.purpose,
      przyrostek: PRZYROSTEK_TABLICZKI_PRZEKLADNIKA[rodzaj],
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
    const device = stack.find(
      (d) => rodzajSymbolu(d.symbolId) === 'voltageTransformer' && d.linkedRef === entry.measurementRef,
    );
    if (!device) continue;
    result.push({ device, text: vtMountingAnnotationLabelText(entry) });
  }
  return result;
}

export { centerOf as protectionDeviceCenter };
