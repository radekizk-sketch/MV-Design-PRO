/**
 * SLD INDUSTRIAL AESTHETICS — Kontrakt estetyki przemysłowej
 *
 * Implementacja reguł wizualnych DIgSILENT/ABB/CANONICAL dla schematów SLD.
 *
 * ZASADA NADRZĘDNA:
 * - Deterministyczność: Ten sam Snapshot → identyczne współrzędne (piksel w piksel)
 * - Siatka rytmu: każda współrzędna jest wielokrotnością GRID_BASE
 * - Kanały Y: stałe poziomy dla magistrali, ringów, odgałęzień
 * - Równe odstępy stacji: GRID_SPACING_MAIN niezależnie od zawartości
 *
 * CANONICAL ALIGNMENT:
 * - docs/sld/SLD_LAYOUT_AESTHETIC_CONTRACT.md — pełna specyfikacja
 * - sldCanonicalStyle.ts — referencje do tych stałych
 *
 * ZAKAZ:
 * - Niecałkowite współrzędne (x % GRID_BASE !== 0)
 * - Wartości niezgodne z siatką
 * - Łuki i linie diagonalne
 * - Odstępy zależne od długości nazwy, metryki kabla itp.
 */

// =============================================================================
// § 1.1 SIATKA RYTMU (GLOBALNA)
// =============================================================================

/**
 * Podstawowa jednostka siatki SLD [px].
 * Wszystkie współrzędne x,y muszą być wielokrotnościami GRID_BASE.
 *
 * @invariant x % GRID_BASE === 0 && y % GRID_BASE === 0
 */
export const GRID_BASE = 20 as const;

// =============================================================================
// § 1.2 KANAŁY Y (STAŁE)
// =============================================================================

/**
 * Y magistrali głównej SN [px].
 * Stała globalna — magistrala ZAWSZE na tej wartości Y.
 */
export const Y_MAIN = 400 as const;

/**
 * Y ścieżki ringowej [px].
 * Ring biegnie 4*GRID_BASE powyżej magistrali.
 *
 * Y_RING = Y_MAIN - 4 * GRID_BASE = 320
 */
export const Y_RING = 320 as const;  // Y_MAIN - 4 * GRID_BASE

/**
 * Y odgałęzień (feeders) [px].
 * Odgałęzienia biegną 4*GRID_BASE poniżej magistrali.
 *
 * Y_BRANCH = Y_MAIN + 4 * GRID_BASE = 480
 */
export const Y_BRANCH = 480 as const;  // Y_MAIN + 4 * GRID_BASE

// =============================================================================
// § 1.3 RÓWNE ODLEGŁOŚCI STACJI NA MAGISTRALI
// =============================================================================

/**
 * Odległość centrum-centrum kolejnych stacji na magistrali [px].
 *
 * GRID_SPACING_MAIN = 14 * GRID_BASE = 280 px
 *
 * Pozycja i-tej stacji:
 *   X_i = X_START + i * GRID_SPACING_MAIN
 *   Y_i = Y_MAIN
 *
 * @invariant Stała niezależna od: długości nazwy stacji, liczby pól, długości kabla
 */
export const GRID_SPACING_MAIN = 280 as const;  // 14 * GRID_BASE

/**
 * Poziome przesunięcie startowe dla pierwszej stacji [px].
 * X pierwszej stacji = X_START.
 */
export const X_START = 40 as const;  // 2 * GRID_BASE

// =============================================================================
// § 1.6 WYRÓWNANIE PIONOWE PÓL W STACJI
// =============================================================================

/**
 * Pionowy odstęp między polami w stacji [px].
 *
 * OFFSET_POLE = 3 * GRID_BASE = 60 px
 *
 * Pola w stacji: Y_MAIN ± n * OFFSET_POLE
 */
export const OFFSET_POLE = 60 as const;  // 3 * GRID_BASE

// =============================================================================
// § 1.7 JEDNOLITA GRUBOŚĆ LINII
// =============================================================================

