import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SldWorkDock } from '../SldWorkDock';

describe('SldWorkDock', () => {
  it('renderuje sekcje procesu i uruchamia nastepny krok', async () => {
    const user = userEvent.setup();
    const onNextStep = vi.fn();

    render(
      <SldWorkDock
        contextItems={[
          { label: 'Projekt', value: 'Projekt 1' },
          { label: 'Przypadek', value: 'Przypadek 1' },
          { label: 'Wariant pracy', value: 'Wariant bazowy' },
          { label: 'Migawka modelu', value: 'snapshot-1' },
          { label: 'Uruchomienie', value: 'run-1' },
          { label: 'Wyniki', value: 'Wyniki aktualne', tone: 'ok' },
        ]}
        nextStep={{
          title: 'Dodaj pole SN do szyny GPZ',
          description: 'Ciag glowny mozna wyprowadzic dopiero z pola SN.',
          actionLabel: 'Otworz formularz pola SN',
          onAction: onNextStep,
        }}
        actionGroups={[
          {
            title: 'Operacje modelu',
            actions: [
              {
                id: 'select',
                label: 'Wybierz element',
                description: 'Przejdz do inspektora elementu.',
                enabled: true,
                active: true,
                onSelect: vi.fn(),
              },
            ],
          },
        ]}
        objectPalette={[
          { label: 'GPZ', description: 'Punkt startowy sieci SN.' },
          { label: 'Stacja koncowa SN/nN', description: 'Zamyka ciag glowny.' },
        ]}
        modelSummary={{
          buses: 1,
          branches: 2,
          transformers: 1,
          stations: 1,
          openTerminals: 1,
        }}
        readinessContent={<div>Brak blokad krytycznych</div>}
        interactionMessage="Aktywne narzedzie: Wyprowadz ciag glowny."
      />,
    );

    expect(screen.getByTestId('sld-work-dock')).toBeInTheDocument();
    expect(screen.getByTestId('sld-dock-context')).toBeInTheDocument();
    expect(screen.getByTestId('sld-dock-next-step')).toBeInTheDocument();
    expect(screen.getByTestId('sld-dock-repair')).toBeInTheDocument();
    expect(screen.getByTestId('sld-dock-actions')).toBeInTheDocument();
    expect(screen.getByTestId('sld-dock-summary')).toBeInTheDocument();
    expect(screen.getByText('Brak blokad krytycznych')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Otworz formularz pola SN' }));

    expect(onNextStep).toHaveBeenCalledTimes(1);
  });

  it('pokazuje powod blokady dla niedostepnej akcji i nastepnego kroku', () => {
    render(
      <SldWorkDock
        contextItems={[
          { label: 'Projekt', value: 'Projekt 1' },
          { label: 'Przypadek', value: 'Nie wybrano', tone: 'warn' },
        ]}
        nextStep={{
          title: 'Dodaj pole SN do szyny GPZ',
          description: 'Wymagany jest jednoznaczny kontekst GPZ.',
          actionLabel: 'Otworz formularz pola SN',
          onAction: vi.fn(),
          disabled: true,
          disabledReason: 'Brak jednoznacznej szyny SN lub stacji GPZ dla nowego pola.',
        }}
        actionGroups={[
          {
            title: 'Budowa sieci SN i nN',
            actions: [
              {
                id: 'continue_trunk_segment_sn',
                label: 'Wyprowadz ciag glowny',
                description: 'Wskaz port pola SN.',
                enabled: false,
                active: false,
                onSelect: vi.fn(),
                disabledReason: 'Najpierw dodaj pole SN do GPZ.',
              },
            ],
          },
        ]}
        objectPalette={[]}
        modelSummary={{
          buses: 1,
          branches: 0,
          transformers: 0,
          stations: 0,
          openTerminals: 0,
        }}
        readinessContent={<div>Brak danych krytycznych</div>}
      />,
    );

    expect(
      screen.getByText('Brak jednoznacznej szyny SN lub stacji GPZ dla nowego pola.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Najpierw dodaj pole SN do GPZ.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Otworz formularz pola SN' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Wyprowadz ciag glowny/i })).toBeDisabled();
  });
});
