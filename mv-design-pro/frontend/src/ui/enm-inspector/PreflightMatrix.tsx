/**
 * PreflightMatrix — Macierz dostępności analiz przed RUN (v4.2).
 *
 * Tabela:
 *   SC 3F | SC 1F | LF | Protection
 *   Status + powód (jeśli BLOCKED)
 *
 * Wyświetlana przed K10 (RUN).
 * Brak „magii" — wszystko z ED-ENGINE.
 *
 * CANONICAL: Polski komunikaty.
 */

import type { PreflightReport, PreflightCheckEntry } from './types';
import { KLASY_TONU_NAGLOWKA, naglowekPreflight } from './naglowekDiagnostyki';

interface PreflightMatrixProps {
  report: PreflightReport | null;
  loading?: boolean;
}

export function PreflightMatrix({ report, loading = false }: PreflightMatrixProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-slate-400">
        Ładowanie macierzy analiz...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-slate-400">
        Brak danych pre-flight
      </div>
    );
  }

  const naglowek = naglowekPreflight(report.checks);

  return (
    <div className="flex flex-col h-full" data-testid="preflight-matrix">
      {/* Nagłówek: liczba analiz dopuszczonych przez macierz (bez zbiorczej flagi gotowości) */}
      <div
        className={`px-3 py-2 border-b ${KLASY_TONU_NAGLOWKA[naglowek.ton]}`}
        data-testid="preflight-readiness"
        data-ton={naglowek.ton}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">{naglowek.tekst}</span>
          <div className="flex gap-2 text-xs">
            {report.blocker_count > 0 && (
              <span className="text-rose-600">
                {report.blocker_count} blokad
              </span>
            )}
            {report.warning_count > 0 && (
              <span className="text-amber-600">
                {report.warning_count} ostrzeżeń
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Analysis matrix table */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <table className="w-full text-xs" data-testid="preflight-table">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-1 text-slate-500 font-medium">
                Analiza
              </th>
              <th className="text-center py-1 text-slate-500 font-medium w-24">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {report.checks.map((check) => (
              <PreflightRow key={check.analysis_type} check={check} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreflightRow({ check }: { check: PreflightCheckEntry }) {
  const isAvailable = check.status === 'AVAILABLE';

  return (
    <tr
      className="border-b border-slate-50"
      data-testid={`preflight-row-${check.analysis_type}`}
    >
      <td className="py-2">
        <span className="text-slate-700">{check.analysis_label_pl}</span>
        {!isAvailable && check.reason_pl && (
          <p className="text-xs text-rose-500 mt-0.5">{check.reason_pl}</p>
        )}
        {!isAvailable && check.blocking_codes.length > 0 && (
          <div className="flex gap-1 mt-0.5">
            {check.blocking_codes.map((code) => (
              <span
                key={code}
                className="text-xs font-mono px-1 bg-rose-50 text-rose-600 rounded"
              >
                {code}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="py-2 text-center">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            isAvailable
              ? 'bg-green-100 text-green-700'
              : 'bg-rose-100 text-rose-700'
          }`}
        >
          {isAvailable ? 'Dostępna' : 'Zablokowana'}
        </span>
      </td>
    </tr>
  );
}
