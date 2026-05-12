/**
 * UI Types for MV-DESIGN-PRO
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 1.2: internal operating context compatibility layer
 * - ui_canonical_parity.md § B.2: Result freshness (NONE, FRESH, OUTDATED)
 * - sld_rules.md § A.2: Element types and symbol mapping
 *
 * These types are used across Property Grid, Context Menu, and Selection components.
 */

import type {
  FixActionSurfaceDescriptor,
  WizardSurfaceStepId,
} from '../types/fixActionSurface';

/**
 * Internal operating context.
 * Publiczny kanon V12.5.1 nie wystawia tych nazw do UI; sa zachowane
 * wylacznie jako warstwa zgodnosci dla starszych reducerow i selektorow.
 */
export type OperatingMode = 'MODEL_EDIT' | 'CASE_CONFIG' | 'RESULT_VIEW';
/**
 * Result freshness status (per ui_canonical_parity.md § B.2).
 */
export type ResultStatus = 'NONE' | 'FRESH' | 'OUTDATED';

/**
 * Element type in the network model — rozszerzenie A–AZ.
 * Maps 1:1 to SLD symbols (bijection per sld_rules.md § A.1).
 */
export type ElementType =
  // Istniejące typy SN (A–L)
  | 'Bus'                    // A-B: Szyna SN / GPZ
  | 'LineBranch'             // D-E: Segment magistrali/odgałęzienia
  | 'TransformerBranch'      // L: Transformator SN/nN
  | 'Switch'                 // I: Aparat SN (wyłącznik/rozłącznik)
  | 'Source'                 // A: GPZ / Źródło SN
  | 'Load'                   // S: Odbiór
  | 'Generator'              // Istniejący typ generatora
  | 'Measurement'            // K: CT SN / VT SN
  | 'ProtectionAssignment'   // J: Przekaźnik SN
  // Nowe typy infrastruktury SN
  | 'Terminal'               // C: Terminal magistrali SN
  | 'PortBranch'             // F: Port BRANCH SN
  | 'Station'                // G: Stacja SN/nN (blok)
  | 'BranchPole'             // G2: Slup rozgalezny SN
  | 'ZKSN'                   // G3: ZKSN
  | 'BaySN'                  // H: Pole SN
  | 'Relay'                  // J: Przekaźnik SN (logiczny)
  | 'SecondaryLink'          // P: Połączenie wtórne (pierścień)
  | 'NOP'                    // Q: Punkt normalnie otwarty
  // Typy nN (M–O, R–AP)
  | 'BusNN'                  // M: Szyna nN
  | 'MainBreakerNN'          // N: Pole główne nN (wyłącznik główny)
  | 'FeederNN'               // O: Odpływ nN (pole odpływowe)
  | 'SegmentNN'              // R: Segment nN (odcinek linii/kabla)
  | 'LoadNN'                 // S: Odbiór nN
  | 'SwitchboardNN'          // T: Rozdzielnica nN
  | 'SourceFieldNN'          // U: Pole źródłowe nN
  // Źródła nN (V–Z)
  | 'PVInverter'             // V: Falownik PV
  | 'BESSInverter'           // W: Falownik BESS
  | 'EnergyStorage'          // X: Magazyn energii (moduł BESS)
  | 'Genset'                 // Y: Zespół prądotwórczy / agregat
  | 'UPS'                    // Z: UPS
  // Pomiary i zabezpieczenia nN (AA–AE)
  | 'EnergyMeter'            // AA: Licznik energii
  | 'PowerQualityMeter'      // AB: Pomiar jakości energii
  | 'SurgeArresterNN'        // AC: Ogranicznik przepięć nN
  | 'Earthing'               // AD: Uziemienie
  | 'MeasurementNN'          // AE: Przekładnik nN (CT/VT)
  // Infrastruktura szyn nN (AF–AR)
  | 'AuxBus'                 // AF: Szyna pomocnicza
  | 'ConnectionPoint'        // AG: Punkt przyłączenia odbiorcy
  | 'SwitchNN'               // AH: Urządzenie łączeniowe nN
  | 'ProtectionNN'           // AI: Zabezpieczenie nN (logiczne)
  | 'SourceController'       // AJ: Regulator/sterownik źródła
  | 'InternalJunction'       // AK: Punkt wspólny w rozdzielnicy
  | 'CableJointNN'           // AL: Złącze kablowe nN
  | 'FaultCurrentLimiter'    // AM: Ogranicznik prądu zwarciowego
  | 'FilterCompensator'      // AN: Filtr/kompensator
  | 'TelecontrolDevice'      // AO: Urządzenie komunikacyjne
  | 'BusSectionNN'           // AP: Sekcja szyn nN
  | 'BusCouplerNN'           // AQ: Sprzęgło szyn nN
  | 'ReserveLink'            // AR: Zworka/łącznik rezerwowy nN
  // Parametry logiczne źródeł (AS–AZ)
  | 'SourceDisconnect'       // AS: Punkt odłączenia źródła
  | 'PowerLimit'             // AT: Ograniczenie mocy źródła
  | 'WorkProfile'            // AU: Profil pracy źródła
  | 'OperatingMode'          // AV: Tryb pracy
  | 'ConnectionConstraints'  // AW: Ograniczenia przyłączeniowe
  | 'MeteringBlock'          // AX: Układ pomiarowo-rozliczeniowy
  | 'SyncPoint'              // AY: Punkt synchronizacji źródła
  | 'DescriptiveElement';    // AZ: Elementy opisowe

