/**
 * SLD VISUAL GRAMMAR nN — JEDYNE źródło prawdy warstwy wizualnej kanwy
 * projekcji nN (mandat „profesjonalizacja SLD nN" §20–§30, §41–§42).
 *
 * `LvDomainView` i `composeLvDomainScene` NIE trzymają własnych stałych
 * wizualnych — czytają wyłącznie ten moduł; dwie kopie języka rozjechałyby
 * się przy pierwszej zmianie (reguła KLASA §3 — predykaty parami).
 *
 * ZASADA WORLD-SCALED vs SCREEN-STABLE (twarda reguła):
 * - WORLD-SCALED: geometria torów/rastrów/szyn (długości, pozycje, raster
 *   bazowy §42) — skaluje się z kamerą/fitem;
 * - SCREEN-STABLE (clamped): typografia, grubości kresek, rozmiary SYMBOLI —
 *   stały rozmiar w px EKRANU niezależnie od skali fitu (zakaz „14 px świata ×
 *   skala 0,55 = 7,7 px ekranu"). Konwersja: wartość ekranowa / skala fitu =
 *   wartość świata do wpisania w atrybut SVG wewnątrz grupy transformowanej.
 *
 * CZTERY POZIOMY GRAFICZNE (§20), rozpoznawalne bez czytania legendy:
 *  1. TOPOLOGIA — szyny, przewody, symbole, zaciski (kreski najgrubsze);
 *  2. ETYKIETA GŁÓWNA — oznaczenia (TA, QF-01, RGnN-A) — `SLD_LABEL_PRIMARY`;
 *  3. DANE INŻYNIERSKIE — tabliczki (400 kVA · 15/0,4 kV · Dyn5 · uk),
 *     przekroje, moce — `SLD_LABEL_SECONDARY`/`TERTIARY`;
 *  4. STAN I WYNIKI — stany zasilania, ostrzeżenia, plakietki wyników —
 *     `SLD_LABEL_STATUS`/`WARNING`/`RESULT` (monospace dla liczb).
 *
 * KOLOR NIE JEST SEMANTYKĄ (§26): każdy stan ma NOŚNIK GEOMETRYCZNY (wzór
 * kreski, glif, znacznik tekstowy) i kolor jest wyłącznie drugim, redundantnym
 * kanałem — tryb monochromatyczny (`paletaMono`) nie traci ani jednej
 * informacji (pin: `__tests__/stanyZasilania.test.tsx`).
 *
 * LOD PROJEKCJI nN — jedna geometria, trzy poziomy: `composeLvDomainScene`
 * liczy scenę RAZ, LOD jest WYŁĄCZNIE filtrem prezentacji w `LvDomainView`
 * przez `REJESTR_ELEMENTOW_KANWY` (`widocznyNaLod`). Zakaz bezwzględny: LOD
 * nie ukrywa nigdy drogi prądu, transformatora, aparatów ze stanem,
 * punktów otwartych, źródeł, odbiorów, granic ani stanu zasilania.
 */
import { CAD_SYMBOL_STROKE_PX } from '../cad/CadSymbol';
import { sldPaletteForTheme } from '../theme/palette';
import type { ThemeMode } from '../../../../ui2/theme/themeMode';
import type { LvEnergizationState } from './types';

// ===========================================================================
// RASTER BAZOWY (§42) i TOKENY GEOMETRII (§41) — jednostki ŚWIATA.
// ===========================================================================

/** Raster bazowy sceny nN [j. świata] — każda pozycja X/Y jest jego
 *  wielokrotnością (rytm rozdzielnicy; zero „ręcznych" przesunięć). */
export const RASTER = 8;

export function doRastra(value: number): number {
  return Math.round(value / RASTER) * RASTER;
}

/**
 * TOKENY GEOMETRII (§41) — eksponowane też jako zmienne CSS `--sld-*` na
 * korzeniu kanwy (`tokenyCss`), żeby druk/motywy/inspekcja widziały te same
 * liczby, którymi liczy się scena. Wartości ŚWIATA, wielokrotności rastru.
 */