/**
 * Grubość linii magistrali (kabel/linia napowietrzna SN) [px].
 * Magistrala = ciągły przewód SN, linia dominująca (najgrubsza).
 *
 * ELEKTROENERGETYKA: Magistrala NIE jest szyną zbiorczą.
 * Szyny zbiorcze SN istnieją w: GPZ (główna) i stacjach (lokalne rozdzielnice).
 * Magistrala to kabel/linia napowietrzna łącząca te punkty.
 */
export const BUSBAR_STROKE_WIDTH = 3 as const;

/**
 * Grubość linii odgałęzień i gałęzi [px].
 * Odgałęzienia = linie podrzędne.
 */
export const BRANCH_STROKE_WIDTH = 2 as const;

/**
 * Grubość linii ringowej [px].
 * Ring = linia przerywana (styl dashed).
 */
export const RING_STROKE_WIDTH = 2 as const;

/**
 * Wzorzec kreskowania linii ringowej (SVG stroke-dasharray).
 * Format: "dash_length gap_length"
 */
export const RING_DASH_ARRAY = '6 4' as const;

// =============================================================================
// § 1.8 MINIMALNE MARGINESY
// =============================================================================

/**
 * Minimalny odstęp poziomy między stacjami [px].
 * = GRID_SPACING_MAIN
 */
export const MIN_HORIZONTAL_GAP = GRID_SPACING_MAIN;

/**
 * Minimalny odstęp pionowy między elementami [px].
 * = 4 * GRID_BASE = 80 px
 */
export const MIN_VERTICAL_GAP = 80 as const;  // 4 * GRID_BASE

// =============================================================================
// § 3.5 SNAP-TO-GRID (FINAŁ)
// =============================================================================

/**
 * Normalizuj wartość do siatki estetycznej.
 *
 * x = round(x / GRID_BASE) * GRID_BASE
 *
 * @param value — wartość do normalizacji
 * @param grid — rozmiar siatki (domyślnie GRID_BASE = 20)
 * @returns wartość znormalizowana do siatki
 *
 * @example
 * snapToAestheticGrid(37) // → 40
 * snapToAestheticGrid(25) // → 20
 * snapToAestheticGrid(280) // → 280 ✓
 */
export function snapToAestheticGrid(value: number, grid: number = GRID_BASE): number {
  return Math.round(value / grid) * grid;
}

/**
 * Normalizuj pozycję (x,y) do siatki estetycznej.
 *
 * @param pos — pozycja do normalizacji
 * @returns pozycja znormalizowana
 */
export function snapPositionToAestheticGrid(
  pos: { x: number; y: number },
  grid: number = GRID_BASE
): { x: number; y: number } {
  return {
    x: snapToAestheticGrid(pos.x, grid),
    y: snapToAestheticGrid(pos.y, grid),
  };
}

// =============================================================================
// WALIDACJA KONTRAKTU
// =============================================================================

/**
 * Wynik walidacji wyrównania siatki.
 */
export interface GridAlignmentResult {
  /** Czy wszystkie współrzędne są wielokrotnościami GRID_BASE */
  allAligned: boolean;
  /** Lista naruszeń (symbolId → {x,y}) */
  violations: Array<{ symbolId: string; x: number; y: number; offX: number; offY: number }>;
}

/**
 * Waliduj wyrównanie siatki dla zestawu pozycji.
 *
 * Używane w testach deterministycznych.
 *
 * @param positions — mapa symbolId → {x, y}
 * @returns wynik walidacji
 */
export function validateGridAlignment(
  positions: Map<string, { x: number; y: number }> | ReadonlyMap<string, { x: number; y: number }>
): GridAlignmentResult {
  const violations: GridAlignmentResult['violations'] = [];

  for (const [symbolId, pos] of positions) {
    const offX = pos.x % GRID_BASE;
    const offY = pos.y % GRID_BASE;
    if (offX !== 0 || offY !== 0) {
      violations.push({ symbolId, x: pos.x, y: pos.y, offX, offY });
    }
  }

  return {
    allAligned: violations.length === 0,
    violations,
  };
}

/**
 * Wynik walidacji rozstawu stacji.
 */
