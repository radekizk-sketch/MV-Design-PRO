/**
 * FIX-12B — Results Tables Components
 *
 * Separate table components for sensitivity, selectivity, and overload checks.
 *
 * CANONICAL ALIGNMENT:
 * - 100% Polish labels
 * - READ-ONLY views of backend data
 * - Canonical parity UX
 *
 * Zakaz P-06: koordynacja nie wydaje werdyktów — tabele pokazują liczby backendu obok
 * wartości wymaganej z kryteriów (bez plakietek „zgodne / wymaga korekty", bez kolorów oceny
 * i bez porównywania liczb z progami w interfejsie) oraz zdanie backendu z tymi liczbami.
 */

import type {
  SensitivityCheck,
  SelectivityCheck,
  OverloadCheck,
  CoordinationDevice,
} from './types';
import { LABELS } from './types';

// =============================================================================
// Helper Functions
// =============================================================================

function getDeviceName(
  deviceId: string,
  devices: CoordinationDevice[]
): string {
  const device = devices.find((d) => d.id === deviceId);
  // Nazwa z wyniku, nigdy identyfikator (karta #144).
  return device?.name ?? LABELS.devices.nieznaneUrzadzenie;
}

/** Liczba z backendu albo „—", gdy wartości nie wyznaczono (brak, nigdy liczba zastępcza). */
export function formatNumber(value: number | null | undefined, decimals: number = 1): string {
  return typeof value === 'number' ? value.toFixed(decimals) : '—';
}

/** Liczba backendu z wartością wymaganą obok — bez koloru i bez porównania (P-06). */
function LiczbaZWymagana({
  wartosc,
  wymagana,
  miejsca,
}: {
  wartosc: number | null;
  wymagana: number;
  miejsca: number;
}) {
  return (
    <>
      <span className="text-slate-700">{formatNumber(wartosc, miejsca)}</span>
      <span className="ml-1 text-xs text-slate-400">
        ({LABELS.summary.wymagany}: {formatNumber(wymagana, miejsca)})
      </span>
    </>
  );
}

// =============================================================================
// Sensitivity Table
// =============================================================================

interface SensitivityTableProps {
  checks: SensitivityCheck[];
  devices: CoordinationDevice[];
  onRowClick?: (deviceId: string) => void;
}

