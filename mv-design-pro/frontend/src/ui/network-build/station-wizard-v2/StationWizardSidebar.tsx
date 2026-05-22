/**
 * StationWizardSidebar — sidebar nawigacji 17-krokowego Kreatora Stacji
 * (komponent skeleton oparty o kontrakt `stationWizardContract.ts`).
 *
 * STATUS: minimalna implementacja warstwy nawigacyjnej. Treść każdego
 * kroku (mini-SLD z kanonicznymi symbolami, CT/VT wielordzeniowe,
 * 22-osiowa macierz gotowości itd.) wymaga pełnej przebudowy w
 * kolejnych sesjach — patrz `docs/audit/DESIGN_IMPL_2026-05-19_KWranPTV.md`
 * §6.5.
 *
 * Komponent nie jest jeszcze podłączony do shellu — służy jako gotowy
 * fundament UI, który będzie wpinany do `InsertStationForm` / nowej
 * powierzchni E-?? po decyzji architektonicznej.
 */
import { clsx } from 'clsx';

import {
  STATION_WIZARD_STEPS,
  STATION_WIZARD_GROUPS,
  type StationWizardStepId,
  type StationWizardGroup,
} from './stationWizardContract';

export interface StationWizardSidebarProps {
  /** Aktualnie aktywny krok. */
  readonly activeStep: StationWizardStepId;
  /** Callback przy kliknięciu kroku — kontener decyduje czy zmienić aktywny. */
  readonly onSelectStep: (id: StationWizardStepId) => void;
  /** Lista kroków oznaczonych jako "ukończone" (✓). */
  readonly completedSteps?: ReadonlySet<StationWizardStepId>;
  /** Lista kroków z błędami (czerwona kropka). */
  readonly errorSteps?: ReadonlySet<StationWizardStepId>;
  /** Tryb gęstości — compact dla widoku 240px, comfortable dla 320px. */
  readonly density?: 'compact' | 'comfortable';
}

const GROUP_LABEL_PL: Record<StationWizardGroup, string> = {
  'SN':         'Strona SN',
  'Pomiary':    'Pomiary',
  'Stacja':     'Stacja',
  'OZE':        'Źródła OZE',
  'Ochrona':    'Ochrona',
  'Infrastr.':  'Infrastruktura',
  'Obliczenia': 'Obliczenia i raport',
};

export function StationWizardSidebar({
  activeStep,
  onSelectStep,
  completedSteps,
  errorSteps,
  density = 'compact',
}: StationWizardSidebarProps): JSX.Element {
  const isCompact = density === 'compact';
  return (
    <nav
      data-testid="station-wizard-sidebar"
      data-density={density}
      aria-label="Konfiguracja stacji — nawigacja kroków"
      className={clsx(
        'flex h-full shrink-0 flex-col overflow-y-auto border-r border-[#1a2a3a] bg-[#080e18]',
        isCompact ? 'w-[240px]' : 'w-[320px]',
      )}
    >
      <div className="border-b border-[#1a2a3a] px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#4a6a8a]">
          Konfiguracja stacji
        </div>
        <div className="text-[11px] font-semibold text-scada-text">
          17 kroków · 7 grup
        </div>
      </div>

      <div className="flex-1 py-1">
        {STATION_WIZARD_GROUPS.map((group, gi) => {
          const stepsInGroup = STATION_WIZARD_STEPS.filter((s) => s.group === group);
          return (
            <div key={group} data-testid={`station-wizard-group-${group}`}>
              {gi > 0 && <div className="mx-3 my-1 h-px bg-[#1a2a3a]" />}
              <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#2a4a6a]">
                {GROUP_LABEL_PL[group]}
              </div>
              {stepsInGroup.map((step) => {
                const isActive = step.id === activeStep;
                const isCompleted = completedSteps?.has(step.id) ?? false;
                const isError = errorSteps?.has(step.id) ?? false;
                return (
                  <button
                    key={step.id}
                    type="button"
                    data-testid={`station-wizard-step-${step.id}`}
                    data-step-active={isActive ? 'true' : 'false'}
                    data-step-completed={isCompleted ? 'true' : 'false'}
                    data-step-error={isError ? 'true' : 'false'}
                    aria-current={isActive ? 'step' : undefined}
                    aria-label={`Krok ${step.n}: ${step.label}. ${step.sub}`}
                    onClick={() => onSelectStep(step.id)}
                    className={clsx(
                      'group flex w-full items-start gap-2 rounded px-3 py-2 text-left transition-colors',
                      isActive
                        ? 'bg-[#00d4ff10] text-[#00d4ff]'
                        : 'text-[#8a9aaa] hover:bg-[#0b1725] hover:text-scada-text',
                    )}
                  >
                    <span
                      className={clsx(
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold',
                        isActive
                          ? 'bg-[#00d4ff] text-[#001f2a]'
                          : isCompleted
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : isError
                              ? 'bg-red-500/20 text-red-300'
                              : 'bg-[#0a1420] text-[#4a6a8a]',
                      )}
                    >
                      {isCompleted ? '✓' : isError ? '!' : step.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={clsx(
                          'block truncate text-xs',
                          isActive ? 'font-semibold' : 'font-medium',
                        )}
                      >
                        {step.label}
                      </span>
                      {!isCompact && (
                        <span className="block truncate text-[10px] text-[#4a6a8a]">
                          {step.sub}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#1a2a3a] px-3 py-2 text-[10px] text-[#4a6a8a]">
        Źródło: Kreator KOMPLETNY (bundle KWranPTV)
      </div>
    </nav>
  );
}
