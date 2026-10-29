/**
 * SCHEMAT-10 S3 (V12K-135) — JEDNO źródło prawdy kolorów kanwy v3.
 *
 * Audyt `docs/sld/AUDYT_SCHEMATOW_OD_ZERA_2026-07.md` §3 „MACIERZ PRAWDY LOD",
 * wiersz „Kolory": JEDNA tabela semantyki koloru — napięcie (110 biały / SN
 * zielony / nN niebieski) × stan (zał./wył./NOP) × wyróżnienie (selekcja/
 * overlay) — IDENTYCZNA na L0/L1/L2 (funkcja czysta z meta sceny, zero
 * zależności od `lod`). Baza kolorystyczna ciemna: `DARK_SCADA_NEON_THEME_SPEC.md`
 * (D11 — kanwa v3 jest trwale ciemna na ekranie; przełącznik motywu + jasny
 * wariant eksportu to S4, POZA tą fazą).
 *
 * D8 („chaos kolorów"): przed tą kartą `#2ECC71`/`#5B6B76`/… były rozsiane
 * jako lokalne stałe w `SldCanvasV3.tsx`, `compose/sourceKind.ts`,
 * `compose/preview.tsx`, `symbols/glyphs.tsx`, `sheet/Frame.tsx` — zielony
 * pełnił naraz rolę „energizacja" I „SN" I „domyślne". Ten moduł jest JEDYNYM
 * miejscem, gdzie te wartości hex istnieją; każdy plik wyżej IMPORTUJE stąd,
 * zero literałów lokalnych (pomiar: grep `#[0-9A-Fa-f]\{6\}` poza tym plikiem).
 *
 * Precedencja renderu jednej kreski (żeby jeden piksel nie niósł dwóch
 * sprzecznych znaczeń naraz):
 *   1. stan źródła DER (`operationalState`, `compose/sourceKind.ts`)
 *   2. nakładka wynikowa (energizacja/przepływ/OLTC/zwarcie — `overlay.ts`)
 *   3. kafel stanu łącznika (`STATE_COLOR`) — wypełnienie POD symbolem łącznika, symbol na
 *      kaflu w kolorze `STATE_COLOR.glif` (NOP = stan łącznika + znacznik `noPoint`)
 *   4. napięcie (baza — gdy nic wyżej nie ustawia koloru)
 * Implementacja precedencji ZOSTAJE w `SldCanvasV3.tsx`/`compose/sourceKind.ts`
 * (logika renderu), ten moduł niesie WYŁĄCZNIE wartości + klasyfikatory
 * czyste (zero JSX, zero DOM).
 *
 * `compose/preview.tsx` (`CompositionPreview`) świadomie NIE czyta z tego
 * modułu dla napięcia/stanu — to udokumentowany harness „mono base" (spec §6
 * P5: „harness nie nakłada koloru stanu/napięcia, F6") używany przez
 * goldeny S1; wprowadzanie kolorowania tam byłoby zmianą PONAD zakres S3 i
 * złamaniem jego własnego kontraktu. Harness dalej importuje tu WYŁĄCZNIE
 * `BASE_STROKE`/`CANVAS_BACKGROUND` (te same wartości co dotąd, zero zmiany
 * zachowania) — nie klasyfikatory napięcia/stanu.
 */
import type { RolaPolaGpz } from '../../v2/canvas/canonicalGpzModel';
import type { SymbolId } from '../symbols/defs';

/**
 * Podzbiór strukturalny `PreviewElementMeta` (`compose/preview.tsx`) —
 * WYŁĄCZNIE pola potrzebne klasyfikatorowi napięcia. Świadomie LOKALNY typ
 * (nie import `PreviewElementMeta`): `compose/preview.tsx` importuje
 * `compose/sourceKind.ts`, który od S3 importuje TEN plik — import pełnego
 * typu stąd zamknąłby cykl modułów `preview.tsx → sourceKind.ts →
 * colorTokens.ts → preview.tsx`. `PreviewElementMeta` jest strukturalnie
 * zgodny (nadzbiór) — wołający przekazuje go bez rzutowania.
 */
