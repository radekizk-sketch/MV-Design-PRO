/**
 * StationWizardWorkspace — composition root Kreatora Stacji KOMPLETNEGO.
 *
 * Łączy:
 *   - `StationWizardSidebar` (lewa karta, 17 kroków × 7 grup)
 *   - `StationWizardStepContent` (router treści per krok 1-17)
 *   - Lokalny state: active step + selected vendor + readiness states
 *
 * Konsumuje wszystkie 17 kontraktów inżynierskich z `station-wizard-v2/`:
 *   cable / switchgear / bays + interlocking / apparatus / ct / vt /
 *   meters / trafo / earthing / nn / sources / pq / protection /
 *   ncrfg / infra / network / readiness.
 */
import { useCallback, useState } from 'react';
import { clsx } from 'clsx';

import { StationWizardSidebar } from './StationWizardSidebar';
import { StationWizardStepContent } from './StationWizardStepContent';
import {
  STATION_WIZARD_STEPS,
  getNextStep,
  getPrevStep,
  type StationWizardStepId,
} from './stationWizardContract';

export interface StationWizardWorkspaceProps {
  /** Początkowy aktywny krok (domyślnie 'cable' = krok 1). */
  readonly initialStep?: StationWizardStepId;
  /** Początkowy wybrany vendor (krok 2 switchgear). */
  readonly initialVendorId?: string;
  /** Density mode sidebar. */
  readonly density?: 'compact' | 'comfortable';
  /** Callback przy zatwierdzeniu kreatora (krok 17 readiness). */
  readonly onComplete?: () => void;
  /** Callback przy anulowaniu. */
  readonly onCancel?: () => void;
}

export function StationWizardWorkspace(
  props: StationWizardWorkspaceProps,
): JSX.Element {
  const {
    initialStep = 'cable',
    initialVendorId,
    density = 'compact',
    onComplete,
    onCancel,
  } = props;

  const [activeStep, setActiveStep] = useState<StationWizardStepId>(initialStep);
  const [selectedVendorId] = useState<string | undefined>(initialVendorId);
  const [completedSteps, setCompletedSteps] = useState<Set<StationWizardStepId>>(new Set());

  const handleSelectStep = useCallback((id: StationWizardStepId) => {
    setActiveStep(id);
  }, []);

  const handleNext = useCallback(() => {
    const next = getNextStep(activeStep);
    if (next !== null) {
      // Oznacz aktualny jako completed.
      setCompletedSteps((prev) => new Set(prev).add(activeStep));
      setActiveStep(next);
    } else {
      onComplete?.();
    }
  }, [activeStep, onComplete]);

  const handlePrev = useCallback(() => {
    const prev = getPrevStep(activeStep);
    if (prev !== null) {
      setActiveStep(prev);
    }
  }, [activeStep]);

  const currentStepIndex = STATION_WIZARD_STEPS.findIndex((s) => s.id === activeStep);
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === STATION_WIZARD_STEPS.length - 1;

  return (
    <div
      data-testid="station-wizard-workspace"
      data-active-step={activeStep}
      className="flex h-full flex-col overflow-hidden bg-[#040810]"
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <StationWizardSidebar
          activeStep={activeStep}
          onSelectStep={handleSelectStep}
          completedSteps={completedSteps}
          density={density}
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <StationWizardStepContent
            activeStep={activeStep}
            selectedVendorId={selectedVendorId}
          />
        </div>
      </div>

      {/* Footer — nawigacja kroku */}
      <footer
        data-testid="station-wizard-footer"
        className="flex shrink-0 items-center justify-between border-t border-[#1a2a3a] bg-[#080e18] px-4 py-2"
      >
        <div className="flex items-center gap-2 text-[11px] text-[#8a9aaa]">
          <span>
            Krok <span className="font-bold text-scada-text">{currentStepIndex + 1}</span>
            {' / '}
            <span>{STATION_WIZARD_STEPS.length}</span>
          </span>
          <span className="text-[#4a6a8a]">·</span>
          <span>
            Ukończone: <span className="font-bold text-emerald-300">{completedSteps.size}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onCancel && (
            <button
              type="button"
              data-testid="station-wizard-cancel"
              onClick={onCancel}
              className="rounded-md border border-[#1a2a3a] px-3 py-1 text-[11px] text-[#8a9aaa] transition-colors hover:bg-[#0b1725] hover:text-scada-text"
            >
              Anuluj
            </button>
          )}
          <button
            type="button"
            data-testid="station-wizard-prev"
            disabled={isFirst}
            onClick={handlePrev}
            className={clsx(
              'rounded-md border px-3 py-1 text-[11px] font-medium transition-colors',
              isFirst
                ? 'cursor-not-allowed border-[#1a2a3a] text-[#3a4a5a]'
                : 'border-[#1a2a3a] text-[#8a9aaa] hover:bg-[#0b1725] hover:text-scada-text',
            )}
          >
            ← Wstecz
          </button>
          <button
            type="button"
            data-testid="station-wizard-next"
            onClick={handleNext}
            className={clsx(
              'rounded-md border px-3.5 py-1 text-[11px] font-bold transition-colors',
              isLast
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                : 'border-[#00d4ff50] bg-[#00d4ff15] text-[#00d4ff] hover:bg-[#00d4ff25]',
            )}
          >
            {isLast ? 'Zakończ kreator' : 'Dalej →'}
          </button>
        </div>
      </footer>
    </div>
  );
}
