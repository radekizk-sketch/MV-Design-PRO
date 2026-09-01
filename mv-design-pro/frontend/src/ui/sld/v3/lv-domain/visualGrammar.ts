/**
 * SLD VISUAL GRAMMAR — L2 (karta T5b-4, werdykt B-02 6/10 → mandat
 * „PROFESSIONAL VISUAL GRAMMAR & ENGINEERING POLISH", pkt 25: „Potrzebny
 * jest jeden język, nie suma komponentów").
 *
 * JEDYNE źródło prawdy warstwy wizualnej kanwy L2: polityka fit/occupancy
 * (P0-V1/P0-V10), typografia SCREEN-STABLE (P0-V2), cele rozmiarów symboli
 * (P0-V3/P0-V6), hierarchia magistral (P0-V5), gramatyka linii (werdykt
 * pkt 13). `LvDomainView` NIE trzyma własnych stałych wizualnych — czyta
 * wyłącznie ten moduł; dwie kopie języka rozjechałyby się przy pierwszej
 * zmianie (reguła KLASA §3 — predykaty parami).
 *
 * ZASADA WORLD-SCALED vs SCREEN-STABLE (werdykt T5a, twarda reguła):
 * - WORLD-SCALED: geometria torów/rastrów/szyn (długości, pozycje) — skaluje
 *   się z kamerą/fitem.
 * - SCREEN-STABLE (clamped): typografia PRIMARY/SECONDARY, grubości kresek,
 *   rozmiary SYMBOLI aparatów — stały rozmiar w px EKRANU niezależnie od
 *   skali fitu. Zakaz „14 px world × scale 0,55 = 7,7 px ekranu" (P0-V2).
 * Konwersja: wartość ekranowa / skala fitu = wartość świata do wpisania w
 * atrybut SVG wewnątrz grupy transformowanej.
 *
 * =========================================================================
 * LOD PROJEKCJI nN — SEMANTYKA WARSTW (dyrektywa właściciela: „KAŻDA
 * projekcja, SN i nN, ma WŁASNY LOD 0/1/2 na JEDNEJ geometrii").
 * =========================================================================
 *
 * JEDNA GEOMETRIA. `composeLvDomainScene` liczy scenę RAZ, bez parametru
 * LOD. LOD jest WYŁĄCZNIE filtrem PREZENTACJI w `LvDomainView` (co narysować
 * z tej samej sceny) — zero drugiej geometrii, zero przeliczania layoutu per
 * poziom. Dwie geometrie rozjechałyby się przy pierwszej zmianie rastru, a
 * „ten sam schemat w trzech skalach" przestałby być tym samym schematem.
 *
 * ZAKAZ BEZWZGLĘDNY. LOD nie ukrywa NIGDY, na ŻADNYM poziomie: rzeczywistej
 * drogi prądu (kikuty, kable, szyny, sprzęgła), transformatora, istotnej
 * aparatury, stanów OPEN/CLOSED, punktów normalnie otwartych, źródeł (TR,
 * kotwica SN/upstream, DER), odbiorów, granic domen (boundary links) ani
 * stanu zasilania (bez napięcia / wyspa DER — ta sama klasa co OPEN/CLOSED:
 * stan ruchowy, nie opis). Znika WYŁĄCZNIE warstwa opisowa i — na poziomie
 * przeglądu — etykiety aparatów.
 *
 * L2 (pełny): wszystko — symbole aparatów, etykiety typów/parametrów,
 *   tabliczki, nakładki wyników w pełnej postaci tekstowej.
 * L1 (sieć): pełny tor elektryczny (TR, incomer, szyny, sprzęgła ze stanem,
 *   kable/odpływy, aparaty odpływów jako SYMBOLE bez etykiet parametrów,
 *   podrozdzielnice, odbiory, DER, granice, punkty normalnie otwarte),
 *   etykiety WYŁĄCZNIE tożsamości (nazwy sekcji/odpływów/DER/odbiorów) —
 *   bez opisów drugorzędnych (przekrój/typ kabla, nastawy, Sn i uk
 *   transformatora jako tekst, napięcia zacisków, nazwy portów modelu).
 * L0 (przegląd): pełny tor elektryczny w postaci UPROSZCZONEJ, ale
 *   KOMPLETNEJ: TR, szyny/sekcje, sprzęgła ze stanem, KAŻDY odpływ jako
 *   kreska do swojego punktu końcowego (odbiór/podrozdzielnica/granica/DER)
 *   z symbolem końcowym; etykiety wyłącznie nazwa sekcji + liczba odpływów
 *   sekcji (nazwa stacji jest w nagłówku widoku); stany łączeniowe i stan
 *   zasilania nadal widoczne (glif + styl kreski); nakładka wyników zwija
 *   się do KROPKI WERDYKTU przy odpływie zamiast plakietki liczbowej.
 *
 * JEDNO ŹRÓDŁO KLASYFIKACJI. Przydział elementu rysunku do warstwy
 * {TOR, TOZSAMOSC, OPIS} i do poziomów, na których jest widoczny, żyje
 * WYŁĄCZNIE w `REJESTR_ELEMENTOW_KANWY` niżej (`warstwaElementu`,
 * `widocznyNaLod`). Renderer nie ma prawa porównywać `lod` punktowo —
 * `if (lod < 2)` rozsiane po komponentach to dokładnie ten dług, który
 * sprawia, że „tor znika na przeglądzie" w miejscu, o którym nikt nie
 * pamiętał (pin: `__tests__/lodProjekcjaNn.test.tsx`).
 */