export interface StationSpacingResult {
  /** Czy wszystkie stacje są rozmieszczone co GRID_SPACING_MAIN */
  uniformSpacing: boolean;
  /** Lista rozstawów stacji */
  spacings: Array<{ from: string; to: string; dx: number; expected: number }>;
  /** Czy rozstaw jest jednolity */
  violations: Array<{ from: string; to: string; dx: number; expected: number }>;
}

/**
 * Waliduj równy rozstaw stacji na magistrali.
 *
 * @param stationXPositions — lista pozycji X stacji na magistrali (w kolejności)
 * @param stationIds — lista ID stacji (opcjonalnie, do raportowania)
 * @returns wynik walidacji
 */
export function validateStationSpacing(
  stationXPositions: number[],
  stationIds?: string[]
): StationSpacingResult {
  const spacings: StationSpacingResult['spacings'] = [];
  const violations: StationSpacingResult['violations'] = [];

  for (let i = 1; i < stationXPositions.length; i++) {
    const from = stationIds?.[i - 1] ?? `station_${i - 1}`;
    const to = stationIds?.[i] ?? `station_${i}`;
    const dx = stationXPositions[i] - stationXPositions[i - 1];
    const expected = GRID_SPACING_MAIN;
    spacings.push({ from, to, dx, expected });
    if (dx !== expected) {
      violations.push({ from, to, dx, expected });
    }
  }

  return {
    uniformSpacing: violations.length === 0,
    spacings,
    violations,
  };
}

/**
 * Wynik walidacji geometrii ringu.
 */
export interface RingGeometryResult {
  /** Czy ring ma 4 ortogonalne odcinki */
  valid: boolean;
  /** Ile odcinków ma ring */
  segmentCount: number;
  /** Czy ring jest na poziomie Y_RING */
  onRingChannel: boolean;
  /** Błędy */
  errors: string[];
}

/**
 * Waliduj geometrię połączenia ringowego.
 *
 * Ring powinien mieć dokładnie 4 punkty tworzące ścieżkę:
 * (X_i, Y_MAIN) → (X_i, Y_RING) → (X_j, Y_RING) → (X_j, Y_MAIN)
 *
 * @param path — lista punktów ścieżki połączenia ringowego
 * @returns wynik walidacji
 */
export function validateRingGeometry(
  path: Array<{ x: number; y: number }>
): RingGeometryResult {
  const errors: string[] = [];

  if (path.length !== 4) {
    errors.push(`Ring powinien mieć 4 punkty, ma: ${path.length}`);
    return { valid: false, segmentCount: path.length - 1, onRingChannel: false, errors };
  }

  const [p0, p1, p2, p3] = path;

  // Wyodrębnij współrzędne, aby uniknąć nazw symbolicznych w komunikatach diagnostycznych
  const x0 = p0.x, y0 = p0.y;
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;

  // Sprawdź pionowe wpięcia (odcinek startowy i końcowy)
  if (x0 !== x1) {
    errors.push(`Wpięcie pierwsze nie jest pionowe: x_pocz=${x0}, x_ring_lewa=${x1}`);
  }
  if (x2 !== x3) {
    errors.push(`Wpięcie drugie nie jest pionowe: x_ring_prawa=${x2}, x_kon=${x3}`);
  }

  // Sprawdź poziomy bieg ringu
  if (y1 !== y2) {
    errors.push(`Bieg poziomy ringu nie jest poziomy: y_lewa=${y1}, y_prawa=${y2}`);
  }

  // Sprawdź kanał Y_RING
  const onRingChannel = y1 === Y_RING && y2 === Y_RING;
  if (!onRingChannel) {
    errors.push(`Ring nie jest na kanale Y (wymagane=${Y_RING}): y_lewa=${y1}, y_prawa=${y2}`);
  }

  // Sprawdź wpięcia z Y_MAIN
  if (y0 !== Y_MAIN) {
    errors.push(`Punkt startowy ringu nie jest na wymaganym Y (wymagane=${Y_MAIN}): y_pocz=${y0}`);
  }
  if (y3 !== Y_MAIN) {
    errors.push(`Punkt końcowy ringu nie jest na wymaganym Y (wymagane=${Y_MAIN}): y_kon=${y3}`);
  }

  return {
    valid: errors.length === 0,
    segmentCount: 3,
    onRingChannel,
    errors,
  };
}

