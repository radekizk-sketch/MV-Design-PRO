/**
 * Panel odstępów czasowych par obok wykresu TCC — liczby backendu, bez werdyktu (P-06).
 *
 * Iloczyn cech: {brak par, para z odstępem (sieć złota), odstęp poniżej wymaganego, para bez
 * odstępu} × {podsumowanie, pozycja pary (fakt „kto zadziała", liczby, zdanie backendu)}.
 * Brak par nigdy nie daje „brak konfliktów"; panel nie wybiera par „wymagających uwagi" ani
 * nie koloruje liczb — wszystkie pary są wymienione.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TccInterpretationPanel } from '../TccInterpretationPanel';
import type { CoordinationDevice, CoordinationResult, SelectivityCheck } from '../types';
import { LABELS } from '../types';
import wynikSceny from '../../../harness-fixtures/generated/koordynacja_scena_wynik.json';

const WYNIK = wynikSceny as unknown as CoordinationResult;
const [POD, NAD] = WYNIK.devices as [CoordinationDevice, CoordinationDevice];
const [PARA] = WYNIK.selectivity_checks;

function para(zmiana: Partial<SelectivityCheck>): SelectivityCheck {
  return {
    ...PARA,
    upstream_device_id: NAD.id,
    downstream_device_id: POD.id,
    notes_pl: 'Zdanie pary z backendu.',
    ...zmiana,
  };
}

describe('TccInterpretationPanel', () => {
  it('brak ocenianych par — stan nazwany, bez „brak konfliktów"', () => {
    render(<TccInterpretationPanel selectivityChecks={[]} devices={WYNIK.devices} />);
    expect(screen.getByTestId('tcc-interpretation-podsumowanie')).toHaveTextContent(
      'selektywność nie jest potwierdzona',
    );
    expect(screen.queryByText(/Brak konfliktów/)).not.toBeInTheDocument();
  });

  it('wynik sieci złotej — każda para wymieniona z liczbami i zdaniem backendu', () => {
    render(
      <TccInterpretationPanel selectivityChecks={WYNIK.selectivity_checks} devices={WYNIK.devices} />,
    );
    expect(screen.getByTestId('tcc-interpretation-podsumowanie')).toHaveTextContent(
      `${WYNIK.selectivity_checks.length} para stopniowania; bez odstępu czasowego: 0`,
    );
    const pozycja = screen.getByTestId('conflict-item-0');
    expect(pozycja).toHaveTextContent(`${PARA.margin_s!.toFixed(3)} s`);
    expect(pozycja).toHaveTextContent(`Wymagany: ${PARA.required_margin_s.toFixed(3)} s`);
    expect(pozycja).toHaveTextContent(PARA.notes_pl);
    expect(screen.getByTestId('conflict-item-0-stan')).toHaveTextContent(PARA.stan_pl);
  });

  it('odstęp poniżej wymaganego — ta sama pozycja z liczbami, bez etykiety oceny', () => {
    render(
      <TccInterpretationPanel
        selectivityChecks={[para({ margin_s: 0.05, t_upstream_s: 0.15 })]}
        devices={WYNIK.devices}
      />,
    );
    const pozycja = screen.getByTestId('conflict-item-0');
    expect(pozycja).toHaveTextContent('Odstęp czasowy: 0.050 s');
    for (const slowo of ['Wymaga korekty', 'Zgodne', 'BRAK SELEKTYWNOŚCI', 'Δ']) {
      expect(pozycja).not.toHaveTextContent(slowo);
    }
  });

  it('para bez odstępu — liczba „—" i fakt z backendu, nie zero', () => {
    render(
      <TccInterpretationPanel
        selectivityChecks={[
          para({
            margin_s: null,
            t_downstream_s: null,
            stan: 'PODRZEDNE_NIE_ZADZIALA',
            stan_pl: 'zabezpieczenie podrzędne nie zadziała, nadrzędne zadziała',
          }),
        ]}
        devices={WYNIK.devices}
      />,
    );
    expect(screen.getByTestId('conflict-item-0')).toHaveTextContent('Odstęp czasowy: —');
    expect(screen.getByTestId('conflict-item-0-stan')).toHaveTextContent('podrzędne nie zadziała');
    expect(screen.getByTestId('tcc-interpretation-podsumowanie')).toHaveTextContent(
      'bez odstępu czasowego: 1',
    );
  });

  it('urządzenie spoza wyniku nazwane etykietą, nie identyfikatorem', () => {
    render(
      <TccInterpretationPanel
        selectivityChecks={[para({ upstream_device_id: 'relay-obcy-1234' })]}
        devices={WYNIK.devices}
      />,
    );
    const pozycja = screen.getByTestId('conflict-item-0');
    expect(pozycja).toHaveTextContent(LABELS.devices.nieznaneUrzadzenie);
    expect(pozycja).not.toHaveTextContent('relay-obcy');
  });

  it('zwijanie panelu', () => {
    render(<TccInterpretationPanel selectivityChecks={[para({})]} devices={WYNIK.devices} />);
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByTestId('conflict-item-0')).not.toBeInTheDocument();
  });
});