interface VoltageClassifiableMeta {
  readonly kind?: string;
  readonly ownerRef?: string;
  /** JAWNA klasa napięcia nadana przez kompozycję (V12K-217). Potrzebna dla
   *  SYMBOLI aparatów: klasyfikacja substring po `ownerRef` działa dla odcinków
   *  (niosą `#hv-`/`#lv-`), ale `bayRef`/`transformerRef` symboli są opaque i
   *  napięcia nie niosą — patrz GAP karty S3 przy `baseSymbolStrokeColor`. Ma
   *  PIERWSZEŃSTWO nad substringiem: kompozycja wie, po której stronie
   *  transformatora stoi aparat, a nazwa referencji tego nie zdradza. */
  readonly voltageClass?: VoltageClass;
}

// ---------------------------------------------------------------------------
// Baza kanwy (bez zmiany wartości — wyłącznie konsolidacja literałów).
// ---------------------------------------------------------------------------

/** Tło kanwy/arkusza (dotychczasowe `SLD_V3_BACKGROUND`/`SHEET_BACKGROUND`/
 *  `DEFAULT_BACKGROUND` — TA SAMA wartość, teraz JEDNO miejsce). */
export const CANVAS_BACKGROUND = '#0B0F14' as const;

/** Kreska bazowa mono (dotychczasowe `V3_STROKE_BASE`/`SHEET_STROKE`/
 *  `DEFAULT_STROKE`). Używana WPROST tam, gdzie element nie niesie napięcia
 *  (etykiety, rama arkusza, rama strefy GPZ) — patrz `BASE_STROKE`. */
export const BASE_STROKE = '#E8EEF4' as const;

// ---------------------------------------------------------------------------
// 1) Napięcie (matrix §3: „110 biały / SN zielony / nN niebieski").
// ---------------------------------------------------------------------------

export type VoltageClass = 'hv' | 'sn' | 'nn';

/**
 * `hv` = CZERWIEŃ (V12K-216, dyrektywa właściciela 2026-07-26: paleta wg praktyki
 * polskich OSD — „110 kV czerwony, SN zielony, nN niebieski"). Do tej zmiany
 * `hv === BASE_STROKE` (biały, dawna matrix §3), co audyt R4 zmierzył jako realny
 * brak: strona 110 kV dzieliła barwę z obwiednią arkusza, znacznikami stref i
 * legendą, więc NAJWYŻSZY poziom napięcia nie wyróżniał się jako poziom — miał
 * kolor „domyślny", wspólny z elementami NIEELEKTRYCZNYMI rysunku (pomiar: L0
 * niósł dwa kolory w całym drzewie DOM przy trzech poziomach napięcia w modelu).
 *
 * DOBÓR ODCIENIA. `#D93A2B` to czerwień przechylona w ciepło (hue ≈ 7°). Od karty
 * UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 5) czerwień niesie też stan ZAMKNIĘTY łącznika
 * (`STATE_COLOR.zamkniety` = `#C62828`, konwencja dyspozytorska) — oba znaczenia rozdziela
 * NOŚNIK, nie odcień: poziom napięcia to kolor KRESKI toru, stan to WYPEŁNIONY kafel pod
 * symbolem łącznika z białym glifem. Literały są różne (eksport podmienia kolory po
 * wartości), a kafel różni się od kreski jasnością i powierzchnią.
 *
 * DRUK (`export/exportPalette.ts`): WN jest czarnym tuszem, kafle stanu zostają w kolorach
 * konwencji — arkusz mówi to samo co ekran.
 * `sn` = zielony — wartość ZGODNA z kanonicznym zielonym szyny SN w v2
 * (`ui/sld/v2/theme/tokens.ts` `COLOR_BUS_LV`/`COLOR_FIELD_TRUNK_ENERGIZED`,
 * „Szyna 15/30 kV (SN) — zielony tor operatorski"), ale ŚWIADOMIE INNY
 * odcień niż nakładka energizacji `HIGHLIGHT_COLOR.energized` (#2ECC71) —
 * D8 wymaga, żeby „SN" i „energizacja" NIE dzieliły jednego literału.
 * `nn` = niebieski — wartość z `DARK_SCADA_NEON_THEME_SPEC.md` §2.2
 * `--scada-bus-lv`, ŚWIADOMIE INNY odcień niż nakładka przepływu
 * `HIGHLIGHT_COLOR.flow` (#4FC3F7), z tego samego powodu.
 */
