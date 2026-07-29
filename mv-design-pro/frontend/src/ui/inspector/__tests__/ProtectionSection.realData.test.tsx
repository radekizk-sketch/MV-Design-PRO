/**
 * Audyt E, faza E-5 — inspektor zabezpieczeń zasilony realnym read modelem.
 *
 * Testuje REALNĄ ścieżkę danych: ProtectionSection → useProtectionAssignment
 * → useProtectionView → fetch(`/api/cases/{caseId}/enm/protection-view`)
 * → adapter → render funkcji + krzywej I-t (E-4). fetch jest mockowany na
 * granicy API (nie obchodzimy hooka ani komponentu). Interakcja natywna
 * (userEvent) — bez syntetycznego dispatchEvent.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProtectionSection } from '../ProtectionSection';
import { useAppStateStore } from '../../app-state/store';
import { EMPTY_PROTECTION_VIEW, type ProtectionViewResponse } from '../../protection';

const ELEMENT_WITH_PROTECTION = 'switch-e5-001';

function buildProtectionView(caseId: string): ProtectionViewResponse {
  return {
    case_id: caseId,
    enm_revision: 1,
    view_status: {
      data_source: 'ENM_PROTECTION_READ_MODEL',
      result_state: 'FRESH',
      has_protection_data: true,
    },
    assignments: [
      {
        element_id: ELEMENT_WITH_PROTECTION,
        element_type: 'Switch',
        device_id: 'relay-e5-001',
        device_name_pl: 'Przekaznik pola liniowego',
        device_kind: 'RELAY_OVERCURRENT',
        status: 'ACTIVE',
        settings_summary: {
          functions: [
            {
              code: 'OVERCURRENT_TIME',
              ansi: ['51'],
              label_pl: 'Nadpradowa czasowa (I>)',
              setpoint: {
                basis: 'IN',
                operator: 'GT',
                multiplier: 1.2,
                unit: 'pu',
                display_pl: '1,2×In',
              },
              time_delay_s: 0.5,
              curve_type: 'DT',
              it_curve: {
                standard: 'IEC_60255',
                curve_kind: 'DEFINITE',
                curve_code: 'DT',
                curve_label_pl: 'Charakterystyka niezalezna (DT)',
                pickup_a: 600,
                time_multiplier: null,
                points: [
                  { i_a: 660, t_s: 0.5 },
                  { i_a: 12000, t_s: 0.5 },
                ],
              },
            },
          ],
          curve_type: 'DT',
          base_values: { i_rated_a: 500, f_rated_hz: 50 },
        },
      },
    ],
  };
}

function mockFetchOk(payload: ProtectionViewResponse): void {
  global.fetch = vi.fn(async () => ({
    ok: true,
    statusText: 'OK',
    json: async () => payload,
  })) as unknown as typeof fetch;
}

describe('ProtectionSection — realny read model protection-view (E-5)', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeCaseId: null });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useAppStateStore.setState({ activeCaseId: null });
  });

  it('renderuje funkcje i krzywa I-t z realnego widoku dla elementu z zabezpieczeniem', async () => {
    const caseId = 'case-e5-with-protection';
    useAppStateStore.setState({ activeCaseId: caseId });
    mockFetchOk(buildProtectionView(caseId));

    render(<ProtectionSection elementId={ELEMENT_WITH_PROTECTION} />);

    // Realny fetch trafil pod endpoint protection-view.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/cases/${caseId}/enm/protection-view`,
      );
    });

    // Urzadzenie i funkcja z backendu.
    await screen.findByTestId('protection-assignment-relay-e5-001');
    expect(screen.getByText('Przekaznik pola liniowego')).toBeInTheDocument();

    // Krzywa I-t (E-4) renderuje sie z realnych punktow solvera.
    const panel = await screen.findByTestId('it-curve-panel');
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId('it-curve-chart')).toBeInTheDocument();
  });

  it('krzywa I-t chowa sie po natywnym zwinieciu sekcji i wraca po rozwinieciu', async () => {
    const caseId = 'case-e5-toggle';
    useAppStateStore.setState({ activeCaseId: caseId });
    mockFetchOk(buildProtectionView(caseId));
    const user = userEvent.setup();

    render(<ProtectionSection elementId={ELEMENT_WITH_PROTECTION} />);
    await screen.findByTestId('it-curve-panel');

    // Natywny klik w naglowek sekcji zwija ja.
    await user.click(screen.getByTestId('protection-section-toggle'));
    expect(screen.queryByTestId('it-curve-panel')).toBeNull();

    // Ponowny natywny klik rozwija.
    await user.click(screen.getByTestId('protection-section-toggle'));
    expect(screen.getByTestId('it-curve-panel')).toBeInTheDocument();
  });

  it('element bez zabezpieczenia -> uczciwy stan pusty (brak sekcji)', async () => {
    const caseId = 'case-e5-empty';
    useAppStateStore.setState({ activeCaseId: caseId });
    mockFetchOk({ ...EMPTY_PROTECTION_VIEW, case_id: caseId });

    const { container } = render(<ProtectionSection elementId="element-bez-zabezpieczen" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/cases/${caseId}/enm/protection-view`,
      );
    });

    // Brak przypisania => sekcja sie nie renderuje (uczciwy stan zerowy).
    expect(container.querySelector('[data-testid="inspector-protection-section"]')).toBeNull();
    expect(screen.queryByTestId('it-curve-panel')).toBeNull();
  });
});
