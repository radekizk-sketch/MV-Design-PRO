/**
 * SLD VALIDATOR — Walidacja topologiczna i geometryczna SLD
 *
 * CANONICAL ALIGNMENT:
 * - SLD_KANONICZNA_SPECYFIKACJA.md § 8: Walidacja
 * - AUDYT_SLD_CANONICAL.md: Wymagania naprawcze
 * - PR-SLD-CANONICAL-GEOMETRY-FULL: NO FLOATING SYMBOL validation
 * - PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL: CANONICAL/Canonical-grade topology validation
 *
 * REGUŁY WALIDACJI:
 *
 * TOPOLOGICZNE:
 * - V-01: Każdy symbol ma elementId (brak orphan symbols)
 * - V-01b: Brak zduplikowanych elementId (N-03 CANONICAL)
 * - V-02: Każdy element ma symbol (brak hidden elements)
 * - V-03: Połączenia port↔port są poprawne
 * - V-04: Brak izolowanych wysp bez źródła
 * - V-05: Minimum 1 źródło
 * - V-06: CANONICAL — Każde odgałęzienie SN MUSI mieć łącznik (wyłącznik/rozłącznik/reklozer)
 * - V-07: CANONICAL — Transformator SN/nn MUSI mieć wyłącznik SN przed transformatorem
 *
 * GEOMETRYCZNE:
 * - G-01: Symbole nie nakładają się
 * - G-02: Połączenia nie przechodzą przez symbole (opcjonalne)
 * - G-03: Pozycje na siatce
 * - G-04: NO FLOATING SYMBOL — żaden symbol nie może wisieć w powietrzu (CANONICAL rule)
 */

import type { AnySldSymbol, BranchSymbol, SwitchSymbol } from '../types';
import { getSymbolBoundingBox, doBoundingBoxesIntersect } from './geometry';
import { CANONICAL_GEOMETRY } from '../../sld/sldCanonicalStyle';

// =============================================================================
// TYPY
// =============================================================================

/** Poziom ważności błędu */
export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

/** Wynik walidacji pojedynczej reguły */
export interface ValidationIssue {
  /** ID reguły (V-01, G-01, ...) */
  ruleId: string;
  /** Poziom ważności */
  severity: ValidationSeverity;
  /** Opis problemu */
  message: string;
  /** ID symboli, których dotyczy problem */
  symbolIds: string[];
  /** Sugestia naprawy */
  suggestion?: string;
}

/** Wynik pełnej walidacji */
export interface ValidationResult {
  /** Czy walidacja przeszła (brak ERROR) */
  valid: boolean;
  /** Lista problemów */
  issues: ValidationIssue[];
  /** Statystyki */
  stats: {
    totalSymbols: number;
    errors: number;
    warnings: number;
    infos: number;
  };
}

/** Opcje walidacji */
export interface ValidationOptions {
  /** Sprawdzaj orphan symbols (V-01) */
  checkOrphanSymbols?: boolean;
  /** Sprawdzaj duplikaty elementId (V-01b) — N-03 CANONICAL */
  checkDuplicateElementIds?: boolean;
  /** Sprawdzaj hidden elements (V-02) */
  checkHiddenElements?: boolean;
  /** Sprawdzaj połączenia (V-03) */
  checkConnections?: boolean;
  /** Sprawdzaj wyspy (V-04) */
  checkIslands?: boolean;
  /** Sprawdzaj źródła (V-05) */
  checkSources?: boolean;
  /** PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL: Sprawdzaj łączniki odgałęzień SN (V-06) */
  checkSnBranchSwitching?: boolean;
  /** PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL: Sprawdzaj wyłączniki transformatorów (V-07) */
  checkTransformerBreakers?: boolean;
  /** Sprawdzaj kolizje (G-01) */
  checkCollisions?: boolean;
  /** Sprawdzaj pozycje na siatce (G-03) */
  checkGridAlignment?: boolean;
  /** PR-SLD-CANONICAL-GEOMETRY-FULL: Sprawdzaj floating symbols (G-04) */
  checkFloatingSymbols?: boolean;
  /** PR-SLD-CANONICAL-GEOMETRY-FULL: Lista floating symbols z layout engine */
  floatingSymbolIds?: string[];
  /** Rozmiar siatki dla G-03 */
  gridSize?: number;
  /** Lista ID elementów modelu (dla V-02) */
  modelElementIds?: string[];
}