export const TOKENY_GEOMETRII = {
  /** Odstęp między kikutami odpływów na szynie (slot odpływu). 128 = etykieta
   *  „QF-12" (≈36 px) + odstęp + pół glifu sąsiada (16 px) mieści się przy
   *  skali fitu ≥ 0,5 bez dotykania sąsiedniej kolumny. */
  feederGap: 128,
  /** Odstęp między szynami sekcji (rangi pionowe: szyna → podrozdzielnica). */
  busGap: 176,
  /** Odstęp etykiety od geometrii [px EKRANU — screen-stable]. */
  labelGap: 8,
  /** Przerwa między sekcjami (na sprzęgło) i między kolumnami podrozdzielnic. */
  sectionGap: 152,
  /** Odstęp zacisku (kropki) od symbolu urządzenia. */
  portGap: 16,
  /** Slot incomera / źródła nad szyną. */
  sourceSlot: 128,
  /** Wysokość toru źródła: kotwica SN → TR → zacisk nN → wyłącznik → szyna. */
  anchorToTransformer: 88,
  transformerToTerminal: 72,
  /** Zacisk nN → szyna (z wyłącznikiem głównym w torze): zacisk → CT →
   *  wyłącznik (`terminalToIncomer`) → przekaźnik obok kikuta dolnego → szyna. */
  terminalToBus: 176,
  terminalToIncomer: 80,
  /** Szyna → aparat odpływu i aparat → cel (zacisk/kabel). Zwięzłe pole
   *  (jak w rozdzielnicach ABB): kabel nie jest „długi", jest ogniwem. */
  busToDevice: 64,
  deviceToChild: 72,
  /** Odbiór/źródło na końcu pola: zacisk → symbol. */
  terminalToLeaf: 56,
  /** Kabel graniczny: szyna → terminal granicy; przesunięcie referencji. */
  busToBoundaryTerminal: 120,
  boundaryChipOffset: 120,
  /** Margines wewnętrzny kreski magistrali poza skrajne kikuty. */
  busOverhang: 48,
  /** Minimalna połowa długości kreski sekcji. */
  minBusHalfWidth: 96,
  /** Marginesy sceny (raster ×4) — reszta zapasu na etykiety wystające poza
   *  geometrię idzie z rezerw kompozytora, nie z marginesu. */
  marginX: 32,
  marginY: 32,
} as const;

/** Zmienne CSS §41 — te same liczby, ta sama nazwa tokenu po obu stronach. */
export function tokenyCss(): Readonly<Record<string, string>> {
  return {
    '--sld-bus-stroke': `${BUS_STROKE_SCREEN_PX.main}px`,
    '--sld-wire-stroke': `${LINE_SCREEN_PX.connection}px`,
    '--sld-device-size': `${CAD_U_PX * 24}px`,
    '--sld-transformer-size': `${CAD_U_PX * 28}px`,
    '--sld-symbol-stroke': `${CAD_SYMBOL_STROKE_PX}px`,
    '--sld-feeder-gap': `${TOKENY_GEOMETRII.feederGap}`,
    '--sld-bus-gap': `${TOKENY_GEOMETRII.busGap}`,
    '--sld-label-gap': `${TOKENY_GEOMETRII.labelGap}px`,
    '--sld-section-gap': `${TOKENY_GEOMETRII.sectionGap}`,
    '--sld-port-gap': `${TOKENY_GEOMETRII.portGap}`,
  };
}

// ===========================================================================
// FIT (§25) — zajętość 70–85 % viewportu, centrowanie, clamp.
// ===========================================================================

/** §25: fit-to-content ma dawać 70–85 % zajętości wiążącej osi. Target =
 *  środek pasma; etykiety wystające poza bbox toru są uwzględnione przez
 *  `labelReserve` sceny (kompozytor rezerwuje pas na tabliczki/nazwy). */
export const OCCUPANCY = {
  xTarget: 0.8,
  yTarget: 0.78,
  min: 0.7,
  max: 0.85,
} as const;

/**
 * MINIMALNA SZEROKOŚĆ POLA na ekranie [px] per poziom szczegółowości (R2 §17):
 * pole odpływu (slot `feederGap`) NIGDY nie jest ściskane poniżej tej
 * szerokości — zamiast pomniejszać rysunek i tekst, kanwa PRZEWIJA (pan /
 * scroll). Poziom pełny: oznaczenie „QF-12" (≈ 40 px) + odstęp + symbol 24 px
 * + zapas; poziom sieci: symbol + krótkie oznaczenie; przegląd: sam symbol.
 */
export const MIN_FIELD_WIDTH_PX: Readonly<Record<PoziomLod, number>> = { 0: 40, 1: 72, 2: 96 };

/** Górny clamp skali: zakaz rozdmuchiwania mikroschematu. */
export const FIT_SCALE_MAX = 1.6;

/** Dolna granica skali z MIN_FIELD_WIDTH (jedno wyprowadzenie dla fitu i testów). */
export function skalaMinimalna(lod: PoziomLod): number {
  return MIN_FIELD_WIDTH_PX[lod] / TOKENY_GEOMETRII.feederGap;
}

