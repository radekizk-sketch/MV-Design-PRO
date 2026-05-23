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
import { SensitivityPanel, type SensitivityEntry } from '../sensitivity/SensitivityPanel';
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
 * AnalysisSurfaceSensitivityTab — tab "sensitivity" w E-35 AnalysisSurface.
 * Renderuje SensitivityPanel (Etap 10 dostawy).
 */
export function AnalysisSurfaceSensitivityTab(): JSX.Element {
  const selectElement = useSelectionStore((state) => state.selectElement);
  const [status, setStatus] = useState<'idle' | 'computing' | 'ready' | 'error'>('idle');
  const entries = useMemo<readonly SensitivityEntry[]>(() => [], []);
  return (
    <SensitivityPanel
      entries={entries}
      status={status}
      onCompute={() => setStatus('computing')}
      onSelectElement={(ref) => selectElementByRef(selectElement, ref)}
    />
  );
}

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