// =============================================================================
// OBLICZANIE POZYCJI STACJI
// =============================================================================

/**
 * Oblicz pozycję X i-tej stacji na magistrali.
 *
 * X_i = X_START + i * GRID_SPACING_MAIN
 *
 * @param stationIndex — indeks stacji (0-based, deterministyczny)
 * @returns pozycja X stacji [px]
 *
 * @invariant Wynik % GRID_BASE === 0
 */
export function stationX(stationIndex: number): number {
  return X_START + stationIndex * GRID_SPACING_MAIN;
}

/**
 * Oblicz pozycję Y pola w stacji.
 *
 * Y = Y_MAIN ± n * OFFSET_POLE
 *
 * @param poleIndex — indeks pola (0 = najbliżej magistrali, +1 = dalej w dół)
 * @param direction — kierunek (+1 = poniżej Y_MAIN, -1 = powyżej Y_MAIN)
 * @returns pozycja Y pola [px]
 */
export function poleY(poleIndex: number, direction: 1 | -1 = 1): number {
  return Y_MAIN + direction * (poleIndex + 1) * OFFSET_POLE;
}

/**
 * Oblicz canoniczną ścieżkę ringu między dwoma stacjami.
 *
 * Ścieżka: (X_i, Y_MAIN) → (X_i, Y_RING) → (X_j, Y_RING) → (X_j, Y_MAIN)
 *
 * @param stationIndexA — indeks stacji A (mniejszy X)
 * @param stationIndexB — indeks stacji B (większy X)
 * @returns 4-punktowa ścieżka ringu
 */
export function ringPath(
  stationIndexA: number,
  stationIndexB: number
): Array<{ x: number; y: number }> {
  const xi = stationX(Math.min(stationIndexA, stationIndexB));
  const xj = stationX(Math.max(stationIndexA, stationIndexB));
  return [
    { x: xi, y: Y_MAIN },
    { x: xi, y: Y_RING },
    { x: xj, y: Y_RING },
    { x: xj, y: Y_MAIN },
  ];
}

// =============================================================================
// § 4 UKŁAD PIONOWY (VERTICAL SN LAYOUT) — GPZ U GÓRY, SIEĆ W DÓŁ
// =============================================================================

/**
 * Y szyny GPZ (górna krawedź schematu) [px].
 * GPZ ZAWSZE u góry — styl ABB/Canonical.
 */
export const Y_GPZ = 60 as const;  // 3 * GRID_BASE

/**
 * Pitch pól liniowych GPZ (odstęp X) [px].
 * Pola liniowe GPZ rozmieszczone równomiernie wzdłuż szyny.
 *
 * PITCH_FIELD_X = GRID_SPACING_MAIN = 280 px
 */
export const PITCH_FIELD_X = GRID_SPACING_MAIN;

/**
 * Krok pionowy magistrali (odcinek trunk w dół) [px].
 * Stały krok wizualny — długość realna jest etykietą.
 *
 * TRUNK_STEP_Y = 5 * GRID_BASE = 100 px
 */
export const TRUNK_STEP_Y = 100 as const;  // 5 * GRID_BASE

/**
 * Odstęp boczny odgałęzienia od magistrali [px].
 * Odgałęzienia biegną bokiem od punktu T na magistrali.
 *
 * BRANCH_OFFSET_X = 7 * GRID_BASE = 140 px
 */
export const BRANCH_OFFSET_X = 140 as const;  // 7 * GRID_BASE

/**
 * Szerokość kanału wtórnego (ring/NOP) [px].
 * Kanał wtórny biegnie równolegle do magistrali, ale przesunięty w X.
 *
 * SECONDARY_CHANNEL_OFFSET_X = 4 * GRID_BASE = 80 px
 */
export const SECONDARY_CHANNEL_OFFSET_X = 80 as const;  // 4 * GRID_BASE

