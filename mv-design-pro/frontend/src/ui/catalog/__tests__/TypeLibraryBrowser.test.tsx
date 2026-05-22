import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TypeLibraryBrowser } from '../TypeLibraryBrowser';
import * as catalogApi from '../api';
import type { CatalogListItem } from '../api';
import type { TypeCategory } from '../types';

vi.mock('../api');

const TAB_LABELS = [
  'Typy linii napowietrznych',
  'Typy kabli SN',
  'Typy zasilania systemowego SN',
  'Typy transformatorów SN/nN',
  'Typy aparatury łączeniowej SN',
  'Typy aparatury SN',
  'Typy aparatury nN',
  'Typy kabli nN',
  'Typy obciążeń',
  'Typy przekładników prądowych',
  'Typy przekładników napięciowych',
  'Typy przekładników pomiarowych',
  'Typy falowników źródeł fotowoltaicznych',
  'Typy falowników magazynów energii',
  'Typy konwerterów',
  'Typy zabezpieczeń',
] as const;

const catalogByCategory: Record<TypeCategory, CatalogListItem[]> = {
  LINE: [
    {
      id: 'line-001',
      name: 'ACSR 240',
      manufacturer: 'ABC Cables',
      r_ohm_per_km: 0.12,
      x_ohm_per_km: 0.39,
      b_us_per_km: 2.82,
      rated_current_a: 645,
      standard: 'IEC 61089',
      max_temperature_c: 70,
      voltage_rating_kv: 15,
      conductor_material: 'ACSR',
      cross_section_mm2: 240,
    },
    {
      id: 'line-002',
      name: 'ACSR 120',
      manufacturer: 'ABC Cables',
      r_ohm_per_km: 0.24,
      x_ohm_per_km: 0.41,
      b_us_per_km: 2.65,
      rated_current_a: 400,
      standard: 'IEC 61089',
      max_temperature_c: 70,
      voltage_rating_kv: 15,
      conductor_material: 'ACSR',
      cross_section_mm2: 120,
    },
  ],
  CABLE: [
    {
      id: 'cable-001',
      name: 'NA2XS(F)2Y 240',
      manufacturer: 'XYZ Cables',
      r_ohm_per_km: 0.125,
      x_ohm_per_km: 0.11,
      c_nf_per_km: 210,
      rated_current_a: 355,
      voltage_rating_kv: 15,
      insulation_type: 'XLPE',
      standard: 'IEC 60502',
      conductor_material: 'Al',
      cross_section_mm2: 240,
      max_temperature_c: 90,
    },
  ],
  SYSTEM_SOURCE: [
    {
      id: 'source-001',
      name: 'GPZ 110/15 kV',
      manufacturer: 'OSD Północ',
      operator_name: 'OSD Północ',
      supply_role: 'GPZ',
      short_circuit_model: 'THEVENIN',
      earthing_system: 'RESISTIVE',
      voltage_rating_kv: 15,
      sk3_mva: 350,
      rx_ratio: 0.15,
      notes_pl: 'Zasilanie podstawowe',
    },
  ],
  TRANSFORMER: [
    {
      id: 'trafo-001',
      name: 'ONAN 40 MVA 110/15 kV',
      manufacturer: 'Trafo Inc',
      rated_power_mva: 40,
      voltage_hv_kv: 110,
      voltage_lv_kv: 15,
      uk_percent: 10.5,
      pk_kw: 150,
      i0_percent: 0.5,
      p0_kw: 25,
      vector_group: 'Dyn11',
      cooling_class: 'ONAN',
      tap_min: -5,
      tap_max: 5,
      tap_step_percent: 2.5,
    },
  ],
  SWITCH_EQUIPMENT: [
    {
      id: 'switch-001',
      name: 'VD4 12 kV 630 A',
      manufacturer: 'ABB',
      equipment_kind: 'CIRCUIT_BREAKER',
      un_kv: 12,
      in_a: 630,
      ik_ka: 25,
      icw_ka: 25,
      medium: 'VACUUM',
    },
  ],
  MV_APPARATUS: [
    {
      id: 'mv-app-001',
      name: 'Pole liniowe SN',
      manufacturer: 'Switchgear SA',
      equipment_kind: 'LINE_BAY',
      voltage_rating_kv: 15,
      rated_current_a: 630,
    },
  ],
  LV_APPARATUS: [
    {
      id: 'lv-app-001',
      name: 'Rozdzielnica nN 1600 A',
      manufacturer: 'LV Systems',
      equipment_kind: 'LV_SWITCHBOARD',
      rated_current_a: 1600,
      voltage_rating_kv: 0.4,
    },
  ],
  LV_CABLE: [
    {
      id: 'lv-cable-001',
      name: 'YAKY 4x240',
      manufacturer: 'XYZ Cables',
      cross_section_mm2: 240,
      number_of_cores: 4,
      rated_current_a: 420,
      voltage_rating_kv: 1,
    },
  ],
  LOAD: [
    {
      id: 'load-001',
      name: 'Odbiór przemysłowy',
      manufacturer: 'Zakład A',
      p_kw: 1800,
      q_kvar: 540,
      cos_phi: 0.96,
      profile_id: 'stały',
    },
  ],
  CT: [
    {
      id: 'ct-001',
      name: 'PP 400/1 A',
      manufacturer: 'MeasureTech',
      ratio_primary_a: 400,
      ratio_secondary_a: 1,
      accuracy_class: '5P20',
      burden_va: 15,
    },
  ],
  VT: [
    {
      id: 'vt-001',
      name: 'PN 15 kV',
      manufacturer: 'MeasureTech',
      ratio_primary_v: 15000,
      ratio_secondary_v: 100,
      accuracy_class: '0.5',
      burden_va: 30,
    },
  ],
  MEASUREMENT_TRANSFORMER: [
    {
      id: 'mt-001',
      name: 'Zestaw pomiarowy',
      manufacturer: 'MeasureTech',
      measurement_kind: 'COMBINED',
      accuracy_class: '0.5 / 5P20',
      burden_va: 30,
    },
  ],
  PV_INVERTER: [
    {
      id: 'pv-001',
      name: 'Falownik źródła fotowoltaicznego 1.2 MW',
      manufacturer: 'Solar Tech',
      model: 'PV-1200',
      p_max_kw: 1200,
      cos_phi_mode: 'Q(U)',
      grid_code: 'NC RfG',
    },
  ],
  BESS_INVERTER: [
    {
      id: 'bess-001',
      name: 'Falownik magazynu energii 1 MW',
      manufacturer: 'Storage Power',
      model: 'BESS-1000',
      p_charge_kw: 1000,
      p_discharge_kw: 1000,
      e_kwh: 2200,
      control_mode: 'PQ',
    },
  ],
  CONVERTER: [
    {
      id: 'conv-001',
      name: 'Konwerter 800 kW',
      manufacturer: 'Drive Systems',
      model: 'CV-800',
      p_max_kw: 800,
      control_mode: 'V/f',
    },
  ],
  PROTECTION_DEVICE: [
    {
      id: 'prot-001',
      name: 'Przekaźnik pola liniowego',
      manufacturer: 'RelayWorks',
      model: 'RW-615',
      series: '615',
      functions_supported: ['50/51', '50N/51N'],
      curves_supported: ['IEC Normal Inverse'],
      notes_pl: 'Dla pola liniowego SN',
    },
  ],
};

