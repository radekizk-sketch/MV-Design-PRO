/**
 * DynamicValidationPanel — wykres U(t) trajectory vs NC RfG envelope.
 *
 * Używa Recharts (dependency frontend). Renderuje:
 * - Line chart: actual U(t) trajectory
 * - Area chart overlay: NC RfG envelope (U_min, U_max)
 * - PASS/FAIL summary per timepoint
 */

import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface DynamicSample {
  t_s: number;
  voltage_pu: number;
  u_min: number;
  u_max: number;
  in_envelope: boolean;
}

interface DynamicValidationResponseDto {
  network_id: string;
  overall_status: 'PASS' | 'FAIL';
  sample_count: number;
  in_envelope_count: number;
  out_of_envelope_count: number;
  samples: DynamicSample[];
}

interface DynamicValidationPanelProps {
  networkId: string;
}

export function DynamicValidationPanel({ networkId }: DynamicValidationPanelProps): JSX.Element {
  const [report, setReport] = useState<DynamicValidationResponseDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDynamic = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/reference-networks/${networkId}/validate-dynamic`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`API ${response.status}: ${await response.text()}`);
      }
      setReport((await response.json()) as DynamicValidationResponseDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(() => {
    if (!report) return [];
    return report.samples.map((s) => ({
      t_s: s.t_s,
      voltage_pu: s.voltage_pu,
      u_min: s.u_min,
      u_max: s.u_max,
      envelope_band: [s.u_min, s.u_max] as [number, number],
    }));
  }, [report]);

  return (
    <div className="space-y-3" data-testid="dynamic-validation-panel">
      <div className="rounded border border-chrome-700 bg-chrome-900 p-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="text-sm font-semibold text-chrome-200">
              Walidacja dynamiczna (FRT trajectory vs NC RfG envelope)
            </h3>
            <p className="mt-1 text-[10px] text-chrome-500">
              Porównanie trajektorii napięcia U(t) z dopuszczalnym envelopem NC RfG Annex II
              (LVRT/HVRT). Próbkowanie dt=20ms, czas zwarcia 150ms.
            </p>
          </div>
          <button
            type="button"
            data-testid="run-dynamic-button"
            disabled={loading}
            onClick={runDynamic}
            className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            title="Uruchom dynamic stability solver + porównaj U(t) z envelopem"
          >
            {loading ? 'Walidacja RMS...' : 'Uruchom walidację RMS'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-500 bg-red-500/10 p-3 text-xs text-red-200" data-testid="dynamic-error">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-3" data-testid="dynamic-report">
          <div
            className={clsx(
              'rounded border p-3',
              report.overall_status === 'PASS'
                ? 'border-green-500 bg-green-500/10 text-green-200'
                : 'border-red-500 bg-red-500/10 text-red-200',
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-chrome-400">Wynik dynamic RMS</div>
                <div className="text-lg font-bold" data-testid="dynamic-overall-status">{report.overall_status}</div>
              </div>
              <div className="text-right text-xs">
                <div>
                  W envelopie: <span className="font-mono">{report.in_envelope_count}/{report.sample_count}</span>
                </div>
                {report.out_of_envelope_count > 0 && (
                  <div className="text-red-300">
                    Poza: <span className="font-mono">{report.out_of_envelope_count}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded border border-chrome-700 bg-chrome-900 p-3">
            <h4 className="mb-2 text-xs font-semibold text-chrome-200">U(t) vs NC RfG envelope</h4>
            <div style={{ width: '100%', height: 280 }} data-testid="dynamic-chart">
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="t_s"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    label={{ value: 't [s]', position: 'insideBottom', offset: -5, fill: '#94a3b8' }}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    domain={[0, 1.4]}
                    label={{ value: 'U [pu]', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="envelope_band"
                    fill="#f59e0b"
                    fillOpacity={0.15}
                    stroke="#f59e0b"
                    strokeWidth={1}
                    name="NC RfG envelope (U_min, U_max)"
                  />
                  <Line
                    type="monotone"
                    dataKey="voltage_pu"
                    stroke={report.overall_status === 'PASS' ? '#22c55e' : '#ef4444'}
                    strokeWidth={2}
                    dot={false}
                    name="U(t) trajektoria"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
