/**
 * Cel wskazania na schemacie z rekordów modelu (karta INSPEKTOR-I-NAWIGACJA, P0 „jeden cel, jedna
 * identyfikacja” i P1 „wskazanie celu”): rodzaj obiektu, stacja nadrzędna i projekcja (SN albo nN).
 *
 * JEDNO źródło dla trzech konsumentów: wskazania kamery (`ui/selection/store.ts`,
 * `centerSldOnElement` — kontrakt `WskazanieSld` niesie rodzaj, stację i projekcję), karty
 * technicznej inspektora (stacja nadrzędna `stacjaRef`) i testów zgodności celu. Stacja
 * nadrzędna: pole → `substation_ref`, aparat → pole, które go niesie (albo szyny gałęzi
 * aparatu), transformator → `transformer_refs` stacji (albo jego szyny), źródło →
 * `station_ref`/`substation_ref` (albo szyna), szyna → reguła przynależności szyn
 * (`stacjaSzyn`, lustro backendu). Projekcja: pasmo napięcia szyny obiektu (`pasmoNapieciowe`)
 * — szyna, odcinek, aparat, odbiór i źródło na szynie nN należą do projekcji nN stacji; stacja,
 * pole SN i transformator są rysowane na schemacie SN. Bez zgadywania po nazwie: brak napięcia
 * szyny → projekcja `null` (nieznana), nie „SN”.
 */
import type { EnergyNetworkModel } from '../../../types/enm';
import { jestRodzajemGaleziAparatu } from '../../../types/rodzajeGalezi';
import { pasmoNapieciowe } from '../../../ui2/model/pasmaNapieciowe';
import { pola } from '../../shared/polaStacji';
import { stacjaSzyn } from '../../shared/szynyStacji';

export type RodzajCeluWskazania =
  | 'stacja'
  | 'pole'
  | 'aparat'
  | 'transformator'
  | 'szyna'
  | 'odcinek'
  | 'zrodlo'
  | 'siec_zasilajaca'
  | 'odbior';

export type ProjekcjaCeluWskazania = 'sn' | 'nn';

export interface CelWskazaniaModelu {
  readonly rodzaj: RodzajCeluWskazania;
  readonly stacjaRef: string | null;
  /** `null` — napięcie szyny obiektu nieznane w modelu (uczciwy brak). */
  readonly projekcja: ProjekcjaCeluWskazania | null;
}

interface IndeksCelu {
  readonly stacjaSzyny: ReadonlyMap<string, string>;
  readonly napiecieSzyny: ReadonlyMap<string, number | null>;
}

const PAMIEC = new WeakMap<EnergyNetworkModel, IndeksCelu>();

function indeks(model: EnergyNetworkModel): IndeksCelu {
  const z = PAMIEC.get(model);
  if (z) return z;
  const napiecieSzyny = new Map<string, number | null>();
  for (const bus of model.buses ?? []) {
    const v = typeof bus.voltage_kv === 'number' && Number.isFinite(bus.voltage_kv) ? bus.voltage_kv : null;
    napiecieSzyny.set(bus.ref_id, v);
    if (bus.id && !napiecieSzyny.has(bus.id)) napiecieSzyny.set(bus.id, v);
  }
  const wynik: IndeksCelu = { stacjaSzyny: stacjaSzyn(model), napiecieSzyny };
  PAMIEC.set(model, wynik);
  return wynik;
}

function projekcjaSzyny(ix: IndeksCelu, szyna: string | null | undefined): ProjekcjaCeluWskazania | null {
  if (!szyna) return null;
  const pasmo = pasmoNapieciowe(ix.napiecieSzyny.get(szyna) ?? null);
  if (pasmo === null) return null;
  return pasmo === 'nN' ? 'nn' : 'sn';
}

function zgodny<T extends { readonly ref_id: string; readonly id?: string }>(lista: readonly T[] | null | undefined, ref: string): T | undefined {
  return (lista ?? []).find((x) => x.ref_id === ref || x.id === ref);
}

/**
 * Cel wskazania obiektu modelu o refie `ref`. `rodzaj` — gdy wołający zna rodzaj obiektu (karta
 * techniczna z danych kanwy), rozstrzyga niejednoznaczność refu; bez niego rodzaj wynika z
 * rekordów modelu w stałej kolejności. `null` — ref nieznany modelowi.
 */
