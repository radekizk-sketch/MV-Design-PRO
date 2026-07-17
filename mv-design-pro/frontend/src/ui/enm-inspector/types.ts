/**
 * Typy dla Inspektora ENM i diagnostyki inżynierskiej (v4.2).
 *
 * CANONICAL: Język polski w UI. Brak nazw kodowych.
 */

// ---------------------------------------------------------------------------
// Diagnostics API response types
// ---------------------------------------------------------------------------

export type DiagnosticSeverity = 'BLOCKER' | 'WARN' | 'INFO';
export type DiagnosticStatus = 'OK' | 'WARN' | 'FAIL';
export type AnalysisAvailability = 'AVAILABLE' | 'BLOCKED';
export type AnalysisType = 'SC_3F' | 'SC_1F' | 'LF' | 'PROTECTION';

export interface DiagnosticIssue {
  code: string;
  severity: DiagnosticSeverity;
  message_pl: string;
  affected_refs: string[];
  hints: string[];
}

export interface AnalysisMatrixEntry {
  analysis_type: AnalysisType;
  availability: AnalysisAvailability;
  reason_pl: string | null;
  blocking_codes: string[];
}

export interface DiagnosticReport {
  status: DiagnosticStatus;
  issues: DiagnosticIssue[];
  analysis_matrix: {
    entries: AnalysisMatrixEntry[];
  };
  blocker_count: number;
  warning_count: number;
  info_count: number;
}

// ---------------------------------------------------------------------------
// Preflight API response types
// ---------------------------------------------------------------------------

export interface PreflightCheckEntry {
  analysis_type: string;
  analysis_label_pl: string;
  status: AnalysisAvailability;
  reason_pl: string | null;
  blocking_codes: string[];
}

export interface PreflightReport {
  ready: boolean;
  overall_status: string;
  checks: PreflightCheckEntry[];
  blocker_count: number;
  warning_count: number;
}

// ---------------------------------------------------------------------------
// ENM Diff API response types
// ---------------------------------------------------------------------------

export interface FieldChange {
  field_name: string;
  old_value: unknown;
  new_value: unknown;
}

export interface EntityChange {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  change_type: 'ADDED' | 'REMOVED' | 'MODIFIED';
  field_changes: FieldChange[];
}

export interface EnmDiffReport {
  from_snapshot_id: string;
  to_snapshot_id: string;
  from_fingerprint: string;
  to_fingerprint: string;
  is_identical: boolean;
  changes: EntityChange[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    total: number;
  };
}

// ---------------------------------------------------------------------------
// ENM Tree types
// ---------------------------------------------------------------------------

export type EnmEntityType =
  | 'bus'
  | 'line'
  | 'cable'
  | 'transformer'
  | 'switch'
  | 'source'
  | 'load'
  | 'station';

export interface EnmTreeNode {
  id: string;
  label: string;
  entityType: EnmEntityType;
  entityId: string;
  children?: EnmTreeNode[];
  voltageLevelKv?: number;
  stationName?: string;
  issueCount?: number;
  issueSeverity?: DiagnosticSeverity;
}

// ---------------------------------------------------------------------------
// Severity display helpers
// ---------------------------------------------------------------------------

export const SEVERITY_LABELS_PL: Record<DiagnosticSeverity, string> = {
  BLOCKER: 'Blokada',
  WARN: 'Ostrzeżenie',
  INFO: 'Informacja',
};

export const SEVERITY_COLORS: Record<DiagnosticSeverity, string> = {
  BLOCKER: 'text-rose-600',
  WARN: 'text-amber-600',
  INFO: 'text-blue-600',
};

export const SEVERITY_BG_COLORS: Record<DiagnosticSeverity, string> = {
  BLOCKER: 'bg-rose-50 border-rose-200',
  WARN: 'bg-amber-50 border-amber-200',
  INFO: 'bg-blue-50 border-blue-200',
};

export const STATUS_LABELS_PL: Record<DiagnosticStatus, string> = {
  OK: 'Model poprawny',
  WARN: 'Ostrzeżenia',
  FAIL: 'Błędy blokujące',
};

export const ANALYSIS_LABELS_PL: Record<AnalysisType, string> = {
  SC_3F: 'Zwarcie trójfazowe (SC 3F)',
  SC_1F: 'Zwarcie jednofazowe (SC 1F)',
  LF: 'Rozpływ mocy (Load Flow)',
  PROTECTION: 'Koordynacja zabezpieczeń',
};

// ---------------------------------------------------------------------------
// Reference Engine V1 (REFERENCE_ENGINE_SPEC_V1.md §9, V12K-060) — raport
// zgodności referencyjnej + Reference Score (kontrakt
// GET /api/cases/{case_id}/reference/compliance).
// ---------------------------------------------------------------------------

export type ReferencePackKind = 'norm' | 'manufacturer' | 'osd';

export interface ReferenceComplianceCheck {
  element_ref: string;
  pack_id: string;
  rule_code: string;
  status: 'pass' | 'fail';
  message_pl: string;
}

export interface ReferencePackComplianceReport {
  pack_id: string;
  name_pl: string;
  kind: ReferencePackKind;
  version: string;
  applicable: number;
  passed: number;
  failed: number;
  /** null = „nie dotyczy" (zero sprawdzeń stosowalnych — uczciwy raport). */
  score_percent: number | null;
  checks: ReferenceComplianceCheck[];
}

export interface ReferenceComplianceReport {
  packs: ReferencePackComplianceReport[];
}

export const REFERENCE_PACK_KIND_LABELS_PL: Record<ReferencePackKind, string> = {
  norm: 'Norma',
  manufacturer: 'Producent',
  osd: 'OSD',
};
