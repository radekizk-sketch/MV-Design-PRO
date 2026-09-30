import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProtectionSettingsEditor } from '../ProtectionSettingsEditor';
import type { MiejsceUrzadzenia } from '../miejsceUrzadzenia';
import type { ProtectionDevice } from '../types';
import { LABELS } from '../types';

// Decyzja O-51 (pkt 7): miejsce prądu rozstrzyga backend — mock na granicy klienta.
const fetchMiejsce = vi.fn();
vi.mock('../miejsceUrzadzenia', () => ({
  fetchMiejsceUrzadzenia: (...args: unknown[]) => fetchMiejsce(...args),
}));

beforeEach(() => {
  fetchMiejsce.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ProtectionSettingsEditor', () => {
  it('uses Polish labels for IEEE timing controls', () => {
    const device: ProtectionDevice = {
      id: 'device-1',
      name: 'Zabezpieczenie Główne',
      device_type: 'RELAY',
      location_element_id: 'bus_1',
      settings: {
        stage_51: {
          enabled: true,
          pickup_current_a: 400,
          directional: false,
          curve_settings: {
            standard: 'IEEE',
            variant: 'VI',
            pickup_current_a: 400,
            time_multiplier: 1,
          },
        },
      },
    };

    render(
      <ProtectionSettingsEditor
        device={device}
        onChange={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByText('TD (nastawa czasowa)')).toBeInTheDocument();
    expect(screen.getByText('(niedostępne)')).toBeInTheDocument();
  });
});

/**
 * Zacisk urządzenia (decyzja O-51 pkt 7, klasa P9). Iloczyn cech: rodzaj lokalizacji
 * {gałąź, łącznik z zaciskiem z modelu, łącznik z odmową, szyna} × stan wskazania
 * {brak, wskazany}. Etykiety i odmowy przychodzą z backendu; brak domyślnego zacisku.
 * Kliki natywne na realnych kontrolkach.
 */
describe('ProtectionSettingsEditor — zacisk gałęzi z rozstrzygnięcia backendu', () => {
  const ZACISKI = {
    od: { szyna_ref: 'bus_1', etykieta_pl: 'Zacisk początkowy — szyna GPZ SN' },
    do: { szyna_ref: 'bus_2', etykieta_pl: 'Zacisk końcowy — szyna Stacja 7' },
  } as const;

  const miejsce = (over: Partial<MiejsceUrzadzenia>): MiejsceUrzadzenia => ({
    lokalizacja_ref: 'line_1',
    rodzaj_lokalizacji: 'galaz',
    zaciski: ZACISKI,
    galaz_ref: null,
    zacisk: null,
    zrodlo_zacisku: null,
    wymaga_wskazania_zacisku: true,
    odmowa_zacisku: {
      kod: 'protection.relay_terminal_indication_missing',
      powod_pl: 'Model nie wskazuje, przy którym zacisku gałęzi stoi zabezpieczenie — wskaż zacisk.',
    },
    ...over,
  });

  const urzadzenie = (over: Partial<ProtectionDevice> = {}): ProtectionDevice => ({
    id: 'device-1',
    name: 'Zabezpieczenie linii',
    device_type: 'RELAY',
    location_element_id: 'line_1',
    settings: { stage_51: { enabled: false, pickup_current_a: 400, directional: false } },
    ...over,
  });

  it('gałąź: etykiety zacisków z backendu, brak wyboru = powód odmowy, klik zapisuje zacisk', async () => {
    fetchMiejsce.mockResolvedValue(miejsce({}));
    const onChange = vi.fn();
    render(
      <ProtectionSettingsEditor
        device={urzadzenie()}
        onChange={onChange}
        onCancel={() => {}}
        caseId="case-1"
      />,
    );

    const od = (await screen.findByTestId('device-terminal-od')) as HTMLInputElement;
    const doZ = screen.getByTestId('device-terminal-do') as HTMLInputElement;
    expect(fetchMiejsce).toHaveBeenCalledWith('case-1', 'line_1', null, expect.anything());
    // Brak zacisku domyślnego — żaden przycisk nie jest zaznaczony.
    expect(od.checked).toBe(false);
    expect(doZ.checked).toBe(false);
    const pole = screen.getByTestId('device-terminal');
    expect(pole.textContent).toContain('Zacisk początkowy — szyna GPZ SN');
    expect(pole.textContent).toContain('Zacisk końcowy — szyna Stacja 7');
    expect(screen.getByTestId('device-terminal-missing').textContent).toContain('wskaż zacisk');

    fireEvent.click(doZ);
    expect(doZ.checked).toBe(true);
    expect(screen.queryByTestId('device-terminal-missing')).toBeNull();
    fireEvent.click(screen.getByText(LABELS.actions.save));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ zacisk: 'do' }));
  });

  it('łącznik w szeregu: zacisk z modelu tylko do odczytu (bez przycisków wyboru)', async () => {
    fetchMiejsce.mockResolvedValue(
      miejsce({
        lokalizacja_ref: 'cb_1',
        rodzaj_lokalizacji: 'lacznik',
        galaz_ref: 'line_1',
        zacisk: 'od',
        zrodlo_zacisku: 'model',
        wymaga_wskazania_zacisku: false,
        odmowa_zacisku: null,
      }),
    );
    render(
      <ProtectionSettingsEditor
        device={urzadzenie({ location_element_id: 'cb_1' })}
        onChange={() => {}}
        onCancel={() => {}}
        caseId="case-1"
      />,
    );

    const model = await screen.findByTestId('device-terminal-model');
    expect(model.textContent).toContain('Zacisk początkowy — szyna GPZ SN');
    expect(model.textContent).toContain('line_1');
    expect(model.textContent).toContain(LABELS.devices.terminalFromModel);
    expect(screen.queryByTestId('device-terminal-od')).toBeNull();
    expect(screen.queryByTestId('device-terminal-do')).toBeNull();
  });

  it('łącznik poza szeregiem: odmowa nazwana z backendu, bez wyboru zacisku', async () => {
    const powod = 'Wyłącznik nie leży w szeregu z zaciskiem żadnej linii — model nie rozstrzyga zacisku.';
    fetchMiejsce.mockResolvedValue(
      miejsce({
        lokalizacja_ref: 'cb_2',
        rodzaj_lokalizacji: 'lacznik',
        zaciski: null,
        wymaga_wskazania_zacisku: false,
        odmowa_zacisku: { kod: 'protection.device_breaker_not_in_series', powod_pl: powod },
      }),
    );
    render(
      <ProtectionSettingsEditor
        device={urzadzenie({ location_element_id: 'cb_2' })}
        onChange={() => {}}
        onCancel={() => {}}
        caseId="case-1"
      />,
    );

    expect((await screen.findByTestId('device-terminal-refusal')).textContent).toBe(powod);
    expect(screen.queryByTestId('device-terminal-od')).toBeNull();
  });

  it('szyna: brak zacisków gałęzi — pole nie oferuje wyboru', async () => {
    fetchMiejsce.mockResolvedValue(
      miejsce({
        lokalizacja_ref: 'bus_1',
        rodzaj_lokalizacji: 'szyna',
        zaciski: null,
        wymaga_wskazania_zacisku: false,
        odmowa_zacisku: null,
      }),
    );
    render(
      <ProtectionSettingsEditor
        device={urzadzenie({ location_element_id: 'bus_1' })}
        onChange={() => {}}
        onCancel={() => {}}
        caseId="case-1"
      />,
    );

    await waitFor(() => expect(fetchMiejsce).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(LABELS.devices.terminalLoading)).toBeNull(),
    );
    expect(screen.queryByTestId('device-terminal-od')).toBeNull();
    expect(screen.queryByTestId('device-terminal-model')).toBeNull();
  });

  it('błąd rozstrzygnięcia: komunikat backendu, nie domyślny zacisk', async () => {
    fetchMiejsce.mockRejectedValue(new Error('Przypadek nie ma modelu sieci.'));
    render(
      <ProtectionSettingsEditor
        device={urzadzenie()}
        onChange={() => {}}
        onCancel={() => {}}
        caseId="case-1"
      />,
    );

    expect((await screen.findByTestId('device-terminal-error')).textContent).toBe(
      'Przypadek nie ma modelu sieci.',
    );
    expect(screen.queryByTestId('device-terminal-od')).toBeNull();
  });
});