export function celWskazaniaModelu(
  model: EnergyNetworkModel | null,
  ref: string,
  rodzaj?: RodzajCeluWskazania,
): CelWskazaniaModelu | null {
  if (!model || !ref) return null;
  const ix = indeks(model);
  const zSzyny = (szyna: string | null | undefined): string | null => (szyna ? ix.stacjaSzyny.get(szyna) ?? null : null);
  const czy = (r: RodzajCeluWskazania) => rodzaj === undefined || rodzaj === r;

  if (czy('stacja')) {
    const stacja = zgodny(model.substations, ref);
    if (stacja) return { rodzaj: 'stacja', stacjaRef: stacja.ref_id, projekcja: 'sn' };
  }
  if (czy('pole')) {
    const pole = pola(model).find((b) => b.ref_id === ref);
    if (pole) {
      return { rodzaj: 'pole', stacjaRef: pole.substation_ref ?? zSzyny(pole.bus_ref), projekcja: projekcjaSzyny(ix, pole.bus_ref) };
    }
  }
  if (czy('aparat')) {
    for (const pole of pola(model)) {
      // Ref pola pod rodzajem „aparat” (klik w aparat adresujący pole) — stacja tego pola.
      // Aparaty pola — ten sam zbiór co tabela aparatów karty (`aparatyPola`): aparaty pierwotne
      // i gałęzie aparatów z `equipment_refs` (transformator pola NIE jest aparatem).
      const wPolu =
        (rodzaj === 'aparat' && pole.ref_id === ref) ||
        (pole.primary_devices ?? []).some((u) => u.device_ref === ref || u.linked_ref === ref) ||
        ((pole.equipment_refs ?? []).includes(ref) && jestRodzajemGaleziAparatu(zgodny(model.branches, ref)?.type ?? ''));
      if (wPolu) {
        return { rodzaj: 'aparat', stacjaRef: pole.substation_ref ?? zSzyny(pole.bus_ref), projekcja: projekcjaSzyny(ix, pole.bus_ref) };
      }
    }
    const galaz = zgodny(model.branches, ref);
    if (galaz && jestRodzajemGaleziAparatu(galaz.type)) {
      return {
        rodzaj: 'aparat',
        stacjaRef: zSzyny(galaz.from_bus_ref) ?? zSzyny(galaz.to_bus_ref),
        projekcja: projekcjaSzyny(ix, galaz.from_bus_ref) ?? projekcjaSzyny(ix, galaz.to_bus_ref),
      };
    }
  }
  if (czy('transformator')) {
    const tr = zgodny(model.transformers, ref);
    if (tr) {
      const wlasciciel = (model.substations ?? []).find((st) => (st.transformer_refs ?? []).includes(tr.ref_id));
      return { rodzaj: 'transformator', stacjaRef: wlasciciel?.ref_id ?? zSzyny(tr.hv_bus_ref) ?? zSzyny(tr.lv_bus_ref), projekcja: 'sn' };
    }
  }
  if (czy('szyna') && ix.napiecieSzyny.has(ref)) {
    const bus = zgodny(model.buses, ref);
    const busRef = bus?.ref_id ?? ref;
    return { rodzaj: 'szyna', stacjaRef: zSzyny(busRef), projekcja: projekcjaSzyny(ix, busRef) };
  }
  if (czy('odcinek')) {
    const galaz = zgodny(model.branches, ref);
    if (galaz && !jestRodzajemGaleziAparatu(galaz.type)) {
      // Odcinek trasy nie należy do stacji (łączy stacje) — stacja nadrzędna pusta.
      return {
        rodzaj: 'odcinek',
        stacjaRef: null,
        projekcja: projekcjaSzyny(ix, galaz.from_bus_ref) ?? projekcjaSzyny(ix, galaz.to_bus_ref),
      };
    }
  }
  if (czy('zrodlo')) {
    const g = zgodny(model.generators, ref);
    if (g) return { rodzaj: 'zrodlo', stacjaRef: g.station_ref ?? zSzyny(g.bus_ref), projekcja: projekcjaSzyny(ix, g.bus_ref) };
  }
  if (czy('siec_zasilajaca')) {
    const s = zgodny(model.sources, ref);
    if (s) return { rodzaj: 'siec_zasilajaca', stacjaRef: s.substation_ref ?? zSzyny(s.bus_ref), projekcja: projekcjaSzyny(ix, s.bus_ref) };
  }
  if (czy('odbior')) {
    const o = zgodny(model.loads, ref);
    if (o) return { rodzaj: 'odbior', stacjaRef: zSzyny(o.bus_ref), projekcja: projekcjaSzyny(ix, o.bus_ref) };
  }
  return null;
}
