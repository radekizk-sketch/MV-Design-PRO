/**
 * useSldInspectorSelection — Hook do zarządzania selekcją inspektora SLD
 *
 * PR-SLD-07: Inspektor elementu / połączenia (panel boczny, read-only)
 * PR-SLD-09: Sekcja "Zabezpieczenia" w trybie ZABEZPIECZENIA
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § G.1: Synchronizacja selection SLD ↔ Tree ↔ Inspector
 * - ui_canonical_parity.md: Inspector jako property grid (read-only)
 *
 * FEATURES:
 * - Subskrypcja na globalny Selection Store
 * - Subskrypcja na SldEditorStore (symbole)
 * - Obsługa selekcji elementów i połączeń
 * - Dane tylko do odczytu (brak mutacji)
 * - PR-SLD-09: Sekcja "Zabezpieczenia" gdy tryb ZABEZPIECZENIA
 *
 * 100% POLISH UI
 */

import { useMemo, useCallback } from 'react';
import { useSelectionStore } from '../../selection/store';
import { useSldEditorStore } from '../../sld-editor/SldEditorStore';
import { useSldModeStore, type SldMode } from '../sldModeStore';
import { useResultsInspectorStore } from '../../results-inspector/store';
import { resolveElementResults } from './elementResultsResolver';
import {
  selectProtectionSummaryByElementId,
  type ProtectionSummary,
  OC_CHARACTERISTIC_LABELS_PL,
  VERIFICATION_STATUS_LABELS_PL,
} from '../protection';
import { useSldProjectModeStore } from '../sldProjectModeStore';
import { buildGeometrySection } from './geometrySection';
import type {
  InspectorSelection,
  InspectorElementSelection,
  InspectorPropertySection,
  InspectorPropertyField,
  InspectorResultData,
  InspectorDiagnosticData,
} from './types';
import {
  ELEMENT_TYPE_LABELS_PL,
  SWITCH_TYPE_LABELS_PL,
  SWITCH_STATE_LABELS_PL,
  CONNECTION_TYPE_LABELS_PL,
  INSPECTOR_SECTION_LABELS_PL,
  PORT_LABELS_PL,
} from './types';
import type {
  AnySldSymbol,
  Connection,
  NodeSymbol,
  BranchSymbol,
  SwitchSymbol,
  SourceSymbol,
  LoadSymbol,
} from '../../sld-editor/types';

// =============================================================================
// INTERFEJS HOOKA
// =============================================================================

export interface UseSldInspectorSelectionResult {
  /** Aktualna selekcja inspektora */
  selection: InspectorSelection;

  /** Sekcje właściwości do wyświetlenia */
  sections: InspectorPropertySection[];

  /** Tryb SLD (EDYCJA / WYNIKI / ZABEZPIECZENIA) */
  mode: SldMode;

  /** Czy tryb WYNIKI */
  isResultsMode: boolean;

  /** Czy tryb ZABEZPIECZENIA (PR-SLD-09) */
  isProtectionMode: boolean;

  /** Zamknij inspektor (wyczyść selekcję) */
  closeInspector: () => void;

  /** Dane diagnostyczne (dostępne w trybie WYNIKI) */
  diagnostics: InspectorDiagnosticData | null;

  /** Dane wyników (dostępne w trybie WYNIKI) */
  results: InspectorResultData | null;

  /** Dane zabezpieczeń (dostępne w trybie ZABEZPIECZENIA, PR-SLD-09) */
  protection: ProtectionSummary | null;
}

// =============================================================================
// POMOCNICZE FUNKCJE
// =============================================================================

/**
 * Formatuje wartość liczbową z polskim formatowaniem.
 */
function formatNumber(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formatuje wartość boolean na polski tekst.
 */
function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value ? 'Tak' : 'Nie';
}

// =============================================================================
// BUILDERY SEKCJI
// =============================================================================

/**
 * Buduje sekcje dla elementu typu Bus (Szyna).
 */
