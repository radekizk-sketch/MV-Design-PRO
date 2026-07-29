import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStationDerStore } from '../../../network-build/station-der';
import { NcRfgTestsTab } from '../NcRfgTestsTab';

const catalogResponse = {
  procedure_version: 'PTPiREE Procedura testowania v3.0',
  source_ref: 'ncrfg-ptpiree-v3',
  operators: [
    {
      operator_id: 'enea',
      operator_name_pl: 'Enea Operator',
      last_revision: '2026-01-01',
    },
  ],
  tests: [],
};

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      statusText: 'OK',
      json: async () => catalogResponse,
    })),
  );
}

describe('NcRfgTestsTab', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
    mockFetch();
    window.location.hash = '#analysis?tab=ncrfg-tests';
  });

  it('prowadzi inżyniera z pustego stanu do schematu i katalogu DER', async () => {
    const user = userEvent.setup();

    render(<NcRfgTestsTab />);

    expect(screen.getByTestId('ncrfg-audit-matrix')).toBeInTheDocument();
    expect(screen.getByTestId('ncrfg-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('ncrfg-flow-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('ncrfg-blocker-table')).toBeInTheDocument();
    expect(screen.getByText('Falownik / PCS')).toBeInTheDocument();
    expect(screen.getByText('brak punktu przyłączenia do stacji lub ciągu SN')).toBeInTheDocument();
    expect(screen.getByText('Profesor sieci SN')).toBeInTheDocument();
    expect(screen.getByText('Specjalista DER/NC RfG')).toBeInTheDocument();
    expect(screen.getByTestId('ncrfg-run-tests')).toBeDisabled();
    expect(screen.getByTestId('ncrfg-run-tests')).toHaveTextContent('Wykonaj testy NC RfG');
    expect(screen.getByTestId('ncrfg-run-tests')).toHaveAttribute(
      'title',
      expect.stringContaining('Dodaj układ PV/BESS/FW z katalogu'),
    );
    expect(screen.getByTestId('ncrfg-run-disabled-reason')).toHaveTextContent(
      'Dodaj układ PV/BESS/FW z katalogu',
    );
    expect(document.body.textContent ?? '').not.toMatch(/uruchom|Uruchom|nieuruchom/i);

    await user.click(screen.getByTestId('ncrfg-open-catalog'));
    expect(window.location.hash).toBe('#catalog');

    await user.click(screen.getByTestId('ncrfg-open-sld'));
    expect(window.location.hash).toBe('#sld');
  });

  it('po dodaniu DER pokazuje formularz wejścia testu zamiast pustego stanu', () => {
    useStationDerStore.getState().attachDer({
      id: 'der-pv-1',
      project_id: 'project-1',
      station_id: 'station-1',
      der_kind: 'PV',
      name: 'PV S01',
      connection_side: 'SN',
      bus_przylaczenia_ref: 'pcc-pv-1',
      voltage_level_ref: '15 kV',
      nominal_power_kw: 500,
      catalogs: {
        device_catalog_ref: 'ptpiree-pv-inverter-500',
      },
      profiles: {
        lvrt_curve_ref: 'lvrt-enea',
        hvrt_curve_ref: 'hvrt-enea',
        regulation_profile_ref: 'qu-enea',
      },
    });

    render(<NcRfgTestsTab />);

    expect(screen.queryByTestId('ncrfg-empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('Wejście testu')).toBeInTheDocument();
    expect(screen.getByText('PV S01 · PV · 500 kW')).toBeInTheDocument();
    expect(screen.getByTestId('ncrfg-run-tests')).toBeEnabled();
    expect(screen.getByTestId('ncrfg-run-tests')).toHaveTextContent('Wykonaj testy NC RfG');
  });
});
