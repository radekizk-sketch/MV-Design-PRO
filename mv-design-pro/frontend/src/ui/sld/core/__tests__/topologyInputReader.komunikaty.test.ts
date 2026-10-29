// @vitest-environment node
/**
 * Komunikaty czytnika topologii SLD — nazwa z modelu, nigdy identyfikator (partia integracji 10).
 *
 * INTENCJA. Czytnik topologii (`readTopologyFromENM`, `readTopologyFromSymbols`) zgłasza braki
 * danych jako `TopologyFixAction`. Treść (`message`) i wskazówka (`fixHint`) trafiają do
 * projektanta, więc opisują element rodzajem i nazwą z modelu (`opisElementu`) albo opisem
 * braku nazwy; identyfikator (`ref_id`, `elementId`) zostaje w polu `elementRef`, z którego
 * interfejs wiąże nawigację. Wartości wyliczeniowe kontraktu (warianty przyłączenia) też nie
 * trafiają do treści — tylko ich polskie opisy.
 *
 * ILOCZYN CECH: każdy kod naprawy czytnika (11 przypadków — w tym trzy rodzaje elementu
 * bez typu katalogowego i dwie drogi kodu `topology.self_edge_forbidden`) × nazwa elementu
 * {nadana, pusta, same spacje, brak}. Dla każdej kombinacji: dokładnie jeden komunikat
 * o tym kodzie dla elementu, treść zaczyna się opisem elementu, ani treść, ani wskazówka nie
 * zawierają identyfikatora ani wartości wyliczeniowej, `elementRef` = identyfikator.
 */

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { AnySldSymbol } from '../../../sld-editor/types';
import { opisElementu } from '../opisElementu';
import { SourceConnectionVariantV1 } from '../sourceConnectionVariant';
import { readTopologyFromENM, readTopologyFromSymbols, type TopologyFixAction } from '../topologyInputReader';

const REF = 'elem/0f3a9c2e-7b1d-4e2a-9c3f-identyfikator';
const WARTOSCI_WYLICZENIOWE = Object.values(SourceConnectionVariantV1);

const NAZWY: ReadonlyArray<readonly [string, string | null]> = [
  ['nadana', 'Element 7'],
  ['pusta', ''],
  ['spacje', '   '],
  ['brak', null],
];

function enmZ(czesc: Partial<Record<keyof EnergyNetworkModel, unknown>>): EnergyNetworkModel {
  return {
    header: { hash_sha256: 'komunikaty' },
    buses: [
      { id: 'b1', ref_id: 'b1', name: 'Szyna 1', voltage_kv: 15, tags: [], meta: {} },
      { id: 'b2', ref_id: 'b2', name: 'Szyna 2', voltage_kv: 15, tags: [], meta: {} },
    ],
    branches: [],
    transformers: [],
    measurements: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    branch_points: [],
    protection_assignments: [],
    line_runs: [],
    ...czesc,
  } as unknown as EnergyNetworkModel;
}

function odcinek(typ: 'cable' | 'line_overhead', nazwa: string | null) {
  return { id: REF, ref_id: REF, name: nazwa, type: typ, from_bus_ref: 'b1', to_bus_ref: 'b2', status: 'closed', catalog_ref: null, length_km: 1, tags: [], meta: {} };
}

function generator(nazwa: string | null, pola: Record<string, unknown>) {
  return { id: REF, ref_id: REF, name: nazwa, bus_ref: 'b1', p_mw: 1, q_mvar: 0, tags: [], meta: {}, ...pola };
}

interface Przypadek {
  readonly kod: string;
  readonly rodzaj: string;
  readonly czytaj: (nazwa: string | null) => readonly TopologyFixAction[];
}

const OZE = { gen_type: 'pv_inverter' } as const;