export function SensitivityTable({
  checks,
  devices,
  onRowClick,
}: SensitivityTableProps) {
  const labels = LABELS.checks.sensitivity;

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-slate-500">{labels.brak}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white" data-testid="sensitivity-table">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900">{labels.title}</h3>
        <p className="text-sm text-slate-500">{labels.subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.device}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.iFaultMin}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.iPickup}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.ratio}
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.notes}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {checks.map((check) => (
              <tr
                key={check.device_id}
                className={`hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(check.device_id)}
                data-testid={`sensitivity-row-${check.device_id}`}
              >
                <td className="px-4 py-2 text-sm font-medium text-slate-900">
                  {getDeviceName(check.device_id, devices)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.i_fault_min_a)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.i_pickup_a)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm">
                  <LiczbaZWymagana wartosc={check.ratio} wymagana={check.required_ratio} miejsca={2} />
                </td>
                <td className="max-w-md whitespace-normal px-4 py-2 text-sm text-slate-500">
                  {check.notes_pl}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Selectivity Table
// =============================================================================

interface SelectivityTableProps {
  checks: SelectivityCheck[];
  devices: CoordinationDevice[];
  onRowClick?: (upstreamId: string, downstreamId: string) => void;
}

export function SelectivityTable({
  checks,
  devices,
  onRowClick,
}: SelectivityTableProps) {
  const labels = LABELS.checks.selectivity;

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-slate-500">{labels.minDevicesRequired}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white" data-testid="selectivity-table">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900">{labels.title}</h3>
        <p className="text-sm text-slate-500">{labels.subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.downstream}
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.upstream}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.analysisCurrent}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.tDownstream}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.tUpstream}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.deltaT}
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.stan}
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.notes}
              </th>
              {onRowClick && (
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                  {labels.action}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {checks.map((check, idx) => (
              <tr
                key={`${check.upstream_device_id}-${check.downstream_device_id}-${idx}`}
                className={`hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() =>
                  onRowClick?.(check.upstream_device_id, check.downstream_device_id)
                }
              >
                <td className="px-4 py-2 text-sm font-medium text-slate-900">
                  {getDeviceName(check.downstream_device_id, devices)}
                </td>
                <td className="px-4 py-2 text-sm font-medium text-slate-900">
                  {getDeviceName(check.upstream_device_id, devices)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.analysis_current_a)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.t_downstream_s, 3)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.t_upstream_s, 3)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm">
                  {/* Odstęp obok wymaganego, bez koloru i bez oceny (P-06). */}
                  <LiczbaZWymagana
                    wartosc={check.margin_s}
                    wymagana={check.required_margin_s}
                    miejsca={3}
                  />
                </td>
                <td className="px-4 py-2 text-sm text-slate-700" data-testid="selectivity-stan">
                  {check.stan_pl}
                </td>
                <td
                  className="max-w-md whitespace-normal px-4 py-2 text-sm text-slate-500"
                  data-testid="selectivity-notes"
                >
                  {check.notes_pl}
                </td>
                {onRowClick && (
                  <td className="px-4 py-2 text-right">
                    {/* WIDOCZNA akcja (V12K-261). Klik w wiersz zostaje — przycisk go NIE
                        zastępuje, tylko nazywa. `stopPropagation`, żeby jedno kliknięcie nie
                        odpalało obu ścieżek. W każdym wierszu: koordynacja nie wydaje
                        werdyktu (P-06), więc to projektant decyduje o zmianie nastaw. */}
                    <button
                      type="button"
                      data-testid={`selectivity-fix-${check.upstream_device_id}`}
                      title={labels.fixSettingsTitle}
                      className="min-h-[44px] rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRowClick(check.upstream_device_id, check.downstream_device_id);
                      }}
                    >
                      {labels.fixSettings}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Overload Table
// =============================================================================

interface OverloadTableProps {
  checks: OverloadCheck[];
  devices: CoordinationDevice[];
  onRowClick?: (deviceId: string) => void;
}

export function OverloadTable({
  checks,
  devices,
  onRowClick,
}: OverloadTableProps) {
  const labels = LABELS.checks.overload;

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-slate-500">{labels.brak}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white" data-testid="overload-table">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900">{labels.title}</h3>
        <p className="text-sm text-slate-500">{labels.subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.device}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.iOperating}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.iPickup}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.ratio}
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.notes}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {checks.map((check) => (
              <tr
                key={check.device_id}
                className={`hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(check.device_id)}
                data-testid={`overload-row-${check.device_id}`}
              >
                <td className="px-4 py-2 text-sm font-medium text-slate-900">
                  {getDeviceName(check.device_id, devices)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.i_operating_a)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.i_pickup_a)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm">
                  <LiczbaZWymagana wartosc={check.ratio} wymagana={check.required_ratio} miejsca={2} />
                </td>
                <td className="max-w-md whitespace-normal px-4 py-2 text-sm text-slate-500">
                  {check.notes_pl}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Summary Card Component — liczba zbiorcza obok wymaganej (bez werdyktu, P-06)
// =============================================================================

interface SummaryCardProps {
  title: string;
  /** Najmniejsza wartość sprawdzeń (backend `summary`) — `null`, gdy żadnej nie wyznaczono. */
  wartosc: number | null;
  /** Wartość wymagana z kryteriów projektowych (backend `summary.kryteria`). */
  wymagana: number;
  miejsca: number;
  /** Sprawdzenia bez wyznaczonej wartości — liczone w całości, nigdy pomijane. */
  bezWartosci: number;
  testid: string;
}

export function SummaryCard({
  title,
  wartosc,
  wymagana,
  miejsca,
  bezWartosci,
  testid,
}: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid={testid}>
      <h4 className="font-medium text-slate-700">{title}</h4>
      <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
        {formatNumber(wartosc, miejsca)}
      </p>
      <p className="text-sm text-slate-500">
        {LABELS.summary.wymagany}: {formatNumber(wymagana, miejsca)}
      </p>
      {bezWartosci > 0 ? (
        <p className="mt-1 text-sm text-slate-600" data-testid={`${testid}-bez-wartosci`}>
          {LABELS.summary.bezWartosci}: {bezWartosci}
        </p>
      ) : null}
    </div>
  );
}