function buildBusSections(
  symbol: NodeSymbol,
  results: InspectorResultData | null
): InspectorPropertySection[] {
  const sections: InspectorPropertySection[] = [];

  // Sekcja 1: Informacje podstawowe
  sections.push({
    id: 'basic',
    label: INSPECTOR_SECTION_LABELS_PL.basic,
    fields: [
      { key: 'type', label: 'Typ elementu', value: ELEMENT_TYPE_LABELS_PL.Bus },
      { key: 'elementId', label: 'ID elementu', value: symbol.elementId },
      { key: 'symbolId', label: 'ID symbolu', value: symbol.id },
      { key: 'inService', label: 'Stan', value: symbol.inService ? 'W służbie' : 'Poza służbą' },
      { key: 'energized', label: 'Zasilona', value: formatBoolean(symbol.inService) },
    ],
  });

  // Sekcja 2: Parametry techniczne
  const technicalFields: InspectorPropertyField[] = [
    { key: 'width', label: 'Szerokość', value: formatNumber(symbol.width, 0), unit: 'px' },
    { key: 'height', label: 'Wysokość', value: formatNumber(symbol.height, 0), unit: 'px' },
  ];

  // Dodaj wyniki jeśli dostępne
  if (results) {
    if (results.voltage_kv !== undefined && results.voltage_kv !== null) {
      technicalFields.push({
        key: 'voltage_kv',
        label: 'Napięcie',
        value: formatNumber(results.voltage_kv, 2),
        unit: 'kV',
        source: 'calculated',
        highlight: 'primary',
      });
    }
    if (results.voltage_pu !== undefined && results.voltage_pu !== null) {
      technicalFields.push({
        key: 'voltage_pu',
        label: 'Napięcie (pu)',
        value: formatNumber(results.voltage_pu, 4),
        unit: 'pu',
        source: 'calculated',
      });
    }
  }

  sections.push({
    id: 'technical',
    label: INSPECTOR_SECTION_LABELS_PL.technical,
    fields: technicalFields,
  });

  return sections;
}

/**
 * Buduje sekcje dla elementu typu Branch (Linia/Transformator).
 */
