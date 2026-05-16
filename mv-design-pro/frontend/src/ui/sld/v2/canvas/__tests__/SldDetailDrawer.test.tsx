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
});