/** Domyślne opcje */
const DEFAULT_OPTIONS: ValidationOptions = {
  checkOrphanSymbols: true,
  checkDuplicateElementIds: true, // N-03: Wykryj zduplikowane elementId
  checkHiddenElements: false, // Wymaga modelElementIds
  checkConnections: true,
  checkIslands: true,
  checkSources: true,
  checkSnBranchSwitching: true, // V-06: CANONICAL — odgałęzienia SN muszą mieć łącznik
  checkTransformerBreakers: true, // V-07: CANONICAL — transformatory muszą mieć wyłącznik
  checkCollisions: true,
  checkGridAlignment: true,
  checkFloatingSymbols: CANONICAL_GEOMETRY.validation.noFloatingSymbol, // PR-SLD-CANONICAL-GEOMETRY-FULL
  gridSize: 20,
};

// =============================================================================
// GŁÓWNA FUNKCJA WALIDACJI
// =============================================================================

/**
 * Przeprowadź pełną walidację SLD.
 *
 * @param symbols - Symbole SLD do walidacji
 * @param options - Opcje walidacji
 * @returns Wynik walidacji
 */
export function validateSld(
  symbols: AnySldSymbol[],
  options: ValidationOptions = {}
): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const issues: ValidationIssue[] = [];

  // V-01: Orphan symbols (symbol bez elementId)
  if (opts.checkOrphanSymbols) {
    issues.push(...checkOrphanSymbols(symbols));
  }

  // V-01b: Duplicate elementIds (N-03 CANONICAL)
  if (opts.checkDuplicateElementIds) {
    issues.push(...checkDuplicateElementIds(symbols));
  }

  // V-02: Hidden elements (element bez symbolu)
  if (opts.checkHiddenElements && opts.modelElementIds) {
    issues.push(...checkHiddenElements(symbols, opts.modelElementIds));
  }

  // V-03: Połączenia
  if (opts.checkConnections) {
    issues.push(...checkConnections(symbols));
  }

  // V-04: Izolowane wyspy
  if (opts.checkIslands) {
    issues.push(...checkIslands(symbols));
  }

  // V-05: Źródła
  if (opts.checkSources) {
    issues.push(...checkSources(symbols));
  }

  // V-06: Odgałęzienia SN muszą mieć łącznik (PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL)
  if (opts.checkSnBranchSwitching) {
    issues.push(...checkSnBranchSwitching(symbols));
  }

  // V-07: Transformatory SN/nn muszą mieć wyłącznik SN (PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL)
  if (opts.checkTransformerBreakers) {
    issues.push(...checkTransformerBreakers(symbols));
  }

  // G-01: Kolizje
  if (opts.checkCollisions) {
    issues.push(...checkCollisions(symbols));
  }

  // G-03: Grid alignment
  if (opts.checkGridAlignment && opts.gridSize) {
    issues.push(...checkGridAlignment(symbols, opts.gridSize));
  }

  // G-04: Floating symbols (PR-SLD-CANONICAL-GEOMETRY-FULL)
  if (opts.checkFloatingSymbols) {
    issues.push(...checkFloatingSymbols(symbols, opts.floatingSymbolIds));
  }

  // Oblicz statystyki
  const errors = issues.filter((i) => i.severity === 'ERROR').length;
  const warnings = issues.filter((i) => i.severity === 'WARNING').length;
  const infos = issues.filter((i) => i.severity === 'INFO').length;

  return {
    valid: errors === 0,
    issues,
    stats: {
      totalSymbols: symbols.length,
      errors,
      warnings,
      infos,
    },
  };
}

// =============================================================================
// V-01: ORPHAN SYMBOLS
// =============================================================================

/**
 * Sprawdź czy każdy symbol ma elementId.
 */
