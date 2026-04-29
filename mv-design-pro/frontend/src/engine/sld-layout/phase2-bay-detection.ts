/**
 * Phase 2: Bay Detection & Assignment
 *
 * ZADANIE: Rozpoznaj baye (feeder bays) odchodzące od szyn.
 *
 * BAY = pionowy łańcuch elementów odchodzący od szyny (busbara).
 * Każdy bay to ścieżka od busbara do terminala (load, source, sub-busbar).
 *
 * ALGORYTM:
 * 1. Znajdź wszystkie busbary (nodes z type = 'Bus')
 * 2. Dla każdego busbara: BFS w DÓŁ (follow edges downstream)
 * 3. Każda ścieżka od busbar do terminala = 1 bay
 * 4. Jeśli ścieżka zawiera sub-busbar → rekurencja (sub-bays)
 * 5. Klasyfikuj typ bay na podstawie elementów
 *
 * DETERMINIZM: Kolejność bayów = sortowanie po ID pierwszego elementu.
 */

import type {
  LayoutSymbol,
  Bay,
  BayType,
  BayElement,
  VoltageBand,
  PipelineContext,
} from './types';
import { findVoltageBandForSymbol, getSymbolMainVoltage } from './phase1-voltage-bands';

// =============================================================================
// GŁÓWNA FUNKCJA FAZY 2
// =============================================================================

/**
 * Faza 2: Wykrywanie bayów.
 *
 * @param context - Kontekst pipeline
 * @returns Zaktualizowany kontekst z bays
 */
export function detectBays(context: PipelineContext): PipelineContext {
  const { symbols, symbolById, elementToSymbol, voltageBands } = context;

  if (!voltageBands || voltageBands.length === 0) {
    return {
      ...context,
      bays: [],
    };
  }

  // Krok 1: Znajdź wszystkie busbary
  // WAŻNE: Sortuj wg hierarchii - główne szyny (z Source) najpierw, potem wg napięcia (malejąco)
  // To zapewnia że CB/transformatory są przypisane do bayów głównych szyn, nie pośrednich
  const sourceConnectedBusbars = new Set(
    symbols
      .filter((s) => s.elementType === 'Source' && s.connectedToNodeId)
      .map((s) => symbols.find((b) => b.elementType === 'Bus' && b.elementId === s.connectedToNodeId)?.id)
      .filter((id): id is string => id !== undefined)
  );

  const busbars = symbols
    .filter((s) => s.elementType === 'Bus')
    .sort((a, b) => {
      // 1. Main busbars (connected to Source) first
      const aIsMain = sourceConnectedBusbars.has(a.id) ? 0 : 1;
      const bIsMain = sourceConnectedBusbars.has(b.id) ? 0 : 1;
      if (aIsMain !== bIsMain) return aIsMain - bIsMain;

      // 2. Higher voltage first
      const aVoltage = a.voltageKV ?? 0;
      const bVoltage = b.voltageKV ?? 0;
      if (aVoltage !== bVoltage) return bVoltage - aVoltage;

      // 3. By id for determinism
      return a.id.localeCompare(b.id);
    });

  // Krok 2: Buduj graf połączeń
  const connectionGraph = buildConnectionGraph(symbols);

  // Krok 3: Wykryj baye dla każdego busbara
  const allBays: Bay[] = [];
  const globalProcessedElements = new Set<string>();
  const processedBusbars = new Set<string>();

  for (const busbar of busbars) {
    if (processedBusbars.has(busbar.id)) {
      continue;
    }

    const bays = detectBaysFromBusbar(
      busbar,
      symbols,
      symbolById,
      elementToSymbol,
      connectionGraph,
      voltageBands,
      0, // depth = 0 (główne baye)
      globalProcessedElements,
      processedBusbars
    );

    allBays.push(...bays);
  }

  // Krok 4: Przypisz sloty (indeksy) bayom
  assignBaySlots(allBays);

  return {
    ...context,
    bays: allBays,
  };
}

// =============================================================================
// GRAF POŁĄCZEŃ
// =============================================================================

/**
 * Graf połączeń między elementami.
 */
interface ConnectionGraph {
  /** Mapa: element ID → lista połączonych element IDs */
  adjacency: Map<string, Set<string>>;

