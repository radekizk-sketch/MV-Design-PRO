/**
 * K5-B (H-2) — współdzielenie `ProtectionConfig.overrides` przez dwóch
 * konsumentów: panel szablonu P14c (nadpisania PÓL po nazwach) i wykonawcę
 * nastaw E-28 (wpisy `coordination_device:*`). PUT wysyła CAŁY słownik, więc
 * zapis z panelu, który nie niesie wpisów urządzeń, skasowałby nastawy
 * koordynacji zapisane per przypadek. Test ćwiczy realną ścieżkę panelu:
 * wczytanie → zmiana szablonu → zapis (kliki natywne, API mockowane na
 * granicy modułów klienta).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProtectionCaseConfigPanel } from '../ProtectionCaseConfigPanel';

const getConfig = vi.fn();
const putConfig = vi.fn();
const fetchTemplates = vi.fn();
const exportLibrary = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getProtectionConfig: (...args: unknown[]) => getConfig(...args),
    updateProtectionConfig: (...args: unknown[]) => putConfig(...args),
  };
});

vi.mock('../../protection/api', () => ({
  fetchProtectionTypesByCategory: (...args: unknown[]) => fetchTemplates(...args),
  exportProtectionLibrary: (...args: unknown[]) => exportLibrary(...args),
}));

const URZADZENIE = {
  id: 'dev-1',
  name: 'Zabezpieczenie GPZ',
  device_type: 'RELAY',
  location_element_id: 'bus_1',
  settings: { stage_51: { enabled: true, pickup_current_a: 175, directional: false } },
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchTemplates.mockResolvedValue([
    {
      id: 'tpl-1',
      name_pl: 'Szablon nadprądowy A',
      setting_fields: [{ name: 'I>', unit: 'A', min: 0.1, max: 10 }],
    },
  ]);
  exportLibrary.mockResolvedValue({
    manifest: {
      fingerprint: 'fp-1',
      library_id: 'lib-1',
      revision: 'r1',
      vendor: 'V',
      series: 'S',
    },
  });
  getConfig.mockResolvedValue({
    template_ref: null,
    template_fingerprint: null,
    library_manifest_ref: null,
    overrides: {
      'coordination_device:dev-1': URZADZENIE,
      'I>': { value: 90, unit: 'A' },
    },
    bound_at: null,
  });
  putConfig.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe('ProtectionCaseConfigPanel — zapis nie kasuje wpisów urządzeń koordynacji (K5-B)', () => {
  it('zmiana szablonu + zapis: wpisy coordination_device:* przetrwały, nadpisania pól zresetowane', async () => {
    render(
      <ProtectionCaseConfigPanel caseId="case-1" isReadOnly={false} />,
    );

    // Realna ścieżka: wybór szablonu w polu wyboru → zapis konfiguracji.
    const wyborSzablonu = await screen.findByRole('combobox');
    await waitFor(() => expect(getConfig).toHaveBeenCalledWith('case-1'));
    fireEvent.change(wyborSzablonu, { target: { value: 'tpl-1' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Zapisz konfigurację' }));

    await waitFor(() => expect(putConfig).toHaveBeenCalledTimes(1));
    const [, zadanie] = putConfig.mock.calls[0] as [
      string,
      { overrides: Record<string, unknown> },
    ];
    // Wpis wykonawcy nastaw E-28 przetrwał zapis panelu P14c…
    expect(zadanie.overrides['coordination_device:dev-1']).toEqual(URZADZENIE);
    // …a nadpisania pól poprzedniego szablonu zostały zresetowane (intencja 1:1).
    expect(zadanie.overrides['I>']).toBeUndefined();
  });
});