function buildBranchSections(
  symbol: BranchSymbol,
  results: InspectorResultData | null
): InspectorPropertySection[] {
  const sections: InspectorPropertySection[] = [];
  const isTrans = symbol.elementType === 'TransformerBranch';

  // Sekcja 1: Informacje podstawowe
  sections.push({
    id: 'basic',
    label: INSPECTOR_SECTION_LABELS_PL.basic,
    fields: [
      {
        key: 'type',
        label: 'Typ elementu',
        value: isTrans ? ELEMENT_TYPE_LABELS_PL.TransformerBranch : ELEMENT_TYPE_LABELS_PL.LineBranch,
      },
      { key: 'elementId', label: 'ID elementu', value: symbol.elementId },
      { key: 'symbolId', label: 'ID symbolu', value: symbol.id },
      { key: 'inService', label: 'Stan', value: symbol.inService ? 'W służbie' : 'Poza służbą' },
      { key: 'energized', label: 'Zasilona', value: formatBoolean(symbol.inService) },
    ],
  });

  // Sekcja 2: Parametry techniczne
  const technicalFields: InspectorPropertyField[] = [
    { key: 'fromNodeId', label: 'Od węzła', value: symbol.fromNodeId || '—' },
    { key: 'toNodeId', label: 'Do węzła', value: symbol.toNodeId || '—' },
  ];

  if (!isTrans && symbol.branchType) {
    technicalFields.push({
      key: 'branchType',
      label: 'Typ linii',
      value: symbol.branchType === 'LINE' ? 'Napowietrzna' : 'Kablowa',
    });
  }

  // Dodaj wyniki jeśli dostępne
  if (results) {
    if (results.current_a !== undefined && results.current_a !== null) {
      technicalFields.push({
        key: 'current_a',
        label: 'Prąd',
        value: formatNumber(results.current_a, 1),
        unit: 'A',
        source: 'calculated',
        highlight: 'primary',
      });
    }
    if (results.loading_pct !== undefined && results.loading_pct !== null) {
      const loadingHighlight: InspectorPropertyField['highlight'] =
        results.loading_pct > 100 ? 'error' : results.loading_pct > 80 ? 'warning' : undefined;
      technicalFields.push({
        key: 'loading_pct',
        label: 'Obciążenie',
        value: formatNumber(results.loading_pct, 1),
        unit: '%',
        source: 'calculated',
        highlight: loadingHighlight,
      });
    }
    if (results.voltage_drop_pct !== undefined && results.voltage_drop_pct !== null) {
      technicalFields.push({
        key: 'voltage_drop_pct',
        label: 'Spadek napięcia',
        value: formatNumber(results.voltage_drop_pct, 2),
        unit: '%',
        source: 'calculated',
      });
    }
    if (results.p_mw !== undefined && results.p_mw !== null) {
      technicalFields.push({
        key: 'p_mw',
        label: 'Moc czynna',
        value: formatNumber(results.p_mw, 3),
        unit: 'MW',
        source: 'calculated',
      });
    }
    if (results.q_mvar !== undefined && results.q_mvar !== null) {
      technicalFields.push({
        key: 'q_mvar',
        label: 'Moc bierna',
        value: formatNumber(results.q_mvar, 3),
        unit: 'Mvar',
        source: 'calculated',
      });
    }
    if (results.s_mva !== undefined && results.s_mva !== null) {
      technicalFields.push({
        key: 's_mva',
        label: 'Moc pozorna',
        value: formatNumber(results.s_mva, 3),
        unit: 'MVA',
        source: 'calculated',
      });
    }
  }

  sections.push({
    id: 'technical',
    label: INSPECTOR_SECTION_LABELS_PL.technical,
    fields: technicalFields,
  });

  return sections;
}

/**
 * Buduje sekcje dla elementu typu Switch (Łącznik).
 */
function buildSwitchSections(
  symbol: SwitchSymbol,
  results: InspectorResultData | null
): InspectorPropertySection[] {
  const sections: InspectorPropertySection[] = [];

  // Sekcja 1: Informacje podstawowe
  sections.push({
    id: 'basic',
    label: INSPECTOR_SECTION_LABELS_PL.basic,
    fields: [
      { key: 'type', label: 'Typ elementu', value: ELEMENT_TYPE_LABELS_PL.Switch },
      { key: 'elementId', label: 'ID elementu', value: symbol.elementId },
      { key: 'symbolId', label: 'ID symbolu', value: symbol.id },
      { key: 'inService', label: 'Stan', value: symbol.inService ? 'W służbie' : 'Poza służbą' },
      { key: 'energized', label: 'Zasilona', value: formatBoolean(symbol.inService) },
    ],
  });

  // Sekcja 2: Parametry techniczne
  const technicalFields: InspectorPropertyField[] = [
    { key: 'switchType', label: 'Typ łącznika', value: SWITCH_TYPE_LABELS_PL[symbol.switchType] || symbol.switchType },
    { key: 'switchState', label: 'Stan łącznika', value: SWITCH_STATE_LABELS_PL[symbol.switchState] || symbol.switchState },
    { key: 'fromNodeId', label: 'Od węzła', value: symbol.fromNodeId || '—' },
    { key: 'toNodeId', label: 'Do węzła', value: symbol.toNodeId || '—' },
  ];

  // Dodaj wyniki jeśli dostępne
  if (results && results.current_a !== undefined && results.current_a !== null) {
    technicalFields.push({
      key: 'current_a',
      label: 'Prąd',
      value: formatNumber(results.current_a, 1),
      unit: 'A',
      source: 'calculated',
    });
  }

  sections.push({
    id: 'technical',
    label: INSPECTOR_SECTION_LABELS_PL.technical,
    fields: technicalFields,
  });

  return sections;
}