  /** Mapa: (from, to) → symbol ID łączący */
  edgeToSymbol: Map<string, string>;
}

/**
 * Buduj graf połączeń z symboli.
 *
 * @param symbols - Lista symboli
 * @returns Graf połączeń
 */
function buildConnectionGraph(symbols: LayoutSymbol[]): ConnectionGraph {
  const adjacency = new Map<string, Set<string>>();
  const edgeToSymbol = new Map<string, string>();

  // Pomocnicza funkcja do dodawania krawędzi
  const addEdge = (fromElementId: string, toElementId: string, symbolId: string) => {
    if (!adjacency.has(fromElementId)) {
      adjacency.set(fromElementId, new Set());
    }
    if (!adjacency.has(toElementId)) {
      adjacency.set(toElementId, new Set());
    }

    adjacency.get(fromElementId)!.add(toElementId);
    adjacency.get(toElementId)!.add(fromElementId);

    const edgeKey = makeEdgeKey(fromElementId, toElementId);
    edgeToSymbol.set(edgeKey, symbolId);
  };

  for (const symbol of symbols) {
    // Branch (Line, Transformer) łączy fromNodeId z toNodeId
    if (
      (symbol.elementType === 'LineBranch' || symbol.elementType === 'TransformerBranch') &&
      symbol.fromNodeId &&
      symbol.toNodeId
    ) {
      addEdge(symbol.fromNodeId, symbol.toNodeId, symbol.id);
    }

    // Switch łączy fromNodeId z toNodeId
    if (symbol.elementType === 'Switch' && symbol.fromNodeId && symbol.toNodeId) {
      addEdge(symbol.fromNodeId, symbol.toNodeId, symbol.id);
    }

    // Source/Load/Generator są połączone do węzła
    if (
      (symbol.elementType === 'Source' ||
        symbol.elementType === 'Load' ||
        symbol.elementType === 'Generator') &&
      symbol.connectedToNodeId
    ) {
      // Terminale nie tworzą krawędzi w grafie — są końcowymi elementami
      // Dodajemy tylko węzeł do adjacency dla kompletności
      if (!adjacency.has(symbol.connectedToNodeId)) {
        adjacency.set(symbol.connectedToNodeId, new Set());
      }
    }
  }

  return { adjacency, edgeToSymbol };
}

/**
 * Utwórz klucz krawędzi (deterministyczny — sortowany).
 */
function makeEdgeKey(elementId1: string, elementId2: string): string {
  const sorted = [elementId1, elementId2].sort();
  return `${sorted[0]}::${sorted[1]}`;
}

// =============================================================================
// WYKRYWANIE BAYÓW
// =============================================================================

/**
 * Wykryj baye odchodzące od busbara.
 *
 * @param busbar - Symbol busbara
 * @param allSymbols - Wszystkie symbole
 * @param symbolById - Mapa symbol ID → symbol
 * @param elementToSymbol - Mapa element ID → symbol ID
 * @param graph - Graf połączeń
 * @param voltageBands - Pasma napięciowe
 * @param depth - Głębokość zagnieżdżenia
 * @param processedElements - Globalny zbiór przetworzonych elementów
 * @param processedBusbars - Globalny zbiór przetworzonych busbarów
 * @returns Lista bayów
 */
