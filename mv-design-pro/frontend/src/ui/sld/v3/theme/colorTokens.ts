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
 *   3. stan NOP (punkt podziału, ZAWSZE „otwarty" z definicji domenowej)
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
 * DOBÓR ODCIENIA. `#D93A2B` to czerwień przechylona w ciepło (hue ≈ 7°), wybrana
 * ŚWIADOMIE daleko od `STATE_COLOR.nop`/`open` = `#FF006E` (magenta, hue ≈ 334°):
 * na ekranie czerwień była wolna, bo stan otwarty/NOP nosi magentę, i ta odległość
 * w odcieniu musi zostać zachowana przy każdej przyszłej korekcie — inaczej
 * „poziom napięcia" i „stan ruchowy" zlałyby się w jedną barwę.
 *
 * ASYMETRIA WOBEC DRUKU (świadoma, patrz `export/exportPalette.ts`): w druku WN
 * pozostaje czarnym tuszem, bo czerwień drukowalna `#B71C1C` jest zarezerwowana
 * dla NOP (wymóg D11 „WN/SN/nN i NOP wzajemnie rozróżnialne"). Gdy trzeba wybrać,
 * PIERWSZEŃSTWO ma stan ruchowy nad poziomem napięcia — pomyłka co do punktu
 * podziału sieci jest groźniejsza niż pomyłka co do poziomu napięcia.
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
 *  `#lv-drop-`/`#lv-load-drop` (stacja nN) — WSZYSTKIE niosą wspólny
 *  podłańcuch `#hv-`/`#lv-`, więc klasyfikacja substring jest stabilna na
 *  całą rodzinę bez wyliczania każdego sufiksu z osobna. */
const HV_OWNER_REF_MARKER = '#hv-';
const LV_OWNER_REF_MARKER = '#lv-';

/** Rodzaje odcinków adnotacji (warstwa POZA torem mocy — §17.1/§20.1e) —
 *  NIE dostają koloru napięcia, zostają na `BASE_STROKE` (bez zmiany
 *  zachowania sprzed S3: dotąd i tak renderowały się jednolitą kreską). */
const ANNOTATION_SEGMENT_KINDS = new Set(['protectionTrip', 'measurementLink', 'leader']);

/**
 * Klasyfikator napięcia odcinka/symbolu z `PreviewElementMeta` — CZYSTA
 * funkcja (`kind`/`ownerRef` już policzone przez `buildScene.ts`/`compose/*`,
 * zero re-derywacji z geometrii, zero zależności od `lod`: IDENTYCZNY wynik
 * na L0/L1/L2 dla tego samego elementu — matrix §3 „Kolory: identyczna
 * tabela na WSZYSTKICH LOD").
 */
export function voltageClassOf(meta: VoltageClassifiableMeta | undefined): VoltageClass {
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
export function baseSegmentStrokeColor(meta: VoltageClassifiableMeta | undefined): string {
  if (meta?.kind && ANNOTATION_SEGMENT_KINDS.has(meta.kind)) return BASE_STROKE;
  return VOLTAGE_COLOR[voltageClassOf(meta)];
}

/**
 * Kolor bazowy symbolu. Klasyfikacja NIEZAWODNA po `symbolId` (deterministyczna,
 * zero zgadywania z `ownerRef` domenowego — `bayRef`/`transformerRef`/
 * `sectionId` symboli NIE niosą sufiksu napięcia, w przeciwieństwie do
 * `ownerRef` odcinków): `gridSource` = sieć zewnętrzna GPZ, ZAWSZE WN w tej
 * domenie (`CLAUDE.md` terminologia „Source | External Grid"); `loadArrow` =
 * zagregowany odbiór 0,4 kV (`symbols/defs.ts` komentarz „zagregowany odbiór
 * 0,4 kV"), ZAWSZE nN. `noPoint` dostaje kolor STANU (`STATE_COLOR.nop`),
 * NIE napięcia — patrz `baseSymbolStrokeColor` wołający.
 *
 * GAP (świadomy, do S4/S5 — raport karty S3): pozostałe symbole aparatury
 * (breaker/disconnector/earthSwitch/fuseSwitch/CT/VT/SA/transformer2W/DER)
 * NIE niosą dziś w `ownerRef` znacznika napięcia pola (`bayRef` to opaque
 * ENM ref) — spadają na fallback `'sn'` (większość aparatury w scenach tej
 * domeny jest na torze SN). Pełne rozróżnienie wymaga przeniesienia
 * `voltage_kv` pola przez `compose/station.ts`/`compose/gpz.ts` do
 * `PreviewElementMeta` — zmiana geometrii/kontraktu kompozycji POZA
 * zakresem S3 (S3 = tokeny, nie nowe pola danych).
 */
export function baseSymbolStrokeColor(symbolId: SymbolId, meta: VoltageClassifiableMeta | undefined): string {
  if (symbolId === 'noPoint') return STATE_COLOR.nop;
  if (symbolId === 'gridSource') return VOLTAGE_COLOR.hv;
  if (symbolId === 'loadArrow') return VOLTAGE_COLOR.nn;
  return VOLTAGE_COLOR[voltageClassOf(meta)];
}

// ---------------------------------------------------------------------------
// 2) Stan (matrix §3: „zał./wył./NOP").
// ---------------------------------------------------------------------------

/**
 * Stan łącznika ZWYKŁEGO (breaker/disconnector/…) jest GEOMETRIĄ, nie
 * kolorem (`symbols/glyphs.tsx` nagłówek: „Stan łącznika wyrażony GEOMETRIĄ
 * ... nie kolorem" — decyzja SLD_CAD_SPEC_V3 §6 P5, NIETKNIĘTA przez S3).
 * `STATE_COLOR` niesie WIĘC wyłącznie wpis realnie okablowany w kanwie dziś
 * (`nop`) + wpisy rezerwowe dla kompletności tabeli/przyszłych konsumentów
 * (legenda, inspektor) — `closed`/`open` NIE są dziś czytane przez żaden
 * glif (dokumentacyjna kompletność tabeli §3, nie martwy kod: literały
 * pochodzą z `DARK_SCADA_NEON_THEME_SPEC.md` §2.3, gotowe do podłączenia
 * bez nowej decyzji kolorystycznej, gdy przyszły konsument tego zapotrzebuje).
 */
export const STATE_COLOR = {
  /** `--scada-switch-closed` (spec §2.3) — rezerwa tabeli, nieużywana dziś. */
  closed: '#00FF7F',
  /** `--scada-switch-open`/`--scada-nop-normal` (spec §2.3) — rezerwa tabeli. */
  open: '#FF006E',
  /** NOP (D7/D8): punkt podziału jest z DEFINICJI domenowej „normalnie
   *  otwarty" (`props.isNop`, `buildScene.ts`) — WYRÓŻNIONY (nie zlewa się z
   *  napięciem/bazą) na KAŻDYM LOD, ta sama wartość co `open` (spec §2.3:
   *  jeden odcień „stan otwarty/alarm"). */
  nop: '#FF006E',
} as const;

// ---------------------------------------------------------------------------
// 3) Wyróżnienie — nakładki wynikowe + selekcja (dotychczasowe stałe
//    `SldCanvasV3.tsx`/`compose/sourceKind.ts`, TERAZ JEDNO miejsce).
// ---------------------------------------------------------------------------

export const HIGHLIGHT_COLOR = {
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
  resultStale: '#7A6E8F',
  /** Selekcja elementu (rezerwa tabeli — `SldCanvasV3.tsx` nie ma dziś
   *  własnej nakładki stroke dla selekcji, ta wchodzi przez `useSelectionStore`
   *  w warstwie wyższej; GAP do S4/S5: podłączenie tego tokenu jako realnej
   *  nakładki na kanwie, dziś poza zakresem S3 — nowa funkcja renderu, nie
   *  tokenizacja istniejącej). Wartość zgodna z v2 `COLOR_SELECTION`. */
  selection: '#35C7FF',
} as const;

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
const SEVERITY_COLOR: Readonly<Record<string, string>> = {
  CRITICAL: HIGHLIGHT_COLOR.fault,
  IMPORTANT: HIGHLIGHT_COLOR.oltc,
  WARNING: HIGHLIGHT_COLOR.standby,
} as const;

/** Kolor progu dla severity (`null` = INFO/nieznane ⇒ bez nadpisania koloru
 *  bazowego warstwy). CZYSTA funkcja — zero fizyki, odczyt tabeli. */
export function resultSeverityColor(severity: string | undefined): string | null {
  if (!severity) return null;
  return SEVERITY_COLOR[severity] ?? null;
}

/** Ranga severity (wyższa liczba = poważniejsze) — do wyboru najgroźniejszego
 *  członka agregatu „+N wyniki”. INFO/nieznane = 0. */
export function resultSeverityRank(severity: string | undefined): number {
  if (severity === 'CRITICAL') return 3;
  if (severity === 'IMPORTANT') return 2;
  if (severity === 'WARNING') return 1;
  return 0;
}
