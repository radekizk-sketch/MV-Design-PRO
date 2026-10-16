/*
 * Obiekty modelu w JEDYNEJ wyszukiwarce (karta K1 POWLOKA) i jedna ścieżka
 * zaznaczenia z chromu (`zaznaczElementModelu`).
 *
 * Zdolność skasowanej drugiej wyszukiwarki (dialog „Szukaj" paska metryk) przeszła
 * do palety poleceń w całości: te same kategorie, ta sama kolejność. Iloczyn cech:
 * rodzaj elementu {7 kategorii} × nazwa {podana, pusta, brak} × determinizm
 * (dwa wywołania na tej samej migawce); zaznaczenie × ref {w migawce, nieobecny}.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { KATEGORIE_OBIEKTOW, obiektyModeluDoIndeksu } from '../obiektyModelu';
import { zaznaczElementModelu } from '../../shell/zaznaczElementModelu';
import { subskrybuj } from '../../events';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useSelectionStore } from '../../../ui/selection/store';
import type { EnergyNetworkModel } from '../../../types/enm';

function model(): EnergyNetworkModel {
  return {
    header: { enm_version: '1.0', name: 'Sieć', revision: 3, hash_sha256: 'h' },
    sources: [{ ref_id: 'SRC-1', name: 'GPZ Północ', bus_ref: 'BUS-1' }],
    buses: [
      { ref_id: 'BUS-1', name: 'Szyna GPZ', voltage_kv: 15 },
      { ref_id: 'BUS-2', name: '   ', voltage_kv: 15 },
    ],
    branches: [{ ref_id: 'LIN-1', name: '', type: 'cable', from_bus_ref: 'BUS-1', to_bus_ref: 'BUS-2' }],
    transformers: [{ ref_id: 'TR-1', name: 'TR 630 kVA' }],
    loads: [{ ref_id: 'LD-1' }],
    generators: [{ ref_id: 'PV-1', name: 'Farma PV', gen_type: 'pv_inverter', station_ref: null }],
    substations: [{ id: 'ST-1', ref_id: 'ST-1', name: 'Stacja Lipowa', station_type: 'mv_lv' }],
    bays: [],
    junctions: [],
  } as unknown as EnergyNetworkModel;
}

describe('obiektyModeluDoIndeksu — kategorie, nazwy, determinizm', () => {
  it('brak modelu = pusty indeks', () => {
    expect(obiektyModeluDoIndeksu(null)).toEqual([]);
  });

  it('wszystkie siedem kategorii w kolejności parytetu skasowanej wyszukiwarki', () => {
    const kategorie = obiektyModeluDoIndeksu(model()).map((o) => o.kategoria);
    const kolejnoscUnikalna = kategorie.filter((k, i) => kategorie.indexOf(k) === i);
    expect(kolejnoscUnikalna).toEqual([
      KATEGORIE_OBIEKTOW.zrodla,
      KATEGORIE_OBIEKTOW.stacje,
      KATEGORIE_OBIEKTOW.transformatory,
      KATEGORIE_OBIEKTOW.odcinki,
      KATEGORIE_OBIEKTOW.generatory,
      KATEGORIE_OBIEKTOW.odbiory,
      KATEGORIE_OBIEKTOW.szyny,
    ]);
  });

  it('typ elementu dla zaznaczenia odpowiada rodzajowi', () => {
    const typy = Object.fromEntries(obiektyModeluDoIndeksu(model()).map((o) => [o.id, o.typ]));
    expect(typy).toEqual({
      'SRC-1': 'Source',
      'ST-1': 'Station',
      'TR-1': 'TransformerBranch',
      'LIN-1': 'LineBranch',
      'PV-1': 'Generator',
      'LD-1': 'Load',
      'BUS-1': 'Bus',
      'BUS-2': 'Bus',
    });
  });

  it('nazwa pusta, z samych spacji albo brak → identyfikator (nigdy pusty wiersz)', () => {
    const nazwy = Object.fromEntries(obiektyModeluDoIndeksu(model()).map((o) => [o.id, o.nazwa]));
    expect(nazwy['LIN-1']).toBe('LIN-1');
    expect(nazwy['BUS-2']).toBe('BUS-2');
    expect(nazwy['LD-1']).toBe('LD-1');
    expect(nazwy['ST-1']).toBe('Stacja Lipowa');
  });

  it('odcinek niesie rodzaj, generator niesie rodzaj źródła w słowach kluczowych', () => {
    const obiekty = obiektyModeluDoIndeksu(model());
    expect(obiekty.find((o) => o.id === 'LIN-1')?.slowaKluczowe).toBe('cable');
    expect(obiekty.find((o) => o.id === 'PV-1')?.slowaKluczowe).toBeTruthy();
  });

  it('determinizm: ta sama migawka → identyczny indeks', () => {
    expect(obiektyModeluDoIndeksu(model())).toEqual(obiektyModeluDoIndeksu(model()));
  });
});

describe('zaznaczElementModelu — ref × obecność w migawce', () => {
  const initialSnapshot = useSnapshotStore.getState();
  const initialSelection = useSelectionStore.getState();
  let zdarzenia: Array<{ obiektId: string | null; zrodlo: string | null }>;
  let odsubskrybuj: () => void;

  beforeEach(() => {
    useSnapshotStore.setState({ ...initialSnapshot, snapshot: model() } as never, true);
    useSelectionStore.setState(initialSelection, true);
    zdarzenia = [];
    odsubskrybuj = subskrybuj('selekcja', (z) => {
      zdarzenia.push({ obiektId: z.obiektId, zrodlo: z.zrodlo });
    });
  });

  afterEach(() => {
    odsubskrybuj();
    useSnapshotStore.setState(initialSnapshot, true);
  });

  it('ref w migawce: zaznaczenie, centrowanie schematu i zdarzenie z prawdziwym źródłem', () => {
    zaznaczElementModelu('BUS-1', 'panel-dolny');
    const stan = useSelectionStore.getState();
    expect(stan.selectedElement?.id).toBe('BUS-1');
    expect(stan.sldCenterOnElement).toBe('BUS-1');
    expect(zdarzenia).toEqual([{ obiektId: 'BUS-1', zrodlo: 'panel-dolny' }]);
  });

  it('ref nieobecny: store selekcji nietknięty, zostaje wyłącznie zdarzenie', () => {
    zaznaczElementModelu('USUNIETY-9', 'wyszukiwarka');
    const stan = useSelectionStore.getState();
    expect(stan.selectedElement).toBeNull();
    expect(stan.sldCenterOnElement).toBeNull();
    expect(zdarzenia).toEqual([{ obiektId: 'USUNIETY-9', zrodlo: 'wyszukiwarka' }]);
  });
});
