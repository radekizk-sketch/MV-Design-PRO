/**
 * ProtectionLibraryBrowser Tests (P14a - READ-ONLY)
 *
 * Smoke tests for Protection Library browser:
 * - 3 tabs in Polish (Urządzenia, Krzywe, Szablony nastaw)
 * - Loading and displaying types
 * - Filtering by search query
 * - Deterministic sorting (name_pl → id)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProtectionLibraryBrowser } from '../ProtectionLibraryBrowser';
import * as protectionApi from '../api';

// Mock protection API
vi.mock('../api');

const mockDeviceTypes = [
  {
    id: 'device-001',
    name_pl: 'Przekaźnik Sepam 20',
    vendor: 'Schneider Electric',
    model: 'Sepam S20',
    series: 'Sepam 20',
    rated_current_a: 100,
    source_catalog: 'devices_v0.json',
    unverified: true,
    unverified_ranges: true,
    functions_supported: ['50', '51', '50N', '51N'],
    curves_supported: ['IEC_NI'],
  },
  {
    id: 'device-002',
    name_pl: 'Przekaźnik ABB REF615',
    vendor: 'ABB',
    model: 'REF615',
    series: 'REF615',
    rated_current_a: 200,
  },
];

const mockCurves = [
  {
    id: 'curve-001',
    name_pl: 'IEC Normalna Inwersyjna',
    standard: 'IEC',
    curve_kind: 'inverse',
    parameters: { A: 0.14, B: 0.02 },
  },
  {
    id: 'curve-002',
    name_pl: 'IEEE Bardzo Inwersyjna',
    standard: 'IEEE',
    curve_kind: 'very_inverse',
    parameters: { A: 19.61, B: 0.491 },
  },
];

const mockTemplates = [
  {
    id: 'template-001',
    name_pl: 'Szablon Sepam - Nadprądowy',
    device_type_ref: 'device-001',
    curve_ref: 'curve-001',
    setting_fields: [
      { name: 'I>', unit: 'A', min: 0.1, max: 10.0 },
      { name: 't>', unit: 's', min: 0.05, max: 5.0 },
    ],
  },
];

describe('ProtectionLibraryBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(protectionApi.fetchProtectionTypesByCategory).mockImplementation(
      async (category) => {
        switch (category) {
          case 'DEVICE':
            return mockDeviceTypes;
          case 'CURVE':
            return mockCurves;
          case 'TEMPLATE':
            return mockTemplates;
          default:
            return [];
        }
      }
    );
  });

  it('renders with 3 tabs in Polish', async () => {
    render(<ProtectionLibraryBrowser />);

    expect(screen.getByText('Biblioteka zabezpieczeń')).toBeInTheDocument();
    expect(screen.getByText('Urządzenia')).toBeInTheDocument();
    expect(screen.getByText('Krzywe')).toBeInTheDocument();
    expect(screen.getByText('Szablony nastaw')).toBeInTheDocument();
    await waitFor(() => {
      expect(protectionApi.fetchProtectionTypesByCategory).toHaveBeenCalledWith('DEVICE');
    });
  });

  it('loads and displays device types on mount (default tab)', async () => {
    render(<ProtectionLibraryBrowser />);

    await waitFor(() => {
      expect(protectionApi.fetchProtectionTypesByCategory).toHaveBeenCalledWith('DEVICE');
    });

    await waitFor(() => {
      expect(screen.getByText('Przekaźnik Sepam 20')).toBeInTheDocument();
      expect(screen.getByText('Przekaźnik ABB REF615')).toBeInTheDocument();
    });
  });

  it('switches to curves tab', async () => {
    const user = userEvent.setup();
    render(<ProtectionLibraryBrowser />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Przekaźnik Sepam 20')).toBeInTheDocument();
    });

    // Click curves tab
    await user.click(screen.getByText('Krzywe'));

    await waitFor(() => {
      expect(protectionApi.fetchProtectionTypesByCategory).toHaveBeenCalledWith('CURVE');
    });

    await waitFor(() => {
      expect(screen.getByText('IEC Normalna Inwersyjna')).toBeInTheDocument();
      expect(screen.getByText('IEEE Bardzo Inwersyjna')).toBeInTheDocument();
    });
  });

  it('filters types by search query', async () => {
    const user = userEvent.setup();
    render(<ProtectionLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText('Przekaźnik Sepam 20')).toBeInTheDocument();
      expect(screen.getByText('Przekaźnik ABB REF615')).toBeInTheDocument();
    });

    // Search for "Sepam"
    const searchInput = screen.getByPlaceholderText(
      'Szukaj po nazwie, producencie lub ID...'
    );
    await user.type(searchInput, 'Sepam');

    // Only Sepam should be visible
    expect(screen.getByText('Przekaźnik Sepam 20')).toBeInTheDocument();
    expect(screen.queryByText('Przekaźnik ABB REF615')).not.toBeInTheDocument();
  });

  it('shows type details when type is selected', async () => {
    const user = userEvent.setup();
    render(<ProtectionLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText('Przekaźnik Sepam 20')).toBeInTheDocument();
    });

    // Click on type
    await user.click(screen.getByText('Przekaźnik Sepam 20'));

    // Details should appear (DetailField renders labels with colon suffix)
    await waitFor(() => {
      expect(screen.getByText('Producent:')).toBeInTheDocument();
      expect(screen.getAllByText('Schneider Electric').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Model:')).toBeInTheDocument();
      expect(screen.getByText('Sepam S20')).toBeInTheDocument();
      expect(screen.getByText('Seria:')).toBeInTheDocument();
      expect(screen.getByText('Sepam 20')).toBeInTheDocument();
    });
  });

  it('shows analytical warning for unverified device entries with stable matcher', async () => {
    const user = userEvent.setup();
    render(<ProtectionLibraryBrowser />);

    const sepamEntry = await screen.findByText(/sepam 20/i);
    expect(sepamEntry).toBeInTheDocument();
    expect(screen.getByText(/dane analityczne - wymagaja weryfikacji/i)).toBeInTheDocument();

    await user.click(sepamEntry);

    await waitFor(() => {
      expect(screen.getByText(/rekord analityczny/i)).toBeInTheDocument();
      expect(screen.getByText('Status weryfikacji:')).toBeInTheDocument();
      expect(screen.getByText('NIEZWERYFIKOWANY')).toBeInTheDocument();
      expect(screen.getByText('Zrodlo danych:')).toBeInTheDocument();
      expect(screen.getByText(/devices_v0\.json/i)).toBeInTheDocument();
    });
  });

  it('displays loading state', async () => {
    vi.mocked(protectionApi.fetchProtectionTypesByCategory).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockDeviceTypes), 1000))
    );

    render(<ProtectionLibraryBrowser />);

    expect(screen.getByText('Ładowanie typów zabezpieczeń...')).toBeInTheDocument();
  });

  it('displays error state', async () => {
    vi.mocked(protectionApi.fetchProtectionTypesByCategory).mockRejectedValue(
      new Error('Network error')
    );

    render(<ProtectionLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('displays empty state when no types', async () => {
    vi.mocked(protectionApi.fetchProtectionTypesByCategory).mockResolvedValue([]);

    render(<ProtectionLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText('Katalog zabezpieczeń wymaga konfiguracji')).toBeInTheDocument();
    });
  });

  it('resets search and selection when tab changes', async () => {
    const user = userEvent.setup();
    render(<ProtectionLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText('Przekaźnik Sepam 20')).toBeInTheDocument();
    });

    // Search
    const searchInput = screen.getByPlaceholderText(
      'Szukaj po nazwie, producencie lub ID...'
    );
    await user.type(searchInput, 'Sepam');

    // Select type
    await user.click(screen.getByText('Przekaźnik Sepam 20'));

    // Switch tab
    await user.click(screen.getByText('Krzywe'));

    // Search should be cleared
    expect(searchInput).toHaveValue('');

    // Selection should be cleared
    await waitFor(() => {
      expect(
        screen.getByText('Wybierz typ z listy, aby zobaczyć szczegóły')
      ).toBeInTheDocument();
    });
  });

  it('calls onSelectType callback when type is selected', async () => {
    const onSelectType = vi.fn();
    const user = userEvent.setup();
    render(<ProtectionLibraryBrowser onSelectType={onSelectType} />);

    await waitFor(() => {
      expect(screen.getByText('Przekaźnik Sepam 20')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Przekaźnik Sepam 20'));

    expect(onSelectType).toHaveBeenCalledWith('device-001', 'DEVICE');
  });

  it('displays vendor in type list', async () => {
    render(<ProtectionLibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText('Schneider Electric')).toBeInTheDocument();
      expect(screen.getByText('ABB')).toBeInTheDocument();
    });
  });

  it('displays curve parameters correctly', async () => {
    const user = userEvent.setup();
    render(<ProtectionLibraryBrowser initialTab="CURVE" />);

    await waitFor(() => {
      expect(screen.getByText('IEC Normalna Inwersyjna')).toBeInTheDocument();
    });

    await user.click(screen.getByText('IEC Normalna Inwersyjna'));

    // DetailField renders labels with colon suffix
    await waitFor(() => {
      expect(screen.getByText('Standard:')).toBeInTheDocument();
      expect(screen.getByText('IEC')).toBeInTheDocument();
      expect(screen.getByText('Typ krzywej:')).toBeInTheDocument();
      expect(screen.getByText('inverse')).toBeInTheDocument();
    });
  });

  it('displays template setting fields correctly', async () => {
    const user = userEvent.setup();
    render(<ProtectionLibraryBrowser initialTab="TEMPLATE" />);

    await waitFor(() => {
      expect(screen.getByText('Szablon Sepam - Nadprądowy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Szablon Sepam - Nadprądowy'));

    await waitFor(() => {
      expect(screen.getByText('Pola nastaw:')).toBeInTheDocument();
      expect(screen.getByText('I>')).toBeInTheDocument();
      expect(screen.getByText('Jednostka: A')).toBeInTheDocument();
      expect(screen.getByText(/Zakres: 0\.1.*10/)).toBeInTheDocument();
    });
  });
});
