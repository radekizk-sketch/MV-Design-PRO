/**
 * routerExtensionSurfaces — Surface wrappers + trigger actions
 * (Plan Phase 1 etapy 13/14/17).
 *
 * Eksporty:
 * - AuditTrailSurface         — wrap dla E-09 (Historia i audyt)
 * - ReportSurfaceOsdAndProfileActions — section z modalami OsdDataForm +
 *   ReportProfileSelector wstawiana wewnątrz ReportSurface (E-37 ext)
 *
 * Pure UI delegate components; brak fizyki / mutacji modelu.
 */

import { useMemo, useState } from 'react';
import type { WorkspaceSurfaceDescriptor } from './types';
import { AuditTrailPanel } from '../audit/AuditTrailPanel';
import { OsdDataForm } from '../reports/OsdDataForm';
import { ReportProfileSelector } from '../reports/ReportProfileSelector';
import type { ReportProfileConfig } from '../reports/ReportProfileSelector';
import {
  ComparisonWizard,
  type ComparisonRun,
  type ComparisonRunType,
} from '../comparison';
import { useExecutionRunsStore } from '../study-cases/runStore';
import { useAppStateStore } from '../app-state';
import { useSelectionStore } from '../selection';

function selectElementByRef(
  selectElement: (el: { id: string; type: 'Bus'; name: string } | null) => void,
  ref: string,
): void {
  selectElement({ id: ref, type: 'Bus', name: ref });
}

export function AuditTrailSurface({ surface: _surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const selectElement = useSelectionStore((state) => state.selectElement);
  return (
    <div className="space-y-4 p-4">
      <AuditTrailPanel onSelectElement={(ref) => selectElementByRef(selectElement, ref)} />
    </div>
  );
}

/**
 * AnalysisSurfaceComparisonWizard — tab "comparison_wizard" w E-35 AnalysisSurface.
 * Renderuje ComparisonWizard A/B (Etap 18 dostawy).
 */
export function AnalysisSurfaceComparisonWizard({
  onCompleted,
  onCancel,
}: {
  onCompleted?: (runA: ComparisonRun, runB: ComparisonRun, comparisonType: ComparisonRunType) => void;
  onCancel?: () => void;
}): JSX.Element {
  const executionRuns = useExecutionRunsStore((state) => state.runs);
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const availableRuns: ComparisonRun[] = useMemo(
    () =>
      executionRuns
        .filter((r) => r.status === 'DONE')
        .map((r) => {
          const isSc = r.analysis_type.startsWith('SC_');
          const isLf = r.analysis_type === 'LOAD_FLOW';
          const isPhase = r.analysis_type === 'PHASE_STATE_SN';
          const runType: ComparisonRunType = isSc
            ? 'short_circuit'
            : isLf
              ? 'power_flow'
              : isPhase
                ? 'voltage_profile'
                : 'protection';
          return {
            id: r.id,
            label: `${projectName ?? 'Wariant'} — ${r.analysis_type} (${r.finished_at?.slice(0, 16) ?? ''})`,
            runType,
            timestamp: r.finished_at ?? r.started_at ?? '',
            caseRef: r.study_case_id,
          };
        }),
    [executionRuns, projectName],
  );

  if (availableRuns.length < 2) {
    return (
      <div className="rounded border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
        <div className="font-semibold">Brak dostępnych przebiegów do porównania</div>
        <p className="mt-1 text-xs">
          Wymagane min. 2 ukończone przebiegi obliczeniowe. Uruchom obliczenia w co najmniej 2 wariantach.
        </p>
      </div>
    );
  }

  return (
    <ComparisonWizard
      availableRuns={availableRuns}
      onConfirm={(runA, runB, comparisonType) => onCompleted?.(runA, runB, comparisonType)}
      onCancel={() => onCancel?.()}
    />
  );
}

// Stub niedostarczony, decyzja właściciela D2 2026-07-17: tab "sensitivity"
// (Analiza wrażliwości) w E-35 AnalysisSurface wygaszony w kroku W5b-2 —
// funkcja NIEDOSTARCZONA (entries=[], onCompute nic nie liczył). Trasa E-35
// pozostaje (kanoniczny rodzic dzieci E-2x).

interface ReportSurfaceOsdAndProfileActionsProps {
  readonly projectName: string;
  readonly caseName: string;
}

export function ReportSurfaceOsdAndProfileActions({
  projectName,
  caseName,
}: ReportSurfaceOsdAndProfileActionsProps): JSX.Element {
  const [osdOpen, setOsdOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ReportProfileConfig | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-4"
      data-testid="report-osd-profile-actions"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Dane OSD i profil raportu
          </div>
          <h3 className="text-sm font-semibold text-slate-900">
            Wypełnij dane operatora + wybierz profil
          </h3>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-700">
        Dane OSD (operator, inwestor, lokalizacja, projektant z numerem SEP) trafiają do
        tytułowego bloku rysunku. Profil raportu (OSD / PW / PR / Pełny techniczny) kontroluje
        zakres sekcji oraz format eksportu (PDF / DOCX).
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="report-osd-open"
          className="rounded border border-slate-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          onClick={() => setOsdOpen(true)}
          title="Otwórz formularz danych OSD (operator, inwestor, projektant, faza, SEP)"
        >
          Dane OSD
        </button>
        <button
          type="button"
          data-testid="report-profile-open"
          className="rounded border border-slate-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
          onClick={() => setProfileOpen(true)}
          title="Wybierz profil raportu (OSD / PW / PR / Pełny techniczny)"
        >
          Wybierz profil raportu
        </button>
      </div>
      {activeProfile ? (
        <div
          data-testid="report-active-profile"
          className="mt-3 rounded border border-slate-300 bg-slate-50 p-2 text-[11px] text-slate-700"
        >
          <div className="font-semibold">Aktywny profil:</div>
          <div>Profil: {activeProfile.profile}</div>
          <div>Poziom: {activeProfile.detailLevel}</div>
          <div>Format: {activeProfile.format}</div>
          <div>Język: {activeProfile.language}</div>
          {activeFileName ? <div>Nazwa pliku: {activeFileName}</div> : null}
        </div>
      ) : null}
      <OsdDataForm isOpen={osdOpen} onClose={() => setOsdOpen(false)} />
      {profileOpen ? (
        <ReportProfileSelector
          projectName={projectName}
          caseName={caseName}
          onConfirm={(config, fileName) => {
            setActiveProfile(config);
            setActiveFileName(fileName);
            setProfileOpen(false);
          }}
          onCancel={() => setProfileOpen(false)}
        />
      ) : null}
    </section>
  );
}
