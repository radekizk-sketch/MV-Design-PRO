/**
 * Validation Report Panel — overall PASS/FAIL + delta tables + NC RfG badge.
 */

import { clsx } from 'clsx';

import { useNcRfgCompliance } from './api';
import type { ValidationReport } from './types';
import { ValidationDeltaTable } from './ValidationDeltaTable';

interface ValidationReportPanelProps {
  report: ValidationReport | null;
  isDerNetwork: boolean;
}

export function ValidationReportPanel({
  report,
  isDerNetwork,
}: ValidationReportPanelProps): JSX.Element {
  if (!report) {
    return (
      <div className="rounded border border-chrome-700 bg-chrome-900 p-4 text-sm text-chrome-400" data-testid="validation-report-empty">
        Uruchom walidację aby zobaczyć raport.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="validation-report-panel">
      <header
        className={clsx(
          'rounded border p-4',
          report.overall_status === 'PASS'
            ? 'border-green-500 bg-green-500/10'
            : 'border-red-500 bg-red-500/10',
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-chrome-400">
              Wynik walidacji
            </div>
            <h2 className="text-lg font-semibold text-chrome-100">{report.network_name_pl}</h2>
            <p className="mt-1 text-[11px] text-chrome-400">{report.source}</p>
          </div>
          <div
            data-testid="validation-overall-status"
            className={clsx(
              'rounded px-4 py-2 text-2xl font-bold',
              report.overall_status === 'PASS'
                ? 'bg-green-500/30 text-green-200'
                : 'bg-red-500/30 text-red-200',
            )}
          >
            {report.overall_status}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-chrome-500">Rozpływ mocy (bus)</div>
            <div className="font-mono text-chrome-200">
              {report.pf_pass_count} PASS / {report.pf_fail_count} FAIL
            </div>
          </div>
          <div>
            <div className="text-chrome-500">Rozpływ mocy (gałąź)</div>
            <div className="font-mono text-chrome-200">
              {report.pf_branch_pass_count} PASS / {report.pf_branch_fail_count} FAIL
            </div>
          </div>
          <div>
            <div className="text-chrome-500">Zwarcia</div>
            <div className="font-mono text-chrome-200">
              {report.sc_pass_count} PASS / {report.sc_fail_count} FAIL
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] italic text-chrome-500">
          Solver: {report.solver_version} · Ślad: {report.trace_step_count} kroków
        </p>
      </header>

      {isDerNetwork && <NcRfgComplianceCard networkId={report.network_id} />}

      <ValidationDeltaTable title="Rozpływ mocy - napięcia węzłów" comparisons={report.pf_comparisons} />
      {report.pf_branch_comparisons.length > 0 && (
        <ValidationDeltaTable
          title="Rozpływ mocy - przepływy gałęzi"
          comparisons={report.pf_branch_comparisons}
        />
      )}
      {report.sc_comparisons.length > 0 && (
        <ValidationDeltaTable title="Zwarcia - prądy zwarciowe" comparisons={report.sc_comparisons} />
      )}
    </div>
  );
}

function NcRfgComplianceCard({ networkId }: { networkId: string }): JSX.Element {
  const { data, isLoading } = useNcRfgCompliance(networkId);

  if (isLoading || !data) {
    return (
      <div className="rounded border border-chrome-700 bg-chrome-900 p-3 text-xs text-chrome-400">
        Sprawdzanie zgodności NC RfG...
      </div>
    );
  }

  const statusStyle = {
    compliant: 'border-green-500 bg-green-500/10 text-green-200',
    audit_required: 'border-amber-500 bg-amber-500/10 text-amber-200',
    non_compliant: 'border-red-500 bg-red-500/10 text-red-200',
    not_applicable: 'border-chrome-700 bg-chrome-900 text-chrome-500',
  }[data.status];

  const statusLabel = {
    compliant: 'Zgodny z NC RfG',
    audit_required: 'Wymaga audytu',
    non_compliant: 'Niezgodny',
    not_applicable: 'Nie dotyczy',
  }[data.status];

  return (
    <div
      data-testid="nc-rfg-compliance-card"
      className={clsx('rounded border p-3', statusStyle)}
    >
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold">Zgodność NC RfG (Network Code on Requirements for Generators)</h4>
        <span className="text-xs font-mono">
          {data.passed_count}/{data.total_count}
        </span>
      </div>
      <div className="mt-1 text-base font-bold" data-testid="nc-rfg-status">{statusLabel}</div>
      {data.missing_items.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs">
          {data.missing_items.map((item) => (
            <li key={item} className="text-chrome-300">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