import { sldPaletteForTheme } from '../theme/palette';
import type { ThemeMode } from '../../../../ui2/theme/themeMode';

/**
 * P0-V1 — polityka zajętości viewportu (occupancy) przy DOMYŚLNYM wejściu
 * do L2. Wartości właściciela: „small fixture: 60–75% szerokości, 55–75%
 * wysokości". Target = środek pasma z lekkim zapasem na etykiety wystające
 * poza bbox sceny (bbox liczy geometrię torów, nie szerokość tekstów).
 */
export const OCCUPANCY = {
  xTarget: 0.7,
  yTarget: 0.66,
} as const;

/**
 * P0-V1 — clamp skali fitu. `min`: poniżej tej skali raster odpływów
 * (TAP_PITCH 96 świata) schodzi pod ~43 px ekranu — aparat (30 px) plus
 * odstęp przestaje się mieścić, schemat wymaga innej REPREZENTACJI, nie
 * mniejszego rysunku (ta sama zasada co `MIN_SYMBOL_SCREEN_PX` w
 * `symbols/defs.ts`). `max`: zakaz rozdmuchiwania mikroschematu do
 * karykatury — mała fixtura ma być DUŻA, nie GIGANTYCZNA (werdykt:
 * occupancy, nie „powiększ wszystko").
 */
export const FIT_SCALE_CLAMP = { min: 0.45, max: 1.8 } as const;

export interface SceneFit {
  /** Skala świat→ekran. */
  readonly s: number;
  /** Translacja px ekranu (składana PRZED skalą: translate(tx,ty) scale(s)). */
  readonly tx: number;
  readonly ty: number;
}

/**
 * P0-V1/P0-V10 — fit sceny do viewportu: skala z pasma occupancy (osobno
 * X/Y, wiąże oś bardziej ograniczająca), clamp, CENTROWANIE w obu osiach
 * (mały schemat NIGDY nie klei się do lewej — werdykt pkt 17). Czysta
 * funkcja — deterministyczna, testowalna bez DOM.
 */
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
  const s = Math.min(FIT_SCALE_CLAMP.max, Math.max(FIT_SCALE_CLAMP.min, sRaw));
  return {
    s,
    tx: (viewportWidth - s * sceneWidth) / 2,
    ty: (viewportHeight - s * sceneHeight) / 2,
  };
}

