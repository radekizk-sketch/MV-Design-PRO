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
    },
    {
      id: 'prosument_pv',
      label_pl: 'Mikroinstalacje PV',
      icon: 'station-pv-prosument',
      description_pl: 'PV prosument',
      template_count: 6,
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

  it('K30-21: applies template via backend when caseId + targetSegment provided', async () => {
    const applyMock = {
      template_id: 'tpl_sn_nn_630kva',
      template_name_pl: 'Stacja SN/nN 630 kVA',
      station_ref: 'stn/abc/station',
      created_element_refs: ['stn/abc/station', 'stn/abc/sn_bus', 'tr/abc/transformer'],
      operations_log: [{ op: 'insert_station_on_segment_sn', status: 'OK' }],
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
