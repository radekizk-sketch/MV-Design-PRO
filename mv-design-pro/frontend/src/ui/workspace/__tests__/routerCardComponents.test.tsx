import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  ActionableEngineeringTable,
  EmptyEngineeringState,
  EngineeringFixActionButton,
  ReportChapterChecklist,
  type EngineeringStageRow,
} from '../routerCardComponents';

describe('routerCardComponents - tabele robocze inżyniera', () => {
  it('renderuje etap jako tabelę z akcją naprawczą zamiast martwego kafla', () => {
    const onAction = vi.fn();
    const rows: EngineeringStageRow[] = [
      {
        id: 'gpz',
        stage: 'gpz',
        label: 'Etap 2 GPZ',
        status: 'brak_danych',
        dataSummary: 'brak źródła GPZ',
        missingFields: ['źródło GPZ', 'dane zwarciowe'],
        sourceRef: 'ENM',
        fixAction: { label: 'Otwórz GPZ', onClick: onAction },
      },
    ];

    render(<ActionableEngineeringTable title="Etapy" rows={rows} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Etap 2 GPZ')).toBeInTheDocument();
    expect(screen.getByText('źródło GPZ, dane zwarciowe')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('engineering-fix-action-gpz'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('pokazuje disabled reason dla niedostępnej akcji', () => {
    render(
      <EngineeringFixActionButton
        label="Eksport LaTeX"
        disabledReason="Wymagany ślad solvera zakończonego obliczenia."
      />,
    );

    const button = screen.getByRole('button', { name: 'Eksport LaTeX' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Wymagany ślad solvera zakończonego obliczenia.')).toBeInTheDocument();
  });

  it('checklista raportu ma rozdziały, źródła danych i eksport', () => {
    render(
      <ReportChapterChecklist
        rows={[
          {
            chapterId: 'calc',
            titlePl: '4. Wyniki obliczeń',
            status: 'gotowe',
            objectCount: 12,
            sourceKind: 'resultset / run',
            missingCount: 0,
            exportIncluded: true,
          },
        ]}
      />,
    );

    expect(screen.getByTestId('report-chapter-checklist')).toBeInTheDocument();
    expect(screen.getByText('4. Wyniki obliczeń')).toBeInTheDocument();
    expect(screen.getByText('resultset / run')).toBeInTheDocument();
  });

  it('empty state zawsze podaje powód, wymagane dane i akcję', () => {
    const onAction = vi.fn();
    render(
      <EmptyEngineeringState
        title="Brak aktywnych blokad"
        reason="Nie wykryto blockerów readiness."
        requiredData="Aktywne obliczenie i ślad solvera."
        actionLabel="Sprawdź konfigurację"
        onAction={onAction}
      />,
    );

    expect(screen.getByTestId('empty-engineering-state')).toHaveTextContent('Nie wykryto blockerów readiness.');
    fireEvent.click(screen.getByRole('button', { name: 'Sprawdź konfigurację' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