export interface SceneFit {
  readonly s: number;
  readonly tx: number;
  readonly ty: number;
  /** Rozmiar treści po skali [px]; > viewport ⇒ kanwa przewijalna. */
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly scroll: boolean;
}

export function fitSceneToViewport(
  sceneWidth: number,
  sceneHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  lod: PoziomLod = 2,
): SceneFit {
  if (sceneWidth <= 0 || sceneHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { s: 1, tx: 0, ty: 0, contentWidth: Math.max(0, sceneWidth), contentHeight: Math.max(0, sceneHeight), scroll: false };
  }
  const sRaw = Math.min(
    (OCCUPANCY.xTarget * viewportWidth) / sceneWidth,
    (OCCUPANCY.yTarget * viewportHeight) / sceneHeight,
  );
  // Dolny clamp z MIN_FIELD_WIDTH: scena, która się nie mieści, NIE jest
  // pomniejszana poniżej czytelności — wychodzi poza viewport i przewija się.
  const s = Math.min(FIT_SCALE_MAX, Math.max(skalaMinimalna(lod), sRaw));
  const contentWidth = s * sceneWidth;
  const contentHeight = s * sceneHeight;
  const scroll = contentWidth > viewportWidth || contentHeight > viewportHeight;
  return {
    s,
    tx: contentWidth > viewportWidth ? 0 : (viewportWidth - contentWidth) / 2,
    ty: contentHeight > viewportHeight ? 0 : (viewportHeight - contentHeight) / 2,
    contentWidth,
    contentHeight,
    scroll,
  };
}

// ===========================================================================
// TYPOGRAFIA (§21) — px EKRANU, screen-stable.
// ===========================================================================

export const SLD_LABEL = {
  /** Oznaczenia urządzeń, transformatorów, sekcji. */
  PRIMARY: 14,
  /** Dane inżynierskie: tabliczki, przekroje, moce. */
  SECONDARY: 11,
  /** Dane trzeciorzędne: nazwy zacisków (audyt), napięcia zacisków. */
  TERTIARY: 9.5,
  /** Stany ruchowe: NIEZASILONA / WYSPA / OTWARTY. */
  STATUS: 10.5,
  /** Wyniki (monospace): Ik″, ΔU, SWZ. */
  RESULT: 10.5,
  /** Ostrzeżenia audytu. */
  WARNING: 10.5,
} as const;

/** Odstęp linii dla etykiet wieloliniowych [× rozmiar pisma]. */
export const LINE_HEIGHT = 1.25;

/** §30 / R2 §17: długie nazwy — zawijanie do `maxChars` znaków w linii po
 *  SŁOWACH, maks. `maxLines` linii; ostatnia linia z „…", gdy reszta się nie
 *  zmieściła. ZAKAZ łamania w środku wyrazu (także technicznego z dywizem,
 *  np. „grid-following"): wyraz dłuższy niż linia zostaje w całości i jest
 *  uczciwie skrócony wielokropkiem — pełna nazwa żyje w podpowiedzi i w
 *  inspektorze, nie w połamanej etykiecie. Czysta funkcja, deterministyczna. */
