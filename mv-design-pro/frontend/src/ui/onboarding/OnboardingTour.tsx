/**
 * OnboardingTour — first-run tour dla nowych użytkowników.
 *
 * 6 kroków przewodnika po systemie:
 *  1. Pulpit projektu
 *  2. Tworzenie projektu
 *  3. Środowisko SLD
 *  4. Dodanie GPZ
 *  5. Power Flow + Proof
 *  6. Raport OSD
 *
 * Persistuje "ukończenie" w localStorage. Auto-show przy 1. uruchomieniu.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useState } from 'react';

export interface TourStep {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly tipPl: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'dashboard',
    title: 'Pulpit projektu (E-00)',
    description: 'Start systemu MV-DESIGN-PRO. Tu wybierasz istniejący projekt lub tworzysz nowy.',
    tipPl: 'Wskazówka: "Nowy projekt" otworzy modal z 4 polami obowiązkowymi (nazwa, inwestor, lokalizacja, faza). Auto-utworzy "Wariant bazowy" i przeniesie Cię do SLD.',
  },
  {
    id: 'create-project',
    title: 'Tworzenie projektu',
    description: 'Wypełnij metadane projektu w sekcji "Identyfikacja". Inwestor i Faza projektu są wymagane dla wniosku OSD.',
    tipPl: 'Wskazówka: faza projektu wpływa na status w title block schematu (PB - budowlany, PW - wykonawczy, PR - rozbudowy, PK - koncepcyjny).',
  },
  {
    id: 'sld',
    title: 'Środowisko SLD (E-01)',
    description: 'Canvas schematu jednokreskowego. Tu budujesz sieć element po elementu - GPZ, pola, odcinki, stacje, OZE.',
    tipPl: 'Skróty: Ctrl+Home dopasowuje widok. F1 otwiera Pomoc. Ctrl+Z cofa ostatnią operację. F2-F7 to tryby pracy.',
  },
  {
    id: 'add-gpz',
    title: 'Pierwszy element: GPZ',
    description: 'Każda sieć zaczyna od GPZ (Główny Punkt Zasilający). To stacja WN/SN typu 110/15 kV.',
    tipPl: 'W empty state widzisz CTA "Wstaw GPZ". Wybierz typ uziemienia (rezystorowy / izolowany / Petersen) - to ważne dla obliczeń zwarciowych 1-faz.',
  },
  {
    id: 'power-flow',
    title: 'Obliczenia: Power Flow + Proof',
    description: 'Po zbudowaniu sieci uruchom Power Flow (Newton-Raphson). Wyniki: napięcia szyn, obciążenia kabli, straty.',
    tipPl: 'Po PF wygeneruj Proof Pack (Dowód obliczeń) - dla SC3F (zwarcia), VDROP (spadki napięcia), Equipment (wytrzymałość aparatury). Eksport PDF/LaTeX/JSON.',
  },
  {
    id: 'osd-report',
    title: 'Wniosek OSD',
    description: 'Finalny krok: raport dla operatora dystrybucyjnego (PSE/Energa/Tauron/Enea/PGE). Wypełnia title block + bilans mocy + załączniki.',
    tipPl: 'Dialog "Dane OSD" zbiera operatora, projektanta z SEP D, sprawdzającego z SEP E, lokalizację. Wynik: gotowy PDF wniosku.',
  },
];

const TOUR_COMPLETED_KEY = 'mvdp.onboarding.completed';

export function isOnboardingCompleted(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(TOUR_COMPLETED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOUR_COMPLETED_KEY, '1');
    }
  } catch {
    // ignore
  }
}

export function resetOnboarding(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOUR_COMPLETED_KEY);
    }
  } catch {
    // ignore
  }
}

export interface OnboardingTourProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** Callback gdy user ukończy tour. */
  readonly onComplete?: () => void;
}

export function OnboardingTour({ isOpen, onClose, onComplete }: OnboardingTourProps): JSX.Element | null {
  const [stepIdx, setStepIdx] = useState(0);

  const next = useCallback(() => {
    if (stepIdx < TOUR_STEPS.length - 1) {
      setStepIdx((i) => i + 1);
    } else {
      markOnboardingCompleted();
      onComplete?.();
      onClose();
    }
  }, [stepIdx, onComplete, onClose]);

  const back = useCallback(() => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  }, [stepIdx]);

  const skip = useCallback(() => {
    markOnboardingCompleted();
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[stepIdx];
  const isLast = stepIdx === TOUR_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      data-testid="onboarding-tour"
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[520px] max-w-[95vw] p-5"
        role="dialog"
        aria-label="Przewodnik powitalny"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-gray-500">
            Krok {stepIdx + 1} z {TOUR_STEPS.length}
          </div>
          <button
            type="button"
            onClick={skip}
            className="text-[10px] text-gray-400 hover:text-gray-600"
            data-testid="onboarding-skip"
          >
            Pomiń przewodnik
          </button>
        </div>

        <h3 className="mb-2 text-base font-semibold text-gray-800" data-testid="onboarding-title">
          {step.title}
        </h3>
        <p className="mb-3 text-sm text-gray-700">{step.description}</p>

        <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-900" data-testid="onboarding-tip">
          💡 {step.tipPl}
        </div>

        <div className="mb-4 flex gap-1">
          {TOUR_STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded transition-colors ${i <= stepIdx ? 'bg-blue-500' : 'bg-gray-200'}`}
              data-testid={`onboarding-progress-${i}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          {stepIdx > 0 ? (
            <button
              type="button"
              onClick={back}
              className="px-3 py-1.5 text-[11px] text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
              data-testid="onboarding-back"
            >
              ← Wstecz
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={next}
            className={`px-4 py-1.5 text-[11px] text-white rounded font-medium ${
              isLast ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
            data-testid="onboarding-next"
          >
            {isLast ? 'Zacznij projektować' : 'Dalej →'}
          </button>
        </div>
      </div>
    </div>
  );
}
