/**
 * lodController — sterowanie poziomem detalu (LOD) nad JEDNĄ prawdą geometrii.
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md §7 (LOD: 3 poziomy, polityka widoczności
 *      warstw per poziom rozwiązuje gęstość STRUKTURALNIE, wirtualizacja, płynne przejścia)
 *
 * Cel (M-08/M-10): schemat ≥50 stacji jest nieczytelny w pełnym detalu (53 stacje jako
 * mikro-znaczki). Ten moduł NIE liczy pozycji — czyta `LayoutResult` (jedna prawda
 * geometrii, zagnieżdżona stacja→pole→aparat) i:
 *   1) mapuje zoom → `LodLevel` (L0/L1/L2) z histerezą (anty-migotanie),
 *   2) liczy współczynnik płynnego przejścia (fade) między poziomami,
 *   3) udostępnia politykę WIDOCZNOŚCI warstw per poziom — to jest fix gęstości:
 *      na L0 etykiety/wyniki/aparaty PO PROSTU nie istnieją (nie polegamy na
 *      collision-avoidance, tylko na strukturze poziomu),
 *   4) wirtualizuje viewport — renderuje tylko węzły przecinające widoczny kadr.
 *
 * JEDNA PRAWDA: pozycje pochodzą z `LayoutResult.nodes[].x/y/width/height`. Ten moduł
 * tylko WYBIERA, co i gdzie pokazać — nie przelicza geometrii.
 */

import type {
  EdgeGeometry,
  LayoutBBox,
  LodLevel,
  NodeGeometry,
} from '../../ui/sld/v2/geometry/layoutContract';

export type { LodLevel } from '../../ui/sld/v2/geometry/layoutContract';

// ---------------------------------------------------------------------------
// 1. Progi zoom → LodLevel (z histerezą)
// ---------------------------------------------------------------------------

/**
 * Progi skali viewportu dla 3 poziomów geometrii (kontrakt §7). Dobrane pod
 * auto-fit substratu ≥50 stacji: fit-to-view ląduje przy małej skali (przegląd) →
 * L0; dosunięcie zoomu odsłania L1, potem L2.
 *
 * - scale <  L0_MAX  → L0 (przegląd sieci: stacje-bloki)
 * - scale <  L1_MAX  → L1 (stacja/ciąg: pola, role, stan łącznika)
 * - scale >= L1_MAX  → L2 (pole/szczegół: pełna aparatura + wyniki)
 */
export const LOD_LEVEL_ZOOM_THRESHOLDS = {
  /** Poniżej tej skali = przegląd (L0). */
  L0_MAX: 0.55,
  /** Poniżej tej skali (a ≥ L0_MAX) = stacja/ciąg (L1); ≥ = pełny szczegół (L2). */
  L1_MAX: 1.4,
} as const;

/** Indeks porządkowy poziomu (L0=0, L1=1, L2=2) — do porównań/interpolacji. */
export function lodLevelIndex(level: LodLevel): 0 | 1 | 2 {
  return level === 'L0' ? 0 : level === 'L1' ? 1 : 2;
}

/**
 * Czysta funkcja: zoom → `LodLevel` (bez histerezy). Determinizm: ta sama skala
 * zawsze daje ten sam poziom.
 */
export function zoomToLodLevel(scale: number): LodLevel {
  if (scale < LOD_LEVEL_ZOOM_THRESHOLDS.L0_MAX) return 'L0';
  if (scale < LOD_LEVEL_ZOOM_THRESHOLDS.L1_MAX) return 'L1';
  return 'L2';
}

/** Górna granica skali dla poziomu (poza którą rozważamy poziom wyżej); null = brak. */
function upperBoundFor(level: LodLevel): number | null {
  switch (level) {
    case 'L0':
      return LOD_LEVEL_ZOOM_THRESHOLDS.L0_MAX;
    case 'L1':
      return LOD_LEVEL_ZOOM_THRESHOLDS.L1_MAX;
    case 'L2':
      return null;
  }
}

/** Dolna granica skali dla poziomu (poniżej której rozważamy poziom niżej); null = brak. */
function lowerBoundFor(level: LodLevel): number | null {
  switch (level) {
    case 'L0':
      return null;
    case 'L1':
      return LOD_LEVEL_ZOOM_THRESHOLDS.L0_MAX;
    case 'L2':
      return LOD_LEVEL_ZOOM_THRESHOLDS.L1_MAX;
  }
}

