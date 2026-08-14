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
 */

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
