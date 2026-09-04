/**
 * K30-71: SldDetailDrawer — right-side detail panel.
 *
 * Inwarianty:
 * 1. open=false → null
 * 2. data=null → null
 * 3. station kind → 4 tabs (rozdzielnica/transformator/nn/der)
 * 4. bay kind → 2 tabs (apparatus/protection)
 * 5. apparatus kind → 2 tabs (state/settings)
 * 6. der kind → 6 tabs (typ/moc/punkt/falownik/rfg/zabezpieczenia)
 * 7. tab click changes active tab
 * 8. onClose triggered by × button
 * 9. data-testid coverage dla DOM audit
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';

import { SldDetailDrawer, type SldDetailDrawerData } from '../SldDetailDrawer';
import { useAppStateStore } from '../../../../app-state/store';
import { EMPTY_PROTECTION_VIEW, type ProtectionViewResponse } from '../../../../protection';

/**
 * FAB-B (fantom nastaw, M0): mock granicy `fetch` dla realnej ścieżki danych
 * nastaw zabezpieczeń — DOKŁADNIE ten sam wzorzec co
 * `ui/inspector/__tests__/ProtectionSection.realData.test.tsx` (mockujemy
 * `fetch`, nie hook/komponent — `useProtectionAssignment` →
 * `useProtectionView` → `GET /api/cases/{caseId}/enm/protection-view`).
 */
function mockProtectionViewFetchOk(payload: ProtectionViewResponse): void {
  global.fetch = vi.fn(async () => ({
    ok: true,
    statusText: 'OK',
    json: async () => payload,
  })) as unknown as typeof fetch;
}

/** Element BEZ przypisanego zabezpieczenia w modelu (uczciwy stan zerowy). */
function protectionViewEmptyFor(caseId: string): ProtectionViewResponse {
  return { ...EMPTY_PROTECTION_VIEW, case_id: caseId };
}

/** Jedno przypisanie zabezpieczenia z realnymi nastawami (setpoint P16b). */
function protectionViewWithAssignment(
  caseId: string,
  elementId: string,
): ProtectionViewResponse {
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
        element_id: elementId,
        element_type: 'Switch',
        device_id: 'relay-fabb-001',
        device_name_pl: 'Przekaznik FAB-B',
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
              time_delay_s: 0.8,
              curve_type: 'IEC SI',
            },
          ],
          curve_type: 'IEC SI',
          base_values: { i_rated_a: 400 },
        },
      },
    ],
  };
}

const STATION_DATA: SldDetailDrawerData = {
  kind: 'station',
  elementId: 'stn/abc/station',
  label: 'S08',
  voltageKv: 15,
  stationCode: 'S08',
  accentColor: '#13C45A',
};