function detectBaysFromBusbar(
  busbar: LayoutSymbol,
  allSymbols: LayoutSymbol[],
  symbolById: Map<string, LayoutSymbol>,
  elementToSymbol: Map<string, string>,
  graph: ConnectionGraph,
  voltageBands: VoltageBand[],
  depth: number,
  processedElements: Set<string>,
  processedBusbars: Set<string>
): Bay[] {
  // Oznacz busbar jako przetworzony
  processedBusbars.add(busbar.id);
  processedElements.add(busbar.elementId);

  // Limit głębokości rekurencji (bezpieczeństwo)
  if (depth > 10) {
    return [];
  }

  const bays: Bay[] = [];
  const busbarElementId = busbar.elementId;

  // Znajdź wszystkie elementy bezpośrednio połączone z busbarem
  const connectedElementIds = new Set<string>(graph.adjacency.get(busbarElementId) ?? new Set());

  // Znajdź też terminale (Source/Load/Generator) połączone z busbarElementId
  for (const symbol of allSymbols) {
    if (
      (symbol.elementType === 'Source' ||
        symbol.elementType === 'Load' ||
        symbol.elementType === 'Generator') &&
      symbol.connectedToNodeId === busbarElementId
    ) {
      connectedElementIds.add(symbol.elementId);
    }
  }

  // Sortuj dla determinizmu
  const sortedConnected = Array.from(connectedElementIds).sort();

  for (const connectedElementId of sortedConnected) {
    if (processedElements.has(connectedElementId)) {
      continue;
    }

    // Sprawdź czy to jest element łączący (Switch/Branch) czy terminal
    const connectedSymbolId = elementToSymbol.get(connectedElementId);
    const connectedSymbol = connectedSymbolId ? symbolById.get(connectedSymbolId) : undefined;

    // Znajdź symbol łączący busbar z tym elementem
    const edgeKey = makeEdgeKey(busbarElementId, connectedElementId);
    const linkingSymbolId = graph.edgeToSymbol.get(edgeKey);
    const linkingSymbol = linkingSymbolId ? symbolById.get(linkingSymbolId) : undefined;

    // BFS od busbara aby znaleźć wszystkie elementy w bayu
    const bayElements = collectBayElements(
      busbar,
      linkingSymbol ?? connectedSymbol,
      allSymbols,
      symbolById,
      elementToSymbol,
      graph,
      processedElements
    );

    if (bayElements.length === 0) {
      continue;
    }

    // Znajdź sub-busbary w bayu
    const subBusbarIds = bayElements
      .filter((e) => {
        const sym = symbolById.get(e.symbolId);
        return sym?.elementType === 'Bus';
      })
      .map((e) => e.symbolId);

    // Klasyfikuj typ baya
    const bayType = classifyBayType(bayElements, symbolById, allSymbols);

    // Znajdź pasmo napięciowe baya
    const voltageBand = findVoltageBandForSymbol(busbar, voltageBands);

    const bay: Bay = {
      id: `bay_${busbar.id}_${bays.length}`,
      parentBusbarId: busbar.id,
      parentBusbarElementId: busbarElementId,
      elements: bayElements,
      subBusbarIds,
      subBays: [], // Wypełnione później (rekurencja)
      bayType,
      depth,
      slotX: 0, // Wypełnione w assignBaySlots
      slotIndex: bays.length,
      voltageBandId: voltageBand?.id ?? '',
    };

    // Rekurencja dla sub-busbarów
    for (const subBusbarId of subBusbarIds) {
      // Sprawdź czy sub-busbar już był przetworzony
      if (processedBusbars.has(subBusbarId)) {
        continue;
      }

      const subBusbar = symbolById.get(subBusbarId);
      if (subBusbar) {
        const subBays = detectBaysFromBusbar(
          subBusbar,
          allSymbols,
          symbolById,
          elementToSymbol,
          graph,
          voltageBands,
          depth + 1,
          processedElements,
          processedBusbars
        );
        bay.subBays.push(...subBays);
      }
    }

    bays.push(bay);
  }

  // Sortuj baye dla determinizmu
  bays.sort((a, b) => {
    // Sortuj po typie (incomer pierwszy, tie ostatni)
    const typeOrder = BAY_TYPE_ORDER[a.bayType] - BAY_TYPE_ORDER[b.bayType];
    if (typeOrder !== 0) return typeOrder;

    // Potem po ID pierwszego elementu
    const aFirstId = a.elements[0]?.symbolId ?? '';
    const bFirstId = b.elements[0]?.symbolId ?? '';
    return aFirstId.localeCompare(bFirstId);
  });

  return bays;
}

/**
 * Zbierz elementy należące do baya (BFS od busbara).
 */