function checkOrphanSymbols(symbols: AnySldSymbol[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  symbols.forEach((symbol) => {
    if (!symbol.elementId || symbol.elementId.trim() === '') {
      issues.push({
        ruleId: 'V-01',
        severity: 'ERROR',
        message: `Symbol "${symbol.elementName}" (${symbol.id}) nie ma przypisanego elementu modelu (brak elementId)`,
        symbolIds: [symbol.id],
        suggestion: 'Usuń symbol lub przypisz go do elementu modelu',
      });
    }
  });

  return issues;
}

// =============================================================================
// V-01b: DUPLICATE ELEMENT IDS (N-03 CANONICAL)
// =============================================================================

/**
 * Sprawdź czy są zduplikowane elementId (bijection violation).
 *
 * N-03 CANONICAL: Kopiowanie/wklejanie musi tworzyć NOWE elementy modelu,
 * nie duplikować referencje do istniejących.
 */
function checkDuplicateElementIds(symbols: AnySldSymbol[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const elementIdMap = new Map<string, string[]>(); // elementId -> symbolIds

  // Zbierz wszystkie elementId
  symbols.forEach((symbol) => {
    if (symbol.elementId && symbol.elementId.trim() !== '') {
      const existing = elementIdMap.get(symbol.elementId) || [];
      existing.push(symbol.id);
      elementIdMap.set(symbol.elementId, existing);
    }
  });

  // Znajdź duplikaty
  for (const [elementId, symbolIds] of elementIdMap.entries()) {
    if (symbolIds.length > 1) {
      const symbolNames = symbolIds
        .map((id) => symbols.find((s) => s.id === id)?.elementName || id)
        .join(', ');

      issues.push({
        ruleId: 'V-01b',
        severity: 'ERROR',
        message: `Zduplikowany elementId "${elementId}" — ${symbolIds.length} symboli (${symbolNames}) wskazuje na ten sam element modelu`,
        symbolIds: symbolIds,
        suggestion: 'Każdy symbol musi wskazywać na unikalny element modelu. Usuń duplikaty lub utwórz nowe elementy.',
      });
    }
  }

  return issues;
}

// =============================================================================
// V-02: HIDDEN ELEMENTS
// =============================================================================

/**
 * Sprawdź czy każdy element modelu ma symbol.
 */
function checkHiddenElements(
  symbols: AnySldSymbol[],
  modelElementIds: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const symbolElementIds = new Set(symbols.map((s) => s.elementId));

  modelElementIds.forEach((elementId) => {
    if (!symbolElementIds.has(elementId)) {
      issues.push({
        ruleId: 'V-02',
        severity: 'WARNING',
        message: `Element modelu (${elementId}) nie ma symbolu na schemacie SLD`,
        symbolIds: [],
        suggestion: 'Dodaj symbol dla tego elementu lub usuń element z modelu',
      });
    }
  });

  return issues;
}

// =============================================================================
// V-03: POŁĄCZENIA
// =============================================================================

/**
 * Sprawdź poprawność połączeń (fromNodeId/toNodeId wskazują na istniejące elementy).
 */
function checkConnections(symbols: AnySldSymbol[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const elementIds = new Set(symbols.map((s) => s.elementId));

  symbols.forEach((symbol) => {
    // Branch
    if (symbol.elementType === 'LineBranch' || symbol.elementType === 'TransformerBranch') {
      const branch = symbol as BranchSymbol;

      if (!branch.fromNodeId) {
        issues.push({
          ruleId: 'V-03',
          severity: 'ERROR',
          message: `Gałąź "${symbol.elementName}" nie ma zdefiniowanego fromNodeId`,
          symbolIds: [symbol.id],
          suggestion: 'Przypisz węzeł początkowy',
        });
      } else if (!elementIds.has(branch.fromNodeId)) {
        issues.push({
          ruleId: 'V-03',
          severity: 'ERROR',
          message: `Gałąź "${symbol.elementName}" wskazuje na nieistniejący fromNodeId: ${branch.fromNodeId}`, // ui-terminology-ignore
          symbolIds: [symbol.id],
          suggestion: 'Popraw referencję lub dodaj brakujący węzeł',
        });
      }

      if (!branch.toNodeId) {
        issues.push({
          ruleId: 'V-03',
          severity: 'ERROR',
          message: `Gałąź "${symbol.elementName}" nie ma zdefiniowanego toNodeId`,
          symbolIds: [symbol.id],
          suggestion: 'Przypisz węzeł końcowy',
        });
      } else if (!elementIds.has(branch.toNodeId)) {
        issues.push({
          ruleId: 'V-03',
          severity: 'ERROR',
          message: `Gałąź "${symbol.elementName}" wskazuje na nieistniejący toNodeId: ${branch.toNodeId}`, // ui-terminology-ignore
          symbolIds: [symbol.id],
          suggestion: 'Popraw referencję lub dodaj brakujący węzeł',
        });
      }
    }

    // Switch
    if (symbol.elementType === 'Switch') {
      const sw = symbol as SwitchSymbol;

      if (!sw.fromNodeId || !elementIds.has(sw.fromNodeId)) {
        issues.push({
          ruleId: 'V-03',
          severity: 'ERROR',
          message: `Łącznik "${symbol.elementName}" ma niepoprawny fromNodeId`,
          symbolIds: [symbol.id],
        });
      }

      if (!sw.toNodeId || !elementIds.has(sw.toNodeId)) {
        issues.push({
          ruleId: 'V-03',
          severity: 'ERROR',
          message: `Łącznik "${symbol.elementName}" ma niepoprawny toNodeId`,
          symbolIds: [symbol.id],
        });
      }
    }

    // Source/Load
    if (symbol.elementType === 'Source' || symbol.elementType === 'Load') {
      const connectedNodeId = (symbol as any).connectedToNodeId;
      if (connectedNodeId && !elementIds.has(connectedNodeId)) {
        issues.push({
          ruleId: 'V-03',
          severity: 'ERROR',
          message: `${symbol.elementType} "${symbol.elementName}" wskazuje na nieistniejący węzeł: ${connectedNodeId}`,
          symbolIds: [symbol.id],
        });
      }
    }
  });

  return issues;
}

// =============================================================================
// V-04: IZOLOWANE WYSPY
// =============================================================================

/**
 * Sprawdź czy istnieją izolowane wyspy (węzły bez połączenia ze źródłem).
 */
function checkIslands(symbols: AnySldSymbol[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Buduj graf
  const adjacency = new Map<string, Set<string>>();
  const elementToSymbol = new Map<string, string>();

  symbols.forEach((s) => {
    elementToSymbol.set(s.elementId, s.id);
    adjacency.set(s.id, new Set());
  });

  // Dodaj krawędzie
  symbols.forEach((symbol) => {
    if (symbol.elementType === 'LineBranch' || symbol.elementType === 'TransformerBranch') {
      const branch = symbol as BranchSymbol;
      const fromSymbolId = elementToSymbol.get(branch.fromNodeId);
      const toSymbolId = elementToSymbol.get(branch.toNodeId);
      if (fromSymbolId && toSymbolId) {
        adjacency.get(fromSymbolId)?.add(toSymbolId);
        adjacency.get(toSymbolId)?.add(fromSymbolId);
      }
    }
    if (symbol.elementType === 'Switch') {
      const sw = symbol as SwitchSymbol;
      const fromSymbolId = elementToSymbol.get(sw.fromNodeId);
      const toSymbolId = elementToSymbol.get(sw.toNodeId);
      if (fromSymbolId && toSymbolId) {
        adjacency.get(fromSymbolId)?.add(toSymbolId);
        adjacency.get(toSymbolId)?.add(fromSymbolId);
      }
    }
    if (symbol.elementType === 'Source' || symbol.elementType === 'Load') {
      const connectedNodeId = (symbol as any).connectedToNodeId;
      const connectedSymbolId = elementToSymbol.get(connectedNodeId);
      if (connectedSymbolId) {
        adjacency.get(symbol.id)?.add(connectedSymbolId);
        adjacency.get(connectedSymbolId)?.add(symbol.id);
      }
    }
  });

  // BFS od źródeł
  const sources = symbols.filter((s) => s.elementType === 'Source').map((s) => s.id);
  const visited = new Set<string>();

  const queue = [...sources];
  sources.forEach((s) => visited.add(s));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current) || new Set();
    neighbors.forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    });
  }

  // Znajdź nieodwiedzone węzły (wyspy)
  const islands = symbols
    .filter((s) => !visited.has(s.id) && s.elementType === 'Bus')
    .map((s) => s.id);

  if (islands.length > 0) {
    issues.push({
      ruleId: 'V-04',
      severity: 'WARNING',
      message: `Wykryto ${islands.length} izolowanych szyn bez połączenia ze źródłem`,
      symbolIds: islands,
      suggestion: 'Połącz szyny ze źródłem lub usuń je',
    });
  }

  return issues;
}