/**
 * Wysokość bloku stacji (drop z magistrali) [px].
 * Stacja wisi pod magistralą jako blok.
 *
 * STATION_BLOCK_HEIGHT = 8 * GRID_BASE = 160 px
 */
export const STATION_BLOCK_HEIGHT = 160 as const;  // 8 * GRID_BASE

/**
 * Szerokość bloku stacji [px].
 * STATION_BLOCK_WIDTH = 6 * GRID_BASE = 120 px
 */
export const STATION_BLOCK_WIDTH = 120 as const;  // 6 * GRID_BASE

// =============================================================================
// § 4.1 WALIDACJA UKŁADU PIONOWEGO
// =============================================================================

/**
 * Wynik walidacji monotonii Y (sieć rośnie w dół).
 */
export interface DownwardGrowthResult {
  /** Czy wszystkie magistrale rosną w dół (monotoniczny Y) */
  allDownward: boolean;
  /** Naruszenia (segment, gdzie Y maleje) */
  violations: Array<{ edgeId: string; fromY: number; toY: number }>;
}

/**
 * Waliduj czy wszystkie magistrale rosną w dół (monotoniczny Y).
 *
 * @param trunkSegments — segmenty magistral [{edgeId, fromY, toY}]
 * @returns wynik walidacji
 */
export function validateDownwardGrowth(
  trunkSegments: Array<{ edgeId: string; fromY: number; toY: number }>
): DownwardGrowthResult {
  const violations: DownwardGrowthResult['violations'] = [];
  for (const seg of trunkSegments) {
    // Vertical trunk: toY should be >= fromY (growing downward)
    // Allow horizontal segments (fromY === toY)
    if (seg.toY < seg.fromY) {
      violations.push(seg);
    }
  }
  return { allDownward: violations.length === 0, violations };
}

/**
 * Wynik walidacji ortogonalności routingu.
 */
export interface OrthogonalResult {
  /** Czy wszystkie segmenty są ortogonalne (0° lub 90°) */
  allOrthogonal: boolean;
  /** Naruszenia (skosy, łuki) */
  violations: Array<{ edgeId: string; fromX: number; fromY: number; toX: number; toY: number }>;
}

/**
 * Waliduj ortogonalność routingu (0° lub 90° only).
 *
 * @param segments — segmenty [{edgeId, fromX, fromY, toX, toY}]
 * @returns wynik walidacji
 */
export function validateOrthogonalRouting(
  segments: Array<{ edgeId: string; fromX: number; fromY: number; toX: number; toY: number }>
): OrthogonalResult {
  const violations: OrthogonalResult['violations'] = [];
  for (const seg of segments) {
    const isH = Math.abs(seg.fromY - seg.toY) < 1;
    const isV = Math.abs(seg.fromX - seg.toX) < 1;
    if (!isH && !isV) {
      violations.push(seg);
    }
  }
  return { allOrthogonal: violations.length === 0, violations };
}

/**
 * Deterministyczny wybór strony odgałęzienia (lewo/prawo).
 *
 * Na podstawie hash elementId: parzyste → prawo, nieparzyste → lewo.
 * Remis: stabilny — ten sam elementId ZAWSZE daje tę samą stronę.
 *
 * @param elementId — ID elementu odgałęzienia
 * @returns 1 = prawo (+X), -1 = lewo (-X)
 */
export function deterministicBranchSide(elementId: string): 1 | -1 {
  let hash = 0;
  for (let i = 0; i < elementId.length; i++) {
    hash = ((hash << 5) - hash + elementId.charCodeAt(i)) | 0;
  }
  return (hash & 1) === 0 ? 1 : -1;
}

// =============================================================================
// STAŁA WERYFIKACYJNA (dla testów)
// =============================================================================

/**
 * Weryfikacja niezmienników kontraktu (używana w testach).
 * Zwraca true jeśli wszystkie niezmienniki są spełnione.
 */
// =============================================================================
// § 1.9 STYL KANONICZNY SLD — CANONICAL/IEC
// =============================================================================

