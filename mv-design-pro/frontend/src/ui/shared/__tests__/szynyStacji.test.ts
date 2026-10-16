/**
 * KARTA SZYNY-STACJI-LUSTRO — ILOCZYN CECH jednej reguły przynależności szyny do stacji.
 *
 * Cechy (model `iloczyn` w pliku parytetu, zbiory oczekiwane policzone przez backend
 * `enm.tor_pola.szyny_stacji`; karta W5-B: pola są rekordami `bays`, poziom z napięcia szyny):
 *   zacisk pola SN (`terminal_bus_ref`) {zwykły, białe znaki, zacisk = szyna pola, pusty
 *   `ref_id`, brak `bus_ref`, szyna bez napięcia, bez zacisku} × aparat pola nN
 *   (`equipment_refs` rekordu pola nN) {z szyny głównej, łańcuch w ODWROTNEJ kolejności
 *   gałęzi, z obcej szyny wskazany przez pole tej stacji, wskazany przez pole innej stacji,
 *   na zacisku wyłącznika głównego, znacznik gałęzi bez rekordu pola} × podrozdzielnica nN
 *   jako osobna `Substation` × szyna bez stacji × kolejność gałęzi {każdy obrót, odwrócona}.
 * Stacja A niesie jednocześnie zaciski pól SN i aparaty pól nN — kombinacja, na której
 * rozjeżdżały się dwie dawne połówki reguły (`szynaNalezyDoStacji`, `stationLoadBusRefs`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Substation } from '../../../types/enm';
import { stacjaSzyn, szynaGlownaStacji, szynyStacji, type GalazDlaSzyn, type ModelSzyn, type StacjaDlaSzyn } from '../szynyStacji';
import { selectStationDistributionTransformers, stationRefOfTransformer } from '../transformatoryStacji';
import { punktPrzylaczeniaPola, stacjaPola, zaciskPola } from '../polaStacji';

const here = dirname(fileURLToPath(import.meta.url));
const { iloczyn } = JSON.parse(readFileSync(resolve(here, 'fixtures/szynyStacjiParytet.json'), 'utf8')) as {
  readonly iloczyn: {
    readonly model: ModelSzyn & { readonly substations: readonly StacjaDlaSzyn[]; readonly branches: readonly GalazDlaSzyn[] };
    readonly szyny: Readonly<Record<string, readonly string[]>>;
    readonly szyny_glowne: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
    readonly transformatory: Readonly<Record<string, readonly string[]>>;
    readonly zaciski_pol: Readonly<Record<string, string | null>>;
    readonly punkty_przylaczenia_rekordow_pol: Readonly<Record<string, string | null>>;
  };
};
const { model, szyny: oczekiwane } = iloczyn;
const enm = model as unknown as EnergyNetworkModel;
const stacja = (ref: string): StacjaDlaSzyn => model.substations.find((s) => s.ref_id === ref)!;
const posortowane = (s: ReadonlySet<string>): string[] => [...s].sort();

function kolejnosci(galezie: readonly GalazDlaSzyn[]): (readonly GalazDlaSzyn[])[] {
  const obroty = galezie.map((_, i) => [...galezie.slice(i), ...galezie.slice(0, i)]);
  return [...obroty, ...obroty.map((o) => [...o].reverse())];
}

describe('szynyStacji — iloczyn cech (zbiory z backendu)', () => {
  it.each(Object.keys(oczekiwane))('%s: zbiór lustra = zbiór backendu w KAŻDEJ kolejności gałęzi', (ref) => {
    for (const galezie of kolejnosci(model.branches)) {
      expect(posortowane(szynyStacji({ ...model, branches: galezie }, stacja(ref)))).toEqual(oczekiwane[ref]);
    }
  });

  it('stacja A: zaciski pól SN i szyny za aparatami pól nN w JEDNYM zbiorze', () => {
    const szyny = szynyStacji(model, stacja('A/stacja'));
    for (const zacisk of ['A/zacisk-in', 'A/zacisk-out', 'A/zacisk-oze', 'A/zacisk-pomiar', 'A/zacisk-tr']) {
      expect(szyny.has(zacisk)).toBe(true);
    }
    for (const zaAparatem of ['A/zacisk-wg-nn', 'A/odp-1', 'A/sekcja', 'A/odp-2', 'A/odp-3', 'B/board']) {
      expect(szyny.has(zaAparatem)).toBe(true);
    }
  });

  it('pusty ref_id, brak bus_ref, pusta szyna główna i zacisk z białymi znakami (przycięty) — nie wchodzą surowo', () => {
    const szyny = szynyStacji(model, stacja('A/stacja'));
    for (const ref of ['A/zacisk-bez-refu', 'A/zacisk-bez-szyny', '  ', ' A/zacisk-tr ']) {
      expect(szyny.has(ref)).toBe(false);
    }
    // Pole na szynie bez napięcia ma poziom nieznany = SN (jak backend): jego zacisk wchodzi.
    expect(szyny.has('A/zacisk-szyny-bez-napiecia')).toBe(true);
  });

  it('aparat wskazany przez pole INNEJ stacji i znacznik gałęzi bez rekordu pola nie dopisują szyn', () => {
    const szyny = szynyStacji(model, stacja('A/stacja'));
    expect(szyny.has('X/obca')).toBe(false);
    expect(szyny.has('A/sierota')).toBe(false);
    expect(szyny.has('Y/szyna-obca')).toBe(true);
  });

  it('szyna bez stacji nie należy do żadnej stacji', () => {
    for (const s of model.substations) expect(szynyStacji(model, s).has('Z/wolna')).toBe(false);
    expect(stacjaSzyn(model).has('Z/wolna')).toBe(false);
  });
});

describe('stacjaSzyn — szyna wspólna dwóch stacji (podrozdzielnica nN)', () => {
  it('szyna podrozdzielnicy za aparatem pola stacji należy do PIERWSZEJ stacji modelu (jak topologia backendu)', () => {
    expect(stacjaSzyn(model).get('B/board')).toBe('A/stacja');
    expect(stacjaSzyn(model, [...model.substations].reverse()).get('B/board')).toBe('B/podrozdzielnica');
  });

  it('mapa = suma zbiorów lustra, każda szyna dokładnie raz', () => {
    const mapa = stacjaSzyn(model);
    const suma = new Set(model.substations.flatMap((s) => [...szynyStacji(model, s)]));
    expect([...mapa.keys()].sort()).toEqual([...suma].sort());
    expect(mapa.get('B/odp-bus')).toBe('B/podrozdzielnica');
  });
});

/**
 * COMMIT 2 — pozostałe odpowiedzi klasy „stacja i jej szyny” na modelu iloczynu; zbiory
 * oczekiwane liczy backend. Każda asercja ma parę z iniekcją drugiej reguły (meldunek karty).
 */
