/**
 * K30-71: SldDetailDrawer — right-side detail panel.
 *
 * Inwarianty:
 * 1. open=false → null
 * 2. data=null → null
 * 3. station kind → 4 tabs (rozdzielnica/transformator/nn/der)
 * 4. bay kind → 2 tabs (apparatus/protection)
 * 5. apparatus kind → 2 tabs (state/settings)
 * 6. der kind → 6 tabs (typ/moc/punkt/inverter/rfg/protection)
 * 7. tab click changes active tab
 * 8. onClose triggered by × button
 * 9. data-testid coverage dla DOM audit
 */

import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { SldDetailDrawer, type SldDetailDrawerData } from '../SldDetailDrawer';

const STATION_DATA: SldDetailDrawerData = {
  kind: 'station',
  elementId: 'stn/abc/station',
  label: 'S08',
  voltageKv: 15,
  stationCode: 'S08',
  accentColor: '#13C45A',
};

describe('SldDetailDrawer — K30-71 right-side detail panel', () => {
  it('open=false → null', () => {
    const { container } = render(<SldDetailDrawer open={false} data={STATION_DATA} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer"]')).toBeFalsy();
    cleanup();
  });

  it('data=null → null', () => {
    const { container } = render(<SldDetailDrawer open data={null} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer"]')).toBeFalsy();
    cleanup();
  });

  it('station kind → 4 tabs (Rozdzielnica SN, Transformator, Strona nN, DER)', () => {
    const { container, getByText } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer"]')).toBeTruthy();
    const tabsWrapper = container.querySelector('[data-testid="sld-v2-detail-drawer-tabs"]');
    expect(tabsWrapper?.querySelectorAll('button')).toHaveLength(4);
    expect(getByText('Rozdzielnica SN')).toBeInTheDocument();
    expect(getByText('Transformator')).toBeInTheDocument();
    expect(getByText('Strona nN')).toBeInTheDocument();
    expect(getByText('DER (PV/BESS/FW)')).toBeInTheDocument();
    cleanup();
  });

  it('bay kind → 2 tabs (Aparatura, Zabezpieczenia)', () => {
    const data: SldDetailDrawerData = { kind: 'bay', elementId: 'b1', label: 'Q01' };
    const { container, getByText } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    const tabsWrapper = container.querySelector('[data-testid="sld-v2-detail-drawer-tabs"]');
    expect(tabsWrapper?.querySelectorAll('button')).toHaveLength(2);
    expect(getByText('Aparatura')).toBeInTheDocument();
    expect(getByText('Zabezpieczenia')).toBeInTheDocument();
    cleanup();
  });

  it('apparatus kind → 2 tabs (Stan + telemetria, Nastawy)', () => {
    const data: SldDetailDrawerData = { kind: 'apparatus', elementId: 'a1', label: 'CB-1' };
    const { container, getByText } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    const tabsWrapper = container.querySelector('[data-testid="sld-v2-detail-drawer-tabs"]');
    expect(tabsWrapper?.querySelectorAll('button')).toHaveLength(2);
    expect(getByText('Stan + telemetria')).toBeInTheDocument();
    expect(getByText('Nastawy')).toBeInTheDocument();
    cleanup();
  });

  it('der kind → 6 tabs (Typ, Moc, Punkt, Inverter, NC RfG, Protection)', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'pv-1', label: 'PV-15' };
    const { container, getByText } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    const tabsWrapper = container.querySelector('[data-testid="sld-v2-detail-drawer-tabs"]');
    expect(tabsWrapper?.querySelectorAll('button')).toHaveLength(6);
    expect(getByText('Typ')).toBeInTheDocument();
    expect(getByText('Moc znamionowa')).toBeInTheDocument();
    expect(getByText('Punkt podłączenia')).toBeInTheDocument();
    expect(getByText('Inverter')).toBeInTheDocument();
    expect(getByText('NC RfG')).toBeInTheDocument();
    expect(getByText('Zabezpieczenia DER')).toBeInTheDocument();
    cleanup();
  });

  it('tab click changes active tab', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    const firstTab = container.querySelector('[data-testid="sld-v2-detail-drawer-tab-rozdzielnica"]');
    const transformerTab = container.querySelector('[data-testid="sld-v2-detail-drawer-tab-transformator"]');
    expect(firstTab?.getAttribute('data-active')).toBe('true');
    expect(transformerTab?.getAttribute('data-active')).toBe('false');
    fireEvent.click(transformerTab as Element);
    expect(transformerTab?.getAttribute('data-active')).toBe('true');
    expect(firstTab?.getAttribute('data-active')).toBe('false');
    cleanup();
  });

  it('× button triggers onClose', () => {
    const onClose = vi.fn();
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={onClose} />);
    const closeBtn = container.querySelector('[data-testid="sld-v2-detail-drawer-close"]');
    fireEvent.click(closeBtn as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('data-testid coverage: kind label, breadcrumb (gdy nie station), tab content', () => {
    const bayData: SldDetailDrawerData = {
      kind: 'bay', elementId: 'q01', label: 'Q01', stationCode: 'S08',
    };
    const { container } = render(<SldDetailDrawer open data={bayData} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-kind"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-label"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-breadcrumb"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-content-apparatus"]')).toBeTruthy();
    cleanup();
  });

  it('station kind brak breadcrumb (już sama jest stacją)', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-breadcrumb"]')).toBeFalsy();
    cleanup();
  });

  it('DER typ tab renders type selector (default PV)', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'pv-1', label: 'PV-15' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-der-type-selector"]')).toBeTruthy();
    const select = container.querySelector('[data-testid="drawer-der-type-select"]') as HTMLSelectElement | null;
    expect(select?.value).toBe('PV');
    cleanup();
  });

  it('DER rfg tab renders 4 radio buttons (typ A/B/C/D)', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'pv-1', label: 'PV-15' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-rfg"]') as Element);
    expect(container.querySelector('[data-testid="drawer-der-rfg"]')).toBeTruthy();
    const radios = container.querySelectorAll('[data-testid="drawer-der-rfg-types"] input[type="radio"]');
    expect(radios).toHaveLength(4);
    cleanup();
  });

  it('K30-78: DER typ tab respects derKind pre-fill (BESS)', () => {
    const data: SldDetailDrawerData = {
      kind: 'der', elementId: 'der-1', label: 'Stacja S-08',
      derKind: 'BESS',
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    const select = container.querySelector('[data-testid="drawer-der-type-select"]') as HTMLSelectElement | null;
    expect(select?.value).toBe('BESS');
    cleanup();
  });

  it('K30-78: DER punkt tab pre-fills connection_variant=nn_side default', () => {
    const data: SldDetailDrawerData = {
      kind: 'der', elementId: 'der-1', label: 'Stacja S-08',
      derKind: 'PV', derConnectionVariant: 'nn_side',
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-punkt"]') as Element);
    expect(container.querySelector('[data-testid="drawer-der-connection-variant"]')).toBeTruthy();
    const nnRadio = container.querySelector('[data-testid="drawer-der-connection-nn_side"]') as HTMLInputElement;
    const snRadio = container.querySelector('[data-testid="drawer-der-connection-sn_side"]') as HTMLInputElement;
    expect(nnRadio.defaultChecked).toBe(true);
    expect(snRadio.defaultChecked).toBe(false);
    cleanup();
  });

  it('K30-78: DER punkt tab pre-fills connection_variant=sn_side when passed', () => {
    const data: SldDetailDrawerData = {
      kind: 'der', elementId: 'der-1', label: 'PV-1',
      derKind: 'PV', derConnectionVariant: 'sn_side',
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-punkt"]') as Element);
    const snRadio = container.querySelector('[data-testid="drawer-der-connection-sn_side"]') as HTMLInputElement;
    expect(snRadio.defaultChecked).toBe(true);
    cleanup();
  });

  it('station tab "transformator" pokazuje vector group + rated kVA placeholders', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-transformator"]') as Element);
    expect(container.querySelector('[data-testid="drawer-tr-vector-group"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-tr-rated-kva"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-tr-voltages"]')).toBeTruthy();
    cleanup();
  });

  it('K30-79: station tab "transformator" renders real ENM transformerSpec', () => {
    const data: SldDetailDrawerData = {
      ...STATION_DATA,
      transformerSpec: {
        vectorGroup: 'Dyn11',
        snMva: 0.63,
        uhvKv: 15,
        ulvKv: 0.4,
        ukPercent: 6.0,
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-transformator"]') as Element);
    expect(container.querySelector('[data-testid="drawer-tr-vector-group"]')?.textContent).toBe('Dyn11');
    expect(container.querySelector('[data-testid="drawer-tr-rated-kva"]')?.textContent).toBe('630 kVA');
    expect(container.querySelector('[data-testid="drawer-tr-voltages"]')?.textContent).toBe('15 / 0.4 kV');
    cleanup();
  });

  it('K30-79: brak transformerSpec → wszystkie pola "—"', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-transformator"]') as Element);
    expect(container.querySelector('[data-testid="drawer-tr-vector-group"]')?.textContent).toBe('—');
    expect(container.querySelector('[data-testid="drawer-tr-rated-kva"]')?.textContent).toBe('—');
    cleanup();
  });

  it('K30-80: station tab "rozdzielnica" lista bays z baysSpec', () => {
    const data: SldDetailDrawerData = {
      ...STATION_DATA,
      baysSpec: [
        { id: 'bay-q01', name: 'Q01', bayRole: 'IN', bayNumber: '1', feederShortName: 'Dopływ' },
        { id: 'bay-q02', name: 'Q02', bayRole: 'OUT', bayNumber: '2', feederShortName: 'Odpływ' },
        { id: 'bay-q03', name: 'Q03', bayRole: 'TR', bayNumber: '3', feederShortName: null },
      ],
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-rozdzielnica-bays"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="drawer-rozdzielnica-bay-"]')).toHaveLength(3);
    expect(container.querySelector('[data-testid="drawer-rozdzielnica-bay-bay-q01"]')?.textContent).toContain('Q1');
    expect(container.querySelector('[data-testid="drawer-rozdzielnica-bay-bay-q02"]')?.textContent).toContain('Pole odpływowe');
    cleanup();
  });

  it('K30-80: rozdzielnica empty state gdy baysSpec puste', () => {
    const data: SldDetailDrawerData = { ...STATION_DATA, baysSpec: [] };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-rozdzielnica-empty"]')).toBeTruthy();
    cleanup();
  });

  it('K30-81: nN tab renders bus voltage + loads list z nnSpec', () => {
    const data: SldDetailDrawerData = {
      ...STATION_DATA,
      nnSpec: {
        busVoltageKv: 0.4,
        loads: [
          { id: 'load-1', name: 'Odbiór mieszkalny', pKw: 25.5, qKvar: 8.2 },
          { id: 'load-2', name: 'Odbiór przemysłowy', pKw: 120, qKvar: 40 },
        ],
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-nn"]') as Element);
    expect(container.querySelector('[data-testid="drawer-nn-side"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-nn-bus-voltage"]')?.textContent).toBe('0.4 kV');
    expect(container.querySelector('[data-testid="drawer-nn-loads-count"]')?.textContent).toBe('2');
    expect(container.querySelector('[data-testid="drawer-nn-load-load-1"]')?.textContent).toContain('25.5 kW');
    cleanup();
  });

  it('K30-81: nN tab "Brak odpływów" gdy loads puste', () => {
    const data: SldDetailDrawerData = {
      ...STATION_DATA,
      nnSpec: { busVoltageKv: 0.4, loads: [] },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-nn"]') as Element);
    expect(container.querySelector('[data-testid="drawer-nn-no-loads"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-nn-loads-count"]')?.textContent).toBe('0');
    cleanup();
  });

  it('K30-82: station DER tab pokazuje istniejące DERs z existingDers', () => {
    const data: SldDetailDrawerData = {
      ...STATION_DATA,
      existingDers: [
        { id: 'pv-1', kind: 'PV', name: 'Panel PV 1', pMw: 0.5 },
        { id: 'bess-1', kind: 'BESS', name: 'Magazyn 1', pMw: 0.2 },
      ],
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-der"]') as Element);
    expect(container.querySelector('[data-testid="drawer-station-der"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-station-der-pv-1"]')?.textContent).toContain('PV');
    expect(container.querySelector('[data-testid="drawer-station-der-bess-1"]')?.textContent).toContain('BESS');
    expect(container.querySelector('[data-testid="drawer-station-der-total"]')?.textContent).toContain('0.70 MW');
    cleanup();
  });

  it('K30-82: station DER tab "Brak DERs" CTA gdy existingDers puste', () => {
    const data: SldDetailDrawerData = { ...STATION_DATA, existingDers: [] };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-der"]') as Element);
    expect(container.querySelector('[data-testid="drawer-station-der-empty"]')).toBeTruthy();
    cleanup();
  });

  it('K30-83: bay apparatus tab renders apparatusSpec list z state colors', () => {
    const data: SldDetailDrawerData = {
      kind: 'bay', elementId: 'bay-q01', label: 'Q01',
      apparatusSpec: [
        { id: 'q01#breaker', kind: 'CB', label: 'Wyłącznik', state: 'closed' },
        { id: 'q01#disconnector_in', kind: 'DS', label: 'Odłącznik', state: 'open' },
        { id: 'q01#earthing', kind: 'ES', label: 'Uziemnik', state: 'unknown' },
      ],
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-bay-apparatus"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="drawer-bay-app-"][data-testid$="-state"]')).toHaveLength(3);
    expect(container.querySelector('[data-testid="drawer-bay-app-q01#breaker-state"]')?.textContent).toBe('zamknięty');
    expect(container.querySelector('[data-testid="drawer-bay-app-q01#disconnector_in-state"]')?.textContent).toBe('otwarty');
    expect(container.querySelector('[data-testid="drawer-bay-app-q01#earthing-state"]')?.textContent).toBe('nieznany');
    cleanup();
  });

  it('K30-84: liveMetrics chips rendered w drawer header gdy podane', () => {
    const data: SldDetailDrawerData = {
      ...STATION_DATA,
      liveMetrics: [
        { label: 'U', value: '15.20 kV' },
        { label: 'U_pu', value: '1.013 pu', color: '#13C45A' },
      ],
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-live-metrics"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-metric-U"]')?.textContent).toBe('U=15.20 kV');
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-metric-U_pu"]')?.textContent).toBe('U_pu=1.013 pu');
    cleanup();
  });

  it('K30-84: brak liveMetrics → no chip area rendered', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-live-metrics"]')).toBeFalsy();
    cleanup();
  });

  it('K30-83: bay apparatus tab empty state', () => {
    const data: SldDetailDrawerData = {
      kind: 'bay', elementId: 'bay-q02', label: 'Q02',
      apparatusSpec: [],
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-bay-apparatus-empty"]')).toBeTruthy();
    cleanup();
  });

  it('K30-85: DER "Moc" tab renders nominal power input + presets per kind', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'pv-1', label: 'PV-1', derKind: 'PV' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-moc"]') as Element);
    expect(container.querySelector('[data-testid="drawer-der-power"]')).toBeTruthy();
    const input = container.querySelector('[data-testid="drawer-der-power-input"]') as HTMLInputElement;
    expect(input.defaultValue).toBe('100');
    expect(container.querySelector('[data-testid="drawer-der-power-preset-500"]')).toBeTruthy();
    cleanup();
  });

  it('K30-85: DER "Moc" BESS presets różnią się (50-1000 kW)', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'b-1', label: 'BESS-1', derKind: 'BESS' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-moc"]') as Element);
    expect(container.querySelector('[data-testid="drawer-der-power-preset-1000"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-der-power-preset-2000"]')).toBeFalsy();
    cleanup();
  });

  it('K30-85: DER "Protection" tab renders 6 ANSI codes (27/59/81U/81O/78/32R)', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'pv-1', label: 'PV-1' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-protection"]') as Element);
    expect(container.querySelector('[data-testid="drawer-der-protection"]')).toBeTruthy();
    for (const code of ['27', '59', '81U', '81O', '78', '32R']) {
      expect(container.querySelector(`[data-testid="drawer-der-protection-${code}"]`)).toBeTruthy();
    }
    cleanup();
  });

  it('K30-86: apparatus "state" tab renders actual state + control mode', () => {
    const data: SldDetailDrawerData = { kind: 'apparatus', elementId: 'cb-1', label: 'CB-1' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-apparatus-state"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-apparatus-actual-state"]')?.textContent).toBe('zamknięty');
    cleanup();
  });

  it('K30-86: apparatus "settings" tab renders ANSI 50/51/67 settings', () => {
    const data: SldDetailDrawerData = { kind: 'apparatus', elementId: 'cb-1', label: 'CB-1' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-settings"]') as Element);
    expect(container.querySelector('[data-testid="drawer-apparatus-settings"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-apparatus-setting-50"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-apparatus-setting-51"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-apparatus-setting-67"]')).toBeTruthy();
    cleanup();
  });

  it('K30-86: bay "protection" tab renders 50/51/67/50N-51N/79', () => {
    const data: SldDetailDrawerData = { kind: 'bay', elementId: 'q01', label: 'Q01' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-protection"]') as Element);
    expect(container.querySelector('[data-testid="drawer-bay-protection"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-bay-protection-50"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-bay-protection-79"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-bay-protection-50N-51N"]')).toBeTruthy();
    cleanup();
  });

  it('K30-86: DER "Inverter" tab renders catalog dropdown per kind', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'pv-1', label: 'PV-1', derKind: 'PV' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-inverter"]') as Element);
    expect(container.querySelector('[data-testid="drawer-der-inverter"]')).toBeTruthy();
    const select = container.querySelector('[data-testid="drawer-der-inverter-select"]') as HTMLSelectElement;
    expect(select.value).toBe('PV-INV-50KW-04KV');
    cleanup();
  });

  it('K30-86: DER "Inverter" tab BESS catalog options różnią się od PV', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'b-1', label: 'BESS-1', derKind: 'BESS' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-inverter"]') as Element);
    const select = container.querySelector('[data-testid="drawer-der-inverter-select"]') as HTMLSelectElement;
    expect(select.value).toBe('BESS-INV-50KW');
    cleanup();
  });

  it('K30-87: footer NOT rendered gdy onSave nie podany', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-footer"]')).toBeFalsy();
    cleanup();
  });

  it('K30-87: footer "Zapisz" + "Anuluj" buttons gdy onSave podany', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={onClose} onSave={onSave} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-footer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-save"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-cancel"]')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-save"]') as Element);
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-cancel"]') as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('K30-88: cable_run kind → 3 tabs (Trasa/Parametry/Spadek)', () => {
    const data: SldDetailDrawerData = { kind: 'cable_run', elementId: 'run-1', label: 'Ciąg-1' };
    const { container, getByText } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    const tabsWrapper = container.querySelector('[data-testid="sld-v2-detail-drawer-tabs"]');
    expect(tabsWrapper?.querySelectorAll('button')).toHaveLength(3);
    expect(getByText('Trasa')).toBeInTheDocument();
    expect(getByText('Parametry')).toBeInTheDocument();
    expect(getByText('Spadek napięcia')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="drawer-cable-trasa"]')).toBeTruthy();
    cleanup();
  });

  it('K30-89: cable_run trasa tab renders real cableRunSpec (length/segments)', () => {
    const data: SldDetailDrawerData = {
      kind: 'cable_run', elementId: 'run-1', label: 'Ciąg-1',
      cableRunSpec: {
        runKind: 'main_trunk',
        segmentCount: 5,
        stationCount: 8,
        lengthKm: 12.345,
        segmentKind: 'cable_sn',
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-cable-run-kind"]')?.textContent).toBe('ciąg główny');
    expect(container.querySelector('[data-testid="drawer-cable-length"]')?.textContent).toBe('12.35 km');
    expect(container.querySelector('[data-testid="drawer-cable-segment-count"]')?.textContent).toBe('5');
    expect(container.querySelector('[data-testid="drawer-cable-station-count"]')?.textContent).toBe('8');
    cleanup();
  });

  it('K30-88: cable_run parametry tab renders ampacity + cable type', () => {
    const data: SldDetailDrawerData = { kind: 'cable_run', elementId: 'run-1', label: 'Ciąg-1' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-parametry"]') as Element);
    expect(container.querySelector('[data-testid="drawer-cable-parametry"]')).toBeTruthy();
    cleanup();
  });

  it('K30-88: Escape key wywołuje onClose', () => {
    const onClose = vi.fn();
    render(<SldDetailDrawer open data={STATION_DATA} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('K30-88: Escape key no-op gdy drawer closed', () => {
    const onClose = vi.fn();
    render(<SldDetailDrawer open={false} data={STATION_DATA} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    cleanup();
  });

  it('K30-90: ArrowRight switches do next tab (station 4 tabs wrap)', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    const firstTab = container.querySelector('[data-testid="sld-v2-detail-drawer-tab-rozdzielnica"]');
    expect(firstTab?.getAttribute('data-active')).toBe('true');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const trTab = container.querySelector('[data-testid="sld-v2-detail-drawer-tab-transformator"]');
    expect(trTab?.getAttribute('data-active')).toBe('true');
    expect(firstTab?.getAttribute('data-active')).toBe('false');
    cleanup();
  });

  it('K30-90: ArrowLeft cofa do poprzedniej (wrap z 0 → last)', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    const lastTab = container.querySelector('[data-testid="sld-v2-detail-drawer-tab-der"]');
    expect(lastTab?.getAttribute('data-active')).toBe('true');
    cleanup();
  });

  it('K30-93: cable_run Spadek tab renders real loading + vdrop z lfDerived', () => {
    const data: SldDetailDrawerData = {
      kind: 'cable_run', elementId: 'run-1', label: 'Ciąg-1',
      cableRunSpec: {
        runKind: 'main_trunk',
        segmentCount: 5,
        stationCount: 8,
        lengthKm: 12.0,
        segmentKind: 'cable_sn',
        maxLoadingPct: 82.5,
        maxVoltageDropPct: 6.3,
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-spadek"]') as Element);
    expect(container.querySelector('[data-testid="drawer-cable-vdrop-total"]')?.textContent).toBe('6.30 %');
    expect(container.querySelector('[data-testid="drawer-cable-loading"]')?.textContent).toBe('82.5 %');
    cleanup();
  });

  it('K30-95: alarm badge widoczny dla critical severity', () => {
    const data: SldDetailDrawerData = { ...STATION_DATA, alarmSeverity: 'critical' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    const badge = container.querySelector('[data-testid="sld-v2-detail-drawer-alarm-badge"]') as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('data-severity')).toBe('critical');
    expect(badge.textContent).toContain('critical');
    cleanup();
  });

  it('K30-95: alarm badge ukryty gdy alarmSeverity=null', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-alarm-badge"]')).toBeFalsy();
    cleanup();
  });

  it('K30-96: auto-focus close button when drawer opens', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    const closeBtn = container.querySelector('[data-testid="sld-v2-detail-drawer-close"]');
    expect(document.activeElement).toBe(closeBtn);
    cleanup();
  });

  it('K30-94: ARIA — role="dialog" + aria-label na root drawer', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    const root = container.querySelector('[data-testid="sld-v2-detail-drawer"]') as HTMLElement;
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-label')).toContain('Detal');
    cleanup();
  });

  it('K30-94: ARIA — role="tablist" + role="tab" + aria-selected', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    const tabs = container.querySelector('[data-testid="sld-v2-detail-drawer-tabs"]') as HTMLElement;
    expect(tabs.getAttribute('role')).toBe('tablist');
    const firstTab = container.querySelector('[data-testid="sld-v2-detail-drawer-tab-rozdzielnica"]') as HTMLElement;
    expect(firstTab.getAttribute('role')).toBe('tab');
    expect(firstTab.getAttribute('aria-selected')).toBe('true');
    expect(firstTab.getAttribute('tabindex')).toBe('0');
    const secondTab = container.querySelector('[data-testid="sld-v2-detail-drawer-tab-transformator"]') as HTMLElement;
    expect(secondTab.getAttribute('aria-selected')).toBe('false');
    expect(secondTab.getAttribute('tabindex')).toBe('-1');
    cleanup();
  });

  it('K30-94: ARIA — role="tabpanel" linked do aktywnego tab via aria-controls', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    const firstTab = container.querySelector('[data-testid="sld-v2-detail-drawer-tab-rozdzielnica"]') as HTMLElement;
    const controlsId = firstTab.getAttribute('aria-controls');
    expect(controlsId).toBe('sld-v2-detail-drawer-tabpanel-rozdzielnica');
    const tabpanel = container.querySelector(`#${controlsId}`) as HTMLElement;
    expect(tabpanel?.getAttribute('role')).toBe('tabpanel');
    expect(tabpanel?.getAttribute('aria-labelledby')).toBe(firstTab.id);
    cleanup();
  });

  it('K30-93: cable_run Spadek tab "—" gdy brak metrics', () => {
    const data: SldDetailDrawerData = {
      kind: 'cable_run', elementId: 'run-1', label: 'Ciąg-1',
      cableRunSpec: {
        runKind: 'main_trunk',
        segmentCount: 1,
        stationCount: 1,
        lengthKm: 1,
        segmentKind: 'cable_sn',
        maxLoadingPct: null,
        maxVoltageDropPct: null,
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-spadek"]') as Element);
    expect(container.querySelector('[data-testid="drawer-cable-vdrop-total"]')?.textContent).toBe('—');
    expect(container.querySelector('[data-testid="drawer-cable-loading"]')?.textContent).toBe('—');
    cleanup();
  });

  it('K30-91: action toolbar widoczny gdy onOpenFullView podany', () => {
    const onOpenFullView = vi.fn();
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} onOpenFullView={onOpenFullView} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-actions"]')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-open-full-view"]') as Element);
    expect(onOpenFullView).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('K30-91: action toolbar ukryty bez onOpenFullView', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-actions"]')).toBeFalsy();
    cleanup();
  });

  it('K30-90: arrow keys ignored gdy input focused', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'pv-1', label: 'PV-1' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-moc"]') as Element);
    const input = container.querySelector('[data-testid="drawer-der-power-input"]') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    // active tab should still be 'moc' (no nav)
    const mocTab = container.querySelector('[data-testid="sld-v2-detail-drawer-tab-moc"]');
    expect(mocTab?.getAttribute('data-active')).toBe('true');
    cleanup();
  });
});
