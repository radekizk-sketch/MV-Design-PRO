/**
 * Kontrakt zapisu/odczytu nastaw koordynacji w konfiguracji przypadku (K5-B, H-2).
 *
 * Kształt: `ProtectionConfig.overrides` kluczowane per urządzenie
 * (`coordination_device:<id>` → pełny ProtectionDevice). Testy pilnują obu
 * kierunków (serializacja/deserializacja) oraz WSPÓŁISTNIENIA z nadpisaniami
 * pól szablonu P14c — PUT wysyła pełny słownik, więc zapis bez scalenia
 * kasowałby dane drugiego konsumenta.
 */

import { describe, expect, it, vi } from 'vitest';

import type { ProtectionConfig } from '../../study-cases/api';
import type { ProtectionDevice } from '../types';
import {
  PREFIKS_URZADZENIA_KOORDYNACJI,
  overridesZUrzadzeniami,
  urzadzeniaZOverrides,
  zapiszUrzadzeniaKoordynacji,
} from '../nastawyPrzypadku';

const updateProtectionConfig = vi.fn();

vi.mock('../../study-cases/api', () => ({
  getProtectionConfig: vi.fn(),
  updateProtectionConfig: (...args: unknown[]) => updateProtectionConfig(...args),
}));

function urzadzenie(id: string, pickup: number): ProtectionDevice {
  return {
    id,
    name: `Zabezpieczenie ${id}`,
    device_type: 'RELAY',
    location_element_id: 'bus_1',
    settings: {
      stage_51: {
        enabled: true,
        pickup_current_a: pickup,
        directional: false,
        curve_settings: {
          standard: 'IEC',
          variant: 'SI',
          pickup_current_a: pickup,
          time_multiplier: 0.25,
        },
      },
    },
  };
}

describe('nastawyPrzypadku — kontrakt overrides per urządzenie', () => {
  it('serializacja → deserializacja odtwarza urządzenia 1:1 (deterministycznie po kluczu)', () => {
    const urzadzenia = [urzadzenie('dev-b', 120), urzadzenie('dev-a', 80)];
    const overrides = overridesZUrzadzeniami({}, urzadzenia);

    expect(Object.keys(overrides).sort()).toEqual([
      `${PREFIKS_URZADZENIA_KOORDYNACJI}dev-a`,
      `${PREFIKS_URZADZENIA_KOORDYNACJI}dev-b`,
    ]);
    // Odczyt sortuje po kluczu — kolejność stabilna niezależnie od kolejności zapisu.
    expect(urzadzeniaZOverrides(overrides).map((d) => d.id)).toEqual(['dev-a', 'dev-b']);
    expect(urzadzeniaZOverrides(overrides)[1]).toEqual(urzadzenia[0]);
  });

  it('zapis zachowuje OBCE klucze (nadpisania pól szablonu P14c) i podmienia wpisy urządzeń', () => {
    const biezace = {
      'I>': { value: 90, unit: 'A' },
      [`${PREFIKS_URZADZENIA_KOORDYNACJI}dev-usuniete`]: urzadzenie('dev-usuniete', 60),
    };
    const overrides = overridesZUrzadzeniami(biezace, [urzadzenie('dev-1', 120)]);

    expect(overrides['I>']).toEqual({ value: 90, unit: 'A' });
    expect(overrides[`${PREFIKS_URZADZENIA_KOORDYNACJI}dev-usuniete`]).toBeUndefined();
    expect(overrides[`${PREFIKS_URZADZENIA_KOORDYNACJI}dev-1`]).toEqual(urzadzenie('dev-1', 120));
  });

  it('wpis uszkodzony jest pomijany (jawna strata, nie cicha podmiana wartości)', () => {
    const overrides = {
      [`${PREFIKS_URZADZENIA_KOORDYNACJI}dev-zly`]: { id: 'dev-zly' },
      [`${PREFIKS_URZADZENIA_KOORDYNACJI}dev-ok`]: urzadzenie('dev-ok', 100),
      'I>': { value: 90 },
    };
    expect(urzadzeniaZOverrides(overrides).map((d) => d.id)).toEqual(['dev-ok']);
  });

  it('PUT niesie pola szablonu 1:1 z ostatniej konfiguracji (nadpisanie całości nie może ich skasować)', async () => {
    updateProtectionConfig.mockResolvedValue({} as ProtectionConfig);
    const ostatnia: ProtectionConfig = {
      template_ref: 'tpl-1',
      template_fingerprint: 'fp-1',
      library_manifest_ref: { library_id: 'lib', revision: '1' },
      overrides: { 'I>': { value: 90 } },
      bound_at: '2026-07-01T00:00:00Z',
    };

    await zapiszUrzadzeniaKoordynacji('case-1', [urzadzenie('dev-1', 120)], ostatnia);

    expect(updateProtectionConfig).toHaveBeenCalledWith('case-1', {
      template_ref: 'tpl-1',
      template_fingerprint: 'fp-1',
      library_manifest_ref: { library_id: 'lib', revision: '1' },
      overrides: {
        'I>': { value: 90 },
        [`${PREFIKS_URZADZENIA_KOORDYNACJI}dev-1`]: urzadzenie('dev-1', 120),
      },
    });
  });
});