/** Grubość toru głównego magistrali [px]. Dominujący — najgrubszy element. */
export const TRUNK_STROKE_WIDTH = 5 as const;

/** Grubość linii odgałęzienia (kabel/napowietrzna) [px]. */
export const BRANCH_LINE_STROKE_WIDTH = 2.5 as const;

/** Grubość linii wewnątrz stacji (łańcuch aparatów) [px]. */
export const STATION_INTERNAL_STROKE = 2 as const;

/** Promień kropki połączeniowej IEC 61082 [px]. */
export const JUNCTION_DOT_RADIUS = 4 as const;

/** Linia napowietrzna SN = linia ciągła (brak dash). */
export const OVERHEAD_DASH_ARRAY = 'none' as const;

/** Kabel SN = linia przerywana (SVG stroke-dasharray). */
export const CABLE_DASH_ARRAY = '8 5' as const;

/** Offset etykiety węzła po lewej stronie toru [px]. */
export const NODE_LABEL_OFFSET_X = -20 as const;

/** Szerokość symbolu aparatu odgałęźnego [px]. */
export const BRANCH_APPARATUS_WIDTH = 40 as const;

/** Offset pola stacyjnego od toru głównego [px]. */
export const STATION_FIELD_OFFSET_X = 60 as const;

/** Krok pionowy w łańcuchu aparatów stacyjnych [px]. */
export const APPARATUS_CHAIN_STEP_Y = 40 as const;

/** Szerokość szyny zbiorczej NN [px]. */
export const NN_BUSBAR_WIDTH = 120 as const;

/** Rozmiar strzałki kierunku mocy [px]. */
export const POWER_ARROW_SIZE = 8 as const;

/** Padding wewnętrzny bounding-box stacji [px]. */
export const STATION_BOUNDING_BOX_PADDING = 16 as const;

/** Minimalna długość toru głównego magistrali [px]. */
export const TRUNK_SPINE_MIN_LENGTH = 200 as const;  // 10 * GRID_BASE

/** Rozmiar fontu etykiety węzła kanonicznego [px]. */
export const ANNOTATION_FONT_SIZE_NODE = 11 as const;

/** Rozmiar fontu etykiety segmentu [px]. */
export const ANNOTATION_FONT_SIZE_SEGMENT = 10 as const;

/** Rozmiar fontu parametrów segmentu [px]. */
export const ANNOTATION_FONT_SIZE_PARAMS = 9 as const;

// =============================================================================
// § 5.1 GPZ HIGHLIGHT — wyróżnienie stacji GPZ
// =============================================================================

/**
 * Rozmiar wyróżnienia GPZ — grubość obramowania [px].
 *
 * GPZ (Główny Punkt Zasilania) wyróżniany grubszym obramowaniem
 * i większą ramką w stosunku do stacji SN/nn.
 *
 * GPZ_HIGHLIGHT_SIZE = GRID_BASE / 2 × 2 = 20 px (STATION_BOUNDING_BOX_PADDING)
 */
export const GPZ_HIGHLIGHT_SIZE = STATION_BOUNDING_BOX_PADDING;

/**
 * Minimalny promieniowy rozmiar GPZ (premia do STATION_BLOCK_WIDTH) [px].
 * GPZ musi być wizualnie większy od stacji SN/nn.
 *
 * GPZ_MIN_BLOCK_SIZE = STATION_BLOCK_WIDTH + 2 * GRID_BASE = 160 px
 */
export const GPZ_MIN_BLOCK_SIZE = STATION_BLOCK_WIDTH + 2 * GRID_BASE;

// =============================================================================
// § 5.2 MINIMALNE ODLEGŁOŚCI — dla algorytmów rozmieszczania
// =============================================================================

/**
 * Minimalna odległość centrum-centrum między stacjami [px].
 * Równa GRID_SPACING_MAIN (280 px) — stały rozstaw stacji na magistrali.
 *
 * Używana przez: force-directed, greedy placement jako dolne ograniczenie.
 */
export const MIN_STATION_DISTANCE = GRID_SPACING_MAIN;

