/**
 * SLD Inspector Compare Types — PR-SLD-08
 *
 * Typy dla trybu porównania elementów w inspektorze SLD.
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Porównanie właściwości (120% CANONICAL)
 * - sld_rules.md § G.1: Multi-selection w inspektorze
 *
 * FEATURES:
 * - Porównanie 2 elementów (MAX)
 * - Deterministyczna kolejność A/B (sortowanie po elementId)
 * - Wyróżnienie różnic (typografia, nie kolory alarmowe)
 * - 100% READ-ONLY
 *
 * 100% POLISH UI - BRAK ANGLICYZMÓW
 */

// Note: InspectorPropertyField and InspectorPropertySection types are similar to compare types
// but we define our own for the comparison context
import type { AnySldSymbol, Connection } from '../../../sld-editor/types';
import type { ElementType } from '../../../types';
import type { SldMode } from '../../sldModeStore';

// =============================================================================
// PORÓWNANIE ELEMENTÓW
// =============================================================================

/**
 * Porównywany element w inspektorze.
 */
export interface CompareElement {
  elementId: string;
  symbolId: string;
  elementType: ElementType;
  elementName: string;
  symbol: AnySldSymbol;
}

/**
 * Porównywane połączenie w inspektorze.
 */
export interface CompareConnection {
  connectionId: string;
  connection: Connection;
  fromSymbol: AnySldSymbol | null;
  toSymbol: AnySldSymbol | null;
}

/**
 * Selekcja porównania (2 elementy).
 */
export interface CompareSelection {
  /** Element A (pierwszy w kolejności deterministycznej) */
  elementA: CompareElement;
  /** Element B (drugi w kolejności deterministycznej) */
  elementB: CompareElement;
  /** Czy elementy są tego samego typu */
  sameType: boolean;
}

/**
 * Selekcja porównania połączeń (2 połączenia).
 */
export interface CompareConnectionSelection {
  connectionA: CompareConnection;
  connectionB: CompareConnection;
}

// =============================================================================
// PORÓWNANIE PÓL
// =============================================================================

/**
 * Status różnicy pola.
 */
export type FieldDiffStatus = 'equal' | 'different' | 'missing_a' | 'missing_b';

/**
 * Porównane pole właściwości.
 */
export interface ComparePropertyField {
  key: string;
  label: string;
  /** Wartość elementu A */
  valueA: string | number | boolean | null;
  /** Wartość elementu B */
  valueB: string | number | boolean | null;
  /** Jednostka (jeśli dotyczy) */
  unit?: string;
  /** Status różnicy */
  diffStatus: FieldDiffStatus;
  /** Źródło danych */
  source?: 'instance' | 'calculated' | 'analysis';
}

/**
 * Porównana sekcja właściwości.
 */
export interface ComparePropertySection {
  id: string;
  label: string;
  fields: ComparePropertyField[];
  /** Czy sekcja zawiera różnice */
  hasDifferences: boolean;
  /** Domyślnie zwinięta */
  collapsed?: boolean;
}

// =============================================================================
// WYNIK HOOKA
// =============================================================================

/**
 * Typ selekcji porównania.
 */
export type CompareSelectionType = 'elements' | 'connections' | 'none' | 'single';

/**
 * Wynik hooka useSldCompareSelection.
 */
export interface UseSldCompareSelectionResult {
  /** Typ selekcji porównania */
  selectionType: CompareSelectionType;

  /** Czy tryb porównania jest aktywny (2 elementy zaznaczone) */
  isCompareMode: boolean;

  /** Dane selekcji elementów (jeśli typ === 'elements') */
  compareSelection: CompareSelection | null;

  /** Dane selekcji połączeń (jeśli typ === 'connections') */
  compareConnectionSelection: CompareConnectionSelection | null;

  /** Sekcje porównania do wyświetlenia */
  compareSections: ComparePropertySection[];

  /** Tryb SLD (EDYCJA / WYNIKI) */
  mode: SldMode;

  /** Czy tryb WYNIKI */
  isResultsMode: boolean;

  /** Zamknij porównanie (wyczyść selekcję) */
  closeCompare: () => void;

  /** Liczba różnic */
  totalDifferences: number;
}

// =============================================================================
// ETYKIETY POLSKIE
// =============================================================================

/**
 * Etykiety trybu porównania po polsku.
 */
export const COMPARE_LABELS_PL = {
  title: 'Porównanie elementów',
  titleConnections: 'Porównanie połączeń',
  elementA: 'Element A',
  elementB: 'Element B',
  connectionA: 'Połączenie A',
  connectionB: 'Połączenie B',
  noDifferences: 'Brak różnic',
  differences: 'różnic',
  difference: 'różnica',
  differences2to4: 'różnice',
  sameType: 'Ten sam typ',
  differentTypes: 'Różne typy',
  diffIndicator: '≠',
  readOnly: 'Tylko do odczytu',
  selectTwoElements: 'Zaznacz 2 elementy, aby porównać',
  maxTwoElements: 'Można porównać maksymalnie 2 elementy',
} as const;

/**
 * Etykiety sekcji porównania po polsku.
 */
export const COMPARE_SECTION_LABELS_PL = {
  basic: 'Informacje podstawowe',
  technical: 'Parametry techniczne',
  connection: 'Dane połączenia',
  diagnostics: 'Diagnostyka',
} as const;