export const VOLTAGE_COLOR: Readonly<Record<VoltageClass, string>> = {
  hv: '#D93A2B',
  sn: '#13C45A',
  nn: '#0099CC',
} as const;

/** Fragmenty `ownerRef` z konwencji `compose/gpz.ts`/`compose/station.ts` —
 *  patrz `#hv-bus`/`#hv-connector`/`#hv-lateral-`/`#hv-field-to-tr`/
 *  `#hv-bus-tap`/`#hv-bus-source-extension` (GPZ WN) i `#lv-bus`/
 *  `#lv-drop-`/`#lv-portal-drop` (zacisk nN + portal stacji) — WSZYSTKIE niosą wspólny
 *  podłańcuch `#hv-`/`#lv-`, więc klasyfikacja substring jest stabilna na
 *  całą rodzinę bez wyliczania każdego sufiksu z osobna. */
const HV_OWNER_REF_MARKER = '#hv-';
const LV_OWNER_REF_MARKER = '#lv-';

/** Rodzaje odcinków adnotacji (warstwa POZA torem mocy — §17.1/§20.1e) —
 *  NIE dostają koloru napięcia, zostają na `BASE_STROKE` (bez zmiany
 *  zachowania sprzed S3: dotąd i tak renderowały się jednolitą kreską). */
const ANNOTATION_SEGMENT_KINDS = new Set(['protectionTrip', 'measurementLink', 'leader']);

/**
 * KD-8 poz. 1 — KSZTAŁT palety rysunku (jeden zestaw kluczy, wiele motywów).
 *
 * Ten moduł niesie WARTOŚCI motywu dyspozytorskiego (ciemnego); wariant jasny
 * ekranu i wybór palety po motywie żyją w `theme/palette.ts` (zero cyklu
 * importów: `palette.ts` → `colorTokens.ts`, nigdy odwrotnie). Funkcje
 * klasyfikujące niżej przyjmują paletę PARAMETREM (domyślnie ciemna), dzięki
 * czemu pozostają czyste i deterministyczne — kolor NIE jest już własnością
 * modułu, tylko argumentem renderu.
 */
export interface SldPalette {
  readonly canvasBackground: string;
  readonly baseStroke: string;
  readonly voltage: Readonly<Record<VoltageClass, string>>;
  /** Kafle stanu łącznika — `STATE_COLOR`, ta sama tabela w każdym motywie i eksporcie. */
  readonly state: KafleStanuLacznika;
  readonly highlight: Readonly<Record<HighlightKey, string>>;
  /** GPZ-PARYTET (§0 pkt 3): kolor roli pola rozdzielni GPZ — tło pola (`gpz.bay.panel`,
   *  wypełnienie półprzezroczyste + obrys), próbka w tabeli „Pola GPZ" i legenda ról.
   *  Rola pochodzi z modelu (`Bay.bay_role`), kolor jest wyłącznie kodem roli. */
  readonly rolaPola: Readonly<Record<RolaPolaGpz, string>>;
}

/**
 * Klasyfikator napięcia odcinka/symbolu z `PreviewElementMeta` — CZYSTA
 * funkcja (`kind`/`ownerRef` już policzone przez `buildScene.ts`/`compose/*`,
 * zero re-derywacji z geometrii, zero zależności od `lod`: IDENTYCZNY wynik
 * na L0/L1/L2 dla tego samego elementu — matrix §3 „Kolory: identyczna
 * tabela na WSZYSTKICH LOD").
 */
export function voltageClassOf(meta: VoltageClassifiableMeta | undefined): VoltageClass {
  // Jawna klasa z kompozycji wygrywa (V12K-217) — patrz `VoltageClassifiableMeta`.
  if (meta?.voltageClass) return meta.voltageClass;
  const kind = meta?.kind;
  if (kind === 'lv') return 'nn';
  const ownerRef = meta?.ownerRef;
  if (ownerRef?.includes(LV_OWNER_REF_MARKER)) return 'nn';
  if (ownerRef?.includes(HV_OWNER_REF_MARKER)) return 'hv';
  return 'sn';
}

