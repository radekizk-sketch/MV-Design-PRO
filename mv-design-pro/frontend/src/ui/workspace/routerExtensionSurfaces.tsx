/**
 * routerExtensionSurfaces — Surface wrappers dla E-09/E-35/E-37
 * (Plan Phase 1 etapy 13/14/17 wiring).
 *
 * E-09 Historia i audyt        → AuditTrailSurface (AuditTrailPanel)
 * E-35 Wyniki i porównania     → SensitivityResultsSurface (SensitivityPanel)
 * E-37 Raporty OSD i audytowe  → ReportsSurface (OsdDataForm + ReportProfileSelector)
 *
 * Pure UI delegate components — fetch state via Zustand stores, no physics.
 */

import { useMemo, useState } from 'react';
import type { WorkspaceSurfaceDescriptor } from './types';
import { AuditTrailPanel } from '../audit/AuditTrailPanel';
import { SensitivityPanel } from '../sensitivity/SensitivityPanel';
import type { SensitivityEntry } from '../sensitivity/SensitivityPanel';
import { OsdDataForm } from '../reports/OsdDataForm';
import { ReportProfileSelector } from '../reports/ReportProfileSelector';
import type { ReportProfileConfig } from '../reports/ReportProfileSelector';
import { useSelectionStore } from '../selection';
import { useAppStateStore } from '../app-state';

function selectElementByRef(
  selectElement: (el: { id: string; type: 'Bus'; name: string } | null) => void,
  ref: string,
): void {
  selectElement({ id: ref, type: 'Bus', name: ref });
}

export function AuditTrailSurface({ surface: _surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const selectElement = useSelectionStore((state) => state.selectElement);
  return (
    <div className="space-y-4">
      <AuditTrailPanel onSelectElement={(ref) => selectElementByRef(selectElement, ref)} />
    </div>
  );
}

export function SensitivityResultsSurface({ surface: _surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const selectElement = useSelectionStore((state) => state.selectElement);
  const [status, setStatus] = useState<'idle' | 'computing' | 'ready' | 'error'>('idle');
  const entries = useMemo<readonly SensitivityEntry[]>(() => [], []);
  return (
    <div className="space-y-4">
      <SensitivityPanel
        entries={entries}
        status={status}
        onCompute={() => setStatus('computing')}
        onSelectElement={(ref) => selectElementByRef(selectElement, ref)}
      />
    </div>
  );
}

export function ReportsSurface({ surface: _surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeProjectName =
    useAppStateStore((state) => state.activeCaseName) ?? 'Projekt MV-DESIGN-PRO';
  const activeCaseName = useAppStateStore((state) => state.activeCaseName) ?? 'Wariant bazowy';
  const [osdOpen, setOsdOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ReportProfileConfig | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-lg font-semibold text-chrome-100">Raporty OSD i audytowe</h2>
      <p className="text-sm text-chrome-300">
        Wybierz profil raportu oraz uzupełnij dane OSD (operator, inwestor, projektant) przed generacją.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-amber-500 bg-amber-600/20 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-600/40"
          onClick={() => setOsdOpen(true)}
          title="Otwórz formularz danych OSD (operator, inwestor, projektant, faza, SEP)"
        >
          Dane OSD
        </button>
        <button
          type="button"
          className="rounded border border-sky-500 bg-sky-600/20 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-600/40"
          onClick={() => setProfileOpen(true)}
          title="Wybierz profil raportu (OSD/PW/PR/Pełny techniczny)"
        >
          Wybierz profil raportu
        </button>
      </div>
      {activeProfile ? (
        <div className="rounded border border-chrome-700 bg-chrome-900 p-3 text-xs text-chrome-200">
          <div className="font-semibold text-chrome-100">Aktywny profil:</div>
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
          projectName={activeProjectName}
          caseName={activeCaseName}
          onConfirm={(config, fileName) => {
            setActiveProfile(config);
            setActiveFileName(fileName);
            setProfileOpen(false);
          }}
          onCancel={() => setProfileOpen(false)}
        />
      ) : null}
    </div>
  );
}
