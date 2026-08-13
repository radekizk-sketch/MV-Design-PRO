/**
 * PARYTET MARKER ↔ OSTRZEŻENIE — pole transformatorowe SN.
 * Karta KOMPLETNOSC-POLA-TR §0 pkt 2/4.
 *
 * CO PILNUJE. Ten sam fakt domenowy („transformator na szynie SN bez pola roli
 * TR") liczą DWIE niezależne implementacje:
 *   * backend — `enm/pole_transformatorowe.py` (ostrzeżenie gotowości W041 +
 *     brama dokumentacji wykonawczej),
 *   * rysunek — `layout/measure.ts::implicitStationTransformers` (marker „!"
 *     przy stronie WN symbolu transformatora).
 * Rozjazd tych predykatów to stan, w którym projektant widzi ostrzeżenie o
 * czymś, czego rysunek nie pokazuje (albo odwrotnie) — czyli dokładnie ta klasa
 * defektu, którą reguła KLASA §3 nazywa „predykaty parami z jednego źródła".
 *
 * JAK. Oba testy chodzą po TEJ SAMEJ tablicy decyzyjnej
 * `backend/schemas/pole_transformatorowe_parytet_v1.json`. Nie ma tu drugiej
 * kopii przypadków — jest jedno źródło i dwóch konsumentów, więc wyjęcie
 * wiersza albo zmiana werdyktu wywraca test po obu stronach.
 *
 * Ścieżka jest REALNA: wiersz tablicy → migawka ENM → `buildSldDataFromSnapshot`
 * (ten sam adapter, który zasila kanwę) → `implicitStationTransformers`.
 * Nie budujemy `StationMeasureInput` ręcznie, bo wtedy test omijałby dokładnie
 * to ogniwo (selekcja transformatorów stacji), w którym parytet się psuje.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import { implicitStationTransformers } from '../measure';

interface WierszTablicy {
  readonly id: string;
  readonly opis_pl: string;
  readonly cecha_pole_tr: 'jest' | 'brak';
  readonly cecha_transformator: 'jest' | 'brak';
  readonly stacja: {
    readonly sn_bus_kv: number;
    readonly nn_bus_kv: number | null;
    readonly role_pol: readonly string[];
    readonly deklaruje_transformator: boolean;
  };
  readonly transformator: {
    readonly hv: 'sn' | 'nn' | 'obca';
    readonly lv: 'sn' | 'nn' | 'obca';
    readonly blokowy_der?: boolean;
  } | null;
  readonly oczekiwane_znalezisko: boolean;
}

const TABLICA_PARYTETU = path.resolve(
  __dirname,
  '../../../../../../../backend/schemas/pole_transformatorowe_parytet_v1.json',
);

function wierszeTablicy(): readonly WierszTablicy[] {
  const dane = JSON.parse(readFileSync(TABLICA_PARYTETU, 'utf-8')) as {
    wiersze: readonly WierszTablicy[];
  };
  return dane.wiersze;
}

/** Migawka ENM odwzorowująca wiersz tablicy — kształt identyczny z pytestem. */
function migawkaZWiersza(wiersz: WierszTablicy): EnergyNetworkModel {
  const { stacja } = wiersz;
  const buses: Record<string, unknown>[] = [
    { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: stacja.sn_bus_kv },
  ];
  const busRefs = ['bus-sn'];
  if (stacja.nn_bus_kv !== null) {
    buses.push({ ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: stacja.nn_bus_kv });
    busRefs.push('bus-nn');
  }

  const fieldSpecs = stacja.role_pol.map((rola, index) => ({
    field_ref: `pole-${String(index).padStart(3, '0')}`,
    name: `Pole ${rola}`,
    bay_role: rola,
    bus_ref: 'bus-sn',
  }));

  const transformers: Record<string, unknown>[] = [];
  const generators: Record<string, unknown>[] = [];
  const transformerRefs: string[] = [];
  if (wiersz.transformator) {
    const mapaSzyn: Record<string, string | null> = { sn: 'bus-sn', nn: 'bus-nn', obca: null };
    const hv = mapaSzyn[wiersz.transformator.hv] ?? 'bus-der-sn';
    const lv = mapaSzyn[wiersz.transformator.lv] ?? 'bus-der-nn';
    if (hv === 'bus-der-sn') {
      buses.push({ ref_id: hv, name: 'Szyna przyłączeniowa DER', voltage_kv: 15.0 });
    }
    if (lv === 'bus-der-nn') {
      buses.push({ ref_id: lv, name: 'Szyna producenta', voltage_kv: 0.8 });
    }
    transformers.push({
      ref_id: 'tr-1',
      name: 'Transformator',
      hv_bus_ref: hv,
      lv_bus_ref: lv,
      sn_mva: 0.63,
      uhv_kv: 15.0,
      ulv_kv: 0.4,
      uk_percent: 6.0,
      pk_kw: 6.5,
    });
    if (stacja.deklaruje_transformator) transformerRefs.push('tr-1');
    if (wiersz.transformator.blokowy_der) {
      generators.push({
        ref_id: 'gen-pv',
        name: 'PV',
        bus_ref: lv,
        gen_type: 'pv_inverter',
        p_mw: 0.4,
        blocking_transformer_ref: 'tr-1',
      });
    }
  }

  return {
    header: { name: 'parytet-pola-tr' },
    buses,
    branches: [],
    transformers,
    generators,
    loads: [],
    bays: [],
    // Magistrala z jawnym `station_refs` — bez niej `buildStations` nie ma gdzie
    // umieścić stacji (adapter nie ma trybu „stacja bez ciągu"), więc test
    // mierzyłby brak stacji zamiast predykatu.
    corridors: [
      {
        ref_id: 'cor-1',
        name: 'Magistrala',
        corridor_type: 'radial',
        ordered_segment_refs: [],
        station_refs: ['stn-1'],
      },
    ],
    substations: [
      {
        ref_id: 'stn-1',
        name: 'Stacja testowa',
        station_type: 'mv_lv',
        bus_refs: busRefs,
        transformer_refs: transformerRefs,
        meta: { field_specs: fieldSpecs },
      },
    ],
  } as unknown as EnergyNetworkModel;
}