/**
 * Kolor bazowy odcinka (gdy żadna nakładka/stan nie ustawia koloru wyżej w
 * precedencji — patrz nagłówek pliku). Adnotacje (`protectionTrip`/
 * `measurementLink`/`leader`) zostają na `BASE_STROKE` — nie są torem mocy,
 * kolorowanie napięciem sugerowałoby fałszywie, że niosą prąd sieci.
 */
export function baseSegmentStrokeColor(
  meta: VoltageClassifiableMeta | undefined,
  palette: SldPalette = DARK_SCADA_SLD_PALETTE,
): string {
  if (meta?.kind && ANNOTATION_SEGMENT_KINDS.has(meta.kind)) return palette.baseStroke;
  return palette.voltage[voltageClassOf(meta)];
}

/**
 * Kolor bazowy symbolu. Klasyfikacja NIEZAWODNA po `symbolId` (deterministyczna,
 * zero zgadywania z `ownerRef` domenowego — `bayRef`/`transformerRef`/
 * `sectionId` symboli NIE niosą sufiksu napięcia, w przeciwieństwie do
 * `ownerRef` odcinków): `gridSource` = sieć zewnętrzna GPZ, ZAWSZE WN w tej
 * domenie (`CLAUDE.md` terminologia „Source | External Grid"); `loadArrow` =
 * zagregowany odbiór 0,4 kV (`symbols/defs.ts` komentarz „zagregowany odbiór
 * 0,4 kV"), ZAWSZE nN. `noPoint` (znacznik punktu normalnie otwartego) idzie kolorem
 * napięcia toru jak każdy aparat; jego stan niesie kafel (`symbols/glyphs.tsx`).
 *
 * GAP karty S3 — CZĘŚCIOWO ZAMKNIĘTY (V12K-217): aparaty pola WN transformatora
 * GPZ dostają jawne `meta.voltageClass = 'hv'` z kompozycji (`compose/gpz.ts`),
 * więc wyłącznik 110 kV nie wygląda już jak wyłącznik SN. Pozostałe symbole aparatury
 * (breaker/disconnector/earthSwitch/fuseSwitch/CT/VT/SA/transformer2W/DER)
 * NIE niosą dziś w `ownerRef` znacznika napięcia pola (`bayRef` to opaque
 * ENM ref) — spadają na fallback `'sn'` (większość aparatury w scenach tej
 * domeny jest na torze SN). Pełne rozróżnienie wymaga przeniesienia
 * `voltage_kv` pola przez `compose/station.ts`/`compose/gpz.ts` do
 * `PreviewElementMeta` — zmiana geometrii/kontraktu kompozycji POZA
 * zakresem S3 (S3 = tokeny, nie nowe pola danych).
 */
export function baseSymbolStrokeColor(
  symbolId: SymbolId,
  meta: VoltageClassifiableMeta | undefined,
  palette: SldPalette = DARK_SCADA_SLD_PALETTE,
): string {
  if (symbolId === 'gridSource') return palette.voltage.hv;
  if (symbolId === 'loadArrow') return palette.voltage.nn;
  return palette.voltage[voltageClassOf(meta)];
}

// ---------------------------------------------------------------------------
// 2) Stan (matrix §3: „zał./wył./NOP").
// ---------------------------------------------------------------------------