/**
 * Buduje sekcje dla elementu typu Source (Źródło).
 */
function buildSourceSections(
  symbol: SourceSymbol,
  results: InspectorResultData | null
): InspectorPropertySection[] {
  const sections: InspectorPropertySection[] = [];

  // Sekcja 1: Informacje podstawowe
  sections.push({
    id: 'basic',
    label: INSPECTOR_SECTION_LABELS_PL.basic,
    fields: [
      { key: 'type', label: 'Typ elementu', value: ELEMENT_TYPE_LABELS_PL.Source },
      { key: 'elementId', label: 'ID elementu', value: symbol.elementId },
      { key: 'symbolId', label: 'ID symbolu', value: symbol.id },
      { key: 'inService', label: 'Stan', value: symbol.inService ? 'W służbie' : 'Poza służbą' },
      { key: 'energized', label: 'Zasilone', value: formatBoolean(symbol.inService) },
    ],
  });

  // Sekcja 2: Parametry techniczne
  const technicalFields: InspectorPropertyField[] = [
    { key: 'connectedToNodeId', label: 'Podłączony do', value: symbol.connectedToNodeId || '—' },
  ];

  // Dodaj wyniki jeśli dostępne
  if (results) {
    if (results.p_mw !== undefined && results.p_mw !== null) {
      technicalFields.push({
        key: 'p_mw',
        label: 'Moc czynna',
        value: formatNumber(results.p_mw, 3),
        unit: 'MW',
        source: 'calculated',
        highlight: 'primary',
      });
    }
    if (results.q_mvar !== undefined && results.q_mvar !== null) {
      technicalFields.push({
        key: 'q_mvar',
        label: 'Moc bierna',
        value: formatNumber(results.q_mvar, 3),
        unit: 'Mvar',
        source: 'calculated',
      });
    }
    if (results.s_mva !== undefined && results.s_mva !== null) {
      technicalFields.push({
        key: 's_mva',
        label: 'Moc pozorna',
        value: formatNumber(results.s_mva, 3),
        unit: 'MVA',
        source: 'calculated',
      });
    }
  }

  sections.push({
    id: 'technical',
    label: INSPECTOR_SECTION_LABELS_PL.technical,
    fields: technicalFields,
  });

  return sections;
}

/**
 * Buduje sekcje dla elementu typu Load (Odbiornik).
 */
function buildLoadSections(
  symbol: LoadSymbol,
  results: InspectorResultData | null
): InspectorPropertySection[] {
  const sections: InspectorPropertySection[] = [];

  // Sekcja 1: Informacje podstawowe
  sections.push({
    id: 'basic',
    label: INSPECTOR_SECTION_LABELS_PL.basic,
    fields: [
      { key: 'type', label: 'Typ elementu', value: ELEMENT_TYPE_LABELS_PL.Load },
      { key: 'elementId', label: 'ID elementu', value: symbol.elementId },
      { key: 'symbolId', label: 'ID symbolu', value: symbol.id },
      { key: 'inService', label: 'Stan', value: symbol.inService ? 'W służbie' : 'Poza służbą' },
      { key: 'energized', label: 'Zasilony', value: formatBoolean(symbol.inService) },
    ],
  });

  // Sekcja 2: Parametry techniczne
  const technicalFields: InspectorPropertyField[] = [
    { key: 'connectedToNodeId', label: 'Podłączony do', value: symbol.connectedToNodeId || '—' },
  ];

  // Dodaj wyniki jeśli dostępne
  if (results) {
    if (results.p_mw !== undefined && results.p_mw !== null) {
      technicalFields.push({
        key: 'p_mw',
        label: 'Moc czynna',
        value: formatNumber(results.p_mw, 3),
        unit: 'MW',
        source: 'calculated',
        highlight: 'primary',
      });
    }
    if (results.q_mvar !== undefined && results.q_mvar !== null) {
      technicalFields.push({
        key: 'q_mvar',
        label: 'Moc bierna',
        value: formatNumber(results.q_mvar, 3),
        unit: 'Mvar',
        source: 'calculated',
      });
    }
    if (results.s_mva !== undefined && results.s_mva !== null) {
      technicalFields.push({
        key: 's_mva',
        label: 'Moc pozorna',
        value: formatNumber(results.s_mva, 3),
        unit: 'MVA',
        source: 'calculated',
      });
    }
  }

  sections.push({
    id: 'technical',
    label: INSPECTOR_SECTION_LABELS_PL.technical,
    fields: technicalFields,
  });

  return sections;
}

