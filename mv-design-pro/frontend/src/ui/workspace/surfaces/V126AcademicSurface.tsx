import { useMemo, useState } from 'react';
import { useAppStateStore } from '../../app-state';
import type { WorkspaceSurfaceDescriptor } from '../types';

type V126AnalysisType =
  | 'power_quality_harmonics'
  | 'voltage_stability'
  | 'reliability_contingency'
  | 'earthing_safety'
  | 'insulation_coordination'
  | 'earth_fault_detection'
  | 'transient_trv'
  | 'motor_starting'
  | 'hosting_capacity'
  | 'opf_loss_lcc'
  | 'benchmark_validation'
  | 'uncertainty_sensitivity';

interface V126RunEnvelope {
  run_id: string;
  status: string;
  result_url: string;
  trace_url: string;
  proof_url: string;
  report_url: string;
  deterministic_hash: string;
}

interface V126ResultEnvelope {
  result: {
    result: Record<string, unknown>;
    white_box_trace: Array<Record<string, unknown>>;
    deterministic_hash: string;
  };
}

interface V126ProofEnvelope {
  proof_id: string;
  proof_hash: string;
  trace_step_count: number;
  steps: Array<Record<string, unknown>>;
}

interface V126ReportEnvelope {
  report_id: string;
  report_hash: string;
  export_policy: string;
  sections: Array<{
    section_id: string;
    title: string;
    metrics: Array<{ label: string; value: unknown }>;
  }>;
}

const SCREEN_TO_ANALYSIS: Partial<Record<string, V126AnalysisType>> = {
  'E-40': 'power_quality_harmonics',
  'E-41': 'voltage_stability',
  'E-42': 'reliability_contingency',
  'E-43': 'earthing_safety',
  'E-44': 'insulation_coordination',
  'E-45': 'transient_trv',
  'E-46': 'motor_starting',
  'E-47': 'hosting_capacity',
  'E-48': 'opf_loss_lcc',
  'E-49': 'benchmark_validation',
  'E-50': 'uncertainty_sensitivity',
};

const ANALYSIS_LABELS: Record<V126AnalysisType, string> = {
  power_quality_harmonics: 'Jakość energii i harmoniczne',
  voltage_stability: 'Stabilność napięciowa',
  reliability_contingency: 'Niezawodność i kontyngencja',
  earthing_safety: 'Uziemienia i bezpieczeństwo',
  insulation_coordination: 'Koordynacja izolacji',
  earth_fault_detection: 'Detekcja ziemnozwarciowa',
  transient_trv: 'Stany przejściowe i TRV',
  motor_starting: 'Rozruch silników',
  hosting_capacity: 'Hosting capacity OZE',
  opf_loss_lcc: 'OPF i straty',
  benchmark_validation: 'Walidacja benchmarkowa',
  uncertainty_sensitivity: 'Niepewność i wrażliwość',
};

function defaultParameters(analysis: V126AnalysisType): Record<string, unknown> {
  if (analysis === 'earthing_safety') {
    return {
      earthing: {
        gpz_ref: 'GPZ',
        rho1_ohm_m: 100,
        rho2_ohm_m: 500,
        h1_m: 0.5,
        length_m: 60,
        width_m: 40,
        mesh_spacing_m: 6,
        buried_depth_m: 0.6,
        fault_current_ka: 10,
        fault_clearing_time_s: 0.5,
      },
    };
  }
  if (analysis === 'insulation_coordination') {
    // G-STK-7: ograniczniki przepięć pochodzą z MODELU (aparaty pierwotne pól
    // kind=SURGE_ARRESTER → build_v126_insulation_from_enm). Brak fabrykowanych
    // parametrów — pusty model = uczciwy stan zerowy „brak ograniczników".
    return {};
  }
  if (analysis === 'motor_starting') {
    return {
      motors: [
        {
          ref: 'MOTOR_SN_1',
          bus_ref: 'BUS_SN',
          rated_kw: 630,
          rated_voltage_kv: 6,
          locked_rotor_multiplier: 6,
          start_time_s: 8,
        },
      ],
    };
  }
  if (analysis === 'hosting_capacity') {
    return { hosting_monte_carlo_n: 1000 };
  }
  if (analysis === 'earth_fault_detection') {
    return {
      neutral_grounding: 'petersen_tuned',
      relay_methods: ['wattmetric', 'admittance', 'transient_directional', 'fifth_harmonic'],
    };
  }
  return {};
}

