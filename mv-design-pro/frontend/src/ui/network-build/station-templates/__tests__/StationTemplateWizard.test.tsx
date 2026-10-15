/**
 * Tests for K30-16 StationTemplateWizard — 7-step UI flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { StationTemplateWizard } from '../StationTemplateWizard';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

const MOCK_CATEGORIES = {
  categories: [
    {
      id: 'typowa_sn_nn',
      label_pl: 'Typowe stacje SN/nN',
      icon: 'station-distribution',
      description_pl: 'Standardowe dystrybucyjne',
      template_count: 10,
      wchodzi_w_segment: true,
    },
    {
      id: 'prosument_pv',
      label_pl: 'Mikroinstalacje PV',
      icon: 'station-pv-prosument',
      description_pl: 'PV prosument',
      template_count: 6,
      wchodzi_w_segment: true,
    },
    {
      // Kategoria KORZENIA modelu — backend buduje ja przez add_grid_source_sn
      // i odmawia, gdy zada sie wciecia w odcinek. Kreator wciecia NIE moze jej
      // oferowac (patrz test nizej).
      id: 'gpz_110_sn',
      label_pl: 'Stacje zasilajace GPZ 110/SN',
      icon: 'station-gpz',
      description_pl: 'GPZ 110/15 i 110/20 kV',
      template_count: 3,
      wchodzi_w_segment: false,
    },
  ],
  total_templates: 57,
};

const MOCK_TEMPLATES_TYPOWE = {
  templates: [
    {
      id: 'tpl_sn_nn_630kva',
      name_pl: 'Stacja SN/nN 630 kVA',
      category: 'typowa_sn_nn',
      wchodzi_w_segment: true,
      description_pl: 'Najbardziej typowa 630 kVA',
      use_case_pl: 'Dystrybucyjna typowa',
      nc_rfg_type: null,
      tags: ['dystrybucyjna'],
      icon: 'station-distribution',
    },
  ],
  total: 1,
};

const MOCK_TEMPLATE_FULL = {
  ...MOCK_TEMPLATES_TYPOWE.templates[0],
  schema: {
    transformer_options: [
      {
        catalog_ref: 'tr-sn-nn-15-04-630kva-dyn11',
        label_pl: 'TR 630 kVA',
        namespace: 'TRAFO_SN_NN',
        default: true,
        badge_pl: null,
      },
    ],
    transformer_count: { default: 1, min_value: 1, max_value: 2, step: 1, label_pl: 'Liczba TR' },
    sn_switchgear_manufacturers: ['ZPUE_WLOSZCZOWA', 'ELEKTROMETAL'],
    sn_switchgear_default: 'ZPUE_WLOSZCZOWA',
    sn_bays_count: { default: 3, min_value: 1, max_value: 8, step: 1, label_pl: 'Liczba pól SN' },
    sn_bay_roles: [],
    sn_bay_protection_options: [
      {
        device_catalog_ref: 'EM_E2TANGO_600',
        label_pl: 'Elektrometal e2TANGO-600',
        vendor: 'ELEKTROMETAL',
        settings_template_id: 'tpl_feeder',
        badge_pl: 'PTPiREE',
      },
    ],
    nn_feeders_count: { default: 4, min_value: 1, max_value: 8, step: 1, label_pl: 'Liczba odpływów nN' },
    nn_feeder_cb_options: [],
    nn_load_default_kw: { default: 50, min_value: 0, max_value: 2000, step: 1, unit: 'kW', label_pl: '' },
    der_options: [],
    der_total_count: { default: 0, min_value: 0, max_value: 20, step: 1, label_pl: 'Liczba modułów DER' },
    protection_settings_default: 'tpl_feeder_15kv_typowa',
    ct_options: [],
    vt_options: [],
    energy_meter_options: [],
    manufacturer_profile_default: 'ZPUE_WLOSZCZOWA',
  },
};

function _mockResponse(data: unknown): Response {
  return {
    ok: true,
    json: async () => data,
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/station-templates/categories') {
      return Promise.resolve(_mockResponse(MOCK_CATEGORIES));
    }
    if (url === '/api/station-templates?category=typowa_sn_nn') {
      return Promise.resolve(_mockResponse(MOCK_TEMPLATES_TYPOWE));
    }
    if (url === '/api/station-templates/tpl_sn_nn_630kva') {
      return Promise.resolve(_mockResponse(MOCK_TEMPLATE_FULL));
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not found' }),
    } as unknown as Response);
  });
});

describe('StationTemplateWizard', () => {
  it('renders 7-step stepper header', async () => {
    render(<StationTemplateWizard />);
    expect(screen.getByTestId('wizard-step-category')).toBeTruthy();
    expect(screen.getByTestId('wizard-step-template')).toBeTruthy();
    expect(screen.getByTestId('wizard-step-location')).toBeTruthy();
    expect(screen.getByTestId('wizard-step-params')).toBeTruthy();
    expect(screen.getByTestId('wizard-step-profile')).toBeTruthy();
    expect(screen.getByTestId('wizard-step-preview')).toBeTruthy();
    expect(screen.getByTestId('wizard-step-apply')).toBeTruthy();
  });

  it('starts on Category step with active highlight', async () => {
    render(<StationTemplateWizard />);
    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-category').dataset.active).toBe('true');
    });
  });

  it('loads categories from API on mount', async () => {
    render(<StationTemplateWizard />);
    await waitFor(() => {
      expect(screen.getByTestId('category-typowa_sn_nn')).toBeTruthy();
      expect(screen.getByTestId('category-prosument_pv')).toBeTruthy();
    });
  });

  it('nie oferuje kategorii korzenia modelu (GPZ) w torze wciecia w odcinek', async () => {
    // Zadanie „wstaw w odcinek X" dla szablonu GPZ konczylo sie kiedys HTTP 200
    // i NOWA wyspa obok magistrali (pomiar 2026-09-17, niezmiennik e2e).
    // Backend odmawia teraz kodem `template.korzen_modelu_nie_wchodzi_w_segment`, a ten
    // kreator nie pokazuje wyboru, ktory i tak skonczylby sie odmowa.
    render(<StationTemplateWizard />);
    await waitFor(() => screen.getByTestId('category-typowa_sn_nn'));
    expect(screen.queryByTestId('category-gpz_110_sn')).toBeNull();
  });

  it('Next button disabled until category selected', async () => {
    render(<StationTemplateWizard />);
    await waitFor(() => screen.getByTestId('category-typowa_sn_nn'));
    const nextBtn = screen.getByTestId('wizard-next') as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('category-typowa_sn_nn'));
    await waitFor(() => {
      expect(nextBtn.disabled).toBe(false);
    });
  });

  it('navigates Category → Template after selection', async () => {
    render(<StationTemplateWizard />);
    await waitFor(() => screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-template').dataset.active).toBe('true');
      expect(screen.getByTestId('template-tpl_sn_nn_630kva')).toBeTruthy();
    });
  });

  it('Params step exposes 6 tabs (Transformator/SN/nN/DER/Zabezpieczenia/Pomiary)', async () => {
    render(<StationTemplateWizard targetSegmentRef="seg/abc/segment" />);
    // Navigate to params: category → template → location → params
    await waitFor(() => screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    // Location
    fireEvent.click(screen.getByTestId('wizard-next'));
    // Params
    await waitFor(() => {
      expect(screen.getByTestId('params-tab-transformer')).toBeTruthy();
      expect(screen.getByTestId('params-tab-sn_switchgear')).toBeTruthy();
      expect(screen.getByTestId('params-tab-nn_feeders')).toBeTruthy();
      expect(screen.getByTestId('params-tab-der')).toBeTruthy();
      expect(screen.getByTestId('params-tab-protection')).toBeTruthy();
      expect(screen.getByTestId('params-tab-measurements')).toBeTruthy();
    });
  });

  it('E3.2: bez initialTemplateId zachowanie bez zmian — start na kroku Kategoria', async () => {
    render(<StationTemplateWizard />);
    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-category').dataset.active).toBe('true');
    });
    expect(screen.queryByTestId('wizard-step-content-location')).toBeNull();
  });

  it('E3.2: z initialTemplateId startuje z zaznaczonym szablonem na kroku lokalizacji i pobiera pełną definicję', async () => {
    render(<StationTemplateWizard initialTemplateId="tpl_sn_nn_630kva" />);
    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-location').dataset.active).toBe('true');
    });
    expect(screen.getByTestId('wizard-step-content-location')).toBeTruthy();
    expect(screen.queryByTestId('wizard-step-content-category')).toBeNull();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/station-templates/tpl_sn_nn_630kva');
    });
  });

  it('E3.2: podpowiedzi Z2 — dymek ⓘ pokazuje zakres/domyślną/źródło dla pól z danymi w schemacie', async () => {
    render(<StationTemplateWizard targetSegmentRef="seg/abc/segment" />);
    await waitFor(() => screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-content-params'));

    // ParamInt (transformer_count) ma default/min/max w schemacie -> dymek z zakresem.
    const liczbaTrHint = screen.getByTestId('hint-content-param-int-Liczba TR');
    expect(liczbaTrHint.textContent).toContain('CO TO JEST');
    expect(liczbaTrHint.textContent).toContain('ZAKRES TYPOWY');
    expect(liczbaTrHint.textContent).toContain('1');
    expect(liczbaTrHint.textContent).toContain('2');
    expect(liczbaTrHint.textContent).toContain('SKĄD DOMYŚLNA');
    expect(liczbaTrHint.textContent).toContain('szablon stacji');

    // ChoiceSelect (transformer_ref) ma opcję default:true z namespace -> źródło z katalogu.
    const typTrHint = screen.getByTestId(
      'hint-content-choice-Typ transformatora (katalog PTPiRE)',
    );
    expect(typTrHint.textContent).toContain('TRAFO_SN_NN');
    expect(typTrHint.textContent).toContain('TR 630 kVA');

    // SelectStr (sn_manufacturer) ma listę opcji + sn_switchgear_default -> dymek.
    fireEvent.click(screen.getByTestId('params-tab-sn_switchgear'));
    const producentHint = screen.getByTestId('hint-content-select-Producent rozdzielni SN');
    expect(producentHint.textContent).toContain('ZPUE_WLOSZCZOWA');
    expect(producentHint.textContent).toContain('ELEKTROMETAL');
  });

  it('E3.2: pola bez danych w schemacie (puste opcje) nie dostają dymka Z2', async () => {
    render(<StationTemplateWizard targetSegmentRef="seg/abc/segment" />);
    await waitFor(() => screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-content-params'));

    // nn_feeder_cb_options: [] w fixture -> brak opcji, brak dymka (zakaz fabrykowania treści).
    fireEvent.click(screen.getByTestId('params-tab-nn_feeders'));
    expect(
      screen.queryByTestId('hint-icon-choice-Aparatura CB odpływów nN'),
    ).toBeNull();
  });

  it('obciążenie odpływu nN jest polem kreatora i trafia do nadpisań podglądu', async () => {
    render(<StationTemplateWizard targetSegmentRef="seg/abc/segment" />);
    await waitFor(() => screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-content-params'));
    fireEvent.click(screen.getByTestId('params-tab-nn_feeders'));
    // Parametr szablonu `nn_load_default_kw` (backend: zakres + dobór transformatora stacji).
    const pole = screen
      .getByTestId('param-num-Obciążenie odpływu nN [kW]')
      .querySelector('input') as HTMLInputElement;
    expect(pole.value).toBe('50');
    fireEvent.change(pole, { target: { value: '120' } });
    expect(pole.value).toBe('120');
  });

  it('protection tab shows E2Tango option with PTPiREE badge', async () => {
    render(<StationTemplateWizard targetSegmentRef="seg/x/segment" />);
    await waitFor(() => screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('params-tab-protection'));
    fireEvent.click(screen.getByTestId('params-tab-protection'));
    await waitFor(() => {
      expect(screen.getByTestId('protection-EM_E2TANGO_600')).toBeTruthy();
    });
  });

  it('Cancel button invokes onCancel', async () => {
    const onCancel = vi.fn();
    render(<StationTemplateWizard onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('wizard-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('applies template via backend when caseId + targetSegment provided', async () => {
    const applyMock = {
      template_id: 'tpl_sn_nn_630kva',
      template_name_pl: 'Stacja SN/nN 630 kVA',
      station_ref: 'stn/abc/station',
      created_element_refs: ['stn/abc/station', 'stn/abc/sn_bus', 'tr/abc/transformer'],
      operations_log: [{ op: 'insert_station_on_segment_sn' }],
      catalog_profile_applied: 'ZPUE_WLOSZCZOWA',
      snapshot_hash: 'abc123',
    };
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/station-templates/categories') {
        return Promise.resolve(_mockResponse(MOCK_CATEGORIES));
      }
      if (url === '/api/station-templates?category=typowa_sn_nn') {
        return Promise.resolve(_mockResponse(MOCK_TEMPLATES_TYPOWE));
      }
      if (url === '/api/station-templates/tpl_sn_nn_630kva') {
        return Promise.resolve(_mockResponse(MOCK_TEMPLATE_FULL));
      }
      if (url === '/api/station-templates/tpl_sn_nn_630kva/apply' && init?.method === 'POST') {
        return Promise.resolve(_mockResponse(applyMock));
      }
      if (url === '/api/station-templates/tpl_sn_nn_630kva/preview' && init?.method === 'POST') {
        return Promise.resolve(_mockResponse({
          template_id: 'tpl_sn_nn_630kva',
          template_name_pl: 'Stacja SN/nN 630 kVA',
          category: 'typowa_sn_nn',
          wchodzi_w_segment: true,
          nc_rfg_type: null,
          station_type: 'inline',
          catalog_profile_applied: 'ZPUE_WLOSZCZOWA',
          effective_config: {
            transformer_ref: 'tr-sn-nn-15-04-630kva-dyn11',
            transformer_count: 1,
            sn_bays_count: 3,
            sn_bay_roles: ['IN', 'OUT', 'TR'],
            sn_manufacturer: 'ZPUE_WLOSZCZOWA',
            nn_feeders_count: 4,
            nn_feeder_cb_ref: 'cb_nn_400a',
            protection_relay_ref: 'EM_E2TANGO_600',
            der_total_count: 0,
            der_mix: [],
          },
          estimated_elements_count: 12,
        }));
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Not found' }),
      } as unknown as Response);
    });

    const onAppliedSuccess = vi.fn();
    render(
      <StationTemplateWizard
        caseId="00000000-0000-0000-0000-000000000001"
        targetSegmentRef="seg/abc/segment"
        onAppliedSuccess={onAppliedSuccess}
      />,
    );
    // Navigate to apply step (one click at a time, wait for state transition)
    await waitFor(() => screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('category-typowa_sn_nn'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('template-tpl_sn_nn_630kva'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    // location → params (wait dla active template load)
    await waitFor(() => screen.getByTestId('wizard-step-content-location'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-content-params'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-content-profile'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-content-preview'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-content-apply'));

    // Click Apply
    fireEvent.click(screen.getByTestId('wizard-apply'));

    // Verify pending indicator
    await waitFor(() => {
      expect(screen.getByTestId('apply-success')).toBeTruthy();
    });

    // Verify success display
    expect(screen.getByText(/Station ref:/)).toBeTruthy();
    expect(onAppliedSuccess).toHaveBeenCalledWith(applyMock);
  });
});


describe('Skład PV/BESS szablonu hybrydowego — kreator i podgląd', () => {
  const BESS_05 = {
    catalog_ref: 'conv-bess-nn-0p5mw-0p69kv',
    label_pl: 'BESS 0,5 MW / 1 MWh 0,69 kV',
    namespace: 'ZRODLO_NN_BESS',
  };
  const BESS_1 = {
    catalog_ref: 'conv-bess-nn-1mw-0p69kv',
    label_pl: 'BESS 1 MW / 2 MWh 0,69 kV',
    namespace: 'ZRODLO_NN_BESS',
  };
  const PV_05 = {
    catalog_ref: 'conv-pv-nn-0p5mw-0p69kv',
    label_pl: 'Falownik PV 0,5 MW 0,69 kV',
    namespace: 'ZRODLO_NN_PV',
    default: true,
  };
  const hybridTemplate = {
    ...MOCK_TEMPLATE_FULL,
    id: 'tpl_hybrid_pv2_bess1',
    name_pl: 'Hybryda PV 2 MW + BESS 1 MW/2 MWh',
    category: 'hybrydowa',
    schema: {
      ...MOCK_TEMPLATE_FULL.schema,
      der_total_count: {
        default: 5,
        min_value: 2,
        max_value: 20,
        step: 1,
        label_pl: 'Liczba modułów DER (PV + BESS)',
      },
      der_options: [
        {
          kind: 'PV',
          label_pl: 'Falownik PV przez własny transformator blokowy nN/SN',
          catalog_options: [PV_05],
          default_count: 4,
          default_p_mw_each: 0.5,
          default_catalog_ref: PV_05.catalog_ref,
          connection_variant_options: ['block_transformer'],
        },
        {
          kind: 'BESS',
          label_pl: 'Magazyn BESS przez własny transformator blokowy nN/SN',
          // Pierwsza opcja listy (0,5 MW) NIE jest tą, którą backend wybierze dla jednostki
          // 1 MW — kreator ma pokazać pozycję z kontraktu (`default_catalog_ref`).
          catalog_options: [BESS_05, BESS_1],
          default_count: 1,
          default_p_mw_each: 1,
          default_catalog_ref: BESS_1.catalog_ref,
          connection_variant_options: ['block_transformer'],
        },
      ],
    },
  };

  it('pokazuje pozycję katalogu z doboru backendu, edytuje liczby i wysyła je do podglądu', async () => {
    const previewBodies: Record<string, unknown>[] = [];
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/station-templates/categories') {
        return Promise.resolve(_mockResponse(MOCK_CATEGORIES));
      }
      if (url === '/api/station-templates/tpl_hybrid_pv2_bess1') {
        return Promise.resolve(_mockResponse(hybridTemplate));
      }
      if (url === '/api/station-templates/tpl_hybrid_pv2_bess1/preview' && init?.method === 'POST') {
        previewBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Promise.resolve(
          _mockResponse({
            template_id: 'tpl_hybrid_pv2_bess1',
            template_name_pl: hybridTemplate.name_pl,
            category: 'hybrydowa',
            nc_rfg_type: 'C',
            station_type: 'inline',
            catalog_profile_applied: null,
            effective_config: {
              transformer_ref: 'tr-sn-nn-15-04-63kva-dyn11',
              transformer_count: 1,
              sn_bays_count: 3,
              sn_bay_roles: ['IN', 'MEASUREMENT', 'OUT'],
              sn_fields: [],
              sn_manufacturer: 'ZPUE_WLOSZCZOWA',
              nn_feeders_count: 0,
              nn_feeder_cb_ref: null,
              protection_relay_ref: null,
              der_total_count: 6,
              der_mix: [
                {
                  kind: 'PV',
                  catalog_ref: PV_05.catalog_ref,
                  p_mw_each: 0.5,
                  connection_variant: 'block_transformer',
                  expected_count_per_kind: 4,
                  block_transformer_ref: 'tr-sn-nn-15-0p69-0p63mva-dyn11-inverter',
                  block_transformer_name: 'TR 15/0.69 kV 630 kVA Dyn11 PV/BESS/FW',
                  block_transformer_sn_mva: 0.63,
                  required_apparent_power_mva_each: 0.55,
                  inverter_output_kv: 0.69,
                  mv_cable_ref: 'cable-polish-yhakxs-1c-50',
                  mv_field_apparatus_ref: 'sw-ls-abb-nal-24kv-400a',
                },
                {
                  kind: 'BESS',
                  // Backend dobiera pozycję do mocy jednostki 1,5 MW (O-53): 2 MW, nie 1 MW.
                  catalog_ref: 'conv-bess-nn-2mw-0p69kv',
                  p_mw_each: 1.5,
                  connection_variant: 'block_transformer',
                  expected_count_per_kind: 2,
                  block_transformer_ref: 'tr-sn-nn-15-0p69-2p5mva-dyn11-inverter',
                  block_transformer_name: 'TR 15/0.69 kV 2.5 MVA Dyn11 PV/BESS/FW',
                  block_transformer_sn_mva: 2.5,
                  required_apparent_power_mva_each: 2.2,
                  inverter_output_kv: 0.69,
                  mv_cable_ref: 'cable-polish-yhakxs-1c-50',
                  mv_field_apparatus_ref: 'sw-ls-abb-nal-24kv-400a',
                },
              ],
            },
            estimated_elements_count: 11,
          }),
        );
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });

    render(
      <StationTemplateWizard
        initialTemplateId="tpl_hybrid_pv2_bess1"
        targetSegmentRef="seg/abc/segment"
      />,
    );
    await waitFor(() => screen.getByTestId('wizard-step-content-location'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-content-params'));
    fireEvent.click(screen.getByTestId('params-tab-der'));

    const bessSelect = screen
      .getByTestId('choice-Katalog BESS')
      .querySelector('select') as HTMLSelectElement;
    expect(bessSelect.value).toBe(BESS_1.catalog_ref);

    const pv = screen.getByTestId('param-int-Liczba jednostek PV');
    const bess = screen.getByTestId('param-int-Liczba jednostek BESS');
    expect((pv.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('4');
    expect((bess.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('1');
    // Suma nie jest osobnym polem dla kilku technologii — tylko wynikiem liczebności.
    expect(screen.queryByTestId('param-int-Liczba modułów DER (PV + BESS)')).toBeNull();
    fireEvent.change(bess.querySelector('input[type="number"]') as HTMLInputElement, {
      target: { value: '2' },
    });
    expect((bess.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('2');
    expect(screen.getByText(/Łączna liczba modułów DER: 6/)).toBeTruthy();
    // Pkt 7.2: moc jednostki jest polem kreatora (`der_<rodzaj>_p_mw_each`), wysyłanym do
    // backendu bez przeliczeń — dobór pozycji i toru robi backend.
    const mocBess = screen
      .getByTestId('param-num-Moc jednostki BESS [MW]')
      .querySelector('input') as HTMLInputElement;
    expect(mocBess.value).toBe('1');
    fireEvent.change(mocBess, { target: { value: '1.5' } });
    expect(mocBess.value).toBe('1.5');

    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-content-profile'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-content-preview'));
    await waitFor(() => screen.getByText(/4× PV 0.5 MW, conv-pv-nn-0p5mw-0p69kv/));
    expect(screen.getByText(/2× BESS 1.5 MW, conv-bess-nn-2mw-0p69kv/)).toBeTruthy();
    // Tor jednostki po stronie SN: własny transformator blokowy z doboru backendu.
    const trBess = screen.getByTestId('preview-tr-blokowy-BESS');
    expect(trBess.textContent).toContain('2× TR 15/0.69 kV 2.5 MVA Dyn11 PV/BESS/FW');
    expect(trBess.textContent).toContain('Sn 2.5 MVA, wymagane 2.2 MVA na jednostkę');
    expect(screen.getByTestId('preview-tr-blokowy-PV').textContent).toContain(
      '4× TR 15/0.69 kV 630 kVA Dyn11 PV/BESS/FW',
    );

    const override = previewBodies.at(-1)?.params_override as Record<string, unknown>;
    expect(override.der_BESS_count).toBe(2);
    expect(override.der_BESS_p_mw_each).toBe(1.5);
    expect(override.der_total_count).toBe(6);
  });
});