/** Czy rysunek postawi kolumnę transformatora BEZ pola (czyli zapali marker). */
function markerNaRysunku(wiersz: WierszTablicy): boolean {
  const dane = buildSldDataFromSnapshot(migawkaZWiersza(wiersz), null);
  const stacja = dane.stations.find((s) => s.id === 'stn-1');
  expect(stacja, `adapter musi zbudować stację dla wiersza ${wiersz.id}`).toBeDefined();
  return (
    implicitStationTransformers({
      snBays: stacja!.snBays ?? [],
      hasTransformer: stacja!.hasTransformer,
      transformerUnits: stacja!.transformerUnits,
    }).length > 0
  );
}

describe('parytet marker (rysunek) ↔ ostrzeżenie (gotowość) — pole transformatorowe SN', () => {
  const wiersze = wierszeTablicy();

  it('tablica decyzyjna jest wczytana i niepusta (test bez danych nie jest testem)', () => {
    expect(wiersze.length).toBeGreaterThanOrEqual(4);
  });

  for (const wiersz of wiersze) {
    it(`[${wiersz.id}] marker = werdykt bramki — ${wiersz.opis_pl}`, () => {
      expect(markerNaRysunku(wiersz)).toBe(wiersz.oczekiwane_znalezisko);
    });
  }

  it('tablica pokrywa iloczyn cech wymagany kartą (§0 pkt 4)', () => {
    const cechy = new Set(wiersze.map((w) => `${w.cecha_pole_tr}|${w.cecha_transformator}`));
    expect(cechy).toContain('jest|jest');
    expect(cechy).toContain('brak|jest');
    expect(cechy).toContain('jest|brak');
    expect(cechy).toContain('brak|brak');
    const werdykty = new Set(wiersze.map((w) => w.oczekiwane_znalezisko));
    expect(werdykty).toEqual(new Set([true, false]));
  });
});
