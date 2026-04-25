/**
 * FIX-03 — Results Browser API Client
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: READ-ONLY result display
 * - Uses existing backend endpoints from P11a, P20a
 *
 * ENDPOINTS:
 * - GET /api/analysis-runs/{run_id}/results/buses
 * - GET /api/analysis-runs/{run_id}/results/branches
 * - GET /api/power-flow-runs/{run_id}/results
 * - GET /api/power-flow-runs/{run_id}/trace
 * - GET /api/power-flow-runs/{run_id}/export/pdf
 * - GET /api/power-flow-runs/{run_id}/export/xlsx
 */

import type {
  BusVoltageRow,
  BranchFlowRow,
  LossesRow,
  ViolationRow,
  ConvergenceRow,
  RunHeaderCompare,
  ResultsViewMode,
} from './types';

const API_BASE = '/api';

// =============================================================================
// Results Fetching
// =============================================================================

/**
 * Fetch bus voltage results for a run.
 */
export async function fetchBusVoltages(runId: string): Promise<BusVoltageRow[]> {
  const response = await fetch(`${API_BASE}/power-flow-runs/${runId}/results`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania napięć węzłowych: ${response.statusText}`);
  }
  const data = await response.json();

  // Map backend PowerFlowResultV1 to BusVoltageRow
  return (data.bus_results ?? []).map((row: {
    bus_id: string;
    v_pu: number;
    angle_deg: number;
    p_injected_mw: number;
    q_injected_mvar: number;
  }) => ({
    bus_id: row.bus_id,
    bus_name: row.bus_id, // Backend may not have name
    bus_type: determineBusType(row.bus_id, data.slack_bus_id),
    voltage_kv: row.v_pu * getBaseVoltage(row.bus_id),
    voltage_pu: row.v_pu,
    angle_deg: row.angle_deg,
    p_mw: row.p_injected_mw,
    q_mvar: row.q_injected_mvar,
    status: determineVoltageStatus(row.v_pu),
  }));
}

/**
 * Fetch branch flow results for a run.
 */
export async function fetchBranchFlows(runId: string): Promise<BranchFlowRow[]> {
  const response = await fetch(`${API_BASE}/power-flow-runs/${runId}/results`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania przepływów gałęziowych: ${response.statusText}`);
  }
  const data = await response.json();

  // Map backend PowerFlowResultV1 to BranchFlowRow
  return (data.branch_results ?? []).map((row: {
    branch_id: string;
    p_from_mw: number;
    q_from_mvar: number;
    p_to_mw: number;
    q_to_mvar: number;
    losses_p_mw: number;
    losses_q_mvar: number;
  }) => ({
    branch_id: row.branch_id,
    branch_name: row.branch_id,
    from_bus: extractFromBus(row.branch_id),
    to_bus: extractToBus(row.branch_id),
    p_from_mw: row.p_from_mw,
    q_from_mvar: row.q_from_mvar,
    p_to_mw: row.p_to_mw,
    q_to_mvar: row.q_to_mvar,
    current_ka: calculateCurrent(row.p_from_mw, row.q_from_mvar),
    loading_pct: calculateLoading(row.branch_id, row.p_from_mw, row.q_from_mvar),
    status: determineLoadingStatus(calculateLoading(row.branch_id, row.p_from_mw, row.q_from_mvar)),
  }));
}

/**
 * Fetch losses data for a run.
 */
export async function fetchLosses(runId: string): Promise<LossesRow[]> {
  const response = await fetch(`${API_BASE}/power-flow-runs/${runId}/results`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania strat: ${response.statusText}`);
  }
  const data = await response.json();

  // Map branch results to losses
  return (data.branch_results ?? []).map((row: {
    branch_id: string;
    losses_p_mw: number;
    losses_q_mvar: number;
    p_from_mw: number;
  }) => ({
    branch_id: row.branch_id,
    branch_name: row.branch_id,
    branch_type: determineBranchType(row.branch_id),
    losses_p_mw: row.losses_p_mw,
    losses_q_mvar: row.losses_q_mvar,
    losses_pct: row.p_from_mw !== 0 ? (Math.abs(row.losses_p_mw) / Math.abs(row.p_from_mw)) * 100 : 0,
  }));
}

/**
 * Fetch violations for a run.
 */
export async function fetchViolations(runId: string): Promise<ViolationRow[]> {
  // Compute violations directly from the canonical result payload.
  const busVoltages = await fetchBusVoltages(runId);
  const violations: ViolationRow[] = [];

  // Check voltage violations
  for (const bus of busVoltages) {
    if (bus.voltage_pu < 0.95) {
      violations.push({
        element_id: bus.bus_id,
        element_name: bus.bus_name,
        element_type: 'bus',
        violation_type: 'UNDERVOLTAGE',
        voltage_pu: bus.voltage_pu,
        limit_min_pu: 0.95,
        limit_max_pu: 1.05,
        deviation_pct: ((0.95 - bus.voltage_pu) / 0.95) * 100,
        severity: bus.voltage_pu < 0.90 ? 'HIGH' : 'WARN',
      });
    } else if (bus.voltage_pu > 1.05) {
      violations.push({
        element_id: bus.bus_id,
        element_name: bus.bus_name,
        element_type: 'bus',
        violation_type: 'OVERVOLTAGE',
        voltage_pu: bus.voltage_pu,
        limit_min_pu: 0.95,
        limit_max_pu: 1.05,
        deviation_pct: ((bus.voltage_pu - 1.05) / 1.05) * 100,
        severity: bus.voltage_pu > 1.10 ? 'HIGH' : 'WARN',
      });
    }
  }

  return violations;
}

/**
 * Fetch convergence trace for a run.
 */
export async function fetchConvergence(runId: string): Promise<ConvergenceRow[]> {
  const response = await fetch(`${API_BASE}/power-flow-runs/${runId}/trace`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania danych zbieżności: ${response.statusText}`);
  }
  const data = await response.json();

  // Map trace iterations to convergence rows
  return (data.iterations ?? []).map((iter: {
    k: number;
    max_mismatch_pu: number;
    norm_mismatch: number;
    cause_if_failed?: string | null;
  }, idx: number) => ({
    iteration: iter.k ?? idx + 1,
    max_mismatch_pu: iter.max_mismatch_pu,
    norm_mismatch: iter.norm_mismatch,
    max_mismatch_bus: undefined,
    jacobian_rcond: undefined,
    converged: idx === (data.iterations?.length ?? 0) - 1 && data.converged,
  }));
}

