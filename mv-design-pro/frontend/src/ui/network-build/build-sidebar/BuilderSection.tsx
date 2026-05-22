/**
 * BuilderSection — Dock projektanta z next-step prowadzeniem (PR-13).
 *
 * Brief 2 §4 sekcja 2 + brief 1 §13 (Dock projektanta).
 * Sekcja: kontekst pracy + następny krok + kontrola konfiguracji + akcje + stan układu.
 */

import type { BuildPhase } from '../../sld/v2/builder/BuildSequence';

export interface BuilderContextInfo {
  readonly projectName: string;
  readonly gpzName?: string;
  readonly operatingState?: string;
  readonly snVoltageKv?: number;
  readonly calculationScopePl?: string;
}

export interface BuilderNextStep {
  readonly id: string;
  readonly labelPl: string;
  readonly descriptionPl?: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export interface BuilderBlocker {
  readonly id: string;
  readonly labelPl: string;
  readonly severityPl: 'błąd' | 'ostrzeżenie' | 'informacja';
  readonly onFix?: () => void;
  readonly onShowOnSld?: () => void;
}

export interface BuilderModelStats {
  readonly gpzCount: number;
  readonly bayCount: number;
  readonly cableSegmentCount: number;
  readonly stationCount: number;
  readonly derSourceCount: number;
  readonly bessCount: number;
  readonly missingDataCount: number;
}

export interface BuilderSectionProps {
  readonly buildPhase: BuildPhase;
  readonly context: BuilderContextInfo;
  readonly nextSteps: readonly BuilderNextStep[];
  readonly blockers: readonly BuilderBlocker[];
  readonly modelStats: BuilderModelStats;
}

const BUILD_PHASE_LABEL: Record<BuildPhase, string> = {
  NO_SOURCE: 'Pusty projekt',
  HAS_SOURCE: 'GPZ wstawiony',
  HAS_TRUNKS: 'Ciągi wyprowadzone',
  HAS_STATIONS: 'Stacje rozmieszczone',
  READY: 'Układ skonfigurowany',
};

const SEVERITY_CLASS: Record<BuilderBlocker['severityPl'], string> = {
  'błąd': 'text-status-error',
  'ostrzeżenie': 'text-status-warn',
  'informacja': 'text-scada-muted',
};

export function BuilderSection(props: BuilderSectionProps): JSX.Element {
  const { buildPhase, context, nextSteps, blockers, modelStats } = props;

  return (
    <div data-testid="builder-section" className="flex flex-col gap-3 py-1">
      {/* Kontekst pracy */}
      <div data-testid="builder-context" className="border-b border-scada-border px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Kontekst pracy
        </div>
        <div className="mt-1 grid grid-cols-1 gap-0.5 text-[11px] text-scada-text">
          <div>
            <span className="text-scada-muted">Projekt: </span>
            <span className="font-mono">{context.projectName}</span>
          </div>
          {context.gpzName && (
            <div>
              <span className="text-scada-muted">GPZ: </span>
              <span className="font-mono">{context.gpzName}</span>
            </div>
          )}
          {context.operatingState && (
            <div>
              <span className="text-scada-muted">Układ pracy sieci: </span>
              <span>{context.operatingState}</span>
            </div>
          )}
          {context.snVoltageKv !== undefined && (
            <div>
              <span className="text-scada-muted">Napięcie: </span>
              <span className="font-mono">{context.snVoltageKv} kV</span>
            </div>
          )}
          {context.calculationScopePl && (
            <div>
              <span className="text-scada-muted">Zakres obliczeń: </span>
              <span>{context.calculationScopePl}</span>
            </div>
          )}
          <div className="mt-1 flex items-center gap-1">
            <span className="text-scada-muted">Etap budowy: </span>
            <span data-testid="builder-phase-chip" className="rounded bg-scada-panel-raised px-1.5 py-0.5 text-[10px] text-scada-text">
              {BUILD_PHASE_LABEL[buildPhase]}
            </span>
          </div>
        </div>
      </div>

      {/* Następny krok */}
      <div data-testid="builder-next-steps" className="px-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Następny krok
        </div>
        <div className="mt-1 flex flex-col gap-1">
          {nextSteps.length === 0 ? (
            <span className="text-xs italic text-scada-muted">
              Aktualny etap nie wymaga dodatkowej akcji.
            </span>
          ) : (
            nextSteps.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid={`builder-next-${s.id}`}
                disabled={s.disabled}
                onClick={s.onClick}
                className={
                  'rounded border border-scada-border px-2 py-1.5 text-left text-xs '
                  + (s.disabled
                    ? 'cursor-not-allowed bg-scada-panel text-scada-muted'
                    : 'bg-scada-panel-raised text-scada-text hover:bg-scada-active')
                }
              >
                <div className="font-medium">{s.labelPl}</div>
                {s.descriptionPl && (
                  <div className="mt-0.5 text-[10px] text-scada-muted">{s.descriptionPl}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Kontrola konfiguracji */}
      <div data-testid="builder-blockers" className="px-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Kontrola konfiguracji
        </div>
        <div className="mt-1 flex flex-col gap-1">
          {blockers.length === 0 ? (
            <span className="text-xs italic text-scada-muted">
              Kontrola nie wskazuje zagadnień technicznych.
            </span>
          ) : (
            blockers.map((b) => (
              <div
                key={b.id}
                data-testid={`builder-blocker-${b.id}`}
                className="rounded border border-scada-border bg-scada-panel-raised px-2 py-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-medium ${SEVERITY_CLASS[b.severityPl]}`}>
                    {b.labelPl}
                  </span>
                  <span className="text-[10px] text-scada-muted">{b.severityPl}</span>
                </div>
                <div className="mt-1 flex gap-1">
                  {b.onShowOnSld && (
                    <button
                      type="button"
                      data-testid={`builder-show-sld-${b.id}`}
                      onClick={b.onShowOnSld}
                      className="rounded border border-scada-border px-1.5 py-0.5 text-[10px] text-scada-text hover:bg-scada-active"
                    >
                      Pokaż na SLD
                    </button>
                  )}
                  {b.onFix && (
                    <button
                      type="button"
                      data-testid={`builder-fix-${b.id}`}
                      onClick={b.onFix}
                      className="rounded border border-scada-border px-1.5 py-0.5 text-[10px] text-scada-text hover:bg-scada-active"
                    >
                      Skonfiguruj
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Stan układu */}
      <div data-testid="builder-model-stats" className="border-t border-scada-border px-3 pt-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Stan układu
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-scada-text">
          <div><span className="text-scada-muted">GPZ:</span> {modelStats.gpzCount}</div>
          <div><span className="text-scada-muted">Pola SN:</span> {modelStats.bayCount}</div>
          <div><span className="text-scada-muted">Odcinki:</span> {modelStats.cableSegmentCount}</div>
          <div><span className="text-scada-muted">Stacje:</span> {modelStats.stationCount}</div>
          <div><span className="text-scada-muted">Układy:</span> {modelStats.derSourceCount}</div>
          <div><span className="text-scada-muted">BESS:</span> {modelStats.bessCount}</div>
          <div className="col-span-2">
            <span className="text-scada-muted">Zagadnienia techniczne: </span>
            <span className={modelStats.missingDataCount > 0 ? 'text-status-warn' : 'text-status-ok'}>
              {modelStats.missingDataCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