describe('szynaGlownaStacji — {szyna główna, zacisk, szyna za aparatem nN, szyna obca}', () => {
  it.each(Object.keys(iloczyn.szyny_glowne))('%s: każda szyna (także obca) = backend', (ref) => {
    for (const [szyna, glowna] of Object.entries(iloczyn.szyny_glowne[ref])) {
      expect({ szyna, glowna: szynaGlownaStacji(model, stacja(ref), szyna) }).toEqual({ szyna, glowna });
    }
  });

  it('zacisk → szyna pola, koniec aparatu z szyny głównej → ta szyna, łańcuch i szyna obca → null', () => {
    const a = stacja('A/stacja');
    expect(szynaGlownaStacji(model, a, 'A/sn')).toBe('A/sn');
    expect(szynaGlownaStacji(model, a, 'A/zacisk-tr')).toBe('A/sn');
    expect(szynaGlownaStacji(model, a, 'A/odp-1')).toBe('A/nn');
    expect(szynaGlownaStacji(model, a, 'A/odp-2')).toBeNull();
    expect(szynaGlownaStacji(model, a, 'Z/wolna')).toBeNull();
  });
});

describe('transformatory stacji — {na szynie głównej, na zacisku, blokowy (wskazanie / rola), obcy} × konsument', () => {
  it.each(Object.keys(iloczyn.transformatory))('%s: transformatory rozdzielcze = backend', (ref) => {
    const wynik = selectStationDistributionTransformers(enm, stacja(ref) as Substation).map((t) => t.ref_id).sort();
    expect(wynik).toEqual(iloczyn.transformatory[ref]);
  });

  it('odwrotność tej samej reguły: stacja transformatora (także blokowego — bez filtra)', () => {
    expect(stationRefOfTransformer(enm, 'T/na-zacisku')).toBe('A/stacja');
    expect(stationRefOfTransformer(enm, 'T/blokowy-rola')).toBe('A/stacja');
    expect(stationRefOfTransformer(enm, 'T/deklarowany-w-C')).toBe('C/stacja-bez-pol');
    expect(stationRefOfTransformer(enm, 'T/obcy')).toBeNull();
  });
});

describe('zacisk pola — {zwykły, białe znaki, = szyna pola, brak} × {zacisk, punkt przyłączenia}', () => {
  it('rekordy pól stacji: `zaciskPola` = backend `enm.pola.zacisk_pola`', () => {
    for (const [ref, oczekiwany] of Object.entries(iloczyn.zaciski_pol)) {
      const bay = (enm.bays ?? []).find((b) => b.ref_id === ref);
      expect({ ref, z: zaciskPola(bay) }).toEqual({ ref, z: oczekiwany });
    }
  });

  it('każdy rekord `bays`: `punktPrzylaczeniaPola` = backend `punkt_przylaczenia_pola`', () => {
    for (const bay of enm.bays ?? []) {
      const punkt = punktPrzylaczeniaPola(bay);
      expect({ ref: bay.ref_id, punkt }).toEqual({ ref: bay.ref_id, punkt: iloczyn.punkty_przylaczenia_rekordow_pol[bay.ref_id] });
    }
  });
});

describe('stacja pola z danych — {pole SN, pole nN, pole stacji spoza modelu, nazwa niezgodna ze wzorcem}', () => {
  it('pole SN i nN wskazuje stację z `substation_ref` rekordu', () => {
    expect(stacjaPola(enm, 'A/pole-tr')).toBe('A/stacja');
    expect(stacjaPola(enm, 'A/nn-odp-1')).toBe('A/stacja');
    expect(stacjaPola(enm, 'B/odp')).toBe('B/podrozdzielnica');
    // Stacja `X/stacja` nie istnieje w modelu — brak stacji (jak backend `stacja_pola`).
    expect(stacjaPola(enm, 'X/nn-pole')).toBeNull();
  });

  it('ref pola o gramatyce „stn/<id>/…” bez rekordu NIE daje stacji (brak zgadywania po nazwie)', () => {
    const model2 = {
      substations: [{ ref_id: 'stn/abc/station' }],
      bays: [{ ref_id: 'pole-bez-wzorca', substation_ref: 'stn/abc/station', bus_ref: 'x', bay_role: 'OUT' as const }],
    };
    expect(stacjaPola(model2, 'stn/abc/sn_field/000')).toBeNull();
    expect(stacjaPola(model2, 'pole-bez-wzorca')).toBe('stn/abc/station');
  });
});