/**
 * Switch state (per SYSTEM_SPEC.md § 2.4).
 */
export type SwitchState = 'OPEN' | 'CLOSED';

/**
 * Switch type (per sld_rules.md § A.2).
 */
export type SwitchType = 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH' | 'FUSE';

/**
 * Lifecycle state for elements.
 */
export type LifecycleState = 'PROJEKTOWANY' | 'AKTYWNY' | 'WYLACZONY';

/**
 * Validation severity level.
 */
export type ValidationSeverity = 'ERROR' | 'WARNING';

/**
 * Validation message structure.
 */
export interface ValidationMessage {
  code: string;
  severity: ValidationSeverity;
  message: string;
  field?: string;
}

/**
 * Selected element reference.
 */
export interface SelectedElement {
  id: string;
  type: ElementType;
  name: string;
  semanticHash?: string;
  semanticElementKind?: string;
  semanticEngineeringRole?: string;
}

/**
 * Multi-selection state (P30c).
 * Used for Property Grid multi-edit functionality.
 */
export interface MultiSelection {
  /** Selected elements (ALWAYS sorted by ID for determinism) */
  elements: SelectedElement[];
  /** Common element type (null if mixed types) */
  commonType: ElementType | null;
}

/**
 * Property field definition for Property Grid.
 * Deterministic ordering per ui_canonical_parity.md § D.3.
 */
export interface PropertyField {
  key: string;
  label: string;
  value: unknown;
  unit?: string;
  editable: boolean;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'ref' | 'type_ref_with_actions';
  enumOptions?: string[];
  refType?: ElementType;
  validation?: ValidationMessage;
  source?: 'instance' | 'type' | 'calculated' | 'audit';

  // P8.2: Type reference actions (for type_ref_with_actions type)
  onAssignType?: () => void;
  onClearType?: () => void;
  typeRefName?: string | null; // Resolved type name for display
}

/**
 * Property section definition (grouped fields).
 * Sections appear in deterministic order per wizard_screens.md § 3.
 */
export interface PropertySection {
  id: string;
  label: string;
  fields: PropertyField[];
  collapsed?: boolean;
}

/**
 * Complete element properties for Property Grid.
 */
export interface ElementProperties {
  elementId: string;
  elementType: ElementType;
  elementName: string;
  sections: PropertySection[];
  validationMessages: ValidationMessage[];
}

/**
 * P30c: Multi-edit field value.
 * Represents a field value across multiple elements.
 */
export type MultiEditFieldValue =
  | { kind: 'uniform'; value: unknown } // All elements have same value
  | { kind: 'mixed' }; // Elements have different values

/**
 * P30c: Draft state for Property Grid (Apply/Cancel).
 */
export interface PropertyGridDraft {
  /** Draft changes (field → new value) */
  changes: Map<string, unknown>;
  /** Has any unsaved changes */
  isDirty: boolean;
}

/**
 * Context menu action definition.
 */
export interface ContextMenuAction {
  id: string;
  actionKey?: string;
  label: string;
  section?: string;
  icon?: string;
  enabled: boolean;
  visible: boolean;
  blockedReason?: string;
  separator?: boolean;
  submenu?: ContextMenuAction[];
  handler?: () => void;
  initialFormData?: Record<string, unknown>;
  testId?: string;
}

