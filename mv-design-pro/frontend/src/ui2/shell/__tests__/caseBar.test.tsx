import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CaseBar } from '../CaseBar';
import type { ShellCaseInfo } from '../shellStatus';
import { znacznikSwiezosci } from '../znacznikSwiezosci';
import { SHELL_STRINGS } from '../strings';
import { studyCaseFixture } from '../../spaces/obliczenia/__tests__/fixtures';
import type { StudyCaseResultStatus } from '../../../ui/study-cases/types';

/**
 * Model znacznika z realnego kształtu StudyCase (przez czysty helper K4/D1).
 * Para rewizji ZGODNA (7 ↔ 7) — od V12K-309 poz. 2 to ona, a nie sam
 * `result_status`, rozstrzyga „aktualne": bez pary rewizji werdykt jest
 * nieustalony, a przy rewizji wyniku starszej od modelu — „nieaktualne".
 */
function znacznik(status: StudyCaseResultStatus, rewizjaWyniku: number | null = 7) {
  return znacznikSwiezosci(
    studyCaseFixture('K-1', 'Zwarcia maks.', {
      result_status: status,
      results_valid: status === 'FRESH',
      is_active: true,
    }),
    { rewizjaWyniku, rewizjaModelu: 7 },
  );
}

function makeInfo(overrides: Partial<ShellCaseInfo> = {}): ShellCaseInfo {
  return {
    projectPresent: true,
    projectName: 'Sieć SN Przykładowa',
    caseName: 'Zwarcia maks. + PV 100%',
    caseCount: 4,
    znacznikWynikow: znacznik('FRESH'),
    modelValidated: true,
    readinessGotowoscUstalona: true,
    readinessWarnings: 0,
    readinessBlockers: 0,
    ...overrides,
  };
}

describe('CaseBar', () => {
  it('chip aktywnego przypadku jest zawsze widoczny (etykieta z §5)', () => {
    render(<CaseBar info={makeInfo()} />);
    expect(screen.getByText(SHELL_STRINGS.activeCase)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-casebar-chip')).toHaveTextContent('Zwarcia maks. + PV 100%');
  });

  it('prezentuje stany modelu / gotowości / wyników ze store (props)', () => {
    render(
      <CaseBar
        info={makeInfo({
          znacznikWynikow: znacznik('OUTDATED'),
          modelValidated: false,
          readinessWarnings: 2,
        })}
      />,
    );
    expect(screen.getByTestId('mvd-casebar-model')).toHaveTextContent(SHELL_STRINGS.modelPending);
    expect(screen.getByTestId('mvd-casebar-readiness')).toHaveTextContent('Gotowość: 2 ostrzeżenia');
    expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(SHELL_STRINGS.resultsOutdated);
    expect(screen.getByTestId('mvd-casebar-count')).toHaveTextContent('Przypadków: 4');
  });

  it('gotowość: liczba pojedyncza/mnoga i blokady', () => {
    const { rerender } = render(<CaseBar info={makeInfo({ readinessWarnings: 1 })} />);
    expect(screen.getByTestId('mvd-casebar-readiness')).toHaveTextContent('Gotowość: 1 ostrzeżenie');
    rerender(<CaseBar info={makeInfo({ readinessBlockers: 3, readinessWarnings: 1 })} />);
    expect(screen.getByTestId('mvd-casebar-readiness')).toHaveTextContent('Gotowość: 3 blokady');
  });

  it('stan „brak projektu": chip pokazuje „—" i akcję „Otwórz projekt"', () => {
    const onOpenProject = vi.fn();
    render(
      <CaseBar
        info={makeInfo({
          projectPresent: false,
          projectName: null,
          caseName: null,
          znacznikWynikow: znacznikSwiezosci(null, { rewizjaWyniku: null, rewizjaModelu: null }),
        })}
        onOpenProject={onOpenProject}
      />,
    );
    expect(screen.getByTestId('mvd-casebar-chip')).toHaveTextContent(SHELL_STRINGS.emptyValue);
    expect(screen.queryByTestId('mvd-casebar-model')).toBeNull();
    const button = screen.getByTestId('mvd-open-project');
    expect(button).toHaveTextContent(SHELL_STRINGS.openProject);
    fireEvent.click(button);
    expect(onOpenProject).toHaveBeenCalledTimes(1);
  });

  it('znacznik „nieaktualne" jest przyciskiem — natywny klik wywołuje akcję (K4/D1)', () => {
    const onPrzejdzDoObliczen = vi.fn();
    render(
      <CaseBar
        info={makeInfo({ znacznikWynikow: znacznik('OUTDATED') })}
        onPrzejdzDoObliczen={onPrzejdzDoObliczen}
      />,
    );
    const chip = screen.getByTestId('mvd-casebar-results');
    expect(chip.tagName).toBe('BUTTON');
    expect(chip).toHaveAttribute('title', SHELL_STRINGS.resultsOutdatedHint);
    fireEvent.click(chip);
    expect(onPrzejdzDoObliczen).toHaveBeenCalledTimes(1);
  });

  it('znacznik „aktualne" i „brak" pozostają statyczne (bez akcji)', () => {
    const onPrzejdzDoObliczen = vi.fn();
    const { rerender } = render(
      <CaseBar
        info={makeInfo({ znacznikWynikow: znacznik('FRESH') })}
        onPrzejdzDoObliczen={onPrzejdzDoObliczen}
      />,
    );
    expect(screen.getByTestId('mvd-casebar-results').tagName).toBe('SPAN');
    expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(SHELL_STRINGS.resultsFresh);

    rerender(
      <CaseBar
        info={makeInfo({ znacznikWynikow: znacznik('NONE') })}
        onPrzejdzDoObliczen={onPrzejdzDoObliczen}
      />,
    );
    const chip = screen.getByTestId('mvd-casebar-results');
    expect(chip.tagName).toBe('SPAN');
    expect(chip).toHaveTextContent(SHELL_STRINGS.resultsNone);
    fireEvent.click(chip);
    expect(onPrzejdzDoObliczen).not.toHaveBeenCalled();
  });

  it('świeżość bez rewizji wyniku → „Wyniki: nieustalone", NIGDY „aktualne" (V12K-309 poz. 2)', () => {
    render(<CaseBar info={makeInfo({ znacznikWynikow: znacznik('FRESH', null) })} />);

    const chip = screen.getByTestId('mvd-casebar-results');
    expect(chip).toHaveTextContent(SHELL_STRINGS.resultsUnknown);
    expect(chip).not.toHaveTextContent(SHELL_STRINGS.resultsFresh);
    // Kropka neutralna — „ok" byłaby werdyktem, którego nikt nie policzył.
    expect(chip.querySelector('.mvd-dot')?.className).toBe('mvd-dot mvd-dot-none');
  });

  it('gotowość nieustalona → chip pokazuje kreskę braku danej i NIE „brak uwag" (V12K-309 poz. 1)', () => {
    render(<CaseBar info={makeInfo({ readinessGotowoscUstalona: false })} />);

    const chip = screen.getByTestId('mvd-casebar-readiness');
    expect(chip).toHaveTextContent(`Gotowość: ${SHELL_STRINGS.emptyValue}`);
    expect(chip).not.toHaveTextContent('brak uwag');
    // Zielona kropka jest zarezerwowana dla POLICZONEJ gotowości bez uwag.
    expect(chip.querySelector('.mvd-dot')?.className).toBe('mvd-dot mvd-dot-warn');
  });
});
