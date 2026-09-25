/**
 * S9-2 — MOST PRZESTRZENI REFÓW (`resultRefBridge.ts`): element rysunku ↔ punkt
 * wyniku. Testy pokrywają ILOCZYN CECH, w którym defekt mógłby się schować
 * (reguła KLASA, NIE INSTANCJA, pkt 2), a nie tylko przypadek z audytu:
 *
 *   rodzina elementu (szyna SN × szyna nN × blok stacji × transformator)
 *   × rodzaj stacji (stacja SN/nN × GPZ)
 *   × jednoznaczność danych (jedna szyna/TR × wiele × brak)
 *
 * Fixtura = ŻYWA migawka biegu (patrz `resultLabelPokrycieBiegu.test.ts`);
 * przypadki niejednoznaczne to GŁĘBOKIE KLONY tej fixtury ze strukturalnie
 * poprawną, minimalną zmianą — zero sieci fabrykowanych od zera.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildResultRefBridge,
  resultPointsHiddenByModel,
  resultPointsInStationNnBoard,
} from '../resultRefBridge';
import { pickStationBus } from '../../../shared/stationBusResolution';
import type { Bus, EnergyNetworkModel, Substation } from '../../../../../types/enm';

const here = dirname(fileURLToPath(import.meta.url));
const enm = JSON.parse(
  readFileSync(resolve(here, 'fixtures', 's92Bieg.enm.json'), 'utf8'),
) as EnergyNetworkModel;

// Tożsamość wyprowadzana z modelu (rodzaj stacji, końcówki refów, rola pola), nie
// z ziaren identyfikatorów — fikstura jest regenerowana z API (karta SLD-SUBSTRAT:
// ziarna odcinków i stacji zmieniły się z CV-4.3 K1; szablon 1250 kVA ma pole TR na
// pozycji 002, dawny zrzut 1000 kVA — na 003).
type PoleSn = { readonly field_ref: string; readonly bay_role?: string; readonly bus_ref?: string };
const stacjaInline = (enm.substations ?? []).find((s) => s.station_type === 'inline')!;
const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz')!;
const polaStacji = (stacjaInline.meta as { field_specs: PoleSn[] }).field_specs;
const STACJA = stacjaInline.ref_id;
const STACJA_SN_BUS = stacjaInline.bus_refs.find((ref) => ref.endsWith('/sn_bus'))!;
const STACJA_NN_BUS = stacjaInline.bus_refs.find((ref) => ref.endsWith('/nn_bus'))!;
const STACJA_TR = stacjaInline.transformer_refs![0];
const STACJA_POLE_TR = polaStacji.find((pole) => pole.bay_role === 'TR')!.field_ref;
const STACJA_POLA_LINIOWE = polaStacji.filter((pole) => pole.bay_role === 'IN' || pole.bay_role === 'OUT');
const GPZ = gpz.ref_id;
const GPZ_SEKCJA_BUS = gpz.bus_refs.find((ref) => ref.endsWith('/bus_sn'))!;
const GPZ_BUS_110 = gpz.bus_refs.find((ref) => ref.endsWith('/bus_110'))!;
const MUFA = (enm.buses ?? []).find((bus) => bus.ref_id.endsWith('/downstream'))!.ref_id;
const ZACISK_POLA = (enm.buses ?? []).find((bus) => bus.ref_id.includes('/sn_field_terminal/'))!.ref_id;
const ODCINEK_0 = (enm.branches ?? []).find((g) => g.name === 'Odcinek 0')!.ref_id;

const klon = (): EnergyNetworkModel => JSON.parse(JSON.stringify(enm)) as EnergyNetworkModel;
const stacjaW = (model: EnergyNetworkModel, ref: string): Substation =>
  (model.substations ?? []).find((s) => s.ref_id === ref)!;

describe('resultRefBridge — most refów rysunek ↔ punkt wyniku', () => {
  const bridge = buildResultRefBridge(enm);

  it('szyna SN stacji: odcinek `#sn-bus` wskazuje kanoniczną szynę SN', () => {
    expect(bridge.get(`${STACJA}#sn-bus`)).toEqual({ resultRef: STACJA_SN_BUS, kind: 'bus' });
  });

  it('szyna nN stacji: odcinek `#lv-bus` wskazuje szynę nN i NIESIE KLASĘ „bus" (scena klasyfikuje go jako zwykły odcinek toru)', () => {
    expect(bridge.get(`${STACJA}#lv-bus`)).toEqual({ resultRef: STACJA_NN_BUS, kind: 'bus' });
  });

  it('blok stacji (poziom przeglądu): ref stacji wskazuje TEN SAM punkt co szyna SN — wartość stacyjna na L0', () => {
    expect(bridge.get(STACJA)).toEqual({ resultRef: STACJA_SN_BUS, kind: 'bus' });
  });

  it('transformator stacji: symbol zakotwiczony na POLU o roli TR wskazuje transformator stacji', () => {
    expect(bridge.get(STACJA_POLE_TR)).toEqual({ resultRef: STACJA_TR, kind: 'transformer' });
  });

  it('GPZ: blok stacji wskazuje szynę SN rozdzielni (pola GPZ), nie szynę 110 kV', () => {
    // Reguła „najwyższe napięcie" wskazałaby tu szynę WN; rysunek bloku GPZ na
    // poziomie przeglądu reprezentuje rozdzielnię SN, więc most idzie za szyną
    // POLA (`field_specs[].bus_ref`) — tą samą, z której kompozycja buduje
    // odcinek szyny.
    expect(bridge.get(GPZ)).toEqual({ resultRef: GPZ_SEKCJA_BUS, kind: 'bus' });
  });

  it('pola o roli innej niż TR nie wchodzą do mostu (brak fabrykacji transformatora na polu liniowym)', () => {
    expect(STACJA_POLA_LINIOWE.length).toBeGreaterThanOrEqual(2);
    for (const pole of STACJA_POLA_LINIOWE) expect(bridge.has(pole.field_ref)).toBe(false);
  });

  it('brak migawki ⇒ most pusty (zero atrap)', () => {
    expect(buildResultRefBridge(null).size).toBe(0);
  });

  it('determinizm: dwa wywołania na tej samej migawce ⇒ identyczna zawartość', () => {
    const a = [...buildResultRefBridge(enm).entries()].sort();
    const b = [...buildResultRefBridge(enm).entries()].sort();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('resultRefBridge — ODMOWY zamiast zgadywania', () => {
  it('stacja z DWOMA transformatorami: pole TR nie dostaje wiązania (rysunek nie rozstrzyga, który to transformator)', () => {
    const model = klon();
    const stacja = stacjaW(model, STACJA);
    (model.transformers as unknown[]).push({
      ...(model.transformers ?? []).find((t) => t.ref_id === STACJA_TR)!,
      ref_id: `${STACJA_TR}-2`,
    });
    stacja.transformer_refs = [STACJA_TR, `${STACJA_TR}-2`];
    const bridge = buildResultRefBridge(model);
    expect(bridge.has(STACJA_POLE_TR)).toBe(false);
    // ...a szyny stacji zostają związane — odmowa dotyczy WYŁĄCZNIE
    // niejednoznacznej rodziny, nie całej stacji.
    expect(bridge.get(`${STACJA}#sn-bus`)?.resultRef).toBe(STACJA_SN_BUS);
  });

  it('stacja, której pola wskazują RÓŻNE szyny (dwie sekcje): szyna SN i blok stacji bez wiązania', () => {
    const model = klon();
    const stacja = stacjaW(model, STACJA);
    const specs = (stacja.meta as { field_specs: { bus_ref?: string }[] }).field_specs;
    specs[0].bus_ref = `${STACJA_SN_BUS}-sekcja-2`;
    const bridge = buildResultRefBridge(model);
    expect(bridge.has(`${STACJA}#sn-bus`)).toBe(false);
    expect(bridge.has(STACJA)).toBe(false);
    // Szyna nN pozostaje związana (inna rodzina, inne dane).
    expect(bridge.get(`${STACJA}#lv-bus`)?.resultRef).toBe(STACJA_NN_BUS);
  });

  it('szyna pól wskazana przez pola, ale NIEOBECNA w migawce ⇒ brak wiązania (ref bez rekordu to nie punkt wyniku)', () => {
    const model = klon();
    model.buses = (model.buses ?? []).filter((bus) => bus.ref_id !== STACJA_SN_BUS);
    const bridge = buildResultRefBridge(model);
    expect(bridge.has(`${STACJA}#sn-bus`)).toBe(false);
  });

  it('stacja z DWIEMA szynami nN tego samego napięcia ⇒ `#lv-bus` bez wiązania (remis = odmowa)', () => {
    const model = klon();
    const stacja = stacjaW(model, STACJA);
    const nn = (model.buses ?? []).find((bus) => bus.ref_id === STACJA_NN_BUS)!;
    (model.buses as Bus[]).push({ ...nn, ref_id: `${STACJA_NN_BUS}-2` });
    stacja.bus_refs = [...stacja.bus_refs, `${STACJA_NN_BUS}-2`];
    expect(pickStationBus(stacja, new Map((model.buses ?? []).map((b) => [b.ref_id, b])), 'nn')).toEqual({
      ref: null,
      voltageKv: 0.4,
      ambiguous: true,
    });
    expect(buildResultRefBridge(model).has(`${STACJA}#lv-bus`)).toBe(false);
  });
});

describe('resultPointsHiddenByModel — deklaracja modelu „tego nie rysujemy"', () => {
  const hidden = resultPointsHiddenByModel(enm);

  it('mufy ciągu (`INLINE_TERMINAL`) i zaciski pól (`FIELD_TERMINAL`) są zadeklarowane jako nierysowane', () => {
    expect(hidden.has(MUFA)).toBe(true);
    expect(hidden.has(ZACISK_POLA)).toBe(true);
  });

  it('szyny stacji, szyna 110 kV GPZ i gałęzie ciągu NIE są zadeklarowane jako nierysowane', () => {
    expect(hidden.has(STACJA_SN_BUS)).toBe(false);
    expect(hidden.has(STACJA_NN_BUS)).toBe(false);
    expect(hidden.has(GPZ_BUS_110)).toBe(false);
    expect(hidden.has(ODCINEK_0)).toBe(false);
  });

  it('brak migawki ⇒ zbiór pusty', () => {
    expect(resultPointsHiddenByModel(null).size).toBe(0);
  });
});

/**
 * ILOCZYN CECH predykatu „punkt w rozdzielnicy nN stacji": rodzaj szyny {szyna
 * odpływu nN tej stacji, szyna nN stacji, szyna SN stacji, szyna GPZ, mufa} ×
 * stan deklaracji {pole w `nn_field_specs` stacji, pole usunięte ze specyfikacji,
 * gałąź wychodząca z obcej szyny}. Źródło prawdy wspólne z agregatem odbioru
 * (`stationLoadBusRefs`) — zbiory nie mogą się rozjechać.
 */
