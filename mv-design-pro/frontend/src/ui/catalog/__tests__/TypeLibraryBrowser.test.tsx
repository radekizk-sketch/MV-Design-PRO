import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TypeLibraryBrowser } from '../TypeLibraryBrowser';
import * as catalogApi from '../api';
import type { CatalogListItem } from '../api';
import type { PtpireeGeneratorCertificateCatalogType, TypeCategory } from '../types';

vi.mock('../api');

const TAB_LABELS = [
  'Typy linii napowietrznych',
  'Typy kabli SN',
  'Typy zasilania systemowego SN',
  'Typy transformatorów SN/nN',
  'Typy aparatury łączeniowej SN',
  'Typy aparatury SN',
  'Typy aparatury nN',
  'Typy wyłączników różnicowoprądowych nN',
  'Typy kabli nN',
  'Typy obciążeń',
  'Typy przekładników prądowych',
  'Typy przekładników napięciowych',
  'Typy przekładników pomiarowych',
  'Typy falowników źródeł fotowoltaicznych',
  'Typy falowników magazynów energii',
  'Typy konwerterów',
  'Typy zabezpieczeń',
  'Wykaz certyfikatów PTPiREE',
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
    {
      // Typ minimalny łącznika 110 kV: brak danych wytrzymałościowych z karty = null.
      id: 'sw-cb-110kv',
      name: 'Wyłącznik 110 kV (typ minimalny topologii zasilania)',
      equipment_kind: 'CIRCUIT_BREAKER',
      un_kv: 123,
      in_a: 3150,
      ik_ka: null,
      icw_ka: null,
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
    // Kształt odpowiedzi `GET /api/catalog/mv-apparatus-types` (V12K-351): dane karty + lista
    // propozycji wartości roboczych dla braków karty (rejestr backendu).
    {
      id: 'sw-cb-abb-vd4-17kv-630a',
      name: 'ABB VD4 17.5 kV 630 A',
      manufacturer: 'ABB',
      device_kind: 'WYLACZNIK',
      u_n_kv: 17.5,
      i_n_a: 630,
      breaking_capacity_ka: 20,
      i_th_ka: 20,
      i_th_duration_s: 1,
      i_th_pochodzenie: 'producent',
      i_dyn_ka: null,
      i_dyn_pochodzenie: null,
      break_time_s: null,
      wartosci_robocze: [
        {
          parametr: 'break_time_s',
          nazwa_pl: 'czas własny wyłączania wyłącznika',
          wartosc: 0.06,
          jednostka: 's',
          rodzaj_zrodla: 'PROFIL_URZADZENIA',
          odniesienie: 'profil typowy wyłącznika próżniowego SN',
          uzasadnienie_pl: 'Karta katalogowa wyłącznika nie podaje czasu własnego',
          wplyw_pl: 'czas wyłączenia zwarcia zawiera wartość typową',
        },
        {
          parametr: 'i_dyn_ka',
          nazwa_pl: 'prąd szczytowy wytrzymywany',
          wartosc: 50,
          jednostka: 'kA',
          rodzaj_zrodla: 'NORMA',
          odniesienie: 'IEC 62271-1:2017 p. 5.7',
          uzasadnienie_pl: 'Karta nie podaje prądu szczytowego wytrzymywanego',
          wplyw_pl: 'limit dynamiczny wynika z relacji normowej',
        },
      ],
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
  LV_RCD: [
    {
      id: 'rcd_nn_a_40a_30ma',
      name: 'RCCB A 40 A / 30 mA',
      in_a: 40,
      i_delta_n_a: 0.03,
      rcd_type: 'A',
      selective: false,
      t_a_s: 0.3,
      t_a_2idn_s: 0.15,
      t_a_5idn_s: 0.04,
      t_nieczuly_min_s: null,
      u_n_kv: 0.4,
      poles: null,
      manufacturer: null,
      verification_status: 'REFERENCYJNY',
      source_reference: 'IEC 61008-1 Tabela 1 (kl. 9.9.2)',
      catalog_status: 'REFERENCYJNY_V1',
      contract_version: '2.0',
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
  // Kategoria łączy CT+VT (dług V12T-018): `fetchTypesByCategory` zwraca
  // `[...CTCatalogType, ...VTCatalogType]` (`api.ts`), więc fixture niesie
  // rekordy w KSZTAŁCIE realnego dostawcy, nie zmyślony wspólny typ.
  MEASUREMENT_TRANSFORMER: [
    {
      id: 'mt-ct-001',
      name: 'PP 400/1 A',
      manufacturer: 'MeasureTech',
      ratio_primary_a: 400,
      ratio_secondary_a: 1,
      accuracy_class: '5P20',
      burden_va: 15,
    },
    {
      id: 'mt-vt-001',
      name: 'PN 15 kV',
      manufacturer: 'MeasureTech',
      ratio_primary_v: 15000,
      ratio_secondary_v: 100,
      accuracy_class: '0.5',
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
  // Kategorie bez zakładki w TypeLibraryBrowser (TAB_DEFINITIONS) — Record
  // wymaga wpisu dla KAŻDEJ TypeCategory, więc pusta lista jest uczciwym
  // stanem (nikt nie klika tych zakładek w tym pliku testów), nie fikcją.
  SURGE_ARRESTER: [],
  SHUNT_CAPACITOR: [],
  BRANCH_POLE: [],
  ZKSN: [],
  // PTPIREE_CERTIFICATE ma WŁASNĄ ścieżkę pobierania (strona serwerowa,
  // `fetchPtpireeGeneratorCertificatesPage` — patrz drugi `describe` niżej);
  // `fetchTypesByCategory` jej nie obsługuje w produkcji, więc pusta lista.
  PTPIREE_CERTIFICATE: [],
};

describe('TypeLibraryBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(catalogApi.fetchTypesByCategory).mockImplementation(async (category) => (
      catalogByCategory[category]
    ));
    // Sekcja „Pozycje do przeglądu" jest częścią przeglądarki (karta
    // KATALOG-NIEZMIENNIKI) i pobiera własny kontrakt z backendu; bez tego
    // mocka automock zwróciłby `undefined` i sekcja rozbiłaby render.
    vi.mocked(catalogApi.fetchPrzegladWiarygodnosci).mockResolvedValue({
      liczba_odstepstw: 0,
      wedlug_kodu: {},
      rodziny: [],
      rodziny_bez_regul: [],
      reguly: [],
    });
  });

  it('renders the full active catalog tab set', async () => {
    render(<TypeLibraryBrowser />);

    await waitFor(() => {
      expect(catalogApi.fetchTypesByCategory).toHaveBeenCalledWith('LINE');
    });

    expect(screen.getByText('Biblioteka typów')).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((button) => button.textContent?.includes('Typy'))).toHaveLength(17);
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

  it('zakładka wyłączników różnicowoprądowych nN pobiera kategorię LV_RCD i streszcza I_Δn, typ, In, t_a', async () => {
    const user = userEvent.setup();
    render(<TypeLibraryBrowser />);

    await user.click(screen.getByRole('button', { name: /Typy wyłączników różnicowoprądowych nN/i }));

    await waitFor(() => {
      expect(catalogApi.fetchTypesByCategory).toHaveBeenCalledWith('LV_RCD');
    });
    expect(await screen.findByText('RCCB A 40 A / 30 mA')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /IΔn=.* A · typ A · In=40 A · ta=.* s/ })).toBeInTheDocument();
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
    // CV-4.3 K7: trzy pola scenariusza MIN — „brak danych" gdy null (wzór K1,
    // `renderLineParams`/`max_temperature_c`), NIE ukryte jak w panelu generycznym.
    expect(screen.getByText('Moc zwarciowa Sk3 min')).toBeInTheDocument();
    expect(screen.getByText('Prąd zwarciowy Ik3 min')).toBeInTheDocument();
    expect(screen.getByText('Stosunek R/X min')).toBeInTheDocument();
    expect(screen.getAllByText('brak danych')).toHaveLength(3);
  });

  it('aparatura łączeniowa: brak danej prądu zwarciowego to „brak danych”, nigdy „0 kA” (KAT-T-048)', async () => {
    const user = userEvent.setup();
    render(<TypeLibraryBrowser />);

    await user.click(screen.getByRole('button', { name: /Typy aparatury łączeniowej SN/i }));
    await waitFor(() => {
      expect(catalogApi.fetchTypesByCategory).toHaveBeenCalledWith('SWITCH_EQUIPMENT');
    });

    // Podsumowanie listy: pozycja z danymi niesie liczbę, pozycja bez danej — „brak danych”.
    expect(await screen.findByRole('cell', { name: '12 kV · 630 A · Ik 25 kA' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '123 kV · 3150 A · Ik brak danych' })).toBeInTheDocument();

    await user.click(screen.getByText('Wyłącznik 110 kV (typ minimalny topologii zasilania)'));
    const szczegoly = screen.getByTestId('type-library-details-grid');
    expect(szczegoly).toHaveTextContent('Prąd wyłączalny Ikbrak danych');
    expect(szczegoly).toHaveTextContent('Prąd wytrzymałości Icwbrak danych');
    expect(szczegoly).not.toHaveTextContent(/0[.,]0\s*kA/);
  });

  it('aparat SN: propozycje wartości roboczych w osobnej sekcji, nie jako dana karty (V12K-351)', async () => {
    const user = userEvent.setup();
    render(<TypeLibraryBrowser />);

    await user.click(screen.getByRole('button', { name: /^◫?\s*Typy aparatury SN/i }));
    await waitFor(() => {
      expect(catalogApi.fetchTypesByCategory).toHaveBeenCalledWith('MV_APPARATUS');
    });
    await user.click(await screen.findByText('ABB VD4 17.5 kV 630 A'));

    const sekcja = screen.getByTestId('type-library-wartosci-robocze');
    expect(sekcja).toHaveTextContent('Wartości robocze obliczeń (brak w karcie)');
    expect(screen.getByTestId('type-library-wartosc-robocza-break_time_s')).toHaveTextContent(
      'czas własny wyłączania wyłącznika: 0,06 s(profil typowy urządzenia)',
    );
    expect(screen.getByTestId('type-library-wartosc-robocza-i_dyn_ka')).toHaveTextContent(
      'IEC 62271-1:2017 p. 5.7',
    );
    // Panel danych karty nie pokazuje listy propozycji jako pola (dawny „[object Object]").
    expect(screen.getByTestId('type-library-details-grid')).not.toHaveTextContent('object');
    expect(screen.queryByText('Wartosci robocze')).not.toBeInTheDocument();
  });

  it('aparat SN bez braków karty: sekcja mówi, że obliczenie nie przyjmuje wartości roboczych', async () => {
    const user = userEvent.setup();
    render(<TypeLibraryBrowser />);

    await user.click(screen.getByRole('button', { name: /^◫?\s*Typy aparatury SN/i }));
    await user.click(await screen.findByText('Pole liniowe SN'));

    expect(screen.getByTestId('type-library-wartosci-robocze')).toHaveTextContent(
      'Karta podaje wszystkie parametry aparatu używane w ocenie',
    );
  });

  it('CV-4.3 K7: ZRODLO_SN z danymi scenariusza MIN pokazuje realne wartości (nie "brak danych")', async () => {
    const user = userEvent.setup();
    vi.mocked(catalogApi.fetchTypesByCategory).mockImplementation((category: TypeCategory) => {
      if (category === 'SYSTEM_SOURCE') {
        return Promise.resolve([
          {
            ...catalogByCategory.SYSTEM_SOURCE[0],
            sk3_min_mva: 210,
            ik3_min_ka: 8.1,
            rx_ratio_min: 0.22,
          },
        ]);
      }
      return Promise.resolve(catalogByCategory[category] ?? []);
    });
    render(<TypeLibraryBrowser />);

    await user.click(screen.getByRole('button', { name: /Typy zasilania systemowego SN/i }));
    await waitFor(() => {
      expect(catalogApi.fetchTypesByCategory).toHaveBeenCalledWith('SYSTEM_SOURCE');
    });
    await user.click(screen.getByText('GPZ 110/15 kV'));

    expect(screen.getByText('Moc zwarciowa Sk3 min')).toBeInTheDocument();
    expect(screen.getByText('210')).toBeInTheDocument();
    expect(screen.getByText('8.1')).toBeInTheDocument();
    expect(screen.getByText('0.22')).toBeInTheDocument();
    expect(screen.queryByText('brak danych')).not.toBeInTheDocument();
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

describe('TypeLibraryBrowser — wykaz certyfikatów PTPiREE (strona serwerowa, dług 5 z V12K-321)', () => {
  const pozycjeStrony: PtpireeGeneratorCertificateCatalogType[] = [
    {
      id: 'wipwc-1-2-w3254',
      name: 'Huawei SUN2000-215KTL-H3',
      manufacturer: 'Huawei Digital Power',
      model: 'SUN2000-215KTL-H3',
      device_type: 'Inwerter',
      document_number: 'DEKRA/2025/3254',
      document_acceptance_date: '31.12.2026',
      wos_version: '',
      wipwc_version: '1.2',
      ppm_scope: 'A,B,C,D',
      source_url: 'https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-06-Wykaz-urzadzen_1.2.pdf',
      manufacturer_key: 'HUAWEI DIGITAL POWER',
      model_key: 'SUN2000 215KTL H3',
    },
    {
      id: 'wipwc-1-2-w0001',
      name: 'Afore HNS3000TL',
      manufacturer: 'Afore New Energy',
      model: 'HNS3000TL',
      device_type: 'Inwerter',
      document_number: 'TUV/2024/0001',
      document_acceptance_date: '31.12.2026',
      wos_version: 'WOS 2024',
      wipwc_version: '1.2',
      ppm_scope: 'A',
      source_url: 'https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-06-Wykaz-urzadzen_1.2.pdf',
      manufacturer_key: 'AFORE NEW ENERGY',
      model_key: 'HNS3000TL',
    },
  ];

  beforeEach(() => {
    vi.mocked(catalogApi.fetchTypesByCategory).mockImplementation(async (category) => (
      catalogByCategory[category]
    ));
    vi.mocked(catalogApi.fetchPtpireeGeneratorCertificatesPage).mockResolvedValue({
      items: pozycjeStrony,
      total: 6887,
    });
  });

  it('zakładka wykazu pobiera stronę z serwera i pokazuje uczciwy licznik pozycji', async () => {
    const user = userEvent.setup();
    render(<TypeLibraryBrowser />);

    await user.click(
      await screen.findByRole('button', { name: /Wykaz certyfikatów PTPiREE/i }),
    );

    await waitFor(() => {
      expect(catalogApi.fetchPtpireeGeneratorCertificatesPage).toHaveBeenCalledWith('', 300);
    });
    expect(await screen.findByText('Huawei SUN2000-215KTL-H3')).toBeInTheDocument();
    // Licznik: pokazano 2 z 6887 (separator tysięcy zależny od ICU — dopuść odstęp).
    const licznik = screen.getByTestId('catalog-strona-serwera');
    expect(licznik.textContent).toMatch(/2 z 6\s?887/u);
  });

  it('zapytanie idzie do serwera (po odroczeniu), a filtr lokalny strony jest wyłączony', async () => {
    const user = userEvent.setup();
    render(<TypeLibraryBrowser />);

    await user.click(
      await screen.findByRole('button', { name: /Wykaz certyfikatów PTPiREE/i }),
    );
    await screen.findByText('Huawei SUN2000-215KTL-H3');

    await user.type(
      screen.getByPlaceholderText('Szukaj po nazwie, producencie lub ID...'),
      'huawei 215ktl',
    );

    await waitFor(() => {
      expect(catalogApi.fetchPtpireeGeneratorCertificatesPage).toHaveBeenCalledWith(
        'huawei 215ktl',
        300,
      );
    });
    // Listę zawęża SERWER: pozycje zwrócone w stronie pozostają widoczne mimo
    // zapytania (mock zwraca tę samą stronę) — filtr lokalny działałby na
    // niepełnej liście i kłamał wynikiem.
    expect(screen.getByText('Afore HNS3000TL')).toBeInTheDocument();
  });
});