/**
 * P0-V2 — typografia SCREEN-STABLE [px EKRANU]. Trzy poziomy + nagłówek
 * sekcji szyn i plakietki wyników. TERTIARY jako jedyny może podlegać LOD
 * (w L2: tryb etykiet AUDYT — P0-V7).
 */
export const TYPE_SCREEN_PX = {
  /** Oznaczenia urządzeń (T1/QF-01/PV1) i nazwy sekcji głównych. */
  primary: 15,
  /** Parametry znamionowe, wartości mocy, stany słowne. */
  secondary: 11.5,
  /** Nazwy zacisków/portów — WYŁĄCZNIE tryb etykiet AUDYT (P0-V7). */
  tertiary: 10,
  /** Nagłówek sekcji podrzędnej (podrozdzielnica). */
  busSub: 13,
  /** Plakietki wyników (SWZ/Ik/ΔU) — monospace. */
  badge: 10.5,
} as const;

/**
 * P0-V5 — hierarchia magistral [px EKRANU]: MAIN LV BUS ≠ SUBDISTRIBUTION
 * BUS rozpoznawalne bez czytania etykiety (werdykt pkt 2). Zacisk/junction
 * nie jest kreską — jest kropką (własna klasa, `junctionRadius`).
 */
export const BUS_STROKE_SCREEN_PX = {
  main: 9,
  sub: 5.5,
} as const;

/** Promień kropki zacisku pośredniego / terminala granicy [px EKRANU]. */
export const JUNCTION_RADIUS_SCREEN_PX = 3.2;

/**
 * Gramatyka linii [px EKRANU] (werdykt pkt 13): BUS (osobno wyżej) >
 * INTERNAL CONNECTION (tor wewnętrzny: kikuty, incomer, zejścia źródeł) >
 * CABLE (kabel odpływu — cieńszy, zaokrąglone końce) > BOUNDARY
 * (przerywany) / LOGICAL (kropkowany). Bez choinki: różnice grubości i
 * stylu kreski, nie kolorów per klasa.
 */
export const LINE_SCREEN_PX = {
  connection: 2.6,
  cable: 1.9,
  coupler: 3.2,
  boundary: 1.6,
} as const;

/** Wzory kresek [px EKRANU]: [kreska, przerwa] — konsument mnoży przez
 *  odwrotność skali fitu (screen-stable jak grubości). */
export const LINE_DASH_SCREEN_PX = {
  boundary: [7, 5],
  open: [6, 5],
  /** Odcinek BEZ NAPIĘCIA (`buses[i].energized === false`) — kreska gęsta i
   *  krótka, ŚWIADOMIE inna od `open` (aparat otwarty): to dwa różne fakty
   *  ruchowe i nie wolno ich zlać w jeden wzór. Aparat może być zamknięty na
   *  szynie bez napięcia i odwrotnie. */
  bezNapiecia: [3, 5],
} as const;

/**
 * P0-V3/P0-V6/P0-V9 — cele rozmiarów SYMBOLI [px EKRANU, wysokość glifu].
 * Transformator = centrum toru zasilania (największy); sprzęgło = aparat
 * sekcjonowania (większy niż aparat odpływu — stan ma być widoczny z
 * daleka); DER = tożsamość źródła (większy niż odbiór).
 */
export const SYMBOL_SCREEN_PX = {
  transformer: 84,
  coupler: 44,
  apparatus: 34,
  generator: 54,
  load: 26,
  junction: 9,
} as const;

/**
 * Skala glifu dla celu ekranowego: glif ma `worldExtent` jednostek świata,
 * na ekranie ma mieć `targetScreenPx` — przy skali fitu `s` mnożnik glifu
 * to target/(extent·s). Jedna formuła dla wszystkich klas symboli (reguła
 * KLASA §5 — ten sam wzorzec wszędzie, nie per-symbol wyjątki).
 */
