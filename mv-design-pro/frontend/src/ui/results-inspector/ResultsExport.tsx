import { useCallback, useMemo, useState } from 'react';

import { notify } from '../notifications/store';
import {
  downloadAnalysisRunExport,
  downloadAnalysisRunReport,
  type AnalysisRunExportFormat,
  type AnalysisRunReportOptions,
} from './api';
import type {
  BranchResultRow,
  BusResultRow,
  ResultsInspectorTab,
  RunHeader,
  ShortCircuitRow,
} from './types';

interface ExportData {
  activeTab: ResultsInspectorTab;
  busRows: BusResultRow[];
  branchRows: BranchResultRow[];
  shortCircuitRows: ShortCircuitRow[];
  runHeader: RunHeader;
  projectName?: string;
  caseName?: string;
}

interface ResultsExportProps {
  exportData: ExportData;
}

const BUS_CSV_COLUMNS = [
  { key: 'name', label: 'Nazwa' },
  { key: 'bus_id', label: 'ID wezla' },
  { key: 'un_kv', label: 'Un [kV]' },
  { key: 'u_kv', label: 'U [kV]' },
  { key: 'u_pu', label: 'U [pu]' },
  { key: 'angle_deg', label: 'Kat [°]' },
  { key: 'flags', label: 'Flagi' },
] as const;

const BRANCH_CSV_COLUMNS = [
  { key: 'name', label: 'Nazwa' },
  { key: 'branch_id', label: 'ID galezi' },
  { key: 'from_bus', label: 'Od wezla' },
  { key: 'to_bus', label: 'Do wezla' },
  { key: 'i_a', label: 'I [A]' },
  { key: 'p_mw', label: 'P [MW]' },
  { key: 'q_mvar', label: 'Q [Mvar]' },
  { key: 's_mva', label: 'S [MVA]' },
  { key: 'loading_pct', label: 'Obciazenie [%]' },
  { key: 'flags', label: 'Flagi' },
] as const;

const SHORT_CIRCUIT_CSV_COLUMNS = [
  { key: 'target_name', label: 'Wezel zwarcia' },
  { key: 'target_id', label: 'ID wezla' },
  { key: 'fault_type', label: 'Rodzaj zwarcia' },
  { key: 'ikss_ka', label: "Ik'' [kA]" },
  { key: 'ip_ka', label: 'ip [kA]' },
  { key: 'ith_ka', label: 'Ith [kA]' },
  { key: 'sk_mva', label: "Sk'' [MVA]" },
] as const;

const TAB_LABELS: Record<ResultsInspectorTab, string> = {
  BUSES: 'Szyny',
  BRANCHES: 'Galezie',
  SHORT_CIRCUIT: 'Zwarcia',
  TRACE: 'Slad obliczen',
};

const FLAG_LABELS: Record<string, string> = {
  SLACK: 'Wezel bilansujacy',
  VOLTAGE_VIOLATION: 'Naruszenie napiecia',
  OVERLOADED: 'Przeciazenie',
};

type ReportProfile = 'standardowy' | 'audytowy';
type ReportDetail = 'skrocony' | 'pelny';
type ReportScope = 'whole_run' | 'active_table';

const REPORT_SECTIONS_BY_TAB: Record<ResultsInspectorTab, string[]> = {
  BUSES: ['summary', 'results', 'catalog'],
  BRANCHES: ['summary', 'results', 'catalog'],
  SHORT_CIRCUIT: ['summary', 'results', 'catalog'],
  TRACE: ['summary', 'results', 'catalog', 'trace'],
};

const REPORT_FOCUS_TABLE: Record<ResultsInspectorTab, string | undefined> = {
  BUSES: 'buses',
  BRANCHES: 'branches',
  SHORT_CIRCUIT: 'short_circuit',
  TRACE: 'trace',
};

function formatNumber(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined) {
    return '';
  }
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatFlags(flags: string[]): string {
  if (!flags || flags.length === 0) {
    return '';
  }
  return flags.map((flag) => FLAG_LABELS[flag] ?? flag).join(', ');
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleString('pl-PL');
  } catch {
    return isoDate;
  }
}

