/**
 * FIX-12B — Results Tables Tests
 *
 * Tests for sensitivity, selectivity, and overload tables.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  VerdictBadge,
  SensitivityTable,
  SelectivityTable,
  OverloadTable,
  SummaryCard,
} from '../ResultsTables';
import type {
  SensitivityCheck,
  SelectivityCheck,
  OverloadCheck,
  ProtectionDevice,
} from '../types';
import { LABELS } from '../types';

// =============================================================================
// Mock Data
// =============================================================================

const mockDevices: ProtectionDevice[] = [
  {
    id: 'device-1',
    name: 'Zabezpieczenie 1',
    device_type: 'RELAY',
    location_element_id: 'bus_1',
    settings: {
      stage_51: {
        enabled: true,
        pickup_current_a: 400,
        directional: false,
      },
    },
  },
  {
    id: 'device-2',
    name: 'Zabezpieczenie 2',
    device_type: 'RELAY',
    location_element_id: 'bus_2',
    settings: {
      stage_51: {
        enabled: true,
        pickup_current_a: 300,
        directional: false,
      },
    },
  },
];

const mockSensitivityChecks: SensitivityCheck[] = [
  {
    device_id: 'device-1',
    i_fault_min_a: 2500,
    i_pickup_a: 400,
    margin_percent: 525,
    verdict: 'PASS',
    verdict_pl: 'Prawidlowa',
    notes_pl: 'Margines wystarczajacy',
  },
  {
    device_id: 'device-2',
    i_fault_min_a: 1200,
    i_pickup_a: 1000,
    margin_percent: 20,
    verdict: 'MARGINAL',
    verdict_pl: 'Graniczny',
    notes_pl: 'Niski margines',
  },
];

const mockSelectivityChecks: SelectivityCheck[] = [
  {
    upstream_device_id: 'device-1',
    downstream_device_id: 'device-2',
    analysis_current_a: 3000,
    t_upstream_s: 0.8,
    t_downstream_s: 0.3,
    margin_s: 0.5,
    required_margin_s: 0.3,
    verdict: 'PASS',
    verdict_pl: 'Prawidlowa',
    notes_pl: 'Selektywnosc zapewniona',
  },
];

const mockOverloadChecks: OverloadCheck[] = [
  {
    device_id: 'device-1',
    i_operating_a: 250,
    i_pickup_a: 400,
    margin_percent: 60,
    verdict: 'PASS',
    verdict_pl: 'Prawidlowa',
    notes_pl: 'Nie zadzial przy obciazeniu',
  },
];

// =============================================================================
// VerdictBadge Tests
// =============================================================================

describe('VerdictBadge', () => {
  it('should render PASS verdict correctly', () => {
    render(<VerdictBadge verdict="PASS" />);
    expect(screen.getByText(LABELS.verdict.PASS)).toBeInTheDocument();
  });

  it('should render MARGINAL verdict correctly', () => {
    render(<VerdictBadge verdict="MARGINAL" />);
    expect(screen.getByText(LABELS.verdict.MARGINAL)).toBeInTheDocument();
  });

  it('should render FAIL verdict correctly', () => {
    render(<VerdictBadge verdict="FAIL" />);
    expect(screen.getByText(LABELS.verdict.FAIL)).toBeInTheDocument();
  });

  it('should render ERROR verdict correctly', () => {
    render(<VerdictBadge verdict="ERROR" />);
    expect(screen.getByText(LABELS.verdict.ERROR)).toBeInTheDocument();
  });

  it('should have correct test ID', () => {
    render(<VerdictBadge verdict="PASS" />);
    expect(screen.getByTestId('verdict-badge-pass')).toBeInTheDocument();
  });

  it('should support size prop', () => {
    const { rerender } = render(<VerdictBadge verdict="PASS" size="sm" />);
    expect(screen.getByTestId('verdict-badge-pass')).toHaveClass('text-xs');

    rerender(<VerdictBadge verdict="PASS" size="md" />);
    expect(screen.getByTestId('verdict-badge-pass')).toHaveClass('text-sm');
  });
});

// =============================================================================
// SensitivityTable Tests
// =============================================================================

describe('SensitivityTable', () => {
  it('should render sensitivity table', () => {
    render(
      <SensitivityTable
        checks={mockSensitivityChecks}
        devices={mockDevices}
      />
    );
    expect(screen.getByTestId('sensitivity-table')).toBeInTheDocument();
  });

  it('should display table headers', () => {
    render(
      <SensitivityTable
        checks={mockSensitivityChecks}
        devices={mockDevices}
      />
    );
    expect(screen.getByText(LABELS.checks.sensitivity.title)).toBeInTheDocument();
    expect(screen.getByText(LABELS.checks.sensitivity.iFaultMin)).toBeInTheDocument();
    expect(screen.getByText(LABELS.checks.sensitivity.iPickup)).toBeInTheDocument();
  });

  it('should display device names', () => {
    render(
      <SensitivityTable
        checks={mockSensitivityChecks}
        devices={mockDevices}
      />
    );
    expect(screen.getByText('Zabezpieczenie 1')).toBeInTheDocument();
    expect(screen.getByText('Zabezpieczenie 2')).toBeInTheDocument();
  });

  it('should display verdict badges', () => {
    render(
      <SensitivityTable
        checks={mockSensitivityChecks}
        devices={mockDevices}
      />
    );
    expect(screen.getByText(LABELS.verdict.PASS)).toBeInTheDocument();
    expect(screen.getByText(LABELS.verdict.MARGINAL)).toBeInTheDocument();
  });

  it('should call onRowClick when row is clicked', () => {
    const onRowClick = vi.fn();
    render(
      <SensitivityTable
        checks={mockSensitivityChecks}
        devices={mockDevices}
        onRowClick={onRowClick}
      />
    );

    fireEvent.click(screen.getByText('Zabezpieczenie 1'));
    expect(onRowClick).toHaveBeenCalledWith('device-1');
  });

  it('should show empty state when no checks', () => {
    render(
      <SensitivityTable
        checks={[]}
        devices={mockDevices}
      />
    );
    expect(screen.getByText('Brak danych czulosci')).toBeInTheDocument();
  });
});

// =============================================================================
// SelectivityTable Tests
// =============================================================================

describe('SelectivityTable', () => {
  it('should render selectivity table', () => {
    render(
      <SelectivityTable
        checks={mockSelectivityChecks}
        devices={mockDevices}
      />
    );
    expect(screen.getByTestId('selectivity-table')).toBeInTheDocument();
  });

  it('should display table headers', () => {
    render(
      <SelectivityTable
        checks={mockSelectivityChecks}
        devices={mockDevices}
      />
    );
    expect(screen.getByText(LABELS.checks.selectivity.title)).toBeInTheDocument();
    expect(screen.getByText(LABELS.checks.selectivity.downstream)).toBeInTheDocument();
    expect(screen.getByText(LABELS.checks.selectivity.upstream)).toBeInTheDocument();
    expect(screen.getByText(LABELS.checks.selectivity.deltaT)).toBeInTheDocument();
  });

  it('should display time margins', () => {
    render(
      <SelectivityTable
        checks={mockSelectivityChecks}
        devices={mockDevices}
      />
    );
    expect(screen.getByText('0.500')).toBeInTheDocument(); // margin_s
    expect(screen.getByText('0.300')).toBeInTheDocument(); // t_downstream_s
  });

  it('should show empty state message when no checks', () => {
    render(
      <SelectivityTable
        checks={[]}
        devices={mockDevices}
      />
    );
    expect(screen.getByText(LABELS.checks.selectivity.minDevicesRequired)).toBeInTheDocument();
  });

  // F-K4 faza 3b (znalezisko Z4): werdykt miskoordynacji musi prowadzić do
  // urządzenia, którego nastawę trzeba zmienić — NADRZĘDNEGO (rezerwowego),
  // bo podrzędne ma zadziałać pierwsze i szybko (stopniowanie CTI).
  it('klik w wiersz prowadzi do urządzenia NADRZĘDNEGO pary (pętla decyzji)', () => {
    const onRowClick = vi.fn();
    render(
      <SelectivityTable
        checks={mockSelectivityChecks}
        devices={mockDevices}
        onRowClick={onRowClick}
      />
    );

    fireEvent.click(screen.getByText('Zabezpieczenie 1'));

    const [upstreamId, downstreamId] = onRowClick.mock.calls[0];
    expect(upstreamId).toBe(mockSelectivityChecks[0].upstream_device_id);
    expect(downstreamId).toBe(mockSelectivityChecks[0].downstream_device_id);
    expect(upstreamId).not.toBe(downstreamId);
  });

  it('bez onRowClick wiersz nie udaje klikalnego (brak kursora wskazującego)', () => {
    render(
      <SelectivityTable
        checks={mockSelectivityChecks}
        devices={mockDevices}
      />
    );

    const wiersz = screen.getByTestId('selectivity-table').querySelector('tbody tr');
    expect(wiersz?.className).not.toContain('cursor-pointer');
  });
});

// =============================================================================
// OverloadTable Tests
// =============================================================================

describe('OverloadTable', () => {
  it('should render overload table', () => {
    render(
      <OverloadTable
        checks={mockOverloadChecks}
        devices={mockDevices}
      />
    );
    expect(screen.getByTestId('overload-table')).toBeInTheDocument();
  });

  it('should display table headers', () => {
    render(
      <OverloadTable
        checks={mockOverloadChecks}
        devices={mockDevices}
      />
    );
    expect(screen.getByText(LABELS.checks.overload.title)).toBeInTheDocument();
    expect(screen.getByText(LABELS.checks.overload.iOperating)).toBeInTheDocument();
    expect(screen.getByText(LABELS.checks.overload.iPickup)).toBeInTheDocument();
  });

  it('should display margin percentages', () => {
    render(
      <OverloadTable
        checks={mockOverloadChecks}
        devices={mockDevices}
      />
    );
    expect(screen.getByText('60.0%')).toBeInTheDocument();
  });

  it('should call onRowClick when row is clicked', () => {
    const onRowClick = vi.fn();
    render(
      <OverloadTable
        checks={mockOverloadChecks}
        devices={mockDevices}
        onRowClick={onRowClick}
      />
    );

    fireEvent.click(screen.getByText('Zabezpieczenie 1'));
    expect(onRowClick).toHaveBeenCalledWith('device-1');
  });
});

// =============================================================================
// SummaryCard Tests
// =============================================================================

describe('SummaryCard', () => {
  it('should render summary card', () => {
    render(
      <SummaryCard
        title="Czulosc"
        passCount={5}
        marginalCount={1}
        failCount={0}
      />
    );
    expect(screen.getByTestId('summary-card')).toBeInTheDocument();
  });

  it('should display title', () => {
    render(
      <SummaryCard
        title="Czulosc"
        passCount={5}
        marginalCount={1}
        failCount={0}
      />
    );
    expect(screen.getByText('Czulosc')).toBeInTheDocument();
  });

  it('should display pass count', () => {
    render(
      <SummaryCard
        title="Czulosc"
        passCount={5}
        marginalCount={0}
        failCount={0}
      />
    );
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('should display marginal count when non-zero', () => {
    render(
      <SummaryCard
        title="Czulosc"
        passCount={3}
        marginalCount={2}
        failCount={0}
      />
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should display fail count when non-zero', () => {
    render(
      <SummaryCard
        title="Czulosc"
        passCount={3}
        marginalCount={0}
        failCount={1}
      />
    );
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