export function glyphScaleForScreenTarget(worldExtent: number, targetScreenPx: number, fitScale: number): number {
  if (worldExtent <= 0 || fitScale <= 0) return 1;
  return targetScreenPx / (worldExtent * fitScale);
}

/** Format liczby po polsku (przecinek dziesiętny) — WYŁĄCZNIE prezentacja
 *  wartości już policzonych przez backend/model (zero fizyki). */
export function plNumber(value: number): string {
  return String(value).replace('.', ',');
}

/** Sn [MVA] → [kVA] na tabliczce TR (werdykt pkt 4: „TR1 / 630 kVA" jako
 *  poziom PRIMARY). Konwersja jednostek = prezentacja, nie obliczenie. */
export function snKvaLabel(snMva: number): string {
  return `${plNumber(Math.round(snMva * 1000))} kVA`;
}

// ===========================================================================
// LOD — poziomy, warstwy, rejestr elementów rysunku (JEDNO ŹRÓDŁO PRAWDY).
// ===========================================================================

/** Poziom szczegółowości projekcji nN: 0 przegląd, 1 sieć, 2 pełny. */
export type PoziomLod = 0 | 1 | 2;

export const POZIOMY_LOD: readonly PoziomLod[] = [0, 1, 2];

/**
 * Warstwa rysunku:
 * - `tor` — wszystko, co niesie prąd albo jego stan (szyny, kikuty, kable,
 *   symbole aparatów/TR/DER/odbiorów, zaciski, granice, glify stanu). NIGDY
 *   nie znika — widoczna na KAŻDYM poziomie.
 * - `tozsamosc` — kto to jest (nazwa sekcji/aparatu/źródła/odbioru/granicy)
 *   oraz stan wyniku i stan zasilania. Częściowo redukowana na przeglądzie.
 * - `opis` — parametry i opisy drugorzędne (tabliczka TR, napięcia zacisków,
 *   moce, nazwy portów modelu, słowne potwierdzenie stanu łącznika,
 *   liczbowe plakietki nakładek). WYŁĄCZNIE poziom pełny.
 */
export type WarstwaWizualna = 'tor' | 'tozsamosc' | 'opis';

/**
 * ZAMKNIĘTA lista elementów rysowanych przez `LvDomainView`. Każdy element,
 * który renderer może narysować albo pominąć, MUSI mieć tu wpis — element
 * bez wpisu nie ma prawa istnieć w rendererze (pin: test rejestru sprawdza,
 * że każdy klucz jest realnie użyty w `LvDomainView.tsx`, a renderer nie
 * porównuje `lod` poza jednym miejscem wyprowadzenia filtra).
 */
export type ElementKanwyNn =
  // --- TOR (poziomy 0/1/2, bez wyjątków) ---
  | 'szynaSekcji'
  | 'zaciskToru'
  | 'symbolAparatu'
  | 'symbolTransformatora'
  | 'symbolZrodlaDer'
  | 'symbolOdbioru'
  | 'zaciskGranicy'
  | 'torZrodla'
  | 'torSprzegla'
  | 'torOdplywu'
  | 'kabelOdplywu'
  | 'linkGranicy'
  // --- TOZSAMOSC ---
  | 'nazwaSekcji'
  | 'licznikOdplywowSekcji'
  | 'nazwaKotwicyZrodla'
  | 'nazwaTransformatora'
  | 'nazwaAparatu'
  | 'nazwaZrodlaDer'
  | 'nazwaOdbioru'
  | 'nazwaGranicy'
  | 'znacznikBezNapiecia'
  | 'znacznikWyspyDer'
  | 'znacznikSwiezosciWyniku'
  | 'plakietkaWyniku'
  | 'kropkaWerdyktu'
  // --- OPIS ---
  | 'parametryKotwicyZrodla'
  | 'tabliczkaTransformatora'
  | 'parametrZrodlaDer'
  | 'parametrOdbioru'
  | 'napiecieSekcji'
  | 'napiecieGranicy'
  | 'nazwaZaciskuModelu'
  | 'stanSlownyLacznika';