/**
 * Buduje sekcje dla połączenia.
 */
function buildConnectionSections(
  connection: Connection,
  fromSymbol: AnySldSymbol | null,
  toSymbol: AnySldSymbol | null,
  results: InspectorResultData | null
): InspectorPropertySection[] {
  const sections: InspectorPropertySection[] = [];

  // Sekcja: Dane połączenia
  const connectionFields: InspectorPropertyField[] = [
    {
      key: 'connectionType',
      label: 'Typ połączenia',
      value: connection.connectionType
        ? CONNECTION_TYPE_LABELS_PL[connection.connectionType] || connection.connectionType
        : 'Nieokreślony',
    },
    { key: 'connectionId', label: 'ID połączenia', value: connection.id },
    { key: 'fromSymbolId', label: 'Od symbolu', value: fromSymbol?.elementName || connection.fromSymbolId },
    { key: 'fromPort', label: 'Port źródłowy', value: PORT_LABELS_PL[connection.fromPortName] },
    { key: 'toSymbolId', label: 'Do symbolu', value: toSymbol?.elementName || connection.toSymbolId },
    { key: 'toPort', label: 'Port docelowy', value: PORT_LABELS_PL[connection.toPortName] },
  ];

  // Długość połączenia (obliczona z ścieżki)
  if (connection.path && connection.path.length >= 2) {
    let totalLength = 0;
    for (let i = 1; i < connection.path.length; i++) {
      const dx = connection.path[i].x - connection.path[i - 1].x;
      const dy = connection.path[i].y - connection.path[i - 1].y;
      totalLength += Math.sqrt(dx * dx + dy * dy);
    }
    connectionFields.push({
      key: 'length',
      label: 'Długość ścieżki',
      value: formatNumber(totalLength, 0),
      unit: 'px',
    });
  }

  // Dodaj wyniki jeśli dostępne
  if (results) {
    if (results.current_a !== undefined && results.current_a !== null) {
      connectionFields.push({
        key: 'current_a',
        label: 'Prąd w połączeniu',
        value: formatNumber(results.current_a, 1),
        unit: 'A',
        source: 'calculated',
        highlight: 'primary',
      });
    }
    if (results.loading_pct !== undefined && results.loading_pct !== null) {
      const loadingHighlight: InspectorPropertyField['highlight'] =
        results.loading_pct > 100 ? 'error' : results.loading_pct > 80 ? 'warning' : undefined;
      connectionFields.push({
        key: 'loading_pct',
        label: 'Obciążenie',
        value: formatNumber(results.loading_pct, 1),
        unit: '%',
        source: 'calculated',
        highlight: loadingHighlight,
      });
    }
  }

  sections.push({
    id: 'connection',
    label: INSPECTOR_SECTION_LABELS_PL.connection,
    fields: connectionFields,
  });

  return sections;
}

/**
 * Buduje sekcje dla elementu na podstawie jego typu.
 */
