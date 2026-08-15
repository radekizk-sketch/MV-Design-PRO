/**
 * `config_id` jest dla frontendu KLUCZEM NIEPRZEZROCZYSTYM — adapter przepisuje
 * go 1:1 i NIE parsuje prefiksu pochodzenia.
 *
 * Karta K-L PROWENIENCJA-CONFIG-ID (backend). Identyfikator konfiguracji pola
 * niesie pochodzenie w prefiksie: `kanoniczny:<ref>` dla szablonu kanonicznego,
 * `producent:<manufacturer_ref>:<template_ref>` dla katalogowego pola rodziny
 * producenta. Do tej karty backend doklejał `kanoniczny:` KAŻDEJ referencji,
 * więc pole producenckie fabrykowało pochodzenie; naprawa zmienia WARTOŚĆ tego
 * klucza dla pól producenckich.
 *
 * Pomiar przed naprawą (grep po `config_id`/`configId` w `frontend/src`):
 * adapter → read-model bloku → `compose/station.ts` → `scene/buildScene.ts` →
 * atrybut `data-config-id` podglądu. ANI JEDNEGO `split`/`startsWith`/`replace`
 * /`match` na tej wartości — zmiana nomenklatury nie ma skutku dla renderu.
 *
 * Ten test PRZYPINA ten pomiar (deklaracja bez testu = fałszywa pewność):
 * gdyby ktoś dopisał we froncie warunek na prefiksie (np. „producenckie rysuj
 * inaczej"), render zacząłby zależeć od pochodzenia zamiast od DANYCH pola —
 * i pierwsza zmiana nomenklatury po stronie katalogu cicho zmieniłaby rysunek.
 * Sprawdzamy iloczyn cech: {obie nomenklatury} × {wartość z separatorem `:`
 * w trzecim członie} × {brak klucza} — wartość wychodzi bajtowo taka, jaka
 * weszła, albo jej nie ma.
 */

import { describe, it, expect } from 'vitest';

import { buildSldDataFromSnapshot } from '../enmToSldAdapter';
import type { EnergyNetworkModel } from '../../../../../types/enm';

const HEADER = {
  enm_version: '1.0' as const,
  name: 'config-id-nieprzezroczysty',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  revision: 1,
  hash_sha256: 'a'.repeat(64),
  defaults: { frequency_hz: 50, unit_system: 'SI' as const },
};

/** Identyfikator KANONICZNY (szablon pola z `bay_templates.py`). */
const CONFIG_ID_KANONICZNY = 'kanoniczny:bay_template_line_out';
/** Identyfikator PRODUCENCKI (katalogowe pole rodziny, po naprawie K-L). */
const CONFIG_ID_PRODUCENCKI = 'producent:ZPUE_WLOSZCZOWA:ZPUE_WLOSZCZOWA__RELF__LINE_OUT';

function buildSnapshotZPolami(configIds: readonly (string | undefined)[]): EnergyNetworkModel {
  return {
    header: HEADER,
    buses: [
      {
        id: 'bus-sn',
        ref_id: 'bus-sn',
        name: 'Szyna SN',
        voltage_kv: 15,
        phase_system: '3ph',
        tags: [],
        meta: {},
        substation_ref: 'ST-CFG',
      },
    ],
    branches: configIds.map((_, index) => ({
      id: `sw-${index}`,
      ref_id: `sw-${index}`,
      name: `Aparat ${index}`,
      type: 'breaker',
      from_bus_ref: 'bus-sn',
      to_bus_ref: `t-${index}`,
      status: 'closed',
      tags: [],
      meta: {},
    })),
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [
      {
        id: 'st',
        ref_id: 'ST-CFG',
        name: 'Stacja z polami katalogowymi',
        tags: [],
        meta: {
          field_specs: configIds.map((configId, index) => ({
            field_ref: `field-${index}`,
            name: `Pole ${index}`,
            bay_role: 'OUT',
            bus_ref: 'bus-sn',
            equipment_refs: [`sw-${index}`],
            meta: { field_role: 'LINIA_OUT' },
            ...(configId === undefined ? {} : { config_id: configId }),
          })),
        },
        station_type: 'inline',
        bus_refs: ['bus-sn'],
        transformer_refs: [],
      },
    ],
    bays: [],
    measurements: [],
    protection_devices: [],
    protection_assignments: [],
    // Stacja trafia do read-modelu adaptera dopiero jako pozycja ciągu głównego.
    line_runs: [
      {
        id: 'run-config-id',
        run_kind: 'main_trunk',
        starting_bay_ref: 'run-config-id/bay',
        starting_port_ref: 'run-config-id/port',
        segments: [],
        stations: [{ substation_ref: 'ST-CFG', order: 1 }],
      },
    ],
    connection_nodes: [],
    cable_joints: [],
  } as never;
}

function stacjaZPolami(configIds: readonly (string | undefined)[]) {
  const dane = buildSldDataFromSnapshot(buildSnapshotZPolami(configIds), null);
  const stacja = dane.stations.find((s) => s.id === 'ST-CFG');
  expect(stacja, 'adapter nie zbudowal stacji z fikstury').toBeTruthy();
  return stacja!;
}

/**
 * Pola SN stacji z fikstury. `snBays` jest w kontrakcie widoku OPCJONALNE, więc
 * jego brak to nieudana fikstura, a nie pusty wynik — mówimy o tym wprost,
 * zamiast czytać z `?? []` i porównywać puste listy (test przechodziłby wtedy
 * nie ćwicząc adaptera).
 */
function polaStacji(configIds: readonly (string | undefined)[]) {
  const pola = stacjaZPolami(configIds).snBays;
  expect(pola, 'adapter nie zbudowal pol SN stacji z fikstury').toBeTruthy();
  return pola!;
}

function configIdyPol(configIds: readonly (string | undefined)[]): (string | undefined)[] {
  return polaStacji(configIds).map((bay) => bay.configId);
}

describe('K-L — config_id jako klucz nieprzezroczysty adaptera ENM → SLD', () => {
  it('przepisuje OBIE nomenklatury bajtowo, bez zdejmowania prefiksu pochodzenia', () => {
    expect(configIdyPol([CONFIG_ID_KANONICZNY, CONFIG_ID_PRODUCENCKI])).toEqual([
      CONFIG_ID_KANONICZNY,
      CONFIG_ID_PRODUCENCKI,
    ]);
  });

  it('nie gubi trzeciego członu identyfikatora producenckiego (dwa separatory `:`)', () => {
    const [wynik] = configIdyPol([CONFIG_ID_PRODUCENCKI]);
    expect(wynik).toBe(CONFIG_ID_PRODUCENCKI);
    expect(wynik?.split(':')).toHaveLength(3);
  });

  it('pole bez `config_id` nie dostaje wartości zastępczej (uczciwy brak, nie domysł)', () => {
    expect(configIdyPol([undefined])).toEqual([undefined]);
  });

  it('render nie rozróżnia pochodzenia: pola różniące się WYŁĄCZNIE nomenklaturą config_id dają identyczny opis bloku', () => {
    const [kanoniczne] = polaStacji([CONFIG_ID_KANONICZNY]);
    const [producenckie] = polaStacji([CONFIG_ID_PRODUCENCKI]);
    expect({ ...kanoniczne, configId: null }).toEqual({ ...producenckie, configId: null });
  });
});