export interface WpisRejestruElementu {
  readonly warstwa: WarstwaWizualna;
  /** Poziomy, na których element jest rysowany. */
  readonly lody: readonly PoziomLod[];
  /** Po co ten element istnieje i dlaczego ma taki zasięg (czytane przy
   *  każdej zmianie kanonu LOD — bez tego wpisu klasyfikacja jest zgadywana). */
  readonly powod: string;
}

const WSZYSTKIE: readonly PoziomLod[] = [0, 1, 2];
const OD_SIECI: readonly PoziomLod[] = [1, 2];
const TYLKO_PELNY: readonly PoziomLod[] = [2];
const TYLKO_PRZEGLAD: readonly PoziomLod[] = [0];

/**
 * REJESTR — jedyne miejsce, w którym zapada decyzja „co widać na którym
 * poziomie". Filtr LOD w rendererze czyta WYŁĄCZNIE stąd.
 */
export const REJESTR_ELEMENTOW_KANWY: Readonly<Record<ElementKanwyNn, WpisRejestruElementu>> = {
  szynaSekcji: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kreska magistrali — sekcja rozdzielnicy jest torem, nie etykietą.' },
  zaciskToru: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kropka zacisku/junctiona — jawny punkt toru między aparatem a kablem.' },
  symbolAparatu: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Aparat (wyłącznik/rozłącznik/odłącznik/wkładka/sprzęgło) razem z glifem STANU — zakaz ukrywania aparatury i stanów.' },
  symbolTransformatora: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Transformator = źródło domeny nN; zakaz ukrywania na jakimkolwiek poziomie.' },
  symbolZrodlaDer: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Źródło rozproszone (PV/BESS/generator) — źródło zasilania toru.' },
  symbolOdbioru: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Odbiór = punkt końcowy odpływu; na przeglądzie niesie sam symbol końcowy.' },
  zaciskGranicy: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Terminal granicy domeny — koniec toru wychodzącego poza domenę.' },
  torZrodla: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Zejście kotwica → TR → zacisk nN oraz zejście DER — droga prądu od źródła.' },
  torSprzegla: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kikuty sprzęgła między sekcjami — sekcjonowanie musi być widoczne zawsze.' },
  torOdplywu: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kikut/gałąź odpływu i zejście odbioru — każdy odpływ ma kreskę do swojego punktu końcowego.' },
  kabelOdplywu: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Kabel/linia odpływu — odrębna klasa kreski, ale nadal tor prądu.' },
  linkGranicy: { warstwa: 'tor', lody: WSZYSTKIE, powod: 'Referencja graniczna (terminal → strzałka) — granica domeny jest torem, nie adnotacją.' },

  nazwaSekcji: { warstwa: 'tozsamosc', lody: WSZYSTKIE, powod: 'Nazwa szyny/sekcji — jedyna tożsamość dopuszczona na przeglądzie (obok liczby odpływów).' },
  licznikOdplywowSekcji: {
    warstwa: 'tozsamosc',
    lody: TYLKO_PRZEGLAD,
    powod: 'Liczba odpływów sekcji zastępuje na przeglądzie nazwy poszczególnych odpływów; od poziomu sieci każdy odpływ ma własną nazwę, więc licznik byłby zdublowaną informacją.',
  },
  nazwaKotwicyZrodla: { warstwa: 'tozsamosc', lody: WSZYSTKIE, powod: 'Krótka tożsamość kotwicy zasilania SN (poziom napięcia) — punkt startu toru nN musi być rozpoznawalny na każdym poziomie.' },
  nazwaTransformatora: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Oznaczenie transformatora; na przeglądzie sylwetka TR wystarcza do rozpoznania źródła.' },
  nazwaAparatu: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Oznaczenie aparatu odpływu/sprzęgła; na przeglądzie znika (zostaje symbol i stan).' },
  nazwaZrodlaDer: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Nazwa źródła rozproszonego; sam symbol DER zostaje na przeglądzie.' },
  nazwaOdbioru: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Nazwa odbioru; sam symbol odbioru zostaje na przeglądzie.' },
  nazwaGranicy: {
    warstwa: 'tozsamosc',
    lody: WSZYSTKIE,
    powod: 'Nazwa stacji po drugiej stronie granicy — to nazwa STACJI (dopuszczona na przeglądzie) i jedyne, co odróżnia granicę domeny od zwykłego odpływu.',
  },
  znacznikBezNapiecia: {
    warstwa: 'tozsamosc',
    lody: WSZYSTKIE,
    powod: 'Brak napięcia to stan ruchowy tej samej klasy co OPEN/CLOSED — zakaz ukrywania na jakimkolwiek poziomie.',
  },
  znacznikWyspyDer: {
    warstwa: 'tozsamosc',
    lody: WSZYSTKIE,
    powod: 'Wyspa zasilana wyłącznie z DER to stan ruchowy o skutkach dla bezpieczeństwa — widoczny zawsze.',
  },
  znacznikSwiezosciWyniku: {
    warstwa: 'tozsamosc',
    lody: WSZYSTKIE,
    powod: 'Status wyniku (brak/nieaktualny/aktualny) jest tożsamością wyniku, nie jego opisem — jawny na każdym poziomie.',
  },
  plakietkaWyniku: { warstwa: 'tozsamosc', lody: OD_SIECI, powod: 'Liczbowa plakietka nakładki (SWZ/prąd/ΔU) — na przeglądzie zastępuje ją kropka werdyktu.' },
  kropkaWerdyktu: {
    warstwa: 'tozsamosc',
    lody: TYLKO_PRZEGLAD,
    powod: 'Zastępcza, uproszczona reprezentacja nakładki na przeglądzie: werdykt bez liczby (liczba nie mieści się czytelnie, a ukrycie wyniku byłoby kłamstwem).',
  },

  parametryKotwicyZrodla: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Sk″/Ik″ kotwicy — parametr, nie tożsamość.' },
  tabliczkaTransformatora: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Sn/przekładnia/grupa/uk — opis drugorzędny wprost wskazany w kanonie LOD.' },
  parametrZrodlaDer: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Moc źródła [MW] — parametr.' },
  parametrOdbioru: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Moc odbioru [MW] — parametr.' },
  napiecieSekcji: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Napięcie szyny — parametr; poziom napięcia całej domeny nN jest w nagłówku widoku.' },
  napiecieGranicy: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Napięcie zacisku granicznego — parametr.' },
  nazwaZaciskuModelu: { warstwa: 'opis', lody: TYLKO_PELNY, powod: 'Nazwa portu/zacisku modelu (tryb audytu topologii) — opis modelu, nie tożsamość elementu sieci.' },
  stanSlownyLacznika: {
    warstwa: 'opis',
    lody: TYLKO_PELNY,
    powod: 'Słowo OTWARTE/ZAMKNIĘTE jest DRUGORZĘDNYM potwierdzeniem — stan niesie glif aparatu, który zostaje na każdym poziomie.',
  },
};