describe('SldDetailDrawer — K30-71 right-side detail panel', () => {
  // FAB-B: kilka testów w tym pliku napędza teraz realną ścieżkę danych
  // nastaw zabezpieczeń (useProtectionAssignment → useAppStateStore.
  // activeCaseId). Reset PO KAŻDYM teście (niezależnie od tego, który test
  // go ustawił) — zero wycieku stanu store'a między testami tego pliku.
  afterEach(() => {
    useAppStateStore.setState({ activeCaseId: null });
  });

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
    expect(getByText('Układy PV/BESS/FW')).toBeInTheDocument();
    cleanup();
  });

  it('nie pokazuje surowego identyfikatora modelu w karcie stacji', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    const drawerText = container.textContent ?? '';
    const root = container.querySelector('[data-testid="sld-v2-detail-drawer"]');

    expect(root?.getAttribute('aria-label')).toBe('Detal: S08');
    expect(drawerText).not.toContain('stn/abc/station');
    expect(drawerText).not.toContain('Element:');
    expect(drawerText).toContain('Układ: Stacja S08');
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

  it('der kind → 6 tabs (Typ, Moc, Punkt, Falownik, NC RfG, Zabezpieczenia)', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'pv-1', label: 'PV-15' };
    const { container, getByText } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    const tabsWrapper = container.querySelector('[data-testid="sld-v2-detail-drawer-tabs"]');
    expect(tabsWrapper?.querySelectorAll('button')).toHaveLength(6);
    expect(getByText('Typ')).toBeInTheDocument();
    expect(getByText('Moc znamionowa')).toBeInTheDocument();
    expect(getByText('Punkt podłączenia')).toBeInTheDocument();
    expect(getByText('Falownik')).toBeInTheDocument();
    expect(getByText('NC RfG')).toBeInTheDocument();
    expect(getByText('Zabezpieczenia źródła')).toBeInTheDocument();
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
    expect(nnRadio.checked).toBe(true);
    expect(snRadio.checked).toBe(false);
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
    expect(snRadio.checked).toBe(true);
    cleanup();
  });

  it('station tab "transformator" pokazuje panel inżynierski i braki danych', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-transformator"]') as Element);
    expect(container.querySelector('[data-testid="drawer-tr-engineering-panel"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-tr-vector-group"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-tr-rated-kva"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-tr-voltages"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-tr-status"]')?.textContent).toBe('DO UZUPEŁNIENIA');
    expect(container.querySelector('[data-testid="drawer-tr-blockers"]')?.textContent).toContain(
      'Brak transformatora SN/nN przypisanego do stacji.',
    );
    cleanup();
  });

  it('K30-79: station tab "transformator" renders real ENM transformerSpec', () => {
    const data: SldDetailDrawerData = {
      ...STATION_DATA,
      transformerSpec: {
        ref: 'tr-1',
        name: 'Transformator T1',
        vectorGroup: 'Dyn11',
        snMva: 0.63,
        uhvKv: 15,
        ulvKv: 0.4,
        ukPercent: 6.0,
        pkKw: 6.4,
        catalogRef: 'tr-630-dyn11',
        dataQuality: 'model',
        blockers: [],
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-transformator"]') as Element);
    expect(container.querySelector('[data-testid="drawer-tr-status"]')?.textContent).toBe('DANE KOMPLETNE');
    expect(container.querySelector('[data-testid="drawer-tr-name"]')?.textContent).toBe('Transformator T1');
    expect(container.querySelector('[data-testid="drawer-tr-vector-group"]')?.textContent).toBe('Dyn11');
    expect(container.querySelector('[data-testid="drawer-tr-rated-kva"]')?.textContent).toBe('630 kVA');
    expect(container.querySelector('[data-testid="drawer-tr-voltages"]')?.textContent).toBe('15 kV / 0,4 kV');
    expect(container.querySelector('[data-testid="drawer-tr-uk-percent"]')?.textContent).toBe('6 %');
    expect(container.querySelector('[data-testid="drawer-tr-catalog-ref"]')?.textContent).toBe('tr-630-dyn11');
    cleanup();
  });

  it('K30-79: brak transformerSpec nie udaje danych zerowych ani myślników', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-transformator"]') as Element);
    const panelText = container.querySelector('[data-testid="drawer-tr-engineering-panel"]')?.textContent ?? '';
    expect(container.querySelector('[data-testid="drawer-tr-vector-group"]')?.textContent).toBe('Brak danych');
    expect(container.querySelector('[data-testid="drawer-tr-rated-kva"]')?.textContent).toBe('Brak danych');
    expect(panelText).toContain('Braki danych');
    expect(panelText).not.toContain('—');
    expect(panelText).not.toContain('0 kVA');
    cleanup();
  });

  it('K30-79: przycisk konfiguracji transformatora wywołuje callback', () => {
    const onOpenConfiguration = vi.fn();
    const { container } = render(
      <SldDetailDrawer
        open
        data={STATION_DATA}
        onClose={vi.fn()}
        onOpenConfiguration={onOpenConfiguration}
      />,
    );
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-transformator"]') as Element);
    fireEvent.click(container.querySelector('[data-testid="drawer-tr-open-config"]') as Element);
    expect(onOpenConfiguration).toHaveBeenCalledTimes(1);
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
    const data: SldDetailDrawerData = {
      ...STATION_DATA,
      baysSpec: [],
      switchgearDescription: 'Rozdzielnica SN: układ przelotowy z polem wejściowym, wyjściowym i transformatorowym.',
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-rozdzielnica-empty"]')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).toContain('Rozdzielnica SN: układ przelotowy z polem wejściowym, wyjściowym i transformatorowym.');
    expect(text).not.toContain('wariant katalogowy');
    expect(text).not.toContain('Brak pól SN');
    expect(text).not.toContain('via E-11');
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
    expect(container.querySelector('[data-testid="drawer-nn-bus-voltage"]')?.textContent).toBe('0,4 kV');
    expect(container.querySelector('[data-testid="drawer-nn-loads-count"]')?.textContent).toBe('2');
    expect(container.querySelector('[data-testid="drawer-nn-load-load-1"]')?.textContent).toContain('25,5 kW');
    expect(container.querySelector('[data-testid="drawer-nn-load-load-1"]')?.textContent).toContain('8,2 kvar');
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
    expect(container.querySelector('[data-testid="drawer-station-der-total"]')?.textContent).toContain('0,70 MW');
    cleanup();
  });

  it('station DER tab nie pokazuje wewnetrznych nazw Blok PV/BESS', () => {
    const data: SldDetailDrawerData = {
      ...STATION_DATA,
      existingDers: [
        { id: 'pv-1', kind: 'PV', name: 'Blok PV', pMw: 1 },
        { id: 'bess-1', kind: 'BESS', name: 'Blok BESS', pMw: 0.5 },
      ],
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-der"]') as Element);
    const text = container.textContent ?? '';

    expect(text).not.toContain('Blok PV');
    expect(text).not.toContain('Blok BESS');
    expect(text).toContain('Układ fotowoltaiczny 01');
    expect(text).toContain('Magazyn energii 02');
    expect(text).toContain('1,00 MW');
    expect(text).toContain('0,50 MW');
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
    expect(input.value).toBe('0.5');
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

  // FAB-B (fantom nastaw, M0): przepisane z zachowaniem intencji — zakładka
  // DER/Zabezpieczenia miała ZASZYTĄ listę 6 kodów ANSI z fikcyjnymi progami
  // napięciowymi/częstotliwościowymi zaszytymi na stałe, niezależnie od
  // modelu. Teraz karta czyta realny read model `protection-view` (ta sama
  // ścieżka co `ui/inspector/ProtectionSection`) — test mockuje `fetch` na
  // granicy API, klik w kartę jest natywny (fireEvent.click na realnym
  // przycisku).
  it('K30-85/FAB-B: DER "Zabezpieczenia" pokazuje realną nastawę z modelu (element z przypisaniem)', async () => {
    const caseId = 'case-fabb-der-with-protection';
    const elementId = 'pv-1';
    useAppStateStore.setState({ activeCaseId: caseId });
    mockProtectionViewFetchOk(protectionViewWithAssignment(caseId, elementId));

    const data: SldDetailDrawerData = { kind: 'der', elementId, label: 'PV-1' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-protection"]') as Element);
    expect(container.querySelector('[data-testid="drawer-der-protection"]')).toBeTruthy();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="drawer-protection-device-relay-fabb-001"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-testid="drawer-protection-device-relay-fabb-001"]')?.textContent)
      .toContain('Przekaznik FAB-B');
    // Dokładnie wartość z modelu (setpoint.display_pl), nie liczba zmyślona przez UI.
    expect(container.querySelector('[data-testid="protection-func-51-OVERCURRENT_TIME"]')?.textContent)
      .toContain('1,2×In');
    cleanup();
  });

  it('K30-85/FAB-B: DER "Zabezpieczenia" — element BEZ przypisania w modelu ⇒ uczciwy stan zerowy, zero zmyślonych nastaw', async () => {
    const caseId = 'case-fabb-der-empty';
    const elementId = 'pv-bez-zabezpieczen';
    useAppStateStore.setState({ activeCaseId: caseId });
    mockProtectionViewFetchOk(protectionViewEmptyFor(caseId));

    const data: SldDetailDrawerData = { kind: 'der', elementId, label: 'PV-2' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-protection"]') as Element);
    expect(container.querySelector('[data-testid="drawer-der-protection"]')).toBeTruthy();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="drawer-der-protection-empty"]')).toBeTruthy();
    });
    const panelText = container.querySelector('[data-testid="drawer-der-protection"]')?.textContent ?? '';
    expect(panelText).toContain('Brak nastaw w modelu dla tego elementu.');
    // Zakaz jakiejkolwiek wartości nastawy — brak jednostek Un/In/Hz/s w sekcji.
    expect(panelText).not.toMatch(/\d+([.,]\d+)?\s*(Un|In|Hz|A|s)\b/);
    expect(container.querySelector('[data-testid="drawer-protection-device-relay-fabb-001"]')).toBeFalsy();
    cleanup();
  });

  it('K30-86: apparatus "state" tab renders actual state + control mode', () => {
    const data: SldDetailDrawerData = { kind: 'apparatus', elementId: 'cb-1', label: 'CB-1' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-apparatus-state"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-apparatus-actual-state"]')?.textContent).toBe('zamknięty');
    cleanup();
  });

  // FAB-B: przepisane z zachowaniem intencji — „Nastawy" aparatu miały
  // ZASZYTE 50/51/67 z fikcyjnymi wartościami I_set/T niezależnie od modelu.
  // Realna ścieżka: `useProtectionAssignment` (ta sama co inspektor).
  it('K30-86/FAB-B: apparatus "Nastawy" pokazuje realną nastawę z modelu (element z przypisaniem)', async () => {
    const caseId = 'case-fabb-apparatus-with-protection';
    const elementId = 'cb-1';
    useAppStateStore.setState({ activeCaseId: caseId });
    mockProtectionViewFetchOk(protectionViewWithAssignment(caseId, elementId));

    const data: SldDetailDrawerData = { kind: 'apparatus', elementId, label: 'CB-1' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-settings"]') as Element);
    expect(container.querySelector('[data-testid="drawer-apparatus-settings"]')).toBeTruthy();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="drawer-protection-device-relay-fabb-001"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-testid="protection-func-51-OVERCURRENT_TIME"]')?.textContent)
      .toContain('1,2×In');
    cleanup();
  });

  it('K30-86/FAB-B: apparatus "Nastawy" — element BEZ przypisania w modelu ⇒ uczciwy stan zerowy, zero zmyślonych nastaw', async () => {
    const caseId = 'case-fabb-apparatus-empty';
    const elementId = 'cb-bez-zabezpieczen';
    useAppStateStore.setState({ activeCaseId: caseId });
    mockProtectionViewFetchOk(protectionViewEmptyFor(caseId));

    const data: SldDetailDrawerData = { kind: 'apparatus', elementId, label: 'CB-2' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-settings"]') as Element);
    expect(container.querySelector('[data-testid="drawer-apparatus-settings"]')).toBeTruthy();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="drawer-apparatus-settings-empty"]')).toBeTruthy();
    });
    const panelText = container.querySelector('[data-testid="drawer-apparatus-settings"]')?.textContent ?? '';
    expect(panelText).toContain('Brak nastaw w modelu dla tego elementu.');
    expect(panelText).not.toMatch(/\d+([.,]\d+)?\s*(Un|In|Hz|A|s)\b/);
    expect(container.querySelector('[data-testid="drawer-protection-device-relay-fabb-001"]')).toBeFalsy();
    cleanup();
  });

  // FAB-B: przepisane z zachowaniem intencji — „Zabezpieczenia pola" miały
  // ZASZYTĄ listę 50/51/67/50N-51N/79 z etykietą „tier" niezależnie od tego,
  // co jest naprawdę przypisane polu w modelu. Realna ścieżka jak wyżej.
  it('K30-86/FAB-B: bay "Zabezpieczenia" pokazuje realną nastawę z modelu (element z przypisaniem)', async () => {
    const caseId = 'case-fabb-bay-with-protection';
    const elementId = 'q01';
    useAppStateStore.setState({ activeCaseId: caseId });
    mockProtectionViewFetchOk(protectionViewWithAssignment(caseId, elementId));

    const data: SldDetailDrawerData = { kind: 'bay', elementId, label: 'Q01' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-protection"]') as Element);
    expect(container.querySelector('[data-testid="drawer-bay-protection"]')).toBeTruthy();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="drawer-protection-device-relay-fabb-001"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-testid="protection-func-51-OVERCURRENT_TIME"]')?.textContent)
      .toContain('1,2×In');
    cleanup();
  });

  it('K30-86/FAB-B: bay "Zabezpieczenia" — element BEZ przypisania w modelu ⇒ uczciwy stan zerowy, zero zmyślonych nastaw', async () => {
    const caseId = 'case-fabb-bay-empty';
    const elementId = 'q02-bez-zabezpieczen';
    useAppStateStore.setState({ activeCaseId: caseId });
    mockProtectionViewFetchOk(protectionViewEmptyFor(caseId));

    const data: SldDetailDrawerData = { kind: 'bay', elementId, label: 'Q02' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-protection"]') as Element);
    expect(container.querySelector('[data-testid="drawer-bay-protection"]')).toBeTruthy();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="drawer-bay-protection-empty"]')).toBeTruthy();
    });
    const panelText = container.querySelector('[data-testid="drawer-bay-protection"]')?.textContent ?? '';
    expect(panelText).toContain('Brak nastaw w modelu dla tego elementu.');
    expect(panelText).not.toMatch(/\d+([.,]\d+)?\s*(Un|In|Hz|A|s)\b/);
    expect(container.querySelector('[data-testid="drawer-protection-device-relay-fabb-001"]')).toBeFalsy();
    cleanup();
  });

  it('K30-86: zakładka DER "Falownik" renderuje katalog per technologia', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'pv-1', label: 'PV-1', derKind: 'PV' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-inverter"]') as Element);
    expect(container.querySelector('[data-testid="drawer-der-inverter"]')).toBeTruthy();
    const select = container.querySelector('[data-testid="drawer-der-inverter-select"]') as HTMLSelectElement;
    expect(select.value).toBe('conv-pv-nn-0p5mw-0p4kv');
    cleanup();
  });

  it('K30-86: zakładka DER "Falownik" dla BESS ma inne typy niż PV', () => {
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'b-1', label: 'BESS-1', derKind: 'BESS' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-inverter"]') as Element);
    const select = container.querySelector('[data-testid="drawer-der-inverter-select"]') as HTMLSelectElement;
    expect(select.value).toBe('conv-bess-nn-0p5mw-0p4kv');
    cleanup();
  });

  it('K30-87: footer NOT rendered gdy onSave nie podany', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-footer"]')).toBeFalsy();
    cleanup();
  });

  it('K30-87: karta techniczna stacji nie pokazuje pustego zapisu nawet gdy onSave podany', () => {
    const onSave = vi.fn();
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} onSave={onSave} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-footer"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-save"]')).toBeFalsy();
    expect(onSave).not.toHaveBeenCalled();
    cleanup();
  });

  it('K30-87: konfiguracja DER pokazuje realny zapis i anulowanie', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const data: SldDetailDrawerData = { kind: 'der', elementId: 'pv-1', label: 'PV-1', derKind: 'PV' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={onClose} onSave={onSave} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-footer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-save"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-cancel"]')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-cancel"]') as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('K30-99: DER save returns validated payload in MW and catalog ref', async () => {
    const onSave = vi.fn();
    const data: SldDetailDrawerData = {
      kind: 'der',
      elementId: 'station/1',
      label: 'Stacja 1',
      voltageKv: 15,
      derKind: 'PV',
      derConnectionVariant: 'nn_side',
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-moc"]') as Element);
    const powerInput = container.querySelector('[data-testid="drawer-der-power-input"]') as HTMLInputElement;
    fireEvent.change(powerInput, { target: { value: '1.2' } });
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-save"]') as Element);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      kind: 'der',
      elementId: 'station/1',
      derConfig: {
        derKind: 'PV',
        powerMw: 1.2,
        connectionVariant: 'nn_side',
        pointVoltageKv: 0.4,
        inverterCatalogRef: 'conv-pv-nn-0p5mw-0p4kv',
        ncRfgModule: 'A',
      },
    });
    cleanup();
  });

  it('K30-99: DER save blocks power outside 0.1-10 MW', async () => {
    const onSave = vi.fn();
    const data: SldDetailDrawerData = {
      kind: 'der',
      elementId: 'station/1',
      label: 'Stacja 1',
      derKind: 'PV',
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-moc"]') as Element);
    const powerInput = container.querySelector('[data-testid="drawer-der-power-input"]') as HTMLInputElement;
    fireEvent.change(powerInput, { target: { value: '0.05' } });
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-save"]') as Element);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="drawer-der-power-error"]')).toBeTruthy();
    });
    expect(onSave).not.toHaveBeenCalled();
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
    expect(container.querySelector('[data-testid="drawer-cable-length"]')?.textContent).toBe('12,35 km');
    expect(container.querySelector('[data-testid="drawer-cable-segment-count"]')?.textContent).toBe('5');
    expect(container.querySelector('[data-testid="drawer-cable-station-count"]')?.textContent).toBe('8');
    cleanup();
  });

  it('K30-88: cable_run parametry tab renders (container present)', () => {
    const data: SldDetailDrawerData = { kind: 'cable_run', elementId: 'run-1', label: 'Ciąg-1' };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-parametry"]') as Element);
    expect(container.querySelector('[data-testid="drawer-cable-parametry"]')).toBeTruthy();
    cleanup();
  });

  it('FAB-C (fantom danych katalogowych K30-89): parametry tab renders REAL catalog data z cableRunSpec, nie zaszyte literały', () => {
    const data: SldDetailDrawerData = {
      kind: 'cable_run', elementId: 'run-1', label: 'Ciąg-1',
      cableRunSpec: {
        runKind: 'main_trunk',
        segmentCount: 1,
        stationCount: null,
        lengthKm: 2.4,
        segmentKind: 'cable_sn',
        catalogRef: 'cable-base-xlpe-al-1c-240',
        conductorMaterial: 'Al',
        crossSectionMm2: 240,
        insulation: 'XLPE',
        ratingInA: 400,
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-parametry"]') as Element);
    expect(container.querySelector('[data-testid="drawer-cable-catalog-ref"]')?.textContent).toBe('cable-base-xlpe-al-1c-240');
    expect(container.querySelector('[data-testid="drawer-cable-cross-section"]')?.textContent).toBe('240 mm²');
    expect(container.querySelector('[data-testid="drawer-cable-material"]')?.textContent).toBe('Al');
    expect(container.querySelector('[data-testid="drawer-cable-insulation"]')?.textContent).toBe('XLPE');
    expect(container.querySelector('[data-testid="drawer-cable-ampacity"]')?.textContent).toBe('400 A');
    // Negatywny test wobec USUNIĘTEJ fabrykacji (K30-89): wartości z modelu są
    // CELOWO inne niż dawne zaszyte literały XRUHKXS 1×120 / 120 mm² / 270 A /
    // PN-HD 620 S2 — gdyby komponent nadal je ignorował i renderował stałe
    // teksty, ten test złapałby to wprost (nie tylko przez brak asercji „—").
    const panelText = container.querySelector('[data-testid="drawer-cable-parametry"]')?.textContent ?? '';
    expect(panelText).not.toContain('XRUHKXS');
    expect(panelText).not.toContain('270 A');
    expect(panelText).not.toContain('PN-HD 620');
    expect(panelText).not.toContain('120 mm');
    // „Norma" fabrykowana USUNIĘTA na amen — model ENM nie niesie normy
    // konstrukcyjnej kabla, więc wiersz nie ma prawa istnieć wcale.
    expect(container.querySelector('[data-testid="drawer-cable-parametry"]')?.textContent).not.toContain('Norma');
    cleanup();
  });

  it('FAB-C: parametry tab — uczciwy stan zerowy „Brak w modelu" gdy segment bez catalog_ref/przekroju/materiału/obciążalności', () => {
    const data: SldDetailDrawerData = {
      kind: 'cable_run', elementId: 'run-2', label: 'Ciąg-2',
      cableRunSpec: {
        runKind: 'branch',
        segmentCount: 1,
        stationCount: null,
        lengthKm: 1.0,
        segmentKind: 'cable_sn',
        catalogRef: null,
        conductorMaterial: null,
        crossSectionMm2: null,
        insulation: null,
        ratingInA: null,
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-parametry"]') as Element);
    const panel = container.querySelector('[data-testid="drawer-cable-parametry"]') as HTMLElement;
    expect(container.querySelector('[data-testid="drawer-cable-catalog-ref"]')?.textContent).toBe('Brak w modelu');
    expect(container.querySelector('[data-testid="drawer-cable-cross-section"]')?.textContent).toBe('Brak w modelu');
    expect(container.querySelector('[data-testid="drawer-cable-material"]')?.textContent).toBe('Brak w modelu');
    expect(container.querySelector('[data-testid="drawer-cable-insulation"]')?.textContent).toBe('Brak w modelu');
    expect(container.querySelector('[data-testid="drawer-cable-ampacity"]')?.textContent).toBe('Brak w modelu');
    // ŻADNEJ liczby z jednostką mm²/A w sekcji parametrów — zero fallbacku liczbowego.
    expect(panel.textContent ?? '').not.toMatch(/\d+([.,]\d+)?\s*(mm²|A)\b/);
    cleanup();
  });

  it('FAB-C: parametry tab — linia napowietrzna pokazuje „Nie dotyczy" dla izolacji (ENM OverheadLine strukturalnie nie ma pola insulation)', () => {
    const data: SldDetailDrawerData = {
      kind: 'cable_run', elementId: 'run-3', label: 'Ciąg-3',
      cableRunSpec: {
        runKind: 'main_trunk',
        segmentCount: 1,
        stationCount: null,
        lengthKm: 3.2,
        segmentKind: 'overhead_line_sn',
        catalogRef: 'line-base-al-70',
        conductorMaterial: 'Al',
        crossSectionMm2: 70,
        insulation: null,
        ratingInA: 210,
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-parametry"]') as Element);
    expect(container.querySelector('[data-testid="drawer-cable-insulation"]')?.textContent).toBe('Nie dotyczy (przewód goły)');
    expect(container.querySelector('[data-testid="drawer-cable-catalog-ref"]')?.textContent).toBe('line-base-al-70');
    expect(container.querySelector('[data-testid="drawer-cable-cross-section"]')?.textContent).toBe('70 mm²');
    expect(container.querySelector('[data-testid="drawer-cable-ampacity"]')?.textContent).toBe('210 A');
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

  it('K30-97: apparatus state tab renders real state z apparatusState prop', () => {
    const data: SldDetailDrawerData = {
      kind: 'apparatus', elementId: 'cb-1', label: 'CB-1',
      apparatusState: {
        actualState: 'open',
        controlMode: 'ZDALNY',
        communicationOk: true,
        interlockBlocked: false,
        lastChangeAt: '2026-05-16T08:30:00Z',
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-apparatus-actual-state"]')?.textContent).toBe('otwarty');
    cleanup();
  });

  it('K30-98: breadcrumb pokazuje parent station + bay dla apparatus kind', () => {
    const data: SldDetailDrawerData = {
      kind: 'apparatus', elementId: 'cb-1', label: 'CB-1',
      parentStationLabel: 'GPZ Centrum',
      parentBayLabel: 'Pole Q01',
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    const crumb = container.querySelector('[data-testid="sld-v2-detail-drawer-breadcrumb"]');
    expect(crumb?.textContent).toContain('GPZ Centrum');
    expect(crumb?.textContent).toContain('Pole Q01');
    cleanup();
  });

  it('K30-98: breadcrumb hidden gdy brak parent context', () => {
    const { container } = render(<SldDetailDrawer open data={STATION_DATA} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-breadcrumb"]')).toBeFalsy();
    cleanup();
  });

  it('K30-97: apparatus state tab pokazuje BŁĄD komunikacji + aktywne uzależnienie', () => {
    const data: SldDetailDrawerData = {
      kind: 'apparatus', elementId: 'cb-1', label: 'CB-1',
      apparatusState: {
        actualState: 'closed',
        controlMode: 'LOKALNY',
        communicationOk: false,
        interlockBlocked: true,
        lastChangeAt: null,
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    const dl = container.querySelector('[data-testid="drawer-apparatus-state"]');
    expect(dl?.textContent).toContain('BŁĄD');
    expect(dl?.textContent).toContain('Uzależnienie operacyjne');
    expect(dl?.textContent).toContain('aktywne');
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

  it('drawer akcji: pokazuje akcje domenowe, wykonuje aktywne i blokuje niedostępne z powodem', () => {
    const onActive = vi.fn();
    const onDisabled = vi.fn();
    const { container } = render(
      <SldDetailDrawer
        open
        data={STATION_DATA}
        onClose={vi.fn()}
        actions={[
          { id: 'show-results', labelPl: 'Pokaż wyniki', group: 'widok', onClick: onActive },
          {
            id: 'delete-station',
            labelPl: 'Usuń stację',
            group: 'usun',
            disabledReasonPl: 'Brak aktywnego zakresu obliczeń.',
            onClick: onDisabled,
          },
        ]}
      />,
    );
    const showResults = container.querySelector('[data-testid="sld-v2-detail-drawer-action-show-results"]') as HTMLButtonElement;
    const deleteStation = container.querySelector('[data-testid="sld-v2-detail-drawer-action-delete-station"]') as HTMLButtonElement;
    expect(showResults).toBeTruthy();
    expect(deleteStation).toBeTruthy();
    expect(deleteStation.getAttribute('data-disabled')).toBe('true');
    expect(deleteStation.title).toBe('Brak aktywnego zakresu obliczeń.');
    fireEvent.click(showResults);
    fireEvent.click(deleteStation);
    expect(onActive).toHaveBeenCalledTimes(1);
    expect(onDisabled).not.toHaveBeenCalled();
    cleanup();
  });

  it('drawer węzła terenowego pokazuje kartę techniczną i operacje bez przeskoku ekranu', () => {
    const data: SldDetailDrawerData = {
      kind: 'node',
      elementId: 'bp-1',
      label: 'ZK SN 1',
      nodeSpec: {
        nodeKind: 'zksn',
        rolePl: 'Złącze kablowe SN',
        voltageKv: 15,
        connectedSegmentsCount: 3,
        catalogRef: 'zksn-standard-15kv',
        blockers: [],
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-karta"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-operacje"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-node-role"]')?.textContent).toBe('Złącze kablowe SN');
    expect(container.querySelector('[data-testid="drawer-node-voltage"]')?.textContent).toBe('15 kV');
    fireEvent.click(container.querySelector('[data-testid="sld-v2-detail-drawer-tab-operacje"]') as Element);
    expect(container.querySelector('[data-testid="drawer-node-operation-rules"]')).toBeTruthy();
    cleanup();
  });

  it('drawer transformatora pokazuje pełną kartę inżynierską zamiast pustych kresek', () => {
    const data: SldDetailDrawerData = {
      kind: 'transformer',
      elementId: 'tr-1',
      label: 'Transformator SN/nN T1',
      voltageKv: 15,
      transformerSpec: {
        ref: 'tr-1',
        name: 'Transformator SN/nN T1',
        vectorGroup: 'Dyn11',
        snMva: 0.63,
        uhvKv: 15,
        ulvKv: 0.4,
        ukPercent: 4,
        pkKw: 5.2,
        catalogRef: 'tr-630-15-04',
        dataQuality: 'model',
        blockers: [],
      },
    };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="drawer-tr-engineering-panel"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drawer-tr-rated-kva"]')?.textContent).toBe('630 kVA');
    expect(container.querySelector('[data-testid="drawer-tr-vector-group"]')?.textContent).toBe('Dyn11');
    expect(container.querySelector('[data-testid="drawer-tr-status"]')?.textContent).toBe('DANE KOMPLETNE');
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