function buildElementSections(
  symbol: AnySldSymbol,
  results: InspectorResultData | null
): InspectorPropertySection[] {
  switch (symbol.elementType) {
    case 'Bus':
      return buildBusSections(symbol as NodeSymbol, results);
    case 'LineBranch':
    case 'TransformerBranch':
      return buildBranchSections(symbol as BranchSymbol, results);
    case 'Switch':
      return buildSwitchSections(symbol as SwitchSymbol, results);
    case 'Source':
      return buildSourceSections(symbol as SourceSymbol, results);
    case 'Load':
      return buildLoadSections(symbol as LoadSymbol, results);
    default:
      return [];
  }
}

// =============================================================================
// SEKCJE ZABEZPIECZEŃ (PR-SLD-09)
// =============================================================================

/**
 * Buduje sekcje zabezpieczeń dla elementu.
 * PR-SLD-09: Wyswietlane gdy tryb ZABEZPIECZENIA i dane istnieja.
 */
function buildProtectionSections(
  protection: ProtectionSummary
): InspectorPropertySection[] {
  const sections: InspectorPropertySection[] = [];

  // Sekcja: Zabezpieczenie nadpradowe I> (51)
  if (protection.overcurrent?.time_overcurrent) {
    const oc = protection.overcurrent.time_overcurrent;
    const fields: InspectorPropertyField[] = [
      {
        key: 'pickup_a',
        label: 'Prog pradowy',
        value: oc.pickup_a !== null ? formatNumber(oc.pickup_a, 0) : '—',
        unit: 'A',
        source: 'instance',
      },
      {
        key: 'trip_time_s',
        label: 'Czas wyzwolenia',
        value: oc.trip_time_s !== null ? formatNumber(oc.trip_time_s, 2) : '—',
        unit: 's',
        source: 'instance',
      },
      {
        key: 'characteristic',
        label: 'Charakterystyka',
        value: OC_CHARACTERISTIC_LABELS_PL[oc.characteristic],
        source: 'instance',
      },
    ];
    if (oc.tms !== null && oc.tms !== undefined) {
      fields.push({
        key: 'tms',
        label: 'Mnoznik TMS',
        value: formatNumber(oc.tms, 2),
        source: 'instance',
      });
    }
    sections.push({
      id: 'protection_oc_time',
      label: INSPECTOR_SECTION_LABELS_PL.protection_oc_time,
      fields,
    });
  }

  // Sekcja: Zabezpieczenie nadpradowe I>> (50)
  if (protection.overcurrent?.instant_overcurrent) {
    const oc = protection.overcurrent.instant_overcurrent;
    const fields: InspectorPropertyField[] = [
      {
        key: 'pickup_a',
        label: 'Prog pradowy',
        value: oc.pickup_a !== null ? formatNumber(oc.pickup_a, 0) : '—',
        unit: 'A',
        source: 'instance',
      },
      {
        key: 'trip_time_s',
        label: 'Czas wyzwolenia',
        value: oc.instantaneous ? 'Bezzwlocznie' : (oc.trip_time_s !== null ? formatNumber(oc.trip_time_s, 2) + ' s' : '—'),
        source: 'instance',
      },
      {
        key: 'instantaneous',
        label: 'Tryb bezzwloczny',
        value: oc.instantaneous ? 'Tak' : 'Nie',
        source: 'instance',
      },
    ];
    sections.push({
      id: 'protection_oc_instant',
      label: INSPECTOR_SECTION_LABELS_PL.protection_oc_instant,
      fields,
    });
  }

  // Sekcja: Przekladnik
  if (protection.ct) {
    sections.push({
      id: 'protection_ct',
      label: INSPECTOR_SECTION_LABELS_PL.protection_ct,
      fields: [
        {
          key: 'ct_ratio',
          label: 'Przekladnia',
          value: protection.ct.label,
          source: 'instance',
        },
        {
          key: 'ct_primary',
          label: 'Strona pierwotna',
          value: formatNumber(protection.ct.primary_a, 0),
          unit: 'A',
          source: 'instance',
        },
        {
          key: 'ct_secondary',
          label: 'Strona wtorna',
          value: formatNumber(protection.ct.secondary_a, 0),
          unit: 'A',
          source: 'instance',
        },
      ],
    });
  }

  // Sekcja: Weryfikacja kryterium
  const verificationFields: InspectorPropertyField[] = [
    {
      key: 'verification_status',
      label: 'Status',
      value: VERIFICATION_STATUS_LABELS_PL[protection.verification_status],
      highlight:
        protection.verification_status === 'NIESPELNIONE'
          ? 'warning'
          : protection.verification_status === 'SPELNIONE'
          ? 'primary'
          : undefined,
      source: 'analysis',
    },
  ];
  if (protection.verification_reason) {
    verificationFields.push({
      key: 'verification_reason',
      label: 'Powod',
      value: protection.verification_reason,
      source: 'analysis',
    });
  }
  if (protection.margin_pct !== null && protection.margin_pct !== undefined) {
    verificationFields.push({
      key: 'margin_pct',
      label: 'Margines',
      value: `${protection.margin_pct > 0 ? '+' : ''}${formatNumber(protection.margin_pct, 0)}`,
      unit: '%',
      source: 'analysis',
      highlight: protection.margin_pct < 0 ? 'warning' : undefined,
    });
  }
  sections.push({
    id: 'protection_verification',
    label: INSPECTOR_SECTION_LABELS_PL.protection_verification,
    fields: verificationFields,
  });

  return sections;
}