/** Warstwa elementu rysunku — jedyna klasyfikacja w systemie. */
export function warstwaElementu(kind: ElementKanwyNn): WarstwaWizualna {
  return REJESTR_ELEMENTOW_KANWY[kind].warstwa;
}

/** Czy element jest rysowany na danym poziomie szczegółowości. */
export function widocznyNaLod(kind: ElementKanwyNn, lod: PoziomLod): boolean {
  return REJESTR_ELEMENTOW_KANWY[kind].lody.includes(lod);
}

/** Elementy warstwy TOR — zbiór, który MUSI być identyczny na 0/1/2. */
export function elementyToru(): readonly ElementKanwyNn[] {
  return (Object.keys(REJESTR_ELEMENTOW_KANWY) as ElementKanwyNn[]).filter(
    (kind) => warstwaElementu(kind) === 'tor',
  );
}

/**
 * Liczba odpływów sekcji po polsku (odmiana: 1 odpływ / 2–4 odpływy /
 * 5+ odpływów, z wyjątkiem nastu). Czysta prezentacja liczby policzonej
 * przez kompozytora sceny — zero liczenia topologii w rendererze.
 */
export function licznikOdplywowLabel(liczba: number): string {
  const setki = liczba % 100;
  const jednosci = liczba % 10;
  if (liczba === 1) return '1 odpływ';
  if (jednosci >= 2 && jednosci <= 4 && !(setki >= 12 && setki <= 14)) return `${liczba} odpływy`;
  return `${liczba} odpływów`;
}

