/**
 * Koordynacja zabezpieczeń nadprądowych (E-28) — urządzenia i nastawy Z MODELU.
 *
 * Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21): urządzenia i nastawy żyją w modelu sieci
 * (edycja: ekran „Zabezpieczenia i automatyka" albo karta elementu). Ten ekran:
 * - wskazuje biegi wejściowe (zwarcie MAX i MIN — scenariusz zapisany na biegu — oraz
 *   rozpływ) z zakończonych biegów przypadku,
 * - uruchamia koordynację backendu (`POST /api/protection-coordination/projects/{id}/run`
 *   z samymi identyfikatorami biegów),
 * - pokazuje wynik: urządzenia z nastawami, odmowy z akcją naprawczą, pary stopniowania
 *   z topologii, czułość/selektywność/przeciążalność ze zdaniem uzasadnienia, TCC, ślad
 *   White Box i eksport PDF/DOCX.
 *
 * Dawny ekran (szablony urządzeń, nastawy w konfiguracji przypadku, lokalizacje wskazywane
 * ręcznie, prądy budowane w przeglądarce) skasowany. ZERO fizyki w UI.
 */

import { useCallback, useMemo, useState } from 'react';

import type { AnalysisStatus, CoordinationResult } from './types';
import { LABELS } from './types';
import {
  getCoordinationResult,
  getExportDocxUrl,
  getExportPdfUrl,
  runCoordinationAnalysis,
} from './api';
import { InformacjeAudytowe } from '../../ui2/wyniki/wzorzec/InformacjeAudytowe';
import { useShellStore } from '../../ui2/shell/useShellStore';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import {
  SensitivityTable,
  SelectivityTable,
  OverloadTable,
  SummaryCard,
} from './ResultsTables';
import { TccChartFromResult } from './TccChart';
import { TracePanel } from './TracePanel';
import { TccInterpretationPanel } from './TccInterpretationPanel';
import { useAppStateStore } from '../app-state/store';
import { useBiegiKoordynacji, type BiegiKoordynacji } from './biegiKoordynacji';

type TabId = 'summary' | 'sensitivity' | 'selectivity' | 'overload' | 'tcc' | 'trace';

// =============================================================================
// Kontekst
// =============================================================================

function ContextSelector() {
  const projectId = useAppStateStore((state) => state.activeProjectId);
  const caseId = useAppStateStore((state) => state.activeCaseId);
  const snapshotId = useAppStateStore((state) => state.activeSnapshotId);
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const caseName = useAppStateStore((state) => state.activeCaseName);
  const labels = LABELS.context;
  const rewizja = useSnapshotStore((stan) => stan.snapshot?.header?.revision ?? null);
  const trybEkspercki = useShellStore((stan) => stan.advancementMode) === 'expert';
  const stanModelu = snapshotId
    ? rewizja !== null
      ? labels.rewizjaModelu(rewizja)
      : labels.stanModeluWczytany
    : labels.selectSnapshot;
  const audyt = [
    ...(projectId ? [{ etykieta: labels.identyfikatorProjektu, wartosc: projectId }] : []),
    ...(caseId ? [{ etykieta: labels.identyfikatorWariantu, wartosc: caseId }] : []),
    ...(snapshotId ? [{ etykieta: labels.identyfikatorStanuModelu, wartosc: snapshotId }] : []),
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{labels.project}:</span>
          <span className="font-medium text-slate-900">
            {projectId ? projectName ?? labels.bezNazwy : labels.noContext}
          </span>
        </div>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{labels.studyCase}:</span>
          <span className="font-medium text-slate-900">
            {caseId ? caseName ?? labels.bezNazwy : labels.selectCase}
          </span>
        </div>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{labels.snapshot}:</span>
          <span className="font-medium text-slate-900">{stanModelu}</span>
        </div>
      </div>
      <InformacjeAudytowe
        trybEkspercki={trybEkspercki}
        testid="koordynacja-kontekst-informacje-audytowe"
        wiersze={audyt}
      />
    </div>
  );
}