function summarizeResult(value: unknown, prefix = ''): Array<{ label: string; value: string }> {
  if (!value || typeof value !== 'object') {
    return [{ label: prefix || 'Wynik', value: String(value ?? '-') }];
  }
  const rows: Array<{ label: string; value: string }> = [];
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    const label = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(item)) {
      rows.push({ label, value: `${item.length} pozycji` });
      const first = item[0];
      if (first && typeof first === 'object') {
        Object.entries(first as Record<string, unknown>).slice(0, 6).forEach(([childKey, childValue]) => {
          rows.push({ label: `${label}[0].${childKey}`, value: String(childValue ?? '-') });
        });
      }
    } else if (item && typeof item === 'object') {
      rows.push(...summarizeResult(item, label).slice(0, 8));
    } else {
      rows.push({ label, value: String(item ?? '-') });
    }
  });
  return rows.slice(0, 18);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function V126AcademicSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }): JSX.Element {
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const analysis = SCREEN_TO_ANALYSIS[surface.screenCode] ?? 'earth_fault_detection';
  const [run, setRun] = useState<V126RunEnvelope | null>(null);
  const [result, setResult] = useState<V126ResultEnvelope | null>(null);
  const [proof, setProof] = useState<V126ProofEnvelope | null>(null);
  const [report, setReport] = useState<V126ReportEnvelope | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const parameters = useMemo(() => defaultParameters(analysis), [analysis]);
  const summaryRows = useMemo(() => summarizeResult(result?.result.result ?? null), [result]);
  const traceRows = result?.result.white_box_trace ?? [];

  const runAnalysis = async (): Promise<void> => {
    if (!activeCaseId) {
      setError('Brak aktywnego przypadku obliczeniowego.');
      setStatus('error');
      return;
    }
    setStatus('running');
    setError(null);
    try {
      const created = await fetchJson<V126RunEnvelope>(
        `/api/cases/${activeCaseId}/runs/v126/${analysis}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters }),
        },
      );
      const loaded = await fetchJson<V126ResultEnvelope>(created.result_url);
      const loadedProof = await fetchJson<V126ProofEnvelope>(created.proof_url);
      const loadedReport = await fetchJson<V126ReportEnvelope>(created.report_url);
      setRun(created);
      setResult(loaded);
      setProof(loadedProof);
      setReport(loadedReport);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd uruchomienia V12.6.');
      setStatus('error');
    }
  };

  return (
    <div className="space-y-4" data-testid={`v126-surface-${surface.screenCode}`}>
      <section className="rounded border border-slate-200 bg-white p-4 text-slate-900">
        <div className="text-xs font-semibold uppercase tracking-wide text-cyan-700">V12.6</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{ANALYSIS_LABELS[analysis]}</h2>
            <div className="mt-1 text-xs text-slate-600">
              Wejście: committed ENM aktywnego przypadku. Wynik: AcademicAnalysisResultV1 z trace, proof, raportem i hashem.
            </div>
          </div>
          <button
            type="button"
            className="rounded border border-cyan-400 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void runAnalysis()}
            disabled={status === 'running'}
          >
            {status === 'running' ? 'Uruchamianie' : 'Uruchom analizę'}
          </button>
        </div>
        {!activeCaseId ? (
          <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
            Aktywuj przypadek obliczeniowy przed uruchomieniem V12.6.
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
      </section>

      {run ? (
        <section className="rounded border border-slate-200 bg-white p-4 text-slate-900">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-[11px] uppercase text-slate-500">Identyfikator przebiegu</div>
              <div className="break-all text-xs">{run.run_id}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-slate-500">Status</div>
              <div className="text-xs">{run.status}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-slate-500">Hash deterministyczny</div>
              <div className="break-all text-xs">{run.deterministic_hash}</div>
            </div>
          </div>
        </section>
      ) : null}

      {result ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <section className="rounded border border-slate-200 bg-white p-4 text-slate-900">
            <h3 className="text-sm font-semibold">Wynik</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {summaryRows.map((row) => (
                <div key={`${row.label}:${row.value}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <div className="text-[11px] uppercase text-slate-500">{row.label}</div>
                  <div className="mt-1 break-words text-xs text-slate-900">{row.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white p-4 text-slate-900">
            <h3 className="text-sm font-semibold">White Box</h3>
            <div className="mt-3 space-y-2">
              {traceRows.slice(0, 8).map((step) => (
                <div key={String(step.proof_ref)} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <div className="text-xs font-semibold text-cyan-700">{String(step.key ?? '-')}</div>
                  <div className="mt-1 text-[11px] text-slate-600">{String(step.formula ?? '-')}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{String(step.unit_check ?? '-')}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {proof && report ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded border border-slate-200 bg-white p-4 text-slate-900">
            <h3 className="text-sm font-semibold">Dowód</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                <div className="text-[11px] uppercase text-slate-500">Identyfikator dowodu</div>
                <div className="mt-1 break-all text-xs">{proof.proof_id}</div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                <div className="text-[11px] uppercase text-slate-500">Hash dowodu</div>
                <div className="mt-1 break-all text-xs">{proof.proof_hash}</div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                <div className="text-[11px] uppercase text-slate-500">Kroki</div>
                <div className="mt-1 text-xs">{proof.trace_step_count}</div>
              </div>
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white p-4 text-slate-900">
            <h3 className="text-sm font-semibold">Raport</h3>
            <div className="mt-3 space-y-2">
              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                <div className="text-[11px] uppercase text-slate-500">Raport</div>
                <div className="mt-1 break-all text-xs">{report.report_id}</div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                <div className="text-[11px] uppercase text-slate-500">Polityka eksportu</div>
                <div className="mt-1 text-xs">{report.export_policy}</div>
              </div>
              {report.sections.slice(0, 3).map((section) => (
                <div key={section.section_id} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <div className="text-xs font-semibold text-cyan-700">{section.title}</div>
                  <div className="mt-1 text-[11px] text-slate-600">{section.metrics.length} metryk</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