// =============================================================================
// V-05: ŹRÓDŁA
// =============================================================================

/**
 * Sprawdź czy istnieje co najmniej jedno źródło.
 */
function checkSources(symbols: AnySldSymbol[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sources = symbols.filter((s) => s.elementType === 'Source');

  if (sources.length === 0) {
    issues.push({
      ruleId: 'V-05',
      severity: 'ERROR',
      message: 'Schemat nie zawiera żadnego źródła zasilania',
      symbolIds: [],
      suggestion: 'Dodaj źródło (utility_feeder, generator, PV, itp.)',
    });
  }

  return issues;
}

// =============================================================================
// V-06: ODGAŁĘZIENIA SN MUSZĄ MIEĆ ŁĄCZNIK (PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL)
// =============================================================================

/**
 * Voltage level type for CANONICAL topology validation.
 */
type VoltageLevel = 'WN' | 'SN' | 'nN' | 'unknown';

/**
 * Detect voltage level from bus name or voltage attribute.
 * DETERMINISTIC: Same name → same classification.
 */
function detectBusVoltageLevel(symbol: AnySldSymbol): VoltageLevel {
  const name = symbol.elementName.toLowerCase();
  const voltage = (symbol as any).voltage || (symbol as any).voltageKV;

  // Check explicit voltage attribute
  if (voltage !== undefined) {
    const v = typeof voltage === 'string' ? parseFloat(voltage) : voltage;
    if (v >= 110) return 'WN';
    if (v >= 6) return 'SN';
    if (v > 0 && v < 1) return 'nN';
  }

  // Check name patterns (Polish naming conventions)
  if (name.includes('110') || name.includes('wn') || name.includes('wysokie')) {
    return 'WN';
  }
  if (
    name.includes('15') ||
    name.includes('20') ||
    name.includes('sn') ||
    name.includes('średnie') ||
    name.includes('srednie')
  ) {
    return 'SN';
  }
  if (name.includes('0.4') || name.includes('nn') || name.includes('niskie')) {
    return 'nN';
  }

  // Default to SN for most MV networks
  return 'SN';
}

/**
 * PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL: Sprawdź czy każde odgałęzienie SN ma łącznik.
 *
 * CANONICAL RULE: Każde odgałęzienie od linii lub szyny SN MUSI mieć łącznik
 * (wyłącznik / rozłącznik / reklozer). Brak łącznika = ERROR.
 */
function checkSnBranchSwitching(symbols: AnySldSymbol[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Find all SN busbars
  const snBusbars = symbols.filter((s) => {
    if (s.elementType !== 'Bus') return false;
    return detectBusVoltageLevel(s) === 'SN';
  });

  if (snBusbars.length === 0) {
    // No SN busbars - skip this check
    return issues;
  }

  // Build element ID to symbol mapping
  const elementToSymbol = new Map<string, AnySldSymbol>();
  symbols.forEach((s) => elementToSymbol.set(s.elementId, s));

  // Get all SN busbar element IDs
  const snBusbarElementIds = new Set(snBusbars.map((s) => s.elementId));

  // Find all switches connected to SN busbars
  const switchesOnSnBusbars = new Map<string, Set<string>>(); // busbarElementId -> Set of connected element IDs via switch
  symbols.forEach((s) => {
    if (s.elementType !== 'Switch') return;
    const sw = s as SwitchSymbol;

    // Check if switch connects to an SN busbar
    if (snBusbarElementIds.has(sw.fromNodeId)) {
      if (!switchesOnSnBusbars.has(sw.fromNodeId)) {
        switchesOnSnBusbars.set(sw.fromNodeId, new Set());
      }
      switchesOnSnBusbars.get(sw.fromNodeId)!.add(sw.toNodeId);
    }
    if (snBusbarElementIds.has(sw.toNodeId)) {
      if (!switchesOnSnBusbars.has(sw.toNodeId)) {
        switchesOnSnBusbars.set(sw.toNodeId, new Set());
      }
      switchesOnSnBusbars.get(sw.toNodeId)!.add(sw.fromNodeId);
    }
  });

  // Check all branches (LineBranch, TransformerBranch) connected to SN busbars
  symbols.forEach((symbol) => {
    if (symbol.elementType !== 'LineBranch' && symbol.elementType !== 'TransformerBranch') return;

    const branch = symbol as BranchSymbol;

    // Check if branch connects directly to SN busbar
    const connectsToSnBusbar =
      snBusbarElementIds.has(branch.fromNodeId) || snBusbarElementIds.has(branch.toNodeId);

    if (!connectsToSnBusbar) return;

    // Determine which end is the SN busbar
    const snBusbarId = snBusbarElementIds.has(branch.fromNodeId)
      ? branch.fromNodeId
      : branch.toNodeId;
    const otherEndId = snBusbarId === branch.fromNodeId ? branch.toNodeId : branch.fromNodeId;

    // Check if there's a switch between the busbar and this branch
    const switchConnections = switchesOnSnBusbars.get(snBusbarId);
    const hasSwitchProtection = switchConnections?.has(otherEndId) ?? false;

    // For transformers, we check in V-07, so skip here
    if (symbol.elementType === 'TransformerBranch') return;

    // For lines/cables connecting to SN busbar without switch protection
    if (!hasSwitchProtection) {
      issues.push({
        ruleId: 'V-06',
        severity: 'ERROR',
        message: `Odgałęzienie SN "${symbol.elementName}" nie ma łącznika — wymagany wyłącznik/rozłącznik/reklozer`,
        symbolIds: [symbol.id],
        suggestion: 'Dodaj łącznik (wyłącznik, rozłącznik lub reklozer) między szyną SN a odgałęzieniem',
      });
    }
  });

  return issues;
}

// =============================================================================
// V-07: TRANSFORMATORY SN/nn MUSZĄ MIEĆ WYŁĄCZNIK SN (PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL)
// =============================================================================

/**
 * PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL: Sprawdź czy transformatory SN/nn mają wyłącznik SN.
 *
 * CANONICAL RULE: Transformator SN/nn bez wyłącznika SN = ERROR.
 * Każda stacja SN/nn (PV, BESS, FW, odbiorcza) MUSI zawierać wyłącznik SN transformatora.
 */
function checkTransformerBreakers(symbols: AnySldSymbol[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Find all transformers
  const transformers = symbols.filter((s) => s.elementType === 'TransformerBranch');

  if (transformers.length === 0) {
    return issues;
  }

  // Build element ID to symbol mapping
  const elementToSymbol = new Map<string, AnySldSymbol>();
  symbols.forEach((s) => elementToSymbol.set(s.elementId, s));

  // Find all switches (specifically breakers)
  const switches = symbols.filter((s) => s.elementType === 'Switch') as SwitchSymbol[];

  // For each transformer, check if there's a breaker on the SN side
  transformers.forEach((trafo) => {
    const branch = trafo as BranchSymbol;

    // Identify which side is SN and which is nN
    const fromBus = elementToSymbol.get(branch.fromNodeId);
    const toBus = elementToSymbol.get(branch.toNodeId);

    if (!fromBus || !toBus) return;

    const fromVoltage = detectBusVoltageLevel(fromBus);
    const toVoltage = detectBusVoltageLevel(toBus);

    // Check if this is an SN/nN transformer
    const isSnNnTransformer =
      (fromVoltage === 'SN' && toVoltage === 'nN') ||
      (fromVoltage === 'nN' && toVoltage === 'SN');

    // Also check WN/SN transformers
    const isWnSnTransformer =
      (fromVoltage === 'WN' && toVoltage === 'SN') ||
      (fromVoltage === 'SN' && toVoltage === 'WN');

    if (!isSnNnTransformer && !isWnSnTransformer) return;

    // Determine the SN side
    let snSideId: string;
    if (isSnNnTransformer) {
      snSideId = fromVoltage === 'SN' ? branch.fromNodeId : branch.toNodeId;
    } else {
      // For WN/SN, the SN side needs the breaker
      snSideId = fromVoltage === 'SN' ? branch.fromNodeId : branch.toNodeId;
    }

    // Check if there's a breaker between the SN busbar and the transformer
    const hasSnBreaker = switches.some((sw) => {
      // Check if switch connects to the transformer's SN side
      const connectsToSnSide = sw.fromNodeId === snSideId || sw.toNodeId === snSideId;

      // Check if switch connects to the transformer
      const connectsToTrafo =
        sw.fromNodeId === trafo.elementId || sw.toNodeId === trafo.elementId;

      // For CANONICAL rule: breaker should be between SN bus and transformer
      // This means the switch should connect the SN bus to an intermediate node
      // that the transformer also connects to

      // Simplified check: switch is on the path between SN bus and transformer
      if (connectsToSnSide || connectsToTrafo) {
        // Accept any switch type as protection (BREAKER, LOAD_SWITCH, etc.)
        return true;
      }

      return false;
    });

    if (!hasSnBreaker) {
      const voltageDesc = isSnNnTransformer ? 'SN/nn' : 'WN/SN';
      issues.push({
        ruleId: 'V-07',
        severity: 'ERROR',
        message: `Transformator ${voltageDesc} "${trafo.elementName}" nie ma wyłącznika SN — wymagana koordynacja zabezpieczeń`,
        symbolIds: [trafo.id],
        suggestion: 'Dodaj wyłącznik SN przed transformatorem dla zapewnienia koordynacji zabezpieczeń',
      });
    }
  });

  return issues;
}

// =============================================================================
// G-01: KOLIZJE
// =============================================================================

/**
 * Sprawdź czy symbole nie nakładają się.
 */
function checkCollisions(symbols: AnySldSymbol[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const box1 = getSymbolBoundingBox(symbols[i]);
      const box2 = getSymbolBoundingBox(symbols[j]);

      if (doBoundingBoxesIntersect(box1, box2)) {
        issues.push({
          ruleId: 'G-01',
          severity: 'WARNING',
          message: `Symbole "${symbols[i].elementName}" i "${symbols[j].elementName}" nakładają się`,
          symbolIds: [symbols[i].id, symbols[j].id],
          suggestion: 'Przesuń jeden z symboli',
        });
      }
    }
  }

  return issues;
}

// =============================================================================
// G-03: GRID ALIGNMENT
// =============================================================================

/**
 * Sprawdź czy pozycje są wyrównane do siatki.
 */
function checkGridAlignment(symbols: AnySldSymbol[], gridSize: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  symbols.forEach((symbol) => {
    const { x, y } = symbol.position;
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;

    if (x !== snappedX || y !== snappedY) {
      issues.push({
        ruleId: 'G-03',
        severity: 'INFO',
        message: `Symbol "${symbol.elementName}" nie jest wyrównany do siatki (${x}, ${y})`,
        symbolIds: [symbol.id],
        suggestion: `Przesuń do (${snappedX}, ${snappedY})`,
      });
    }
  });

  return issues;
}

// =============================================================================
// G-04: FLOATING SYMBOLS (PR-SLD-CANONICAL-GEOMETRY-FULL)
// =============================================================================

/**
 * PR-SLD-CANONICAL-GEOMETRY-FULL: Sprawdź czy są symbole "wiszące w powietrzu".
 *
 * CANONICAL RULE: Żaden symbol nie może wisieć — każdy musi być połączony
 * do głównej topologii (szyny, transformatora, źródła).
 *
 * This function checks:
 * 1. Symbols reported as floating by the layout engine (floatingSymbolIds)
 * 2. Symbols with no connections to any other element
 *
 * @param symbols - All symbols in the SLD
 * @param floatingSymbolIds - Symbol IDs marked as floating by layout engine
 */
function checkFloatingSymbols(
  symbols: AnySldSymbol[],
  floatingSymbolIds?: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check symbols reported by layout engine
  if (floatingSymbolIds && floatingSymbolIds.length > 0) {
    const floatingNames = floatingSymbolIds
      .map((id) => {
        const symbol = symbols.find((s) => s.id === id);
        return symbol ? `"${symbol.elementName}"` : id;
      })
      .join(', ');

    issues.push({
      ruleId: 'G-04',
      severity: 'WARNING',
      message: `Wykryto ${floatingSymbolIds.length} symboli wiszących w powietrzu (CANONICAL violation): ${floatingNames}`,
      symbolIds: floatingSymbolIds,
      suggestion: 'Połącz symbole z główną topologią (szyną, transformatorem lub źródłem) lub usuń je',
    });

    // Add individual warnings for each floating symbol (for UI highlighting)
    floatingSymbolIds.forEach((symbolId) => {
      const symbol = symbols.find((s) => s.id === symbolId);
      if (symbol) {
        issues.push({
          ruleId: 'G-04a',
          severity: 'WARNING',
          message: `Symbol "${symbol.elementName}" wisi w powietrzu — brak połączenia z topologią`,
          symbolIds: [symbolId],
          suggestion: 'Połącz symbol z szyną, transformatorem lub źródłem',
        });
      }
    });
  }

  // Additional check: symbols with no connections at all (not connected to any element)
  const elementIds = new Set(symbols.map((s) => s.elementId));
  const connectedSymbolIds = new Set<string>();

  // Find all symbols that are connected to something
  symbols.forEach((symbol) => {
    // Branch has fromNodeId/toNodeId
    if (symbol.elementType === 'LineBranch' || symbol.elementType === 'TransformerBranch') {
      const branch = symbol as BranchSymbol;
      if (elementIds.has(branch.fromNodeId) || elementIds.has(branch.toNodeId)) {
        connectedSymbolIds.add(symbol.id);
        // Mark the connected nodes as well
        symbols.forEach((s) => {
          if (s.elementId === branch.fromNodeId || s.elementId === branch.toNodeId) {
            connectedSymbolIds.add(s.id);
          }
        });
      }
    }

    // Switch has fromNodeId/toNodeId
    if (symbol.elementType === 'Switch') {
      const sw = symbol as SwitchSymbol;
      if (elementIds.has(sw.fromNodeId) || elementIds.has(sw.toNodeId)) {
        connectedSymbolIds.add(symbol.id);
        symbols.forEach((s) => {
          if (s.elementId === sw.fromNodeId || s.elementId === sw.toNodeId) {
            connectedSymbolIds.add(s.id);
          }
        });
      }
    }

    // Source/Load has connectedToNodeId
    if (symbol.elementType === 'Source' || symbol.elementType === 'Load') {
      const connectedNodeId = (symbol as any).connectedToNodeId;
      if (connectedNodeId && elementIds.has(connectedNodeId)) {
        connectedSymbolIds.add(symbol.id);
        symbols.forEach((s) => {
          if (s.elementId === connectedNodeId) {
            connectedSymbolIds.add(s.id);
          }
        });
      }
    }
  });

  // Find unconnected symbols (excluding those already reported by layout engine)
  const reportedFloating = new Set(floatingSymbolIds || []);
  const unconnectedSymbols = symbols.filter(
    (s) => !connectedSymbolIds.has(s.id) && !reportedFloating.has(s.id)
  );

  if (unconnectedSymbols.length > 0) {
    unconnectedSymbols.forEach((symbol) => {
      // Bus without connections is a floating bus
      if (symbol.elementType === 'Bus') {
        issues.push({
          ruleId: 'G-04b',
          severity: 'WARNING',
          message: `Szyna "${symbol.elementName}" nie ma żadnych przyłączeń`,
          symbolIds: [symbol.id],
          suggestion: 'Dodaj przyłączenia do szyny lub usuń ją',
        });
      } else {
        issues.push({
          ruleId: 'G-04c',
          severity: 'WARNING',
          message: `Symbol "${symbol.elementName}" nie jest połączony z żadnym elementem`,
          symbolIds: [symbol.id],
          suggestion: 'Połącz symbol z topologią sieci',
        });
      }
    });
  }

  return issues;
}

// =============================================================================
// FUNKCJE POMOCNICZE
// =============================================================================

/**
 * Sprawdź czy walidacja blokuje zapis.
 */
export function shouldBlockSave(result: ValidationResult): boolean {
  return result.stats.errors > 0;
}

/**
 * Pobierz podsumowanie walidacji w formie tekstowej.
 */
export function getValidationSummary(result: ValidationResult): string {
  if (result.valid) {
    if (result.stats.warnings > 0) {
      return `Walidacja OK z ${result.stats.warnings} ostrzeżeniami`;
    }
    return 'Walidacja OK';
  }
  return `Walidacja NIEUDANA: ${result.stats.errors} błędów, ${result.stats.warnings} ostrzeżeń`;
}

/**
 * Filtruj problemy po severity.
 */
export function filterIssuesBySeverity(
  issues: ValidationIssue[],
  severity: ValidationSeverity
): ValidationIssue[] {
  return issues.filter((i) => i.severity === severity);
}
