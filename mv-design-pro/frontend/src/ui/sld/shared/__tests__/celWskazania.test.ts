/*
 * Cel wskazania kamery z rekordów modelu (karta INSPEKTOR-I-NAWIGACJA: P0 jeden cel, NAV-01
 * zgodność stacji, NAV-02 projekcja nN, NAV-03 powtarzające się nazwy; P1 rodzaj celu w
 * kontrakcie wskazania `WskazanieSld`).
 *
 * ILOCZYN CECH na migawce wygenerowanej przez backend (6 stacji, trzy szyny „Szyna nN stacji”):
 * rodzaj obiektu {stacja · pole · aparat · transformator · szyna · odcinek · źródło · sieć ·
 * odbiór} × pasmo szyny obiektu {SN · nN} × każda stacja modelu. Ścieżka produktowa: wskazanie
 * przez `centerSldOnElement` (jedyne wejście wszystkich miejsc „pokaż na schemacie”), a karta
 * inspektora — jej stacja musi być stacją wskazania (jedna reguła, dwa końce).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import fikstura from '../../../../harness-fixtures/generated/geometria_stacji_zamkniete.json';
import type { EnergyNetworkModel } from '../../../../types/enm';
import { jestRodzajemGaleziAparatu } from '../../../../types/rodzajeGalezi';
import { pasmoNapieciowe } from '../../../../ui2/model/pasmaNapieciowe';
import { useSelectionStore } from '../../../selection/store';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { szynyStacji } from '../../../shared/szynyStacji';
import { pola } from '../../../shared/polaStacji';
import { celWskazaniaModelu } from '../celWskazania';
import type { DaneElementuKanwy } from '../daneElementuKanwy';
import { buildKartaTechniczna } from '../kartaTechnicznaElementu';

const model = (fikstura as unknown as { snapshot: EnergyNetworkModel }).snapshot;
const STACJE = model.substations ?? [];
const napiecie = (ref: string | null | undefined) => (model.buses ?? []).find((b) => b.ref_id === ref)?.voltage_kv ?? null;
const projekcjaZNapiecia = (ref: string | null | undefined) => {
  const p = pasmoNapieciowe(napiecie(ref));
  return p === null ? null : p === 'nN' ? 'nn' : 'sn';
};

function wskaz(ref: string) {
  useSelectionStore.getState().centerSldOnElement(ref);
  return useSelectionStore.getState().sldWskazanie!;
}

beforeEach(() => {
  useSnapshotStore.setState({ snapshot: model });
});

describe('cel wskazania: rodzaj × projekcja × stacja (przez centerSldOnElement)', () => {
  it('iloczyn niepusty: szyny SN i nN, pola, aparaty, transformatory, odcinki, sieć', () => {
    const szyny = model.buses ?? [];
    expect(szyny.some((b) => pasmoNapieciowe(b.voltage_kv) === 'nN')).toBe(true);
    expect(szyny.some((b) => pasmoNapieciowe(b.voltage_kv) === 'SN')).toBe(true);
    expect(pola(model).length).toBeGreaterThan(0);
    expect((model.transformers ?? []).length).toBeGreaterThan(0);
    expect((model.branches ?? []).some((g) => jestRodzajemGaleziAparatu(g.type))).toBe(true);
    expect((model.branches ?? []).some((g) => !jestRodzajemGaleziAparatu(g.type))).toBe(true);
    expect((model.sources ?? []).length).toBeGreaterThan(0);
  });

  it.each(STACJE.map((s) => [s.name, s] as const))('%s: każdy obiekt stacji wskazuje tę stację i projekcję wg pasma szyny', (_n, stacja) => {
    expect(wskaz(stacja.ref_id)).toMatchObject({ ref: stacja.ref_id, rodzaj: 'stacja', stacjaRef: stacja.ref_id, projekcja: 'sn' });
    for (const busRef of szynyStacji(model, stacja)) {
      if (napiecie(busRef) === null) continue;
      const w = wskaz(busRef);
      expect(w, busRef).toMatchObject({ rodzaj: 'szyna', stacjaRef: stacja.ref_id, projekcja: projekcjaZNapiecia(busRef) });
      // Ta sama stacja w karcie inspektora (jedna reguła, dwa końce).
      expect(buildKartaTechniczna(model, { kind: 'bus', elementId: busRef } as DaneElementuKanwy)?.stacjaRef, busRef).toBe(w.stacjaRef);
    }
    for (const pole of pola(model).filter((b) => b.substation_ref === stacja.ref_id)) {
      expect(wskaz(pole.ref_id), pole.ref_id).toMatchObject({ rodzaj: 'pole', stacjaRef: stacja.ref_id, projekcja: projekcjaZNapiecia(pole.bus_ref) });
      for (const ref of pole.equipment_refs ?? []) {
        const galaz = (model.branches ?? []).find((g) => g.ref_id === ref);
        if (!galaz || !jestRodzajemGaleziAparatu(galaz.type)) continue;
        expect(wskaz(ref), ref).toMatchObject({ rodzaj: 'aparat', stacjaRef: stacja.ref_id, projekcja: projekcjaZNapiecia(pole.bus_ref) });
      }
    }
    for (const trRef of stacja.transformer_refs ?? []) {
      expect(wskaz(trRef), trRef).toMatchObject({ rodzaj: 'transformator', stacjaRef: stacja.ref_id, projekcja: 'sn' });
    }
  });

  it('NAV-02: szyna nN nigdy nie dostaje projekcji SN; NAV-03: trzy szyny o tej samej nazwie → trzy cele w trzech stacjach', () => {
    const nn = (model.buses ?? []).filter((b) => b.name === 'Szyna nN stacji');
    const cele = nn.map((b) => wskaz(b.ref_id));
    expect(cele.map((c) => c.projekcja)).toEqual(['nn', 'nn', 'nn']);
    expect(new Set(cele.map((c) => c.ref)).size).toBe(3);
    expect(new Set(cele.map((c) => c.stacjaRef)).size).toBe(3);
    expect(cele.every((c) => c.stacjaRef !== null)).toBe(true);
  });

  it('odcinek trasy i sieć zasilająca: rodzaj z rekordu, projekcja z pasma szyny', () => {
    const odcinek = (model.branches ?? []).find((g) => !jestRodzajemGaleziAparatu(g.type))!;
    expect(wskaz(odcinek.ref_id)).toMatchObject({ rodzaj: 'odcinek', projekcja: projekcjaZNapiecia(odcinek.from_bus_ref) ?? projekcjaZNapiecia(odcinek.to_bus_ref) });
    const siec = (model.sources ?? [])[0];
    expect(wskaz(siec.ref_id)).toMatchObject({ rodzaj: 'siec_zasilajaca', projekcja: projekcjaZNapiecia(siec.bus_ref) });
  });

  it('ref nieznany modelowi: rodzaj, stacja i projekcja puste (bez zgadywania)', () => {
    expect(wskaz('nie-ma-takiego')).toMatchObject({ rodzaj: null, stacjaRef: null, projekcja: null });
    expect(celWskazaniaModelu(model, 'nie-ma-takiego')).toBeNull();
    expect(celWskazaniaModelu(null, STACJE[0].ref_id)).toBeNull();
  });

  it('szyna bez napięcia w modelu: projekcja nieznana, nie „SN”', () => {
    const bus = (model.buses ?? [])[0];
    const bez = { ...model, buses: (model.buses ?? []).map((b) => (b.ref_id === bus.ref_id ? { ...b, voltage_kv: undefined as unknown as number } : b)) };
    expect(celWskazaniaModelu(bez, bus.ref_id)?.projekcja).toBeNull();
  });
});