export interface LodLevelControllerOptions {
  readonly initialScale: number;
  /**
   * Margines histerezy (0–1). Aby wejść w poziom wyżej, skala musi przekroczyć
   * próg × (1 + margin); aby zejść niżej — spaść poniżej próg × (1 - margin).
   * Domyślnie 0.15 (15%) — stabilizuje przejścia, eliminuje migotanie na progu.
   */
  readonly hysteresisMargin?: number;
}

/**
 * Stateful kontroler poziomu z histerezą. Czysty (bez React, bez timerów).
 * Wywołujący woła `update(scale)` przy każdej zmianie zoomu.
 */
export interface LodLevelController {
  /** Aktualizuje skalę, zwraca aktualny poziom (po histerezie). */
  update(scale: number): LodLevel;
  /** Aktualny poziom bez aktualizacji skali. */
  getLevel(): LodLevel;
  /** Ostatnia przekazana skala. */
  getScale(): number;
  /** Reset do skali (bez histerezy). */
  reset(scale: number): void;
}

/**
 * Tworzy kontroler poziomu z histerezą. Pozwala uniknąć migotania L0↔L1↔L2 na
 * progach (np. drobne ruchy zoomu wokół 0.55 nie przerzucają poziomu tam i z powrotem).
 */
export function createLodLevelController(
  opts: LodLevelControllerOptions,
): LodLevelController {
  const margin = opts.hysteresisMargin ?? 0.15;
  let current: LodLevel = zoomToLodLevel(opts.initialScale);
  let lastScale = opts.initialScale;

  function withHysteresis(scale: number): LodLevel {
    const upper = upperBoundFor(current);
    const lower = lowerBoundFor(current);
    // Wejście w poziom wyżej tylko po wyraźnym przekroczeniu progu górnego.
    if (upper !== null && scale >= upper * (1 + margin)) {
      return zoomToLodLevel(scale);
    }
    // Zejście w poziom niżej tylko po wyraźnym spadku poniżej progu dolnego.
    if (lower !== null && scale <= lower * (1 - margin)) {
      return zoomToLodLevel(scale);
    }
    return current;
  }

  return {
    update(scale: number): LodLevel {
      lastScale = scale;
      current = withHysteresis(scale);
      return current;
    },
    getLevel(): LodLevel {
      return current;
    },
    getScale(): number {
      return lastScale;
    },
    reset(scale: number): void {
      current = zoomToLodLevel(scale);
      lastScale = scale;
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Płynne przejścia (fade) — M-10
// ---------------------------------------------------------------------------

/**
 * Postęp przejścia [0..1] w obrębie pasma bieżącego poziomu. 0 = tuż po wejściu
 * w poziom (od dolnego progu), 1 = tuż przed przejściem w poziom wyższy (górny próg).
 * Służy do interpolacji (fade-in detalu wyższego poziomu, fade-out niższego) —
 * render NIE skacze na progu.
 */
export function lodTransitionProgress(scale: number, level: LodLevel): number {
  const upper = upperBoundFor(level);
  const lower = lowerBoundFor(level);
  // Pasmo poziomu = [lo, hi]. Brzegi otwarte zastępujemy rozsądnym zakresem,
  // by progress był ciągły i monotoniczny względem skali.
  const lo = lower ?? Math.max(1e-3, (upper ?? 1) * 0.25);
  const hi = upper ?? lo * 4;
  if (hi <= lo) return 0;
  const t = (scale - lo) / (hi - lo);
  return clamp01(t);
}

/**
 * Współczynnik fade detalu w okolicy przejścia (cross-fade). W paśmie `bandFraction`
 * (ułamek progu) wokół górnego progu poziomu render krótko wygasza/rozjaśnia (1 → min → 1),
 * dając płynne przejście bez migotania. Poza pasmem przejścia: pełna widoczność (1).
 *
 * Determinizm + ciągłość: dla tej samej skali ten sam współczynnik; brak skoków.
 */
export function lodFadeFactor(
  scale: number,
  level: LodLevel,
  bandFraction = 0.12,
): number {
  const upper = upperBoundFor(level);
  if (upper === null) return 1; // najwyższy poziom — zawsze pełny
  const bandHalf = upper * bandFraction;
  const start = upper - bandHalf;
  const end = upper + bandHalf;
  if (scale <= start) return 1;
  if (scale >= end) return 1; // po przejściu poziom wyższy jest już „bieżący"
  // W paśmie przejścia: symetryczny trójkąt (1 → min → 1) = płynny cross-fade.
  const mid = (start + end) / 2;
  const dist = Math.abs(scale - mid) / bandHalf; // 0 w środku, 1 na brzegach
  const minFactor = 0.35;
  return minFactor + (1 - minFactor) * clamp01(dist);
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// ---------------------------------------------------------------------------
// 3. Polityka widoczności warstw per poziom — STRUKTURALNY fix gęstości (§7)
// ---------------------------------------------------------------------------

/**
 * Warstwa treści sterowana poziomem detalu. Mapuje kontrakt §7 (tabela L0/L1/L2)
 * na konkretne, renderowalne decyzje „pokaż / nie pokazuj".
 */
export interface LodVisibilityPolicy {
  /** Poziom, dla którego polityka obowiązuje. */
  readonly level: LodLevel;

  /** Stacja jako BLOK (bbox dzieci) — zawsze widoczna (każdy poziom rysuje korpus). */
  readonly stationBlock: boolean;
  /** Nazwa/kod stacji nad blokiem. */
  readonly stationName: boolean;
  /** Status gotowości stacji (kropka/badge). L0 = TAK (przegląd ma stan). */
  readonly stationReadiness: boolean;

  /**
   * Pola (rozwinięcie bloku: WE/WY/TR/ODG, role) — POJAWIA się dopiero L1.
   * Na L0 = false: to jest powód, dla którego 53 bloki są czytelne (zero mikro-pól).
   */
  readonly fields: boolean;
  /** Etykiety ról pól (WE/WY/TR/FEEDER) — L1+. */
  readonly fieldRoleLabels: boolean;
  /** Stan łącznika (otwarty/zamknięty) na polu — L1+. */
  readonly switchState: boolean;

  /**
   * Pełna aparatura (CB/DS/ES, przekładniki, GŁOWICE) — TYLKO L2. Na L0/L1
   * NIE renderujemy aparatów (cała poanta wirtualizacji/czytelności).
   */
  readonly apparatus: boolean;
  /** Katalogowe etykiety aparatów (typ/przekrój/długość) — L2. */
  readonly apparatusCatalogLabels: boolean;
  /** Głowice kablowe (cable head ▲) — L2. */
  readonly cableHeads: boolean;

  /** Kluczowe wyniki (Ik″ szyna, obciążenie ciągu) — L1+. */
  readonly keyResults: boolean;
  /** Pełne wyniki per węzeł (Ik″/ip/Ith, prądy, spadki) — L2. */
  readonly fullResults: boolean;
  /** Etykiety wyników na kanwie — L1 (kluczowe) lub L2 (pełne); L0 = false. */
  readonly resultLabels: boolean;

  /** Krawędzie zagregowane stacja→stacja (L0/L1) vs port→port (L2). */
  readonly aggregatedEdges: boolean;
  readonly portToPortEdges: boolean;

  /** Alarmy/uzależnienia — widoczne na każdym poziomie (bezpieczeństwo). */
  readonly alarms: boolean;
}

/**
 * Zwraca politykę widoczności dla poziomu. To JEDNO ŹRÓDŁO decyzji „co rysować",
 * spójne z tabelą kontraktu §7:
 *
 *  L0 przegląd  : bloki + nazwa + status gotowości; BRAK pól/aparatów/etykiet-wyników.
 *  L1 stacja/ciąg: + pola, role, stan łącznika, kluczowe wyniki; BRAK pełnej aparatury.
 *  L2 pole/szczegół: pełna aparatura + głowice + katalogowe etykiety + pełne wyniki.
 *
 * Reguła §7: widoczność warstw sterowana LOD rozwiązuje nachodzenie etykiet
 * STRUKTURALNIE — na L0 etykiety/wyniki NIE ISTNIEJĄ, więc nie mogą się nakładać.
 */
export function lodVisibilityPolicy(level: LodLevel): LodVisibilityPolicy {
  switch (level) {
    case 'L0':
      return {
        level,
        stationBlock: true,
        stationName: true,
        stationReadiness: true,
        fields: false,
        fieldRoleLabels: false,
        switchState: false,
        apparatus: false,
        apparatusCatalogLabels: false,
        cableHeads: false,
        keyResults: false,
        fullResults: false,
        resultLabels: false,
        aggregatedEdges: true,
        portToPortEdges: false,
        alarms: true,
      };
    case 'L1':
      return {
        level,
        stationBlock: true,
        stationName: true,
        stationReadiness: true,
        fields: true,
        fieldRoleLabels: true,
        switchState: true,
        apparatus: false,
        apparatusCatalogLabels: false,
        cableHeads: false,
        keyResults: true,
        fullResults: false,
        resultLabels: true,
        aggregatedEdges: true,
        portToPortEdges: false,
        alarms: true,
      };
    case 'L2':
      return {
        level,
        stationBlock: true,
        stationName: true,
        stationReadiness: true,
        fields: true,
        fieldRoleLabels: true,
        switchState: true,
        apparatus: true,
        apparatusCatalogLabels: true,
        cableHeads: true,
        keyResults: true,
        fullResults: true,
        resultLabels: true,
        aggregatedEdges: false,
        portToPortEdges: true,
        alarms: true,
      };
  }
}

// ---------------------------------------------------------------------------
// 4. Wirtualizacja viewportu — render tylko widocznego (§7, §7B.7)
// ---------------------------------------------------------------------------

/** Kadr widoczny w world-space (po odwzorowaniu viewportu ekranu na świat). */
export interface WorldViewport {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Oblicz widoczny kadr (world-space) z transformacji viewportu ekranu.
 * `scale`/`translate` zgodne z `ViewportController` (`screen = world*scale + translate`).
 * `margin` (px ekranu) rozszerza kadr, by przygraniczne obiekty nie znikały na krawędzi.
 */
export function worldViewportFromTransform(
  transform: { readonly scale: number; readonly translateX: number; readonly translateY: number },
  screen: { readonly width: number; readonly height: number },
  marginPx = 64,
): WorldViewport {
  const s = transform.scale === 0 ? 1 : transform.scale;
  const toWorldX = (px: number): number => (px - transform.translateX) / s;
  const toWorldY = (px: number): number => (px - transform.translateY) / s;
  const m = marginPx / s;
  const x0 = toWorldX(0) - m;
  const y0 = toWorldY(0) - m;
  const x1 = toWorldX(screen.width) + m;
  const y1 = toWorldY(screen.height) + m;
  return {
    minX: Math.min(x0, x1),
    minY: Math.min(y0, y1),
    maxX: Math.max(x0, x1),
    maxY: Math.max(y0, y1),
  };
}

/** Czy prostokąt obiektu przecina kadr (AABB intersection). */
export function rectIntersectsViewport(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  vp: WorldViewport,
): boolean {
  return (
    rect.x <= vp.maxX &&
    rect.x + rect.width >= vp.minX &&
    rect.y <= vp.maxY &&
    rect.y + rect.height >= vp.minY
  );
}

/** Czy punkt leży w kadrze. */
export function pointInViewport(
  pt: { readonly x: number; readonly y: number },
  vp: WorldViewport,
): boolean {
  return pt.x >= vp.minX && pt.x <= vp.maxX && pt.y >= vp.minY && pt.y <= vp.maxY;
}

/**
 * Czy bbox polyline krawędzi przecina kadr (krawędź ma być rysowana, gdy
 * jakikolwiek jej fragment jest widoczny — przybliżamy bbox punktów).
 */
export function polylineIntersectsViewport(
  polyline: ReadonlyArray<{ readonly x: number; readonly y: number }>,
  vp: WorldViewport,
): boolean {
  if (polyline.length === 0) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polyline) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return rectIntersectsViewport({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, vp);
}

/**
 * Wirtualizacja węzłów: zwraca tylko węzły (korzenie L0) przecinające kadr.
 * Czyta `NodeGeometry` z `LayoutResult` — NIE liczy pozycji. Determinizm:
 * zachowuje kolejność wejściową.
 */
export function visibleNodes(
  nodes: readonly NodeGeometry[],
  vp: WorldViewport,
): readonly NodeGeometry[] {
  return nodes.filter((n) => rectIntersectsViewport(n, vp));
}

/** Wirtualizacja krawędzi: tylko krawędzie przecinające kadr. */
export function visibleEdges(
  edges: readonly EdgeGeometry[],
  vp: WorldViewport,
): readonly EdgeGeometry[] {
  return edges.filter((e) => polylineIntersectsViewport(e.polyline, vp));
}

/**
 * Generyczny filtr wirtualizacji dla dowolnych pozycjonowanych elementów (np.
 * propsów rendererów `{ x, y }`). Domyślny `extent` daje obiektowi rozmiar
 * (≈ blok stacji), by przygraniczne elementy nie znikały. Zwraca te przecinające
 * kadr, zachowując kolejność (determinizm).
 */
export function virtualizePositioned<T extends { readonly x: number; readonly y: number }>(
  items: readonly T[],
  vp: WorldViewport,
  extent = 160,
): readonly T[] {
  const half = extent / 2;
  return items.filter((it) =>
    rectIntersectsViewport({ x: it.x - half, y: it.y - half, width: extent, height: extent }, vp),
  );
}

// ---------------------------------------------------------------------------
// 5. Most: numeryczny LOD (0–4, legacy) ↔ poziom geometrii (L0/L1/L2)
// ---------------------------------------------------------------------------

/**
 * Mapuje legacy numeryczny LOD (0–4 z `lod/LodPolicy`) na poziom geometrii.
 * JEDNA PRAWDA poziomu: kanwa liczy LOD numeryczny ze skali (z histerezą), a tu
 * deterministycznie projektujemy go na 3-poziomową politykę widoczności:
 *   0      → L0 (przegląd: bloki),
 *   1, 2   → L1 (stacja/ciąg),
 *   3, 4   → L2 (pełny szczegół).
 * Zgodne z tabelą kontraktu §7 i progami auto-fit kanwy.
 */
export function numericLodToLevel(numericLod: 0 | 1 | 2 | 3 | 4): LodLevel {
  if (numericLod <= 0) return 'L0';
  if (numericLod <= 2) return 'L1';
  return 'L2';
}

/** Polityka widoczności wprost z numerycznego LOD kanwy (skrót). */
export function lodVisibilityPolicyForNumericLod(numericLod: 0 | 1 | 2 | 3 | 4): LodVisibilityPolicy {
  return lodVisibilityPolicy(numericLodToLevel(numericLod));
}

/**
 * Domyślny próg gęstości: liczba stacji jednocześnie w kadrze, powyżej której widok
 * jest „przeglądem sieci" (L0) — niezależnie od surowej skali. Powód: skala 0.76 to
 * „zbliżenie" dla jednej stacji, ale „przegląd" dla 50 stacji. Gęstość = ile widać,
 * nie tylko jak blisko (kontrakt §7: „L0 czytelny dla ≥50 stacji").
 */
export const OVERVIEW_DENSITY_VISIBLE_STATIONS = 16;

/**
 * Poziom „świadomy gęstości": gdy w kadrze jest dużo stacji (≥ próg), wymuś L0
 * (czytelne bloki) niezależnie od poziomu wynikającego ze skali. To domyka fix
 * gęstości M-08: auto-fit dużej sieci często ląduje przy skali mapującej na L1/L2,
 * co dawałoby pełną aparaturę 50+ stacji (nieczytelne). Widoczność liczona po
 * wirtualizacji (ile faktycznie na ekranie).
 *
 * NIE dotyczy jawnego override poziomu (użytkownik/harness wymusił poziom świadomie).
 */
export function densityAwareLevel(
  baseLevel: LodLevel,
  visibleStationCount: number,
  threshold = OVERVIEW_DENSITY_VISIBLE_STATIONS,
): LodLevel {
  if (visibleStationCount >= threshold) return 'L0';
  return baseLevel;
}

// ---------------------------------------------------------------------------
// 6. Liczenie renderowanego detalu (do testów gęstości + diagnostyki)
// ---------------------------------------------------------------------------

/**
 * Policz, ile pozycjonowanych elementów (węzłów + zagnieżdżonych dzieci) zostałoby
 * NARYSOWANYCH na danym poziomie, biorąc pod uwagę politykę widoczności i kadr.
 *
 * To dowód gęstości (M-08): na L0 liczba ≪ niż na L2, bo L0 rysuje tylko bloki
 * (children pominięte), a L2 schodzi do aparatów. Czysta funkcja nad `LayoutResult`.
 */
export function countRenderedDetail(
  nodes: readonly NodeGeometry[],
  level: LodLevel,
  vp?: WorldViewport,
): number {
  const policy = lodVisibilityPolicy(level);
  const inView = vp ? visibleNodes(nodes, vp) : nodes;
  let count = 0;
  const visit = (node: NodeGeometry, depth: number): void => {
    // depth 0 = stacja (L0), 1 = pole (L1), 2 = aparat (L2)
    if (depth === 0 && policy.stationBlock) count += 1;
    if (depth === 1 && policy.fields) count += 1;
    if (depth === 2 && policy.apparatus) count += 1;
    // Schodź w dół tylko, gdy następny poziom jest w ogóle widoczny —
    // to modeluje wirtualizację głębokości (L0 nie renderuje pól/aparatów).
    const descend =
      (depth === 0 && policy.fields) || (depth === 1 && policy.apparatus);
    if (descend) node.children?.forEach((c) => visit(c, depth + 1));
  };
  inView.forEach((n) => visit(n, 0));
  return count;
}

/** Pomocniczo: bbox całej geometrii (do auto-fit / wirtualizacji w testach). */
export function geometryBBox(nodes: readonly NodeGeometry[]): LayoutBBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (n: NodeGeometry): void => {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
    n.children?.forEach(visit);
  };
  nodes.forEach(visit);
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}