function collectBayElements(
  busbar: LayoutSymbol,
  startSymbol: LayoutSymbol | undefined,
  allSymbols: LayoutSymbol[],
  _symbolById: Map<string, LayoutSymbol>,
  elementToSymbol: Map<string, string>,
  graph: ConnectionGraph,
  processedElements: Set<string>
): BayElement[] {
  if (!startSymbol) {
    return [];
  }

  const elements: BayElement[] = [];
  const visited = new Set<string>();
  const queue: Array<{ symbol: LayoutSymbol; order: number }> = [];

  // Start od elementu łączącego
  queue.push({ symbol: startSymbol, order: 0 });
  visited.add(startSymbol.id);

  while (queue.length > 0) {
    const { symbol, order } = queue.shift()!;

    // Nie dodawaj początkowego busbara do baya
    if (symbol.id === busbar.id) {
      continue;
    }

    // Oznacz element jako przetworzony (globalnie)
    processedElements.add(symbol.elementId);

    // Dodaj do listy elementów baya
    elements.push({
      symbolId: symbol.id,
      elementId: symbol.elementId,
      elementType: symbol.elementType,
      orderInBay: order,
      voltageKV: getSymbolMainVoltage(symbol),
    });

    // Jeśli to sub-busbar — zatrzymaj eksplorację (będzie osobna rekurencja)
    if (symbol.elementType === 'Bus' && symbol.id !== busbar.id) {
      continue;
    }

    // Jeśli to terminal (Source/Load) — koniec ścieżki
    if (symbol.elementType === 'Source' || symbol.elementType === 'Load') {
      continue;
    }

    // Znajdź sąsiadów
    const neighbors = findSymbolNeighbors(symbol, allSymbols, elementToSymbol, graph);

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.id) && neighbor.id !== busbar.id) {
        visited.add(neighbor.id);
        queue.push({ symbol: neighbor, order: order + 1 });
      }
    }
  }

  // Sortuj elementy po orderInBay
  elements.sort((a, b) => a.orderInBay - b.orderInBay);

  // Renumeruj order
  elements.forEach((e, i) => (e.orderInBay = i));

  return elements;
}

/**
 * Znajdź sąsiadów symbolu w grafie.
 *
 * WAŻNE: Dla bay detection, traverse only DOWNSTREAM (from busbar toward terminal).
 * For Switch/LineBranch: only look at toNodeId (downstream), not fromNodeId (upstream).
 * This prevents finding sibling bays at the same busbar level.
 */
function findSymbolNeighbors(
  symbol: LayoutSymbol,
  allSymbols: LayoutSymbol[],
  elementToSymbol: Map<string, string>,
  graph: ConnectionGraph
): LayoutSymbol[] {
  const neighbors: LayoutSymbol[] = [];
  const symbolById = new Map(allSymbols.map((s) => [s.id, s]));

  // Dla wszystkich Branch/Switch — traverse tylko DOWNSTREAM (toNodeId)
  // NIE szukamy na fromNodeId aby uniknąć cofania się do głównej szyny
  // Transformatory też powinny iść tylko w jednym kierunku (HV → LV)

  if (symbol.toNodeId) {
    // WAŻNE: Dodaj busbar AT toNodeId (element, którego elementId === toNodeId)
    const toNodeSymbolId = elementToSymbol.get(symbol.toNodeId);
    if (toNodeSymbolId) {
      const toNodeSymbol = symbolById.get(toNodeSymbolId);
      if (toNodeSymbol && toNodeSymbol.elementType === 'Bus') {
        neighbors.push(toNodeSymbol);
      }
    }

    // Szukaj elementów połączonych z toNodeId (ale nie samego busa - już dodaliśmy)
    const connected = graph.adjacency.get(symbol.toNodeId) ?? new Set();
    for (const elementId of connected) {
      if (elementId !== symbol.fromNodeId && elementId !== symbol.toNodeId) {
        const symbolId = elementToSymbol.get(elementId);
        if (symbolId) {
          const neighborSymbol = symbolById.get(symbolId);
          if (neighborSymbol) {
            neighbors.push(neighborSymbol);
          }
        }
      }
    }

    // NIE szukamy terminali (Source/Load/Generator) tutaj
    // Terminale są podłączone do BUSBARÓW, a nie do transformatorów/switchy
    // Znajdowane są w głównej pętli detectBaysFromBusbar
  }

  // Dla Source/Load/Generator — szukaj elementów połączonych z connectedToNodeId
  if (symbol.connectedToNodeId) {
    const connected = graph.adjacency.get(symbol.connectedToNodeId) ?? new Set();
    for (const elementId of connected) {
      const symbolId = elementToSymbol.get(elementId);
      if (symbolId) {
        const neighborSymbol = symbolById.get(symbolId);
        if (neighborSymbol) {
          neighbors.push(neighborSymbol);
        }
      }
    }

    // Szukaj innych terminali na tym samym węźle
    for (const s of allSymbols) {
      if (
        s.id !== symbol.id &&
        (s.elementType === 'Source' ||
          s.elementType === 'Load' ||
          s.elementType === 'Generator') &&
        s.connectedToNodeId === symbol.connectedToNodeId
      ) {
        neighbors.push(s);
      }
    }
  }

  // Usuń duplikaty i sortuj dla determinizmu
  const uniqueNeighbors = Array.from(new Map(neighbors.map((n) => [n.id, n])).values());
  uniqueNeighbors.sort((a, b) => a.id.localeCompare(b.id));

  return uniqueNeighbors;
}