export function zawinNazwe(text: string, maxChars: number, maxLines: number): readonly string[] {
  const limit = Math.max(2, Math.floor(maxChars));
  const slowa = text.trim().split(/\s+/).filter(Boolean);
  if (slowa.length === 0) return [''];
  const skroc = (s: string): string => (s.length <= limit ? s : `${s.slice(0, Math.max(1, limit - 1)).trimEnd()}…`);
  const linie: string[] = [];
  let biezaca = '';
  for (const slowo of slowa) {
    const kandydat = biezaca ? `${biezaca} ${slowo}` : slowo;
    if (kandydat.length <= limit || biezaca === '') {
      biezaca = kandydat;
    } else {
      linie.push(biezaca);
      biezaca = slowo;
    }
  }
  linie.push(biezaca);
  const zLimitem = linie.map(skroc);
  if (zLimitem.length <= maxLines) return zLimitem;
  const skrocone = zLimitem.slice(0, maxLines);
  const ostatnia = skrocone[maxLines - 1];
  skrocone[maxLines - 1] = ostatnia.endsWith('…') ? ostatnia : `${ostatnia.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
  return skrocone;
}

/** Szacunek szerokości znaku [em] dla pisma bezszeryfowego — do wyliczania
 *  limitu znaków w slocie (nie do pikselowego układu). Pismo półgrube jest
 *  szersze — osobny współczynnik, bo etykiety główne są pogrubione. */
/** Zmierzone na zrzutach kanwy (Liberation Sans): 0,50–0,54 em regular,
 *  0,54–0,58 em bold (wersaliki szersze) — wartości z zapasem w górę. */
export const CHAR_WIDTH_RATIO = 0.55;
export const CHAR_WIDTH_RATIO_BOLD = 0.6;
/** Pismo monospace (wyniki): stała szerokość znaku. */
export const CHAR_WIDTH_RATIO_MONO = 0.6;

/** Limit znaków w linii etykiety dla szerokości [px EKRANU] i rozmiaru pisma. */
export function limitZnakow(screenWidthPx: number, fontPx: number, ratio: number = CHAR_WIDTH_RATIO): number {
  return Math.max(4, Math.floor(screenWidthPx / (ratio * fontPx)));
}

// ===========================================================================
// GRUBOŚCI, WZORY, ROZMIARY SYMBOLI — px EKRANU.
// ===========================================================================

/**
 * HIERARCHIA GRUBOŚCI KRESEK (R2 §13) — techniczny system BUS / PRIMARY /
 * SECONDARY / RESULT HIGHLIGHT bez skrajnych kontrastów, jak w dokumentacji
 * rozdzielnic: szyna 3,0 px, tor pierwotny 1,6 px, symbol 1,4 px
 * (`CAD_SYMBOL_STROKE_PX`), obwód wtórny/pomiarowy 1,0 px, podświetlenie
 * wyniku 6 px pod torem (przezroczyste). Wszystko w px EKRANU (kreska
 * nieskalowana z kamerą). Magistrala główna ≠ podrozdzielnica po grubości.
 */
export const BUS_STROKE_SCREEN_PX = { main: 3, sub: 2.4 } as const;

export const JUNCTION_RADIUS_SCREEN_PX = 2.5;

/** Gramatyka linii: PRIMARY (tor pierwotny, kabel, sprzęgło) > SECONDARY
 *  (obwody wtórne: łącznik przekaźnika, granica). */
export const LINE_SCREEN_PX = {
  connection: 1.6,
  cable: 1.6,
  coupler: 1.6,
  boundary: 1.0,
  secondary: 1.0,
  /** Podświetlenie toru zasilania (§37) — obwódka pod kreską. */
  highlight: 6,
} as const;

/** Wzory kresek [px ekranu]: nośnik GEOMETRYCZNY stanu zasilania odcinka. */
export const LINE_DASH_SCREEN_PX = {
  boundary: [7, 5],
  deenergized: [3, 5],
  unknown: [1.5, 4],
} as const;

/**
 * SKALA SYMBOLI CAD (R2 §16/§19): JEDNA skala dla całej biblioteki — px
 * ekranu na 1 u rejestru `cad/cadSymbolRegistry.ts` (aparat 16×24 u → 32×48
 * px, transformator 16×28 u → 56 px, złożenie PV/BESS 16×40 u → 80 px):
 * korpus aparatu (nóż 10 u = 20 px, krzyżyk 5 u = 10 px) ma ≈ 2× wysokość
 * pisma oznaczenia (12 px) — proporcja dokumentacji rozdzielnic. Rozmiar NIE
 * koduje parametrów (moc, prąd) — wszystkie symbole na wspólnej siatce;
 * screen-stable (nie skaluje się z kamerą), z sufitem udziału w slocie, gdy
 * przegląd (LOD 0) schodzi poniżej skali minimalnej pełnego poziomu.
 */
export const CAD_U_PX = 2;

export type RodzajSymbolu = 'transformer' | 'coupler' | 'apparatus' | 'generator' | 'load' | 'measurement' | 'relay' | 'junction';

/** Maksymalny UDZIAŁ symbolu w szerokości jego slotu na ekranie (§43/§44):
 *  symbol jest screen-stable, dopóki slot to znosi; gdy przegląd schodzi w
 *  dół (MIN_FIELD_WIDTH poziomu 0), symbol maleje razem ze slotem, żeby
 *  symbole sąsiednich kolumn nigdy się nie zlewały. Slot referencyjny:
 *  `feederGap` dla aparatów/odbiorów/pomiarów, `sourceSlot` dla TR/DER. */
export const SYMBOL_SLOT_SHARE: Readonly<Record<RodzajSymbolu, number>> = {
  transformer: 0.6,
  coupler: 0.6,
  apparatus: 0.5,
  generator: 0.6,
  load: 0.4,
  measurement: 0.4,
  relay: 0.4,
  junction: 0.2,
};

/** Skala symbolu [px ekranu na 1 u] przy skali fitu: `CAD_U_PX` z sufitem
 *  udziału w slocie dla symbolu o szerokości `widthU` (jedno wyprowadzenie
 *  dla renderera i testów). */
export function skalaSymboluNaEkranie(kind: RodzajSymbolu, widthU: number, fitScale: number): number {
  const slotWorld = kind === 'transformer' || kind === 'generator' ? TOKENY_GEOMETRII.sourceSlot : TOKENY_GEOMETRII.feederGap;
  const sufitPx = SYMBOL_SLOT_SHARE[kind] * slotWorld * Math.max(fitScale, 0);
  const sufit = sufitPx / Math.max(1, widthU);
  return Math.max(0.2, Math.min(CAD_U_PX, sufit));
}

// ===========================================================================
// FORMATY LICZB (prezentacja, zero fizyki).
// ===========================================================================

export function plNumber(value: number): string {
  return String(value).replace('.', ',');
}

export function plFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

export function snKvaLabel(snMva: number): string {
  return `${plNumber(Math.round(snMva * 1000))} kVA`;
}

/** Moc [MW] → czytelna etykieta kW/MW po polsku. */
export function mocLabel(pMw: number): string {
  if (Math.abs(pMw) < 1) return `${plNumber(Math.round(pMw * 1000))} kW`;
  return `${plFixed(pMw, 2)} MW`;
}

// ===========================================================================
// STANY ZASILANIA (§5/§17/§26) — etykiety i nośniki geometryczne.
// ===========================================================================

/** Etykieta stanu ZACISKU/SEKCJI po polsku (§17: topologia, nie pomiar). */
export function etykietaStanuZasilania(state: LvEnergizationState): string | null {
  switch (state) {
    case 'DEENERGIZED':
      return 'NIEZASILONA (WG AKTUALNEJ TOPOLOGII)';
    case 'UNKNOWN':
      return 'STAN ZASILANIA NIEZNANY';
    case 'CONFLICT':
      return 'KONFLIKT ŹRÓDEŁ';
    case 'MULTISOURCE':
      return 'ZASILANIE WIELOSTRONNE';
    default:
      return null;
  }
}

/** Wzór kreski dla stanu (nośnik geometryczny; `undefined` = ciągła). */
export function wzorKreskiStanu(state: LvEnergizationState | undefined): readonly [number, number] | undefined {
  switch (state) {
    case 'DEENERGIZED':
      return LINE_DASH_SCREEN_PX.deenergized;
    case 'UNKNOWN':
      return LINE_DASH_SCREEN_PX.unknown;
    default:
      return undefined;
  }
}

// ===========================================================================
// LOD — poziomy, warstwy, rejestr elementów rysunku (JEDNO ŹRÓDŁO PRAWDY).
// ===========================================================================

export type PoziomLod = 0 | 1 | 2;
export const POZIOMY_LOD: readonly PoziomLod[] = [0, 1, 2];

/**
 * Warstwa rysunku:
 * - `tor` — wszystko, co niesie prąd albo jego stan (szyny, kikuty, kable,
 *   symbole aparatów/TR/DER/odbiorów/pomiarów, zaciski, granice, glify stanu,
 *   kotwica systemu SN). NIGDY nie znika.
 * - `tozsamosc` — kto to jest i w jakim jest stanie (nazwy, stany zasilania,
 *   wyspy, ostrzeżenia, status wyniku, zabezpieczenia). Częściowo redukowana
 *   na przeglądzie.
 * - `opis` — parametry i opisy drugorzędne. WYŁĄCZNIE poziom pełny.
 */
export type WarstwaWizualna = 'tor' | 'tozsamosc' | 'opis';

export type ElementKanwyNn =
  // --- TOR ---
  | 'szynaSekcji'
  | 'zaciskToru'
  | 'symbolAparatu'
  | 'symbolTransformatora'
  | 'symbolZrodlaDer'
  | 'symbolOdbioru'
  | 'symbolPomiaru'
  | 'zaciskGranicy'
  | 'kotwicaSystemuSn'
  | 'torZrodla'
  | 'torSprzegla'
  | 'torOdplywu'
  | 'kabelOdplywu'
  | 'linkGranicy'
  | 'podswietlenieToru'
  // --- TOZSAMOSC ---
  | 'nazwaSekcji'
  | 'licznikOdplywowSekcji'
  | 'nazwaKotwicyZrodla'
  | 'nazwaTransformatora'
  | 'nazwaAparatu'
  | 'nazwaZrodlaDer'
  | 'nazwaOdbioru'
  | 'nazwaGranicy'
  | 'znacznikStanuZasilania'
  | 'znacznikWyspy'
  | 'znacznikOstrzezenia'
  | 'symbolZabezpieczenia'
  | 'znacznikSwiezosciWyniku'
  | 'plakietkaWyniku'
  | 'kropkaWerdyktu'
  // --- OPIS ---
  | 'parametryKotwicyZrodla'
  | 'tabliczkaTransformatora'
  | 'parametrZrodlaDer'
  | 'parametrOdbioru'
  | 'parametrKabla'
  | 'napiecieSekcji'
  | 'napiecieGranicy'
  | 'nazwaZaciskuModelu'
  | 'nazwaPomiaru'
  | 'stanSlownyLacznika'
  | 'pochodzenieWyniku';

export interface WpisRejestruElementu {
  readonly warstwa: WarstwaWizualna;
  readonly lody: readonly PoziomLod[];
  readonly powod: string;
}

const WSZYSTKIE: readonly PoziomLod[] = [0, 1, 2];
const OD_SIECI: readonly PoziomLod[] = [1, 2];
const TYLKO_PELNY: readonly PoziomLod[] = [2];
const TYLKO_PRZEGLAD: readonly PoziomLod[] = [0];

export const REJESTR_ELEMENTOW_KANWY: Readonly<Record<ElementKanwyNn, WpisRejestruElementu>> = {
  szynaSekcji: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kreska magistrali — sekcja rozdzielnicy jest torem, nie etykietą.' },
  zaciskToru: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kropka zacisku w punkcie rozgałęzienia toru (stopień ≠ 2) — jawny węzeł, nie „przeciek" kotwicy.' },
  symbolAparatu: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Aparat z glifem STANU — zakaz ukrywania aparatury i stanów OPEN/CLOSED.' },
  symbolTransformatora: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Transformator = źródło domeny nN; zakaz ukrywania na jakimkolwiek poziomie.' },
  symbolZrodlaDer: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Źródło rozproszone — źródło zasilania toru (albo wyspy).' },
  symbolOdbioru: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Odbiór = punkt końcowy odpływu.' },
  symbolPomiaru: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Przekładnik w torze (CT) albo na odgałęzieniu (VT) — element toru pierwotnego z modelu.' },
  zaciskGranicy: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Terminal granicy domeny — koniec toru wychodzącego poza domenę.' },
  kotwicaSystemuSn: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kreska systemu SN spinająca transformatory o WSPÓLNYM zasilaniu — bez niej dwa TR wyglądają jak dwa niezależne systemy.' },
  torZrodla: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Zejście kotwica → TR → zacisk nN → wyłącznik główny → szyna oraz zejścia źródeł.' },
  torSprzegla: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kikuty sprzęgła między sekcjami — każdy w stanie SWOJEGO zacisku.' },
  torOdplywu: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kikut/gałąź odpływu i zejście odbioru — każdy odpływ ma kreskę do swojego punktu końcowego.' },
  kabelOdplywu: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kabel/linia odpływu — odrębna klasa kreski, nadal tor prądu.' },
  linkGranicy: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Referencja graniczna (terminal → strzałka) — granica domeny jest torem.' },
  podswietlenieToru: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Podświetlenie pełnego toru zasilania wybranego elementu (z `supply_paths` backendu) — stan interakcji na torze.' },

  nazwaSekcji: { warstwa: 'tozsamosc', lody: WSZYSTKIE, powod: 'Nazwa sekcji — jedyna tożsamość dopuszczona na przeglądzie (obok liczby odpływów).' },
  licznikOdplywowSekcji: { warstwa: 'tozsamosc', lody: TYLKO_PRZEGLAD, powod: 'Liczba odpływów sekcji zastępuje na przeglądzie nazwy poszczególnych odpływów.' },
  nazwaKotwicyZrodla: { warstwa: 'tozsamosc', lody: WSZYSTKIE, powod: 'Tożsamość systemu SN (poziom napięcia, źródło) — punkt startu toru musi być rozpoznawalny zawsze.' },
  nazwaTransformatora: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Oznaczenie transformatora; na przeglądzie sylwetka wystarcza.' },
  nazwaAparatu: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Oznaczenie aparatu; na przeglądzie zostaje symbol i stan.' },
  nazwaZrodlaDer: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Nazwa źródła rozproszonego.' },
  nazwaOdbioru: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Nazwa odbioru — tożsamość punktu końcowego odpływu.' },
  nazwaGranicy: { warstwa: 'tozsamosc', lody: WSZYSTKIE, powod: 'Nazwa stacji po drugiej stronie granicy — nazwa STACJI, dopuszczona na przeglądzie.' },
  znacznikStanuZasilania: { warstwa: 'tozsamosc', lody: WSZYSTKIE, powod: 'Stan zasilania sekcji (NIEZASILONA wg topologii / NIEZNANY / KONFLIKT / WIELOSTRONNE) — stan ruchowy tej samej klasy co OPEN/CLOSED, widoczny zawsze.' },
  znacznikWyspy: { warstwa: 'tozsamosc', lody: WSZYSTKIE, powod: 'Wyspa bez sieci (z DER tworzącym / podążającym / o nieznanej zdolności) — skutki dla bezpieczeństwa, widoczna zawsze.' },
  znacznikOstrzezenia: { warstwa: 'tozsamosc', lody: WSZYSTKIE, powod: 'Znacznik komunikatu audytu przy elemencie — ostrzeżenie backendu jest faktem o elemencie, nie opisem.' },
  symbolZabezpieczenia: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Zabezpieczenie przypisane do aparatu (kody funkcji) — tożsamość ochrony; na przeglądzie znika jak nazwy aparatów.' },
  znacznikSwiezosciWyniku: { warstwa: 'tozsamosc', lody: WSZYSTKIE, powod: 'Status wyniku (brak/nieaktualny/aktualny) jest tożsamością wyniku — jawny na każdym poziomie.' },
  plakietkaWyniku: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Liczbowa plakietka nakładki — na przeglądzie zastępuje ją kropka werdyktu.' },
  kropkaWerdyktu: { warstwa: 'tozsamosc', lody: TYLKO_PRZEGLAD, powod: 'Uproszczona postać nakładki na przeglądzie: werdykt bez liczby.' },

  parametryKotwicyZrodla: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Sk″/Ik″ strony SN — parametr, nie tożsamość.' },
  tabliczkaTransformatora: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Sn/przekładnia/grupa/uk — opis drugorzędny.' },
  parametrZrodlaDer: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Moc źródła i zdolność pracy wyspowej — parametr.' },
  parametrOdbioru: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Moc odbioru — parametr.' },
  parametrKabla: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Typ/przekrój kabla z katalogu — parametr.' },
  napiecieSekcji: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Napięcie szyny — parametr; poziom napięcia domeny jest w nagłówku.' },
  napiecieGranicy: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Napięcie zacisku granicznego — parametr.' },
  nazwaZaciskuModelu: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Nazwa zacisku modelu (tryb audytu topologii) — opis modelu.' },
  nazwaPomiaru: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Oznaczenie i przekładnia przekładnika — parametr.' },
  stanSlownyLacznika: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Słowo OTWARTY/ZAMKNIĘTY — drugorzędne potwierdzenie glifu, który zostaje zawsze.' },
  pochodzenieWyniku: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Identyfikator przebiegu/rewizji przy plakietce wyniku — pochodzenie (§19), nie sam wynik.' },
};

export function warstwaElementu(kind: ElementKanwyNn): WarstwaWizualna {
  return REJESTR_ELEMENTOW_KANWY[kind].warstwa;
}

export function widocznyNaLod(kind: ElementKanwyNn, lod: PoziomLod): boolean {
  return REJESTR_ELEMENTOW_KANWY[kind].lody.includes(lod);
}

export function elementyToru(): readonly ElementKanwyNn[] {
  return (Object.keys(REJESTR_ELEMENTOW_KANWY) as ElementKanwyNn[]).filter(
    (kind) => warstwaElementu(kind) === 'tor',
  );
}

/** Liczba odpływów sekcji po polsku (1 odpływ / 2–4 odpływy / 5+ odpływów). */
export function licznikOdplywowLabel(liczba: number): string {
  const setki = liczba % 100;
  const jednosci = liczba % 10;
  if (liczba === 1) return '1 odpływ';
  if (jednosci >= 2 && jednosci <= 4 && !(setki >= 12 && setki <= 14)) return `${liczba} odpływy`;
  return `${liczba} odpływów`;
}

// ===========================================================================
// PALETA (§27) — z motywu powłoki; tryb MONO (druk §44) bez utraty informacji.
// ===========================================================================

export interface PaletaNn {
  readonly tlo: string;
  readonly kreskaBazowa: string;
  readonly kreskaWygaszona: string;
  readonly kreskaOtwarta: string;
  readonly kreskaGranicy: string;
  readonly kreskaKabla: string;
  readonly wypelnienieZacisku: string;
  readonly bezNapiecia: string;
  readonly tonOk: string;
  readonly tonBledu: string;
  readonly tonOstrzegawczy: string;
  readonly tonInfo: string;
  readonly podswietlenie: string;
  readonly panelTlo: string;
  readonly panelCien: string;
  readonly przyciskAktywnyTlo: string;
}

interface TokenyLokalne {
  readonly kreskaWygaszona: string;
  readonly kreskaOtwarta: string;
  readonly kreskaGranicy: string;
  readonly kreskaKabla: string;
  readonly wypelnienieZacisku: string;
  readonly tonInfo: string;
  readonly podswietlenie: string;
  readonly panelTlo: string;
  readonly panelCien: string;
  readonly przyciskAktywnyTlo: string;
}

const TOKENY_CIEMNE: TokenyLokalne = {
  kreskaWygaszona: '#5B6B7A',
  kreskaOtwarta: '#8A98A6',
  kreskaGranicy: '#E8A33D',
  kreskaKabla: '#6FA0C2',
  wypelnienieZacisku: '#B8C4CF',
  tonInfo: '#5FA8D3',
  podswietlenie: '#2E7DD1',
  panelTlo: '#111821F2',
  panelCien: '0 12px 36px #000A',
  przyciskAktywnyTlo: '#1D3A2E',
};

const TOKENY_JASNE: TokenyLokalne = {
  kreskaWygaszona: '#5A6673',
  kreskaOtwarta: '#6B7684',
  kreskaGranicy: '#8A5A00',
  kreskaKabla: '#0A5A78',
  wypelnienieZacisku: '#39434E',
  tonInfo: '#1F5F8B',
  podswietlenie: '#1B6AC9',
  panelTlo: '#FFFFFFF2',
  panelCien: '0 12px 36px #00000026',
  przyciskAktywnyTlo: '#E3F3EA',
};

export function paletaNnDlaMotywu(mode: ThemeMode): PaletaNn {
  const wspolna = sldPaletteForTheme(mode);
  const lokalne = mode === 'light_technical' ? TOKENY_JASNE : TOKENY_CIEMNE;
  return {
    tlo: wspolna.canvasBackground,
    kreskaBazowa: wspolna.baseStroke,
    bezNapiecia: wspolna.highlight.deenergized,
    tonOk: wspolna.highlight.swzOk,
    tonBledu: wspolna.highlight.swzFail,
    tonOstrzegawczy: wspolna.highlight.swzUnknown,
    ...lokalne,
  };
}

/** Paleta MONOCHROMATYCZNA (druk A4/A3, §44): jeden tusz na białym. Stany
 *  niosą wzory kresek, glify i znaczniki tekstowe — kolor nie jest potrzebny
 *  do odczytu żadnego faktu (pin: test stanów w trybie mono). */
export function paletaMono(): PaletaNn {
  const tusz = '#000000';
  const szary = '#555555';
  return {
    tlo: '#FFFFFF',
    kreskaBazowa: tusz,
    kreskaWygaszona: szary,
    kreskaOtwarta: tusz,
    kreskaGranicy: tusz,
    kreskaKabla: tusz,
    wypelnienieZacisku: tusz,
    bezNapiecia: szary,
    tonOk: tusz,
    tonBledu: tusz,
    tonOstrzegawczy: tusz,
    tonInfo: tusz,
    podswietlenie: szary,
    panelTlo: '#FFFFFF',
    panelCien: 'none',
    przyciskAktywnyTlo: '#EEEEEE',
  };
}

/** Ton (drugi kanał) dla stanu zasilania odcinka/zacisku. */
export function tonStanuZasilania(state: LvEnergizationState | undefined, paleta: PaletaNn): string {
  switch (state) {
    case 'DEENERGIZED':
      return paleta.bezNapiecia;
    case 'UNKNOWN':
      return paleta.kreskaWygaszona;
    case 'CONFLICT':
      return paleta.tonBledu;
    default:
      return paleta.kreskaBazowa;
  }
}

/** Ton werdyktu z severity nakładki wynikowej (gotowy werdykt backendu). */
export function tonWerdyktuSeverity(severity: string | undefined, paleta: PaletaNn): string {
  switch (severity) {
    case 'CRITICAL':
    case 'BLOCKER':
    case 'IMPORTANT':
      return paleta.tonBledu;
    case 'WARNING':
      return paleta.tonOstrzegawczy;
    case 'INFO':
      return paleta.tonOk;
    default:
      return paleta.kreskaBazowa;
  }
}

/** Ton komunikatu walidacji wg wagi. */
export function tonWagi(severity: string, paleta: PaletaNn): string {
  if (severity === 'BLOCKER') return paleta.tonBledu;
  if (severity === 'IMPORTANT') return paleta.tonOstrzegawczy;
  return paleta.tonInfo;
}