describe('resultPointsInStationNnBoard — szyny odpływów nN stacji (poza schematem SN)', () => {
  const nnBoard = resultPointsInStationNnBoard(enm);
  const aparatyOdplywow = (enm.branches ?? []).filter((g) => typeof g.meta?.nn_field_migrowany_z === 'string');

  it('każda szyna za aparatem pola nN stacji należy do zbioru; szyny stacji, GPZ i mufy — nie', () => {
    expect(aparatyOdplywow).toHaveLength(6);
    expect([...nnBoard].sort()).toEqual(aparatyOdplywow.map((g) => String(g.to_bus_ref)).sort());
    for (const ref of [STACJA_SN_BUS, STACJA_NN_BUS, GPZ_SEKCJA_BUS, GPZ_BUS_110, MUFA]) {
      expect(nnBoard.has(ref)).toBe(false);
    }
  });

  it('pole usunięte z `nn_field_specs` stacji ⇒ jego szyna wypada ze zbioru (deklaracja, nie wędrówka po grafie)', () => {
    const model = klon();
    const stacja = stacjaW(model, STACJA);
    const meta = stacja.meta as { nn_field_specs: { field_ref: string }[] };
    const usuniete = meta.nn_field_specs.shift()!;
    const szyna = aparatyOdplywow.find((g) => g.meta?.nn_field_migrowany_z === usuniete.field_ref)!.to_bus_ref;
    const zbior = resultPointsInStationNnBoard(model);
    expect(zbior.has(String(szyna))).toBe(false);
    expect(zbior.size).toBe(5);
  });

  it('aparat pola nN wychodzący z OBCEJ szyny (nie tej stacji) ⇒ jego szyna nie należy do rozdzielnicy stacji', () => {
    const model = klon();
    const aparat = (model.branches ?? []).find((g) => g.ref_id === aparatyOdplywow[0].ref_id)!;
    aparat.from_bus_ref = GPZ_SEKCJA_BUS;
    expect(resultPointsInStationNnBoard(model).has(String(aparat.to_bus_ref))).toBe(false);
  });

  it('zbiory „nierysowane w modelu" i „w rozdzielnicy nN" są rozłączne na tej migawce', () => {
    const hidden = resultPointsHiddenByModel(enm);
    expect([...nnBoard].filter((ref) => hidden.has(ref))).toEqual([]);
  });

  it('brak migawki ⇒ zbiór pusty', () => {
    expect(resultPointsInStationNnBoard(null).size).toBe(0);
  });
});