/**
 * Minimalna odległość centrum-centrum między stacją a krawędzią schematu [px].
 * = 2 × GRID_BASE = 40 px
 */
export const MIN_DIAGRAM_MARGIN = 2 * GRID_BASE;

// =============================================================================
// STAŁA WERYFIKACYJNA (dla testów)
// =============================================================================

export function verifyAestheticContract(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // § 1.1: GRID_BASE = 20
  if (GRID_BASE !== 20) errors.push(`GRID_BASE musi wynosić 20, jest: ${GRID_BASE}`);

  // § 1.2: Kanały Y
  if (Y_RING !== Y_MAIN - 4 * GRID_BASE) {
    errors.push(`Y_RING musi wynosić Y_MAIN - 4*GRID_BASE = ${Y_MAIN - 4 * GRID_BASE}, jest: ${Y_RING}`);
  }
  if (Y_BRANCH !== Y_MAIN + 4 * GRID_BASE) {
    errors.push(`Y_BRANCH musi wynosić Y_MAIN + 4*GRID_BASE = ${Y_MAIN + 4 * GRID_BASE}, jest: ${Y_BRANCH}`);
  }

  // § 1.3: GRID_SPACING_MAIN = 14 * GRID_BASE
  if (GRID_SPACING_MAIN !== 14 * GRID_BASE) {
    errors.push(`GRID_SPACING_MAIN musi wynosić 14*GRID_BASE = ${14 * GRID_BASE}, jest: ${GRID_SPACING_MAIN}`);
  }

  // § 1.6: OFFSET_POLE = 3 * GRID_BASE
  if (OFFSET_POLE !== 3 * GRID_BASE) {
    errors.push(`OFFSET_POLE musi wynosić 3*GRID_BASE = ${3 * GRID_BASE}, jest: ${OFFSET_POLE}`);
  }

  // § 4: Vertical layout invariants
  if (TRUNK_STEP_Y !== 5 * GRID_BASE) {
    errors.push(`TRUNK_STEP_Y musi wynosić 5*GRID_BASE = ${5 * GRID_BASE}, jest: ${TRUNK_STEP_Y}`);
  }
  if (BRANCH_OFFSET_X !== 7 * GRID_BASE) {
    errors.push(`BRANCH_OFFSET_X musi wynosić 7*GRID_BASE = ${7 * GRID_BASE}, jest: ${BRANCH_OFFSET_X}`);
  }
  if (PITCH_FIELD_X !== GRID_SPACING_MAIN) {
    errors.push(`PITCH_FIELD_X musi wynosić GRID_SPACING_MAIN = ${GRID_SPACING_MAIN}, jest: ${PITCH_FIELD_X}`);
  }

  // Wszystkie stałe muszą być wielokrotnościami GRID_BASE
  const toCheck: Array<[string, number]> = [
    ['Y_MAIN', Y_MAIN],
    ['Y_RING', Y_RING],
    ['Y_BRANCH', Y_BRANCH],
    ['GRID_SPACING_MAIN', GRID_SPACING_MAIN],
    ['X_START', X_START],
    ['OFFSET_POLE', OFFSET_POLE],
    ['MIN_VERTICAL_GAP', MIN_VERTICAL_GAP],
    ['Y_GPZ', Y_GPZ],
    ['PITCH_FIELD_X', PITCH_FIELD_X],
    ['TRUNK_STEP_Y', TRUNK_STEP_Y],
    ['BRANCH_OFFSET_X', BRANCH_OFFSET_X],
    ['SECONDARY_CHANNEL_OFFSET_X', SECONDARY_CHANNEL_OFFSET_X],
    ['STATION_BLOCK_HEIGHT', STATION_BLOCK_HEIGHT],
    ['STATION_BLOCK_WIDTH', STATION_BLOCK_WIDTH],
  ];

  for (const [name, value] of toCheck) {
    if (value % GRID_BASE !== 0) {
      errors.push(`${name} (${value}) nie jest wielokrotnością GRID_BASE (${GRID_BASE})`);
    }
  }

  return { valid: errors.length === 0, errors };
}