// ===========================================================================
// PALETA KANWY nN — sterowana MOTYWEM (jasny techniczny / ciemny
// dyspozytorski). Do tej karty kanwa nN miała paletę wypaloną na ciemno, a
// harness ustawiał `data-theme` bez pokrycia w rysunku — deklaracja motywu
// bez pokrycia (ten sam dług, który paleta kanwy SN zamknęła wcześniej).
// Tokeny o TEJ SAMEJ semantyce co kanwa SN są STĄD brane (tło, tusz bazowy,
// brak energizacji, werdykt trzytonowy) — jeden odcień = jedno znaczenie w
// całym produkcie. Tokeny WŁASNE tej kanwy (kabel, granica, zacisk, kreska
// wygaszona) mają wartości lokalne, bo w domenie nN wszystko jest nN:
// kolorowanie „napięciem" pomalowałoby CAŁY rysunek jednym kolorem i
// przestałoby cokolwiek znaczyć — tu rozróżniamy KLASY LINII, nie napięcia.
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
  readonly panelTlo: string;
  readonly panelCien: string;
  readonly przyciskAktywnyTlo: string;
}

/** Wariant dyspozytorski (ciemny) — wartości zastane, bez zmiany rysunku. */
const TOKENY_CIEMNE: TokenyLokalne = {
  kreskaWygaszona: '#5B6B7A',
  kreskaOtwarta: '#8A98A6',
  kreskaGranicy: '#E8A33D',
  /** Kabel jaśniejszy niż tło: przy 1,9 px ekranu ciemniejszy odcień ginął. */
  kreskaKabla: '#6FA0C2',
  wypelnienieZacisku: '#B8C4CF',
  panelTlo: '#111821F2',
  panelCien: '0 12px 36px #000A',
  przyciskAktywnyTlo: '#1D3A2E',
};

/** Wariant techniczny (jasny) — te same role, ściemnione pod biel arkusza:
 *  kreski ≥ 3:1, teksty ≥ 4,5:1 na bieli (te same progi co paleta kanwy SN). */
const TOKENY_JASNE: TokenyLokalne = {
  kreskaWygaszona: '#5A6673',
  kreskaOtwarta: '#6B7684',
  kreskaGranicy: '#8A5A00',
  kreskaKabla: '#0A5A78',
  wypelnienieZacisku: '#39434E',
  panelTlo: '#FFFFFFF2',
  panelCien: '0 12px 36px #00000026',
  przyciskAktywnyTlo: '#E3F3EA',
};

/** Paleta rysunku domeny nN dla trybu motywu — JEDYNE miejsce tego wyboru. */
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

/**
 * Ton KROPKI/PLAKIETKI werdyktu z severity nakładki wynikowej. Prezentacja
 * GOTOWEGO werdyktu backendu (`RawOverlayElement.severity`) — zero progu
 * liczonego w UI (ta sama zasada co `swzPresentationTone`). Severity spoza
 * kontraktu → ton neutralny (kropka mówi „jest wynik", nie zmyśla oceny).
 */
export function tonWerdyktuSeverity(severity: string | undefined, paleta: PaletaNn): string {
  switch (severity) {
    case 'CRITICAL':
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
