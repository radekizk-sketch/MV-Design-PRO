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
    '--sld-device-size': `${SYMBOL_SCREEN_PX.apparatus}px`,
    '--sld-transformer-size': `${SYMBOL_SCREEN_PX.transformer}px`,
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

/** Clamp skali fitu: `min` — poniżej raster odpływów schodzi pod czytelność
 *  (schemat wymaga innej reprezentacji, nie mniejszego rysunku); `max` —
 *  zakaz rozdmuchiwania mikroschematu. */
export const FIT_SCALE_CLAMP = { min: 0.4, max: 1.6 } as const;

export interface SceneFit {
  readonly s: number;
  readonly tx: number;
  readonly ty: number;
}

export function fitSceneToViewport(
  sceneWidth: number,
  sceneHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): SceneFit {
  if (sceneWidth <= 0 || sceneHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { s: 1, tx: 0, ty: 0 };
  }
  const sRaw = Math.min(
    (OCCUPANCY.xTarget * viewportWidth) / sceneWidth,
    (OCCUPANCY.yTarget * viewportHeight) / sceneHeight,
  );
  // Dolny clamp NIGDY nie może wypchnąć sceny poza viewport (§43, wąski ekran):
  // gdy skala minimalna nie mieści całości, obowiązuje skala „zmieść wszystko".
  const sFitAll = Math.min(viewportWidth / sceneWidth, viewportHeight / sceneHeight);
  const sMin = Math.min(FIT_SCALE_CLAMP.min, sFitAll);
  const s = Math.min(FIT_SCALE_CLAMP.max, Math.max(sMin, sRaw));
  return {
    s,
    tx: (viewportWidth - s * sceneWidth) / 2,
    ty: (viewportHeight - s * sceneHeight) / 2,
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

/** §30: długie nazwy — zawijanie do `maxChars` znaków w linii (słowa, bez
 *  łamania w środku wyrazu), maks. `maxLines` linii; ostatnia linia z „…"
 *  gdy nie zmieściła się reszta. Czysta funkcja, deterministyczna. */
export function zawinNazwe(text: string, maxChars: number, maxLines: number): readonly string[] {
  const limit = Math.max(2, Math.floor(maxChars));
  const slowa = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Pojedynczy wyraz dłuższy niż linia: ŁAMANIE z dywizem na kawałki
    // mieszczące się w slocie (§30). Nawis „limit + 30 %" wchodził w tło
    // etykiety sąsiada i ucinał mu końcówkę (zrzut 15_many_feeders:
    // „przeciwpożarov", „ładowani") — etykieta NIGDY nie wychodzi poza slot.
    .flatMap((slowo) => {
      if (slowo.length <= limit) return [slowo];
      // Najpierw naturalne miejsce łamania: istniejący dywiz w wyrazie
      // („grid-following" → „grid-" + „following"), dopiero potem twarde
      // łamanie na kawałki z dywizem.
      const naturalne = slowo.split(/(?<=-)/).filter(Boolean);
      const czesci = naturalne.length > 1 ? naturalne : [slowo];
      const kawalki: string[] = [];
      for (const czesc of czesci) {
        let reszta = czesc;
        while (reszta.length > limit) {
          kawalki.push(`${reszta.slice(0, limit - 1)}-`);
          reszta = reszta.slice(limit - 1);
        }
        kawalki.push(reszta);
      }
      return kawalki;
    });
  if (slowa.length === 0) return [''];
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
  if (linie.length <= maxLines) return linie;
  const skrocone = linie.slice(0, maxLines);
  const ostatnia = skrocone[maxLines - 1];
  skrocone[maxLines - 1] = `${ostatnia.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
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

/** Hierarchia magistral: MAIN ≠ SUB rozpoznawalne bez etykiety. */
export const BUS_STROKE_SCREEN_PX = { main: 8, sub: 5 } as const;

export const JUNCTION_RADIUS_SCREEN_PX = 3;

/** Gramatyka linii: tor wewnętrzny > kabel > granica. */
export const LINE_SCREEN_PX = {
  connection: 2.4,
  cable: 1.8,
  coupler: 3,
  boundary: 1.5,
  /** Podświetlenie toru zasilania (§37) — obwódka pod kreską. */
  highlight: 7,
} as const;

/** Wzory kresek [px ekranu]: nośnik GEOMETRYCZNY stanu zasilania odcinka. */
export const LINE_DASH_SCREEN_PX = {
  boundary: [7, 5],
  deenergized: [3, 5],
  unknown: [1.5, 4],
} as const;

/** Cele rozmiarów SYMBOLI [px EKRANU, wysokość glifu]. Transformator o
 *  ~26 % lżejszy niż dotąd (84 → 62, §9) — nadal największy element toru. */
export const SYMBOL_SCREEN_PX = {
  transformer: 62,
  coupler: 40,
  apparatus: 32,
  generator: 44,
  load: 22,
  measurement: 24,
  relay: 22,
  junction: 8,
} as const;

export function glyphScaleForScreenTarget(worldExtent: number, targetScreenPx: number, fitScale: number): number {
  if (worldExtent <= 0 || fitScale <= 0) return 1;
  return targetScreenPx / (worldExtent * fitScale);
}

export type RodzajSymbolu = keyof typeof SYMBOL_SCREEN_PX;

/** Maksymalny UDZIAŁ symbolu w szerokości jego slotu na ekranie (§43/§44):
 *  symbol jest screen-stable, dopóki slot to znosi; gdy scena schodzi w dół
 *  (wąski ekran, wiele odpływów), symbol maleje razem ze slotem, żeby glify
 *  sąsiednich kolumn nigdy się nie zlewały w pas. Slot referencyjny:
 *  `feederGap` dla aparatów/odbiorów/pomiarów, `sourceSlot` dla TR/DER. */
export const SYMBOL_SLOT_SHARE: Readonly<Record<RodzajSymbolu, number>> = {
  transformer: 0.6,
  coupler: 0.45,
  apparatus: 0.4,
  generator: 0.5,
  load: 0.3,
  measurement: 0.3,
  relay: 0.3,
  junction: 0.12,
};

/** Cel rozmiaru symbolu [px EKRANU] przy skali fitu: screen-stable z sufitem
 *  udziału w slocie (jedno wyprowadzenie dla renderera i testów). */
export function celGlifuNaEkranie(kind: RodzajSymbolu, fitScale: number): number {
  const slotWorld = kind === 'transformer' || kind === 'generator' ? TOKENY_GEOMETRII.sourceSlot : TOKENY_GEOMETRII.feederGap;
  const sufit = SYMBOL_SLOT_SHARE[kind] * slotWorld * Math.max(fitScale, 0);
  return Math.max(2, Math.min(SYMBOL_SCREEN_PX[kind], sufit));
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