/**
 * Context menu configuration for an element.
 */
export interface ContextMenuConfig {
  elementId: string;
  elementType: ElementType;
  elementName: string;
  mode: OperatingMode;
  actions: ContextMenuAction[];
}

// ============================================================================
// P9: Project Tree Types
// ============================================================================

/**
 * Tree node type (categories in the project tree).
 */
export type TreeNodeType =
  | 'PROJECT'
  | 'NETWORK'
  | 'STATION'           // FIX-05: Logical station container
  | 'VOLTAGE_LEVEL'     // FIX-05: Voltage level grouping
  | 'BUSES'
  | 'LINES'
  | 'CABLES'
  | 'TRANSFORMERS'
  | 'SWITCHES'
  | 'SOURCES'
  | 'LOADS'
  | 'TYPE_CATALOG'
  | 'LINE_TYPES'
  | 'CABLE_TYPES'
  | 'TRANSFORMER_TYPES'
  | 'SWITCH_EQUIPMENT_TYPES'
  | 'CASES'
  | 'STUDY_CASE'  // P10: Individual study case node
  | 'RESULTS'
  | 'RUN_ITEM'    // P11c: Individual analysis run in results history
  | 'PROTECTION_RESULTS'  // P15c: Protection results category
  | 'PROTECTION_RUNS'     // P15c: Protection runs subcategory
  | 'PROTECTION_COMPARISONS'  // P15c: Protection comparisons subcategory
  | 'POWER_FLOW_RESULTS'  // P20b: Power flow results category
  | 'POWER_FLOW_RUNS'     // P20b: Power flow runs subcategory
  | 'SHORT_CIRCUIT_RESULTS'  // SC results category (Zwarcia)
  | 'SHORT_CIRCUIT_RUNS'     // SC runs subcategory
  | 'GENERATORS'           // PR-9: Generator / OZE category
  | 'MEASUREMENTS'         // PR-9: Measurement transformers (CT/VT) category
  | 'PROTECTION_ASSIGNMENTS' // PR-9: Protection assignment category
  | 'ELEMENT'; // Individual element node

/**
 * Project tree node structure.
 */
export interface TreeNode {
  id: string;
  label: string;
  nodeType: TreeNodeType;
  elementType?: ElementType; // For ELEMENT nodes
  elementId?: string; // For ELEMENT nodes
  children?: TreeNode[];
  count?: number; // Number of items in category
  expanded?: boolean;
  icon?: string;
  // FIX-05: Station properties
  stationId?: string; // For STATION nodes
  voltageLevelKv?: number; // For VOLTAGE_LEVEL nodes
  // P10: Study case properties
  studyCaseId?: string; // For STUDY_CASE nodes
  isActive?: boolean; // For STUDY_CASE nodes - active case indicator
  resultStatus?: ResultStatus; // For STUDY_CASE nodes - result status
  // P11c: Run item properties (for RUN_ITEM nodes in results history)
  runId?: string; // For RUN_ITEM nodes - analysis run UUID
  solverKind?: string; // For RUN_ITEM nodes - solver type (PF, SC)
  createdAt?: string; // For RUN_ITEM nodes - timestamp
  caseId?: string; // For RUN_ITEM nodes - parent case UUID
  // Service status for ELEMENT nodes
  inService?: boolean; // For ELEMENT nodes - service status indicator
}

// ============================================================================
// P9: Data Manager Types
// ============================================================================

/**
 * Data Manager column definition.
 * P9.2: Extended with editability metadata for inline editing.
 */
export interface DataManagerColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'ref';
  unit?: string;
  sortable: boolean;
  width?: number;
  // P9.2: Inline editing metadata
  editable?: boolean; // Can be edited inline only in writable model context, only for instance fields
  source?: 'instance' | 'type' | 'calculated'; // Source of the value
  enumOptions?: string[]; // For enum type fields
  validation?: (value: unknown) => string | null; // Inline validation function
}

/**
 * Sort direction.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Data Manager sort configuration.
 */
export interface DataManagerSort {
  column: string;
  direction: SortDirection;
}

/**
 * Data Manager filter configuration.
 */