const PRZYPADKI: readonly Przypadek[] = [
  {
    kod: 'catalog.reference_missing',
    rodzaj: 'Kabel',
    czytaj: (n) => readTopologyFromENM(enmZ({ branches: [odcinek('cable', n)] })).fixActions,
  },
  {
    kod: 'catalog.reference_missing',
    rodzaj: 'Linia',
    czytaj: (n) => readTopologyFromENM(enmZ({ branches: [odcinek('line_overhead', n)] })).fixActions,
  },
  {
    kod: 'catalog.reference_missing',
    rodzaj: 'Transformator',
    czytaj: (n) =>
      readTopologyFromENM(
        enmZ({
          transformers: [
            { id: REF, ref_id: REF, name: n, hv_bus_ref: 'b1', lv_bus_ref: 'b2', sn_mva: 0.63, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, catalog_ref: null, tags: [], meta: {} },
          ],
        }),
      ).fixActions,
  },
  {
    kod: 'generator.type_missing',
    rodzaj: 'Źródło',
    czytaj: (n) => readTopologyFromENM(enmZ({ generators: [generator(n, { gen_type: null })] })).fixActions,
  },
  {
    kod: 'generator.connection_variant_missing',
    rodzaj: 'Źródło OZE',
    czytaj: (n) => readTopologyFromENM(enmZ({ generators: [generator(n, { ...OZE, connection_variant: null })] })).fixActions,
  },
  {
    kod: 'generator.connection_variant_invalid',
    rodzaj: 'Źródło OZE',
    czytaj: (n) => readTopologyFromENM(enmZ({ generators: [generator(n, { ...OZE, connection_variant: 'wariant_spoza' })] })).fixActions,
  },
  {
    kod: 'generator.block_transformer_missing',
    rodzaj: 'Źródło OZE',
    czytaj: (n) =>
      readTopologyFromENM(
        enmZ({ generators: [generator(n, { ...OZE, connection_variant: 'DEDICATED_MV_CONNECTION', blocking_transformer_ref: null })] }),
      ).fixActions,
  },
  {
    kod: 'generator.block_transformer_invalid',
    rodzaj: 'Źródło OZE',
    czytaj: (n) =>
      readTopologyFromENM(
        enmZ({ generators: [generator(n, { ...OZE, connection_variant: 'DEDICATED_MV_CONNECTION', blocking_transformer_ref: 'tr/nie-ma' })] }),
      ).fixActions,
  },
  {
    kod: 'generator.station_ref_missing',
    rodzaj: 'Źródło OZE',
    czytaj: (n) =>
      readTopologyFromENM(
        enmZ({ generators: [generator(n, { ...OZE, connection_variant: 'LV_BEHIND_STATION_TRANSFORMER', station_ref: null })] }),
      ).fixActions,
  },
  {
    kod: 'generator.station_ref_invalid',
    rodzaj: 'Źródło OZE',
    czytaj: (n) =>
      readTopologyFromENM(
        enmZ({ generators: [generator(n, { ...OZE, connection_variant: 'SOURCE_CONNECTION_STATION', station_ref: 'st/nie-ma' })] }),
      ).fixActions,
  },
  {
    kod: 'bus.voltage_missing',
    rodzaj: 'Szyna',
    czytaj: (n) =>
      readTopologyFromSymbols([
        { id: 's1', elementId: REF, elementName: n ?? '', elementType: 'Bus', inService: true, position: { x: 0, y: 0 } },
      ] as unknown as readonly AnySldSymbol[]).fixActions,
  },
  {
    kod: 'topology.self_edge_forbidden',
    rodzaj: 'Gałąź',
    czytaj: (n) =>
      readTopologyFromSymbols([
        { id: 's1', elementId: REF, elementName: n ?? '', elementType: 'LineBranch', branchType: 'CABLE', fromNodeId: 'b1', toNodeId: 'b1', inService: true, position: { x: 0, y: 0 }, points: [] },
      ] as unknown as readonly AnySldSymbol[]).fixActions,
  },
  {
    kod: 'topology.self_edge_forbidden',
    rodzaj: 'Łącznik',
    czytaj: (n) =>
      readTopologyFromSymbols([
        { id: 's1', elementId: REF, elementName: n ?? '', elementType: 'Switch', switchType: 'BREAKER', switchState: 'CLOSED', fromNodeId: 'b1', toNodeId: 'b1', inService: true, position: { x: 0, y: 0 } },
      ] as unknown as readonly AnySldSymbol[]).fixActions,
  },
];

describe('czytnik topologii SLD — komunikaty z nazwą z modelu, bez identyfikatora', () => {
  for (const przypadek of PRZYPADKI) {
    for (const [etykieta, nazwa] of NAZWY) {
      it(`${przypadek.kod} × ${przypadek.rodzaj} × nazwa ${etykieta}`, () => {
        const akcje = przypadek.czytaj(nazwa).filter((a) => a.code === przypadek.kod && a.elementRef === REF);
        expect(akcje).toHaveLength(1);
        const [akcja] = akcje;
        expect(akcja.message.startsWith(opisElementu(przypadek.rodzaj, nazwa))).toBe(true);
        for (const tekst of [akcja.message, akcja.fixHint]) {
          expect(tekst).not.toContain(REF);
          for (const wartosc of WARTOSCI_WYLICZENIOWE) expect(tekst).not.toContain(wartosc);
          expect(tekst).not.toMatch(/[a-z]+_[a-z]+/);
        }
      });
    }
  }
});

describe('opisElementu — jedna reguła opisu elementu warstwy SLD', () => {
  it.each([
    ['Szyna', 'Sekcja 1', 'Szyna „Sekcja 1”'],
    ['Szyna', '  Sekcja 1  ', 'Szyna „Sekcja 1”'],
    ['Szyna', '', 'Szyna bez nazwy'],
    ['Szyna', '   ', 'Szyna bez nazwy'],
    ['Szyna', null, 'Szyna bez nazwy'],
    ['Szyna', undefined, 'Szyna bez nazwy'],
  ])('%s + %j → %s', (rodzaj, nazwa, oczekiwany) => {
    expect(opisElementu(rodzaj, nazwa)).toBe(oczekiwany);
  });
});