describe('TypeLibraryBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(catalogApi.fetchTypesByCategory).mockImplementation(async (category) => (
      catalogByCategory[category]
    ));
    vi.mocked(catalogApi.exportTypeLibrary).mockResolvedValue({ ok: true });
    vi.mocked(catalogApi.importTypeLibrary).mockResolvedValue({
      success: true,
      mode: 'merge',
      added: [],
      skipped: [],
      conflicts: [],
    });
  });

  it('renders the full active catalog tab set', async () => {
    render(<TypeLibraryBrowser />);

    await waitFor(() => {
      expect(catalogApi.fetchTypesByCategory).toHaveBeenCalledWith('LINE');
    });

    expect(screen.getByText('Biblioteka typów')).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((button) => button.textContent?.includes('Typy'))).toHaveLength(16);
    for (const label of TAB_LABELS) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('loads line types on mount and shows key summary data', async () => {
    render(<TypeLibraryBrowser />);

    await waitFor(() => {
      expect(catalogApi.fetchTypesByCategory).toHaveBeenCalledWith('LINE');
    });

    expect(await screen.findByText('ACSR 240')).toBeInTheDocument();
    expect(screen.getAllByText('ABC Cables')).toHaveLength(2);
    expect(screen.getByRole('cell', { name: /R=0\.12 Ohm\/km .* In=645 A/ })).toBeInTheDocument();
  });

  it('switches to a generic category and renders generic details', async () => {
    const user = userEvent.setup();
    render(<TypeLibraryBrowser />);

    await user.click(screen.getByRole('button', { name: /Typy zasilania systemowego SN/i }));

    await waitFor(() => {
      expect(catalogApi.fetchTypesByCategory).toHaveBeenCalledWith('SYSTEM_SOURCE');
    });

    await user.click(screen.getByText('GPZ 110/15 kV'));

    expect(screen.getByText('Informacje podstawowe')).toBeInTheDocument();
    expect(screen.getByText('Dane katalogowe')).toBeInTheDocument();
    expect(screen.getByText('Operator')).toBeInTheDocument();
    expect(screen.getAllByText('OSD Północ').length).toBeGreaterThan(1);
    expect(screen.getByText('Moc zwarciowa Sk3 [MVA]')).toBeInTheDocument();
    expect(screen.getByText('350')).toBeInTheDocument();
  });

  it('filters visible types by search query', async () => {
    const user = userEvent.setup();
    render(<TypeLibraryBrowser />);

    expect(await screen.findByText('ACSR 240')).toBeInTheDocument();
    expect(await screen.findByText('ACSR 120')).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText('Szukaj po nazwie, producencie lub ID...'),
      '240',
    );

    expect(screen.getByText('ACSR 240')).toBeInTheDocument();
    expect(screen.queryByText('ACSR 120')).not.toBeInTheDocument();
  });

  it('resets search and details when switching tabs', async () => {
    const user = userEvent.setup();
    render(<TypeLibraryBrowser />);

    expect(await screen.findByText('ACSR 240')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Szukaj po nazwie, producencie lub ID...'), '240');
    await user.click(screen.getByText('ACSR 240'));
    expect(screen.getByText('Dane katalogowe')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Typy kabli SN/i }));

    expect(screen.getByPlaceholderText('Szukaj po nazwie, producencie lub ID...')).toHaveValue('');
    await waitFor(() => {
      expect(screen.getByText('Wybierz typ z listy, aby zobaczyć szczegóły')).toBeInTheDocument();
    });
  });

  it('calls onSelectType with the active category', async () => {
    const user = userEvent.setup();
    const onSelectType = vi.fn();
    render(<TypeLibraryBrowser initialTab="PROTECTION_DEVICE" onSelectType={onSelectType} />);

    expect(await screen.findByText('Przekaźnik pola liniowego')).toBeInTheDocument();

    await user.click(screen.getByText('Przekaźnik pola liniowego'));

    expect(onSelectType).toHaveBeenCalledWith('prot-001', 'PROTECTION_DEVICE');
  });

  it('shows loading state', async () => {
    vi.mocked(catalogApi.fetchTypesByCategory).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(catalogByCategory.LINE), 1000)),
    );

    render(<TypeLibraryBrowser />);

    expect(screen.getByText('Ładowanie typów...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    vi.mocked(catalogApi.fetchTypesByCategory).mockRejectedValueOnce(new Error('Błąd API katalogów'));

    render(<TypeLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText('Błąd')).toBeInTheDocument();
      expect(screen.getByText('Błąd API katalogów')).toBeInTheDocument();
    });
  });

  it('shows empty state when the active category has no items', async () => {
    vi.mocked(catalogApi.fetchTypesByCategory).mockResolvedValueOnce([]);

    render(<TypeLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText('Katalog typów wymaga konfiguracji.')).toBeInTheDocument();
    });
  });
});
