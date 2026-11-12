/*
 * Stacja nadrzędna karty inspektora (karta INSPEKTOR-I-NAWIGACJA pkt 6 / NAV-01, NAV-03).
 *
 * Identyfikacja celu = element modelu + stacja nadrzędna, liczona z rekordów modelu, nigdy
 * po nazwie. ILOCZYN CECH na migawce wygenerowanej przez backend (6 stacji, trzy szyny o tej
 * samej nazwie „Szyna nN stacji"): rodzaj karty (stacja, szyna, pole, transformator, sieć
 * zasilająca) × każda stacja modelu; plus szyny o powtarzającej się nazwie → różne obiekty
 * i różne stacje; odcinek trasy (poza stacją) → brak stacji.
 */
import { describe, expect, it } from 'vitest';

import fikstura from '../../../../harness-fixtures/generated/geometria_stacji_zamkniete.json';
import type { EnergyNetworkModel } from '../../../../types/enm';
import { szynyStacji } from '../../../shared/szynyStacji';
import type { DaneElementuKanwy } from '../daneElementuKanwy';
import { buildKartaTechniczna } from '../kartaTechnicznaElementu';

const model = (fikstura as unknown as { snapshot: EnergyNetworkModel }).snapshot;

function karta(kind: DaneElementuKanwy['kind'], elementId: string) {
  return buildKartaTechniczna(model, { kind, elementId } as DaneElementuKanwy);
}

const STACJE = model.substations ?? [];

describe('karta inspektora: stacja nadrzędna z modelu (rodzaj karty × stacja)', () => {
  it('model ma 6 stacji i trzy szyny o tej samej nazwie (iloczyn niepusty)', () => {
    expect(STACJE).toHaveLength(6);
    expect((model.buses ?? []).filter((b) => b.name === 'Szyna nN stacji')).toHaveLength(3);
  });

  it.each(STACJE.map((s) => [s.name, s] as const))('%s: stacja, jej szyny, pola i transformatory', (_n, stacja) => {
    const wlasna = karta('station', stacja.ref_id);
    expect(wlasna).toMatchObject({ elementRef: stacja.ref_id, stacjaRef: stacja.ref_id });
    expect(wlasna?.stacjaNazwa).toBeTruthy();
    const szyny = [...szynyStacji(model, stacja)].filter((ref) => (model.buses ?? []).some((b) => b.ref_id === ref));
    expect(szyny.length).toBeGreaterThan(0);
    for (const ref of szyny) {
      expect(karta('bus', ref), ref).toMatchObject({ elementRef: ref, stacjaRef: stacja.ref_id, stacjaNazwa: wlasna?.stacjaNazwa });
    }
    for (const pole of (model.bays ?? []).filter((b) => b.substation_ref === stacja.ref_id)) {
      expect(karta('bay', pole.ref_id)?.stacjaRef, pole.ref_id).toBe(stacja.ref_id);
    }
    for (const tr of stacja.transformer_refs ?? []) {
      expect(karta('transformer', tr)?.stacjaRef, tr).toBe(stacja.ref_id);
    }
  });

  it('sieć zasilająca: stacja GPZ z rekordu źródła', () => {
    const zrodlo = (model.sources ?? [])[0];
    expect(karta('grid_source', zrodlo.ref_id)?.stacjaRef).toBe(zrodlo.substation_ref);
  });

  it('szyny o tej samej nazwie: trzy różne obiekty w trzech różnych stacjach', () => {
    const karty = (model.buses ?? []).filter((b) => b.name === 'Szyna nN stacji').map((b) => karta('bus', b.ref_id));
    expect(new Set(karty.map((k) => k?.elementRef)).size).toBe(3);
    expect(new Set(karty.map((k) => k?.stacjaRef)).size).toBe(3);
    expect(karty.every((k) => k?.stacjaRef)).toBe(true);
  });

  it('odcinek trasy między stacjami nie ma stacji nadrzędnej', () => {
    const kabel = (model.branches ?? []).find((b) => b.type === 'cable');
    expect(kabel).toBeDefined();
    expect(karta('cable_run', kabel!.ref_id)?.stacjaRef).toBeNull();
  });
});