/**
 * Fetch run headers for comparison.
 */
export async function fetchRunsForComparison(projectId: string): Promise<RunHeaderCompare[]> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/power-flow-runs`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania listy runów: ${response.statusText}`);
  }
  const data = await response.json();

  return (data.runs ?? []).map((run: {
    id: string;
    study_case_id?: string;
    created_at: string;
    status: string;
    converged?: boolean;
  }) => {
    if (!run.study_case_id) {
      throw new Error('Brak `study_case_id` w kanonicznej liście uruchomień rozplywu.');
    }
    return {
      run_id: run.id,
      case_id: run.study_case_id,
      created_at: run.created_at,
      solver_kind: 'PF',
      status: run.status,
      converged: run.converged,
    };
  });
}

// =============================================================================
// Export Functions
// =============================================================================

/**
 * Export results to CSV format (client-side).
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: string; header: string }[],
  filename: string
): void {
  // BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';

  // Header row
  const header = columns.map((col) => escapeCSVField(col.header)).join(';');

  // Data rows
  const rows = data.map((row) =>
    columns.map((col) => formatCSVValue(row[col.key])).join(';')
  );

  const content = [header, ...rows].join('\n');
  downloadFile(BOM + content, filename, 'text/csv;charset=utf-8');
}

/**
 * Export results to PDF via backend.
 */
export async function exportToPDF(
  runId: string,
  viewMode: ResultsViewMode,
  _projectName?: string,
  _caseName?: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/power-flow-runs/${runId}/export/pdf`);

  if (!response.ok) {
    throw new Error(`Błąd eksportu PDF: ${response.statusText}`);
  }

  const blob = await response.blob();
  const filename = `wyniki_${viewMode}_${formatTimestamp()}.pdf`;
  downloadBlob(blob, filename);
}

/**
 * Export results to Excel (XLSX) via backend.
 */
export async function exportToExcel(
  runId: string,
  viewMode: ResultsViewMode,
  _projectName?: string,
  _caseName?: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/power-flow-runs/${runId}/export/xlsx`);

  if (!response.ok) {
    throw new Error(`Błąd eksportu Excel: ${response.statusText}`);
  }

  const blob = await response.blob();
  const filename = `wyniki_${viewMode}_${formatTimestamp()}.xlsx`;
  downloadBlob(blob, filename);
}

// =============================================================================
// Helper Functions
// =============================================================================

function escapeCSVField(value: string): string {
  if (value.includes(';') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCSVValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return value.toLocaleString('pl-PL');
  }
  if (Array.isArray(value)) {
    return escapeCSVField(value.join(', '));
  }
  return escapeCSVField(String(value));
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
}

// Placeholder implementations - these would use actual network model data
function getBaseVoltage(_busId: string): number {
  return 20.0; // Default MV voltage
}

function determineBusType(busId: string, slackBusId: string): 'SLACK' | 'PV' | 'PQ' {
  if (busId === slackBusId) return 'SLACK';
  return 'PQ';
}

function determineVoltageStatus(vPu: number): 'PASS' | 'FAIL' | 'WARNING' {
  if (vPu < 0.90 || vPu > 1.10) return 'FAIL';
  if (vPu < 0.95 || vPu > 1.05) return 'WARNING';
  return 'PASS';
}

function extractFromBus(branchId: string): string {
  // Branch ID format: "from_bus->to_bus" or similar
  const parts = branchId.split('->');
  return parts[0] ?? branchId;
}

function extractToBus(branchId: string): string {
  const parts = branchId.split('->');
  return parts[1] ?? branchId;
}

function determineBranchType(_branchId: string): string {
  // Would determine from network model
  return 'Linia';
}

function calculateCurrent(pMw: number, qMvar: number): number {
  // S = sqrt(P^2 + Q^2), I = S / (sqrt(3) * U)
  // Assuming 20 kV base
  const sMva = Math.sqrt(pMw * pMw + qMvar * qMvar);
  return sMva / (Math.sqrt(3) * 20.0);
}

function calculateLoading(_branchId: string, pMw: number, qMvar: number): number {
  // Would use actual ampacity from network model
  // Placeholder: assume 100 MVA rated
  const sMva = Math.sqrt(pMw * pMw + qMvar * qMvar);
  return (sMva / 100.0) * 100.0;
}

function determineLoadingStatus(loadingPct: number): 'PASS' | 'FAIL' | 'WARNING' {
  if (loadingPct > 100) return 'FAIL';
  if (loadingPct > 80) return 'WARNING';
  return 'PASS';
}