// =============================================================================
// KLASYFIKACJA TYPU BAYA
// =============================================================================

/**
 * Kolejność typów bayów (dla sortowania).
 */
const BAY_TYPE_ORDER: Record<BayType, number> = {
  incomer: 0,
  measurement: 1,
  feeder: 2,
  generator: 3,
  oze_pv: 4,
  oze_wind: 5,
  bess: 6,
  capacitor: 7,
  auxiliary: 8,
  tie: 9,
  unknown: 10,
};

/**
 * Wyodrębnij cechy ścieżki baya (do klasyfikacji).
 */
interface BayFeatures {
  hasSource: boolean;
  hasLoad: boolean;
  hasGenerator: boolean;
  hasTransformer: boolean;
  hasSubBusbar: boolean;
  hasTwoBusbars: boolean;
  generatorTypes: Set<string>;
  explicitBayTypes: Set<BayType>;
  onlyMeasurement: boolean;
}

type RuntimeSymbolSemantics = {
  bayType?: unknown;
  bayRole?: unknown;
  semanticRole?: unknown;
  role?: unknown;
};

const EXPLICIT_ELEMENT_TYPE_TO_BAY_TYPE: Record<string, BayType> = {
  Capacitor: 'capacitor',
  CapacitorBank: 'capacitor',
  Measurement: 'measurement',
  Metering: 'measurement',
  CurrentTransformer: 'measurement',
  VoltageTransformer: 'measurement',
  Auxiliary: 'auxiliary',
  AuxiliarySupply: 'auxiliary',
};

const EXPLICIT_ROLE_TO_BAY_TYPE: Record<string, BayType> = {
  incomer: 'incomer',
  feeder: 'feeder',
  tie: 'tie',
  generator: 'generator',
  oze_pv: 'oze_pv',
  PV: 'oze_pv',
  oze_wind: 'oze_wind',
  WIND: 'oze_wind',
  bess: 'bess',
  BESS: 'bess',
  capacitor: 'capacitor',
  measurement: 'measurement',
  auxiliary: 'auxiliary',
  unknown: 'unknown',
};

function getExplicitBayType(symbol: LayoutSymbol): BayType | undefined {
  const typeFromElementType = EXPLICIT_ELEMENT_TYPE_TO_BAY_TYPE[symbol.elementType];
  if (typeFromElementType) {
    return typeFromElementType;
  }

  const runtimeSemantics = symbol as RuntimeSymbolSemantics;
  const explicitRole =
    runtimeSemantics.bayType ??
    runtimeSemantics.bayRole ??
    runtimeSemantics.semanticRole ??
    runtimeSemantics.role;

  if (typeof explicitRole !== 'string') {
    return undefined;
  }

  return EXPLICIT_ROLE_TO_BAY_TYPE[explicitRole];
}

function isMeasurementElement(symbol: LayoutSymbol): boolean {
  return getExplicitBayType(symbol) === 'measurement';
}

/**
 * Wyodrębnij cechy baya z listy elementów.
 */