/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC, rozszerzenie 5 (referencja HMI sterownika polowego,
 * właściciel 2026-10-29) — JEDNA konwencja stanu łącznika dla kanwy, eksportu, legendy
 * i inspektora: KAFEL wypełniony pod symbolem łącznika w kolorze stanu, symbol na kaflu
 * w kolorze `glif`. Konwencja dyspozytorska polskich OSD: czerwony = ZAMKNIĘTY,
 * zielony = OTWARTY. Kolor nigdy nie jest jedynym nośnikiem stanu — geometria styku
 * (`symbols/glyphs.tsx`) i znak rodzaju aparatu (×, ○, poprzeczka, EN 60617) mówią to
 * samo, więc rysunek jest czytelny dla daltonisty i w druku monochromatycznym.
 *
 * STANY = położenia, które rozróżnia model (`v2/model/stanAparatowPola.ts`):
 * zamknięty, otwarty, nieustalony (brak danej, „nieznany", rekord sprzeczny z gałęzią)
 * i błędny (rekord „awaria" — odpowiednik położenia „bad-state" podwójnego wskazania
 * IEC 61850-7-4 Dbpos). Położenie „uziemiony" łącznika trójpołożeniowego ma kolor
 * ZAMKNIĘTEGO: zestyk jest zamknięty na uziemienie (łącznik trójpołożeniowy w praktyce
 * IEC 61850 to dwa węzły XSWI — tor i uziemienie; uziemiony = węzeł uziemienia „on"),
 * a geometria noża na zestyku uziemiającym odróżnia go od zamknięcia na tor.
 * Punkt normalnie otwarty (NOP) NIE ma osobnego koloru: to stan łącznika (zwykle
 * otwarty) plus ZNACZNIK funkcji NOP (symbol `noPoint` i podpis „NO").
 *
 * WARTOŚCI IDENTYCZNE w motywie ciemnym, jasnym i w eksporcie — zmienia się tylko tło.
 * Progi (pilnuje `__tests__/palette.test.ts`): kafel ≥ 3:1 wobec tła OBU motywów
 * i arkusza eksportu (kontrast obiektu graficznego WCAG 1.4.11), glif na kaflu ≥ 4,5:1.
 * Każda wartość jest różna od wszystkich innych tokenów palety (eksport podmienia kolory
 * po wartości — wspólny literał z innym znaczeniem zlałby dwa znaczenia w dokumencie).
 */
export type StanKafla = 'zamkniety' | 'otwarty' | 'nieustalony' | 'bledny';

export const STANY_KAFLA: readonly StanKafla[] = ['zamkniety', 'otwarty', 'nieustalony', 'bledny'];

export interface KafleStanuLacznika {
  readonly zamkniety: string;
  readonly otwarty: string;
  readonly nieustalony: string;
  readonly bledny: string;
  /** Kolor symbolu (kresek glifu i znaku „?"/„!") rysowanego NA kaflu. */
  readonly glif: string;
}

export const STATE_COLOR: KafleStanuLacznika = {
  zamkniety: '#C62828',
  otwarty: '#2E7D32',
  nieustalony: '#6B7280',
  bledny: '#8E44AD',
  // Biel glifu jako literał RÓŻNY od bieli tła motywu jasnego i arkusza (`#FFFFFF`): eksport
  // podmienia kolory po wartości, więc wspólny literał z tłem przemalowałby symbol na kaflu
  // przy każdej zmianie tła dokumentu (pomiar 2026-10-29, `exportPalette.test.tsx`). Kontrast
  // na najciemniejszym kaflu nieustalonym 4,8:1 (próg 4,5:1, `palette.test.ts`).
  glif: '#FEFEFE',
};

// ---------------------------------------------------------------------------
// 3) Wyróżnienie — nakładki wynikowe + selekcja (dotychczasowe stałe
//    `SldCanvasV3.tsx`/`compose/sourceKind.ts`, TERAZ JEDNO miejsce).
// ---------------------------------------------------------------------------

export type HighlightKey =
  | 'energized'
  | 'deenergized'
  | 'standby'
  | 'maintenance'
  | 'flow'
  | 'oltc'
  | 'fault'
  | 'faultWarning'
  | 'faultOk'
  | 'resultLabel'
  | 'resultStale'
  | 'selection'
  | 'swzOk'
  | 'swzFail'
  | 'swzUnknown';

export const HIGHLIGHT_COLOR: Readonly<Record<HighlightKey, string>> = {
  /** Energizacja (spec §6 P5) — dawne `OVERLAY_ENERGIZED_STROKE`
   *  (`SldCanvasV3.tsx`) I `SOURCE_STATE_OVERLAY_COLOR.energized`
   *  (`compose/sourceKind.ts`) — DWA literały z TĄ SAMĄ wartością w dwóch
   *  plikach (dokładnie defekt D8): teraz JEDEN. */
  energized: '#2ECC71',
  /** Brak energizacji — dawne `OVERLAY_DEENERGIZED_STROKE`/
   *  `SOURCE_STATE_OVERLAY_COLOR.disconnected`. */
  deenergized: '#5B6B76',
  /** Stan DER „gotowość/standby" (`compose/sourceKind.ts`, bez odpowiednika
   *  poza tym modułem — bursztyn/żółty, odrębny od OLTC (§ niżej) i od
   *  wyniku „warning" (poniżej), bo to inny WYMIAR (stan pracy vs wynik
   *  solvera). */
  standby: '#F1C40F',
  /** Stan DER „konserwacja". */
  maintenance: '#3498DB',
  /** F9.5 (spec §14.2) — nakładka przepływu mocy, dawne `FLOW_OVERLAY_COLOR`. */
  flow: '#4FC3F7',
  /** V12K-092 — badge wynikowy OLTC, dawne `OLTC_OVERLAY_COLOR`. */
  oltc: '#FFB300',
  /** Awaria/zwarcie — dawne `sourceKind.fault` I `FAULT_FLOW_TOKEN_COLOR.critical`
   *  I fallback nieskonwergowanego przepływu w `SldCanvasV3.tsx` — TRZY
   *  literały `#E74C3C` w dwóch plikach, teraz JEDEN. */
  fault: '#E74C3C',
  /** Strzałki rozpływu zwarciowego — token tercylowy „warning" (W-C). */
  faultWarning: '#F5A623',
  /** Strzałki rozpływu zwarciowego — token tercylowy „ok". */
  faultOk: '#F9E79F',
  /** W4 (§8) — LICZBOWE etykiety wynikowe (U/obc./S/P/Q/Ik″/Ith). Lawenda:
   *  odrębna od flow (błękit)/oltc (bursztyn)/fault (czerwień)/energized
   *  (zieleń), by warstwa liczb była wizualnie rozróżnialna od strzałek. */
  resultLabel: '#B39DDB',
  /** R2 (wym. 8) — etykiety wyników NIEAKTUALNYCH względem modelu (Case
   *  Immutability Rule): wyszarzona lawenda + baner „⚠ wyniki nieaktualne".
   *  Etykiety NIE znikają (inżynier ma widzieć, że są stare), ale są wizualnie
   *  stłumione — odrębny, ściemniony odcień od `resultLabel`. */
  /* KD-8 poz. 1 (Zero-Debt, defekt zastany zmierzony przy tokenizacji):
   * dawna wartość `#7A6E8F` dawała na tle kanwy 4,08:1 — etykieta LICZBOWA
   * poniżej progu czytelności tekstu. Rozjaśniona do 5,09:1 z zachowaniem
   * roli „stłumiona wobec `resultLabel`" (8,02:1) — wyniki stare nadal
   * ustępują pierwszeństwa aktualnym, ale dają się PRZECZYTAĆ. */
  resultStale: '#8A7E9F',
  /** Selekcja elementu (rezerwa tabeli — `SldCanvasV3.tsx` nie ma dziś
   *  własnej nakładki stroke dla selekcji, ta wchodzi przez `useSelectionStore`
   *  w warstwie wyższej; GAP do S4/S5: podłączenie tego tokenu jako realnej
   *  nakładki na kanwie, dziś poza zakresem S3 — nowa funkcja renderu, nie
   *  tokenizacja istniejącej). Wartość zgodna z v2 `COLOR_SELECTION`. */
  selection: '#35C7FF',
  /** T2-WYNIKI (PLAN_SLD_NN_TOPOLOGIA_2026-08 §T2, §0 pkt 2) — odznaka SWZ
   *  (samoczynne wyłączenie zasilania, IEC 60364-4-41) przy aparacie odpływu
   *  nN: WERDYKT 3-tonowy, token ODRĘBNY od `energized`/`fault`/`standby` —
   *  ten sam wymiar wizualny (zielony=dobrze/czerwony=źle/bursztyn=nie wiadomo,
   *  konwencja uniwersalna), ale INNY WYMIAR TREŚCI (werdykt SWZ, nie stan
   *  napięcia/awaria rozpływu/gotowość DER) — osobny klucz, żeby zmiana
   *  jednego tokenu w przyszłości NIE poruszała pozostałych trzech. Wartości
   *  ODRĘBNE hex (nie identyczne z `energized`/`fault`/`standby`) — testowy
   *  niezmiennik D8 (`colorTokens.test.ts` „każda wartość WŁASNEGO wymiaru
   *  jest unikalna") wymaga, żeby jeden odcień = jedno znaczenie wyniku. */
  swzOk: '#27AE60',
  swzFail: '#E63939',
  /** „nierozstrzygalne" (fail-closed, P0.6 §0.3: NIGDY cichy fallback na „ok"). */
  swzUnknown: '#E67E22',
};

/**
 * Paleta rysunku motywu DYSPOZYTORSKIEGO (ciemnego) — złożenie stałych wyżej
 * w JEDEN obiekt. Ta struktura (nie luźne stałe) jest tym, co render przekazuje
 * przez kontekst, a eksport bierze jako źródło substytucji.
 */
/** GPZ-PARYTET: kolory ról pól GPZ motywu dyspozytorskiego — sześć odcieni wzajemnie
 *  rozróżnialnych, każdy ≥ 3:1 na tle kanwy (test `palette.test.ts`), żaden nie powtarza
 *  wartości innego tokenu (eksport mapuje kolor ekranu na jeden cel dokumentowy). */
export const ROLA_POLA_COLOR: Readonly<Record<RolaPolaGpz, string>> = {
  zasilajace: '#E0A040',
  liniowe: '#4FA3E0',
  transformatorowe: '#B48CF0',
  sprzeglo: '#9AA4AF',
  pomiarowe: '#3FBFA8',
  zrodlowe: '#7CC85A',
  // Pole baterii kondensatorów (karta UX-04/POLE-BKR-MODEL): odcień purpurowo-różowy,
  // wolny od pozostałych ról (bursztyn, błękit, fiolet, szarość, morski, zieleń).
  kompensacyjne: '#E07AA8',
};

export const DARK_SCADA_SLD_PALETTE: SldPalette = {
  canvasBackground: CANVAS_BACKGROUND,
  baseStroke: BASE_STROKE,
  voltage: VOLTAGE_COLOR,
  state: STATE_COLOR,
  highlight: HIGHLIGHT_COLOR,
  rolaPola: ROLA_POLA_COLOR,
};

// ---------------------------------------------------------------------------
// R3 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.9) — PROGI KOLORYSTYCZNE warstwy
// wynikowej z KONTRAKTU SEVERITY backendu (`RawOverlayElement.severity`). ZERO
// progów liczonych w UI: żaden „>100% ⇒ czerwony” nie powstaje tutaj — mapujemy
// gotową klasyfikację solvera 1:1 na ISTNIEJĄCE tokeny statusów (`HIGHLIGHT_COLOR`).
// Kolor jest DODATKIEM (renderer dokłada też znacznik tekstowy „⚠”, nie sam kolor).
// ---------------------------------------------------------------------------

/**
 * Severity backendu → istniejący token statusu. CRITICAL = czerwień (awaria,
 * `HIGHLIGHT_COLOR.fault`), IMPORTANT = bursztyn (`HIGHLIGHT_COLOR.oltc`),
 * WARNING = żółty (`HIGHLIGHT_COLOR.standby`). INFO NIE ma wpisu — element
 * poprawny zostaje na bazowym kolorze warstwy (`HIGHLIGHT_COLOR.resultLabel`),
 * zero recoloringu „na zielono” w UI (brak sygnału OK per element w kontrakcie).
 */
const SEVERITY_HIGHLIGHT_KEY: Readonly<Record<string, HighlightKey>> = {
  CRITICAL: 'fault',
  IMPORTANT: 'oltc',
  WARNING: 'standby',
} as const;

/** Kolor progu dla severity (`null` = INFO/nieznane ⇒ bez nadpisania koloru
 *  bazowego warstwy). CZYSTA funkcja — zero fizyki, odczyt tabeli.
 *  KD-8 poz. 1: tabela mapuje severity na KLUCZ tokenu, a kolor bierze z
 *  palety podanej parametrem — próg zgodności zostaje ten sam w obu motywach. */
export function resultSeverityColor(
  severity: string | undefined,
  palette: SldPalette = DARK_SCADA_SLD_PALETTE,
): string | null {
  if (!severity) return null;
  const key = SEVERITY_HIGHLIGHT_KEY[severity];
  return key === undefined ? null : palette.highlight[key];
}

/** Ranga severity (wyższa liczba = poważniejsze) — do wyboru najgroźniejszego
 *  członka agregatu „+N wyniki”. INFO/nieznane = 0. */
export function resultSeverityRank(severity: string | undefined): number {
  if (severity === 'CRITICAL') return 3;
  if (severity === 'IMPORTANT') return 2;
  if (severity === 'WARNING') return 1;
  return 0;
}