export interface DataManagerFilter {
  inServiceOnly: boolean;
  withTypeOnly: boolean;
  withoutTypeOnly: boolean;
  switchStateFilter: 'ALL' | 'OPEN' | 'CLOSED';
  showErrorsOnly: boolean; // P9.1: Filter for elements with validation errors
}

/**
 * Column view preset types.
 * P9.1: Canonical-like column view presets.
 */
export type ColumnViewPreset = 'BASIC' | 'TECHNICAL' | 'OPERATIONAL';

/**
 * Column view preset labels (Polish).
 */
export const COLUMN_VIEW_PRESET_LABELS: Record<ColumnViewPreset, string> = {
  BASIC: 'Widok podstawowy',
  TECHNICAL: 'Parametry techniczne',
  OPERATIONAL: 'Eksploatacja',
};

/**
 * Data Manager row (generic element representation).
 */
export interface DataManagerRow {
  id: string;
  name: string;
  elementType: ElementType;
  inService: boolean;
  typeRef: string | null;
  typeRefName: string | null;
  switchState?: SwitchState;
  data: Record<string, unknown>;
  validationMessages: ValidationMessage[];
}

/**
 * Batch edit operation type.
 * P9.2: Extended with SET_PARAMETER for generic parameter editing.
 */
export type BatchEditOperation =
  | { type: 'SET_IN_SERVICE'; value: boolean }
  | { type: 'ASSIGN_TYPE'; typeId: string }
  | { type: 'CLEAR_TYPE' }
  | { type: 'SET_SWITCH_STATE'; state: SwitchState }
  | { type: 'SET_PARAMETER'; field: string; value: unknown }; // P9.2: Generic parameter edit

/**
 * Batch edit result.
 */
export interface BatchEditResult {
  success: boolean;
  affectedCount: number;
  errors: Array<{ elementId: string; message: string }>;
}

// ============================================================================
// P9.2: Inline Editing Types
// ============================================================================

/**
 * Inline edit state (tracks currently edited cell).
 */
export interface InlineEditState {
  rowId: string;
  columnKey: string;
  value: unknown;
}

/**
 * Inline edit validation result.
 */
export interface InlineEditValidation {
  valid: boolean;
  error?: string;
}

// ============================================================================
// P9.2: Batch Edit Diff Preview Types
// ============================================================================

/**
 * Single change in batch edit preview.
 */
export interface BatchEditChange {
  elementId: string;
  elementName: string;
  field: string;
  fieldLabel: string;
  oldValue: unknown;
  newValue: unknown;
  validation: InlineEditValidation;
}

/**
 * Batch edit preview (shown before applying changes).
 */
export interface BatchEditPreview {
  operation: BatchEditOperation;
  changes: BatchEditChange[];
  hasErrors: boolean;
}

// ============================================================================
// P30d: Issue Panel / Validation Browser Types
// ============================================================================

/**
 * Issue severity (P22 BINDING thresholds).
 * INFO: |V - 1.0| < 2%, losses < 2 kW
 * WARN: 2-5%
 * HIGH: >5%
 */
export type IssueSeverity = 'INFO' | 'WARN' | 'HIGH';

/**
 * Issue source (origin of the issue).
 */
export type IssueSource = 'MODEL' | 'POWER_FLOW' | 'PROTECTION';

/**
 * Reference to a network object.
 */
export interface IssueObjectRef {
  type: ElementType;
  id: string;
  name?: string;
}

/**
 * Single issue/finding in the project.
 * Aggregates model validation + power flow interpretation + protection findings.
 * DETERMINISTIC: Sorted by severity DESC, source, object_ref.id ASC.
 */
export interface Issue {
  /** Unique issue identifier (derived from source + object + finding type) */
  issue_id: string;
  /** Source of the issue */
  source: IssueSource;
  /** Severity level (INFO/WARN/HIGH) */
  severity: IssueSeverity;
  /** Polish title (short summary) */
  title_pl: string;
  /** Polish description (detailed explanation) */
  description_pl: string;
  /** Reference to affected object */
  object_ref: IssueObjectRef;
  /** Optional evidence reference (e.g., "voltage_profile_fig_1") */
  evidence_ref?: string;
  /** Optional field name (for model validation issues) */
  field?: string;
}

/**
 * Issue filter configuration.
 */