function extractBayFeatures(
  symbols: LayoutSymbol[]
): BayFeatures {
  const busbars = symbols.filter((s) => s.elementType === 'Bus');
  const generators = symbols.filter((s) => s.elementType === 'Generator');
  const sources = symbols.filter((s) => s.elementType === 'Source');
  const loads = symbols.filter((s) => s.elementType === 'Load');
  const transformers = symbols.filter((s) => s.elementType === 'TransformerBranch');

  // Zbierz generatorType z generatorów
  const generatorTypes = new Set<string>();
  for (const gen of generators) {
    if (gen.generatorType) {
      generatorTypes.add(gen.generatorType);
    }
  }

  const explicitBayTypes = new Set<BayType>();
  for (const symbol of symbols) {
    const explicitBayType = getExplicitBayType(symbol);
    if (explicitBayType) {
      explicitBayTypes.add(explicitBayType);
    }
  }

  // Sprawdź czy to pole pomiarowe (tylko CT/VT + switching, BEZ sub-busbara)
  // Bay z sub-busbarem to feeder, nie pole pomiarowe
  const onlyMeasurement =
    busbars.length === 0 &&
    symbols.every((s) => s.elementType === 'Switch' || isMeasurementElement(s)) &&
    symbols.length <= 3;

  return {
    hasSource: sources.length > 0,
    hasLoad: loads.length > 0,
    hasGenerator: generators.length > 0,
    hasTransformer: transformers.length > 0,
    hasSubBusbar: busbars.length > 0,
    hasTwoBusbars: busbars.length >= 2,
    generatorTypes,
    explicitBayTypes,
    onlyMeasurement,
  };
}

/**
 * Klasyfikuj typ baya na podstawie cech (priorytetowo).
 *
 * Priorytety (od najwyższego):
 * 1. tie (łączy dwa busbary)
 * 2. bess (magazyn energii)
 * 3. oze_pv (fotowoltaika)
 * 4. oze_wind (wiatrowa)
 * 5. generator (konwencjonalny)
 * 6. capacitor (kondensatory)
 * 7. auxiliary (potrzeby własne)
 * 8. measurement (pole pomiarowe)
 * 9. incomer (transformator z WN)
 * 10. feeder (domyślne pole liniowe)
 */
function classifyBayFromFeatures(features: BayFeatures): BayType {
  const { explicitBayTypes, generatorTypes } = features;

  // 1. Tie: łączy dwa busbary
  if (features.hasTwoBusbars) {
    return 'tie';
  }

  // 2. BESS: jawny generatorType lub rola/typ
  if (generatorTypes.has('BESS') || explicitBayTypes.has('bess')) {
    return 'bess';
  }

  // 3. OZE PV: jawny generatorType lub rola/typ
  if (generatorTypes.has('PV') || explicitBayTypes.has('oze_pv')) {
    return 'oze_pv';
  }

  // 4. OZE Wind: jawny generatorType lub rola/typ
  if (generatorTypes.has('WIND') || explicitBayTypes.has('oze_wind')) {
    return 'oze_wind';
  }

  // 5. Generator konwencjonalny
  if (
    explicitBayTypes.has('generator') ||
    generatorTypes.has('DIESEL') ||
    generatorTypes.has('GAS') ||
    generatorTypes.has('HYDRO') ||
    generatorTypes.has('OTHER')
  ) {
    return 'generator';
  }

  // 6. Bateria kondensatorów
  if (explicitBayTypes.has('capacitor')) {
    return 'capacitor';
  }

  // 7. Potrzeby własne
  if (explicitBayTypes.has('auxiliary')) {
    return 'auxiliary';
  }

  // 8. Pole pomiarowe
  if (features.onlyMeasurement) {
    return 'measurement';
  }

  // 9. Incomer: bay z zewnętrznym źródłem (Source) — zasilanie z sieci
  if (features.hasSource) {
    return 'incomer';
  }

  // 10. Feeder: ma load, sub-busbar, transformator, generator lub jest "normalnym" polem
  if (features.hasLoad || features.hasSubBusbar || features.hasTransformer || features.hasGenerator) {
    return 'feeder';
  }

  return 'unknown';
}

/**
 * Klasyfikuj typ baya na podstawie elementów.
 *
 * @param elements - Elementy w bayu
 * @param symbolById - Mapa symbol ID → symbol
 * @param allSymbols - Wszystkie symbole
 * @returns Typ baya
 */