// =============================================================================
// Biegi wejściowe
// =============================================================================

function PanelBiegow({ biegi }: { biegi: BiegiKoordynacji }) {
  const L = LABELS.biegi;
  const wiersz = (etykieta: string, id: string | null, testid: string) => (
    <div className="flex justify-between gap-4 text-sm" data-testid={testid}>
      <span className="text-slate-600">{etykieta}</span>
      <span className={id ? 'text-emerald-700' : 'text-amber-700'}>
        {id ? '✓' : L.brak}
      </span>
    </div>
  );
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4" data-testid="coordination-runs">
      <h3 className="font-semibold text-slate-900">{L.tytul}</h3>
      {wiersz(L.max, biegi.max, 'coordination-run-max')}
      {wiersz(L.min, biegi.min, 'coordination-run-min')}
      {wiersz(L.pf, biegi.pf, 'coordination-run-pf')}
      {!biegi.max || !biegi.min ? (
        <p className="text-sm text-amber-800" data-testid="coordination-runs-missing">
          {L.brakMaxMin}
        </p>
      ) : !biegi.pf ? (
        <p className="text-sm text-slate-500">{L.brakPf}</p>
      ) : null}
    </div>
  );
}

// =============================================================================
// Urządzenia wyniku
// =============================================================================

function PanelUrzadzen({ result }: { result: CoordinationResult }) {
  const L = LABELS.devices;
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const nazwa = (ref: string) =>
    result.devices.find((d) => d.id === ref)?.name ?? L.nieznaneUrzadzenie;
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" data-testid="coordination-devices">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{L.title}</h3>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          data-testid="coordination-edit-settings"
          onClick={() => openRouteSurface('E-27')}
        >
          {L.zmienNastawy}
        </button>
      </div>
      <p className="text-xs text-slate-500">{L.opis}</p>
      <ul className="space-y-2">
        {result.devices.map((d) => (
          <li key={d.id} className="rounded border border-slate-200 p-2 text-sm" data-testid={`coordination-device-${d.id}`}>
            <div className="font-medium text-slate-900">{d.name}</div>
            <div className="text-xs text-slate-500">
              {d.device_type === 'FUSE' ? L.bezpiecznik : L.przekaznik}
            </div>
            {d.nastawy?.stopnie.map((s) => (
              <div key={s.funkcja} className="text-xs text-slate-700">
                {s.etykieta_pl}: {s.prog_pierwotny_a.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} A,{' '}
                {s.krzywa_pl}
                {s.tms !== null ? `, TMS ${s.tms.toLocaleString('pl-PL')}` : ''}
                {s.zwloka_s !== null ? `, ${s.zwloka_s.toLocaleString('pl-PL')} s` : ''}
              </div>
            ))}
          </li>
        ))}
      </ul>
      {result.pary.length > 0 ? (
        <div data-testid="coordination-pairs">
          <h4 className="text-sm font-medium text-slate-800">{L.paryTytul}</h4>
          <ul className="text-xs text-slate-700">
            {result.pary.map((p) => (
              <li key={`${p.nadrzedne_ref}-${p.podrzedne_ref}`}>
                {nazwa(p.podrzedne_ref)} ({L.podrzedne}) → {nazwa(p.nadrzedne_ref)} ({L.nadrzedne})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.odmowy_urzadzen.length > 0 ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2" data-testid="coordination-refusals">
          <h4 className="text-sm font-medium text-amber-900">{L.odmowyTytul}</h4>
          <ul className="space-y-1 text-xs text-amber-900">
            {result.odmowy_urzadzen.map((o) => (
              <li key={o.urzadzenie_ref}>
                <span className="font-medium">{o.nazwa_pl}:</span>{' '}
                {o.braki.map((b) => `${b.komunikat_pl} ${b.akcja_naprawcza_pl}`).join(' ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.odmowy_par.length > 0 ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2" data-testid="coordination-pair-refusals">
          <h4 className="text-sm font-medium text-amber-900">{L.odmowyParTytul}</h4>
          <ul className="space-y-1 text-xs text-amber-900">
            {result.odmowy_par.map((o) => (
              <li key={`${o.podrzedne_ref}-${o.kod}`}>
                {nazwa(o.podrzedne_ref)}: {o.powod_pl}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.pominiete.length > 0 ? (
        <div data-testid="coordination-skipped">
          <h4 className="text-sm font-medium text-slate-800">{L.pominieteTytul}</h4>
          <ul className="text-xs text-slate-600">
            {result.pominiete.map((p) => (
              <li key={p.urzadzenie_ref}>
                {p.nazwa_pl}: {p.powod_pl}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// =============================================================================
// Podsumowanie i zakładki
// =============================================================================

function SummaryTab({ result }: { result: CoordinationResult }) {
  const { summary } = result;
  const labels = LABELS.summary;
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6" data-testid="coordination-summary">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{labels.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{labels.opis}</p>
        </div>
        <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <div className="flex justify-between rounded bg-slate-50 px-3 py-2">
            <span className="text-slate-600">{labels.totalDevices}</span>
            <span className="font-medium text-slate-900">{summary.total_devices}</span>
          </div>
          <div className="flex justify-between rounded bg-slate-50 px-3 py-2">
            <span className="text-slate-600">{labels.totalChecks}</span>
            <span className="font-medium text-slate-900">{summary.total_checks}</span>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <a
            href={getExportPdfUrl(result.run_id)}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
            data-testid="coordination-export-pdf"
          >
            {LABELS.actions.exportPdf}
          </a>
          <a
            href={getExportDocxUrl(result.run_id)}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
            data-testid="coordination-export-docx"
          >
            {LABELS.actions.exportDocx}
          </a>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title={labels.najmniejszyIlorazCzulosci}
          wartosc={summary.sensitivity.najmniejszy_iloraz}
          wymagana={summary.kryteria.sensitivity_ratio_required}
          miejsca={2}
          bezWartosci={summary.sensitivity.bez_wartosci}
          testid="summary-card-czulosc"
        />
        <SummaryCard
          title={labels.najmniejszyOdstep}
          wartosc={summary.selectivity.najmniejszy_odstep_s}
          wymagana={summary.kryteria.minimum_grading_margin_s}
          miejsca={3}
          bezWartosci={summary.selectivity.bez_odstepu}
          testid="summary-card-selektywnosc"
        />
        <SummaryCard
          title={labels.najmniejszyIlorazPrzeciazalnosci}
          wartosc={summary.overload.najmniejszy_iloraz}
          wymagana={summary.kryteria.overload_ratio_required}
          miejsca={2}
          bezWartosci={summary.overload.bez_wartosci}
          testid="summary-card-przeciazalnosc"
        />
      </div>
    </div>
  );
}

function TabNavigation({
  activeTab,
  onTabChange,
  result,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  result: CoordinationResult;
}) {
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'summary', label: LABELS.tabs.summary },
    { id: 'sensitivity', label: LABELS.tabs.sensitivity, count: result.sensitivity_checks.length },
    { id: 'selectivity', label: LABELS.tabs.selectivity, count: result.selectivity_checks.length },
    { id: 'overload', label: LABELS.tabs.overload, count: result.overload_checks.length },
    { id: 'tcc', label: LABELS.tabs.tcc },
    { id: 'trace', label: LABELS.tabs.trace, count: result.trace_steps.length },
  ];
  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1" data-testid="tab-navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'bg-white text-slate-900 shadow'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          data-testid={`tab-${tab.id}`}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="rounded-full bg-slate-200 px-1.5 text-xs">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Ekran
// =============================================================================

export function ProtectionCoordinationPage() {
  const projectId = useAppStateStore((state) => state.activeProjectId);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);

  const biegi = useBiegiKoordynacji();
  const [result, setResult] = useState<CoordinationResult | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('summary');

  const handleRun = useCallback(async () => {
    if (!projectId) {
      setStatus('ERROR');
      setError('Wybierz aktywny projekt przed uruchomieniem koordynacji zabezpieczeń.');
      return;
    }
    if (!biegi.max || !biegi.min) {
      setStatus('ERROR');
      setError(LABELS.biegi.brakMaxMin);
      return;
    }
    setStatus('RUNNING');
    setError(null);
    try {
      const summary = await runCoordinationAnalysis(projectId, {
        sc_run_id: biegi.max,
        sc_run_id_min: biegi.min,
        ...(biegi.pf ? { pf_run_id: biegi.pf } : {}),
      });
      setResult(await getCoordinationResult(summary.run_id));
      setStatus('SUCCESS');
      setActiveTab('summary');
    } catch (err) {
      setStatus('ERROR');
      setError(err instanceof Error ? err.message : LABELS.status.error);
    }
  }, [biegi, projectId]);

  const statusText = useMemo(() => {
    if (status === 'RUNNING') return LABELS.status.running;
    if (status === 'SUCCESS') return LABELS.status.success;
    if (status === 'ERROR') return LABELS.status.error;
    return LABELS.status.idle;
  }, [status]);

  const doEdycjiNastaw = () => openRouteSurface('E-27');

  return (
    <div className="min-h-screen bg-slate-50 p-6" data-testid="protection-coordination-page">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{LABELS.title}</h1>
          <p className="text-slate-600">{LABELS.subtitle}</p>
        </div>
        <div className="mb-6">
          <ContextSelector />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <PanelBiegow biegi={biegi} />
            <button
              onClick={() => void handleRun()}
              disabled={status === 'RUNNING'}
              className="w-full rounded bg-emerald-600 px-4 py-3 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="run-analysis-button"
            >
              {status === 'RUNNING' ? LABELS.status.running : LABELS.actions.runAnalysis}
            </button>
            {status !== 'IDLE' && (
              <div
                data-testid="coordination-status"
                role={status === 'ERROR' ? 'alert' : undefined}
                className={`rounded p-3 text-sm ${
                  status === 'ERROR'
                    ? 'border border-rose-200 bg-rose-50 text-rose-700'
                    : status === 'SUCCESS'
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-blue-200 bg-blue-50 text-blue-700'
                }`}
              >
                {error || statusText}
              </div>
            )}
            {result ? <PanelUrzadzen result={result} /> : null}
          </div>
          <div className="lg:col-span-2">
            {result ? (
              <div className="space-y-4">
                <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} result={result} />
                {activeTab === 'summary' && <SummaryTab result={result} />}
                {activeTab === 'sensitivity' && (
                  <SensitivityTable
                    checks={result.sensitivity_checks}
                    devices={result.devices}
                    onRowClick={doEdycjiNastaw}
                  />
                )}
                {activeTab === 'selectivity' && (
                  <SelectivityTable
                    checks={result.selectivity_checks}
                    devices={result.devices}
                    onRowClick={doEdycjiNastaw}
                  />
                )}
                {activeTab === 'overload' && (
                  <OverloadTable
                    checks={result.overload_checks}
                    devices={result.devices}
                    onRowClick={doEdycjiNastaw}
                  />
                )}
                {activeTab === 'tcc' && (
                  <div className="flex flex-col gap-4 xl:flex-row">
                    <div className="min-w-0 flex-1">
                      <TccChartFromResult result={result} devices={result.devices} height={500} />
                    </div>
                    <div className="flex-shrink-0 xl:w-96">
                      <TccInterpretationPanel
                        selectivityChecks={result.selectivity_checks}
                        devices={result.devices}
                      />
                    </div>
                  </div>
                )}
                {activeTab === 'trace' && (
                  <TracePanel
                    traceSteps={result.trace_steps}
                    runId={result.run_id}
                    createdAt={result.created_at}
                  />
                )}
              </div>
            ) : (
              <div className="flex h-96 items-center justify-center rounded-lg border border-slate-200 bg-white">
                <p className="text-slate-500" data-testid="coordination-empty">
                  {LABELS.devices.brak}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProtectionCoordinationPage;