function escapeCSVField(value: string): string {
  if (value.includes(';') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function generateBusCSV(rows: BusResultRow[]): string {
  const header = BUS_CSV_COLUMNS.map((column) => escapeCSVField(column.label)).join(';');
  const dataRows = rows.map((row) =>
    [
      escapeCSVField(row.name),
      escapeCSVField(row.bus_id),
      formatNumber(row.un_kv, 1),
      formatNumber(row.u_kv, 3),
      formatNumber(row.u_pu, 4),
      formatNumber(row.angle_deg, 2),
      escapeCSVField(formatFlags(row.flags)),
    ].join(';'),
  );
  return [header, ...dataRows].join('\n');
}

function generateBranchCSV(rows: BranchResultRow[]): string {
  const header = BRANCH_CSV_COLUMNS.map((column) => escapeCSVField(column.label)).join(';');
  const dataRows = rows.map((row) =>
    [
      escapeCSVField(row.name),
      escapeCSVField(row.branch_id),
      escapeCSVField(row.from_bus),
      escapeCSVField(row.to_bus),
      formatNumber(row.i_a, 1),
      formatNumber(row.p_mw, 3),
      formatNumber(row.q_mvar, 3),
      formatNumber(row.s_mva, 3),
      formatNumber(row.loading_pct, 1),
      escapeCSVField(formatFlags(row.flags)),
    ].join(';'),
  );
  return [header, ...dataRows].join('\n');
}

function generateShortCircuitCSV(rows: ShortCircuitRow[]): string {
  const header = SHORT_CIRCUIT_CSV_COLUMNS.map((column) => escapeCSVField(column.label)).join(';');
  const dataRows = rows.map((row) =>
    [
      escapeCSVField(row.target_name ?? ''),
      escapeCSVField(row.target_id),
      escapeCSVField(row.fault_type ?? ''),
      formatNumber(row.ikss_ka, 3),
      formatNumber(row.ip_ka, 3),
      formatNumber(row.ith_ka, 3),
      formatNumber(row.sk_mva, 1),
    ].join(';'),
  );
  return [header, ...dataRows].join('\n');
}

function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ResultsExport({ exportData }: ResultsExportProps) {
  const [reportProfile, setReportProfile] = useState<ReportProfile>('standardowy');
  const [reportDetail, setReportDetail] = useState<ReportDetail>('skrocony');
  const [reportScope, setReportScope] = useState<ReportScope>('whole_run');
  const { activeTab, busRows, branchRows, shortCircuitRows, runHeader } = exportData;

  const isCsvAvailable = activeTab !== 'TRACE';

  const reportOptions = useMemo<AnalysisRunReportOptions>(
    () => ({
      profile: reportProfile,
      detailLevel: reportDetail,
      scope: reportScope,
      sections: REPORT_SECTIONS_BY_TAB[activeTab],
      focusTable: REPORT_FOCUS_TABLE[activeTab],
    }),
    [activeTab, reportDetail, reportProfile, reportScope],
  );

  const handleExportCSV = useCallback(() => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const tabSuffix = activeTab.toLowerCase();

    let csvContent = '';
    if (activeTab === 'BUSES') {
      csvContent = generateBusCSV(busRows);
    } else if (activeTab === 'BRANCHES') {
      csvContent = generateBranchCSV(branchRows);
    } else if (activeTab === 'SHORT_CIRCUIT') {
      csvContent = generateShortCircuitCSV(shortCircuitRows);
    }

    if (!csvContent) {
      return;
    }

    downloadCSV(csvContent, `wyniki_${tabSuffix}_${timestamp}.csv`);
  }, [activeTab, branchRows, busRows, shortCircuitRows]);

  const handleArtifactExport = useCallback(
    async (format: AnalysisRunExportFormat) => {
      try {
        await downloadAnalysisRunExport(runHeader.project_id, runHeader.run_id, format);
        notify(`Pobrano pomocniczy eksport uruchomienia (${format.toUpperCase()}).`, 'success');
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : `Nie udalo sie pobrac pomocniczego eksportu uruchomienia (${format.toUpperCase()}).`,
          'error',
        );
      }
    },
    [runHeader.project_id, runHeader.run_id],
  );

  const handleReportExport = useCallback(
    async (format: AnalysisRunExportFormat) => {
      try {
        await downloadAnalysisRunReport(runHeader.project_id, runHeader.run_id, format, reportOptions);
        notify(`Pobrano raport końcowy (${format.toUpperCase()}).`, 'success');
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : `Nie udalo sie pobrac raportu koncowego (${format.toUpperCase()}).`,
          'error',
        );
      }
    },
    [reportOptions, runHeader.project_id, runHeader.run_id],
  );

  return (
    <div className="space-y-4" data-testid="results-export">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Generator raportu końcowego</h3>
          <p className="mt-1 text-xs text-slate-500">
            Raport korzysta ze wspolnego kontraktu wynikow, White Box i aktywnego uruchomienia.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs text-slate-600">
            <span>Profil raportu</span>
            <select
              data-testid="report-profile-select"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              value={reportProfile}
              onChange={(event) => setReportProfile(event.target.value as ReportProfile)}
            >
              <option value="standardowy">standardowy</option>
              <option value="audytowy">audytowy</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            <span>Poziom szczegolowosci</span>
            <select
              data-testid="report-detail-select"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              value={reportDetail}
              onChange={(event) => setReportDetail(event.target.value as ReportDetail)}
            >
              <option value="skrocony">skrocony</option>
              <option value="pelny">pelny</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            <span>Zakres raportu</span>
            <select
              data-testid="report-scope-select"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              value={reportScope}
              onChange={(event) => setReportScope(event.target.value as ReportScope)}
            >
              <option value="whole_run">whole_run</option>
              <option value="active_table">active_table</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="report-json-btn"
            onClick={() => void handleReportExport('json')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Raport JSON
          </button>
          <button
            type="button"
            data-testid="report-docx-btn"
            onClick={() => void handleReportExport('docx')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Raport DOCX
          </button>
          <button
            type="button"
            data-testid="report-pdf-btn"
            onClick={() => void handleReportExport('pdf')}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Raport PDF
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Pomocnicze artefakty uruchomienia</h3>
          <p className="mt-1 text-xs text-slate-500">
            Eksporty pomocnicze pozostaja dostepne dla diagnostyki, sladu i integracji zewnetrznych.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isCsvAvailable && (
            <button
              type="button"
              onClick={handleExportCSV}
              data-testid="export-csv-btn"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Eksport CSV
            </button>
          )}
          <button
            type="button"
            data-testid="export-json-btn"
            onClick={() => void handleArtifactExport('json')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Artefakt JSON
          </button>
          <button
            type="button"
            data-testid="export-docx-btn"
            onClick={() => void handleArtifactExport('docx')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Artefakt DOCX
          </button>
          <button
            type="button"
            data-testid="export-pdf-btn"
            onClick={() => void handleArtifactExport('pdf')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Artefakt PDF
          </button>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Aktywna zakladka: {TAB_LABELS[activeTab]} • Data uruchomienia: {formatDate(runHeader.created_at)}
        </div>
      </section>
    </div>
  );
}