function classifyBayType(
  elements: BayElement[],
  symbolById: Map<string, LayoutSymbol>,
  _allSymbols: LayoutSymbol[]
): BayType {
  const symbols = elements.map((e) => symbolById.get(e.symbolId)).filter(Boolean) as LayoutSymbol[];

  // Wyodrębnij cechy
  const features = extractBayFeatures(symbols);

  // Klasyfikuj na podstawie cech
  return classifyBayFromFeatures(features);
}

// =============================================================================
// PRZYPISANIE SLOTÓW
// =============================================================================

/**
 * Przypisz sloty (indeksy X) bayom.
 *
 * @param bays - Lista bayów
 */
function assignBaySlots(bays: Bay[]): void {
  // Grupuj baye po parent busbar
  const baysByBusbar = new Map<string, Bay[]>();

  for (const bay of bays) {
    const existing = baysByBusbar.get(bay.parentBusbarId) ?? [];
    existing.push(bay);
    baysByBusbar.set(bay.parentBusbarId, existing);
  }

  // Dla każdego busbara — przypisz sloty
  for (const [_busbarId, busbarBays] of baysByBusbar) {
    // Sortuj po typie i ID
    busbarBays.sort((a, b) => {
      const typeOrder = BAY_TYPE_ORDER[a.bayType] - BAY_TYPE_ORDER[b.bayType];
      if (typeOrder !== 0) return typeOrder;
      return a.id.localeCompare(b.id);
    });

    // Przypisz slotIndex
    busbarBays.forEach((bay, index) => {
      bay.slotIndex = index;
    });
  }
}

// =============================================================================
// FUNKCJE POMOCNICZE DLA INNYCH FAZ
// =============================================================================

/**
 * Znajdź bay zawierający dany symbol.
 *
 * @param symbolId - ID symbolu
 * @param bays - Lista bayów
 * @returns Bay lub undefined
 */
export function findBayContainingSymbol(symbolId: string, bays: Bay[]): Bay | undefined {
  for (const bay of bays) {
    if (bay.elements.some((e) => e.symbolId === symbolId)) {
      return bay;
    }

    // Sprawdź sub-baye
    const subBay = findBayContainingSymbol(symbolId, bay.subBays);
    if (subBay) {
      return subBay;
    }
  }

  return undefined;
}

/**
 * Znajdź wszystkie baye dla danego busbara.
 *
 * @param busbarId - ID busbara
 * @param bays - Lista bayów
 * @returns Lista bayów
 */
export function findBaysForBusbar(busbarId: string, bays: Bay[]): Bay[] {
  return bays.filter((bay) => bay.parentBusbarId === busbarId);
}

/**
 * Policz łączną liczbę bayów (włącznie z sub-bayami).
 *
 * @param bays - Lista bayów
 * @returns Łączna liczba
 */
export function countTotalBays(bays: Bay[]): number {
  let count = bays.length;
  for (const bay of bays) {
    count += countTotalBays(bay.subBays);
  }
  return count;
}

/**
 * Wykryj tie-baye (łączniki międzyszynowe).
 *
 * @param bays - Lista bayów
 * @returns Lista tie-bayów
 */
export function findTieBays(bays: Bay[]): Bay[] {
  return bays.filter((bay) => bay.bayType === 'tie');
}

/**
 * Wykryj SZR (samoczynne załączanie rezerwy).
 *
 * SZR to specjalny przypadek tie-bay z normalnie otwartym łącznikiem.
 *
 * @param bays - Lista bayów
 * @param symbolById - Mapa symbol ID → symbol
 * @returns Lista SZR bayów
 */
export function findSZRBays(bays: Bay[], symbolById: Map<string, LayoutSymbol>): Bay[] {
  return bays.filter((bay) => {
    if (bay.bayType !== 'tie') {
      return false;
    }

    // Sprawdź czy zawiera normalnie otwarty switch
    for (const element of bay.elements) {
      const symbol = symbolById.get(element.symbolId);
      if (symbol?.elementType === 'Switch' && symbol.switchState === 'OPEN') {
        return true;
      }
    }

    return false;
  });
}