export interface IssueFilter {
  /** Filter by source (empty = all) */
  sources: IssueSource[];
  /** Filter by severity (empty = all) */
  severities: IssueSeverity[];
  /** Show only issues for currently selected element */
  selectedOnly: boolean;
}

// ============================================================================
// PR-13: Engineering Readiness Panel Types
// ============================================================================

/**
 * FixAction — deterministic fix suggestion (no mutation, no auto-fix).
 */
export type FixActionType =
  | 'OPEN_MODAL'
  | 'NAVIGATE_TO_ELEMENT'
  | 'SELECT_CATALOG'
  | 'ADD_MISSING_DEVICE';

export interface FixAction {
  action_type: FixActionType;
  element_ref: string | null;
  modal_type?: string | null;
  panel?: string | null;
  step?: string | null;
  focus?: string | null;
  payload_hint: Record<string, unknown> | null;
  surface_descriptor?: FixActionSurfaceDescriptor | null;
}

/**
 * Engineering Readiness severity (BLOCKER / IMPORTANT / INFO).
 */
export type ReadinessSeverity = 'BLOCKER' | 'IMPORTANT' | 'INFO';

/**
 * Single engineering readiness issue with optional fix action.
 */
export interface ReadinessIssue {
  code: string;
  severity: ReadinessSeverity;
  element_ref: string | null;
  element_refs: string[];
  message_pl: string;
  wizard_step_hint: string | null;
  wizard_step_id?: WizardSurfaceStepId | null;
  suggested_fix: string | null;
  fix_action: FixAction | null;
}

/**
 * Engineering Readiness API response.
 */
export interface EngineeringReadinessResponse {
  case_id: string;
  enm_revision: number;
  status: 'OK' | 'WARN' | 'FAIL';
  ready: boolean;
  issues: ReadinessIssue[];
  total_count: number;
  by_severity: Record<ReadinessSeverity, number>;
  analysis_available: {
    short_circuit_3f: boolean;
    short_circuit_1f: boolean;
    load_flow: boolean;
  };
}

// ============================================================================
// PR-17: Analysis Eligibility Matrix Types
// ============================================================================

/**
 * Analysis type for eligibility matrix.
 */
export type EligibilityAnalysisType = 'SC_3F' | 'SC_2F' | 'SC_1F' | 'LOAD_FLOW';

/**
 * Eligibility status for a given analysis type.
 */
export type EligibilityStatus = 'ELIGIBLE' | 'INELIGIBLE';

/**
 * Eligibility issue severity.
 */
export type EligibilityIssueSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

/**
 * Single eligibility issue with optional fix action.
 */
export interface AnalysisEligibilityIssue {
  code: string;
  severity: EligibilityIssueSeverity;
  message_pl: string;
  element_ref: string | null;
  element_type: string | null;
  fix_action: FixAction | null;
}

/**
 * Eligibility result for one analysis type.
 */
export interface AnalysisEligibilityResult {
  analysis_type: EligibilityAnalysisType;
  status: EligibilityStatus;
  blockers: AnalysisEligibilityIssue[];
  warnings: AnalysisEligibilityIssue[];
  info: AnalysisEligibilityIssue[];
  by_severity: Record<EligibilityIssueSeverity, number>;
  content_hash: string;
}

/**
 * Overall eligibility summary.
 */
export interface EligibilityOverall {
  eligible_any: boolean;
  eligible_all: boolean;
  blockers_total: number;
}

/**
 * Full Analysis Eligibility Matrix API response.
 */
export interface AnalysisEligibilityMatrixResponse {
  case_id: string;
  enm_revision: number;
  matrix: AnalysisEligibilityResult[];
  overall: EligibilityOverall;
  content_hash: string;
}

/**
 * Polish labels for eligibility analysis types.
 */
export const ELIGIBILITY_ANALYSIS_LABELS: Record<EligibilityAnalysisType, string> = {
  SC_3F: 'Zwarcie trójfazowe (3F)',
  SC_2F: 'Zwarcie dwufazowe (2F)',
  SC_1F: 'Zwarcie jednofazowe (1F)',
  LOAD_FLOW: 'Rozpływ mocy',
};

/**
 * Polish labels for eligibility status.
 */
export const ELIGIBILITY_STATUS_LABELS: Record<EligibilityStatus, string> = {
  ELIGIBLE: 'Możliwe',
  INELIGIBLE: 'Zablokowane',
};
