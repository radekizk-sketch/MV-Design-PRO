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
import { buildResultRefBridge, resultPointsHiddenByModel } from '../resultRefBridge';
import { pickStationBus } from '../../../shared/stationBusResolution';
import type { Bus, EnergyNetworkModel, Substation } from '../../../../../types/enm';

const here = dirname(fileURLToPath(import.meta.url));
const enm = JSON.parse(
  readFileSync(resolve(here, 'fixtures', 's92Bieg.enm.json'), 'utf8'),
) as EnergyNetworkModel;

const STACJA = 'stn/6db7ec2086af7dc462ff4bbb91f42b90/station';
const STACJA_SN_BUS = 'stn/6db7ec2086af7dc462ff4bbb91f42b90/sn_bus';
const STACJA_NN_BUS = 'stn/6db7ec2086af7dc462ff4bbb91f42b90/nn_bus';
const STACJA_TR = 'stn/6db7ec2086af7dc462ff4bbb91f42b90/transformer';
const STACJA_POLE_TR = 'stn/6db7ec2086af7dc462ff4bbb91f42b90/sn_field/003';
const GPZ = 'gpz/a6b30c58f8be3a034fd29c5254ae4326/substation';
const GPZ_SEKCJA_BUS = 'gpz/a6b30c58f8be3a034fd29c5254ae4326/section/001/bus_sn';

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
    expect(bridge.has('stn/6db7ec2086af7dc462ff4bbb91f42b90/sn_field/000')).toBe(false);
    expect(bridge.has('stn/6db7ec2086af7dc462ff4bbb91f42b90/sn_field/001')).toBe(false);
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
    expect(hidden.has('bus/579ff99a3d0449ee89eb53b41d3f1bca/downstream')).toBe(true);
    expect(hidden.has('stn/6db7ec2086af7dc462ff4bbb91f42b90/sn_field_terminal/000')).toBe(true);
  });

  it('szyny stacji, szyna 110 kV GPZ i gałęzie ciągu NIE są zadeklarowane jako nierysowane', () => {
    expect(hidden.has(STACJA_SN_BUS)).toBe(false);
    expect(hidden.has(STACJA_NN_BUS)).toBe(false);
    expect(hidden.has('gpz/a6b30c58f8be3a034fd29c5254ae4326/transformer/001/bus_110')).toBe(false);
    expect(hidden.has('seg/579ff99a3d0449ee89eb53b41d3f1bca/segment')).toBe(false);
  });

  it('brak migawki ⇒ zbiór pusty', () => {
    expect(resultPointsHiddenByModel(null).size).toBe(0);
  });
});