// =============================================================================
// GŁÓWNY HOOK
// =============================================================================

/**
 * Hook do zarządzania selekcją inspektora SLD.
 *
 * Subskrybuje:
 * - Selection Store (globalny stan selekcji)
 * - SldEditorStore (symbole SLD)
 * - SldModeStore (tryb SLD: EDYCJA/WYNIKI)
 *
 * Zwraca:
 * - Aktualną selekcję (element/połączenie/brak)
 * - Sekcje właściwości do wyświetlenia
 * - Tryb SLD
 * - Funkcję do zamykania inspektora
 *
 * INVARIANT: Hook NIE mutuje żadnych danych - tylko odczyt.
 */
export function useSldInspectorSelection(): UseSldInspectorSelectionResult {
  // Subskrypcja na globalny Selection Store
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  // Subskrypcja na SldEditorStore (symbole)
  const symbols = useSldEditorStore((state) => state.symbols);

  // Subskrypcja na SldModeStore (tryb SLD)
  const mode = useSldModeStore((state) => state.mode);
  const isResultsMode = mode === 'WYNIKI';
  const isProtectionMode = mode === 'ZABEZPIECZENIA';

  // Oblicz selekcję inspektora
  const selection = useMemo<InspectorSelection>(() => {
    if (!selectedElement) {
      return { type: 'none' };
    }

    // Znajdź symbol po elementId
    const symbol = Array.from(symbols.values()).find(
      (s) => s.elementId === selectedElement.id || s.id === selectedElement.id
    );

    if (symbol) {
      return {
        type: 'element',
        elementId: symbol.elementId,
        symbolId: symbol.id,
        elementType: symbol.elementType,
        elementName: symbol.elementName,
        symbol,
      } as InspectorElementSelection;
    }

    return { type: 'none' };
  }, [selectedElement, symbols]);

  // Resolve results from ResultsInspectorStore by elementId
  const busResults = useResultsInspectorStore((s) => s.busResults);
  const branchResults = useResultsInspectorStore((s) => s.branchResults);
  const shortCircuitResults = useResultsInspectorStore((s) => s.shortCircuitResults);

  const results = useMemo<InspectorResultData | null>(() => {
    if (!isResultsMode || selection.type !== 'element') {
      return null;
    }

    return resolveElementResults(
      selection.elementId,
      busResults,
      branchResults,
      shortCircuitResults,
    );
  }, [isResultsMode, selection, busResults, branchResults, shortCircuitResults]);

  // RUN #3H: Dane trybu projektowego (overrides + bledy walidacji)
  const projectModeActive = useSldProjectModeStore((s) => s.projectModeActive);
  const projectOverrides = useSldProjectModeStore((s) => s.overrides);
  const projectValidationErrors = useSldProjectModeStore((s) => s.validationErrors);

  // Diagnostyka walidacji (z bledow trybu projektowego)
  const diagnostics = useMemo<InspectorDiagnosticData | null>(() => {
    if (!isResultsMode || selection.type !== 'element') {
      return null;
    }

    // Sprawdz bledy walidacji z trybu projektowego (overrides + config)
    if (projectValidationErrors.length > 0) {
      const elementErrors = projectValidationErrors.filter(
        (e) => e.elementId === selection.elementId,
      );
      if (elementErrors.length > 0) {
        return {
          status: 'WYMAGA_KOREKTY',
          reasons: elementErrors.map((e) => e.message),
          source: 'analysis' as const,
        };
      }
    }

    // Brak bledow diagnostycznych dla tego elementu
    return null;
  }, [isResultsMode, selection, projectValidationErrors]);

  // PR-SLD-09: Dane zabezpieczeń dla elementu
  const protection = useMemo<ProtectionSummary | null>(() => {
    if (selection.type !== 'element') {
      return null;
    }

    // Pobierz dane zabezpieczeń dla elementu (fixture)
    return selectProtectionSummaryByElementId(selection.elementId);
  }, [selection]);

  // Buduj sekcje właściwości
  const sections = useMemo<InspectorPropertySection[]>(() => {
    if (selection.type === 'none') {
      return [];
    }

    if (selection.type === 'element') {
      const elementSections = buildElementSections(selection.symbol, results);

      // Dodaj sekcję diagnostyki jeśli dostępna (tryb WYNIKI)
      if (diagnostics) {
        elementSections.push({
          id: 'diagnostics',
          label: INSPECTOR_SECTION_LABELS_PL.diagnostics,
          fields: [
            {
              key: 'status',
              label: 'Status',
              value: diagnostics.status,
              highlight:
                diagnostics.status === 'WYMAGA_KOREKTY'
                  ? 'error'
                  : diagnostics.status === 'INFORMACJA'
                  ? 'warning'
                  : undefined,
            },
            {
              key: 'reasons',
              label: 'Powody',
              value: diagnostics.reasons.length > 0 ? diagnostics.reasons.join('; ') : '—',
            },
            {
              key: 'source',
              label: 'Źródło danych',
              value: diagnostics.source === 'solver' ? 'Solver' : 'Analiza',
              source: 'analysis',
            },
          ],
        });
      }

      // PR-SLD-09: Dodaj sekcje zabezpieczeń jeśli dostępne (tryb ZABEZPIECZENIA lub gdy dane istnieją)
      if (protection && (isProtectionMode || protection.has_complete_data)) {
        const protectionSections = buildProtectionSections(protection);
        elementSections.push(...protectionSections);
      }

      // RUN #3H: Dodaj sekcje geometrii jeśli tryb projektowy aktywny
      if (projectModeActive) {
        const geometrySection = buildGeometrySection(
          selection.elementId,
          projectOverrides,
          projectValidationErrors,
        );
        if (geometrySection) {
          elementSections.push(geometrySection);
        }
      }

      return elementSections;
    }

    if (selection.type === 'connection') {
      return buildConnectionSections(
        selection.connection,
        selection.fromSymbol,
        selection.toSymbol,
        results
      );
    }

    return [];
  }, [selection, results, diagnostics, protection, isProtectionMode, projectModeActive, projectOverrides, projectValidationErrors]);

  // Funkcja zamykania inspektora
  const closeInspector = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return {
    selection,
    sections,
    mode,
    isResultsMode,
    isProtectionMode,
    closeInspector,
    diagnostics,
    results,
    protection,
  };
}

export default useSldInspectorSelection;
