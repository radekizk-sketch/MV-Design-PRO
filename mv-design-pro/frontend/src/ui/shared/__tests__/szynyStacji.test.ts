/**
 * KARTA SZYNY-STACJI-LUSTRO — ILOCZYN CECH jednej reguły przynależności szyny do stacji.
 *
 * Cechy (model `iloczyn` w pliku parytetu, zbiory oczekiwane policzone przez backend
 * `enm.tor_pola.szyny_stacji`):
 *   zacisk pola SN {każdy z czterech kluczy, zacisk = szyna pola, pusty `field_ref`, brak
 *   `bus_ref`, białe znaki} × aparat pola nN {z szyny głównej, łańcuch w ODWROTNEJ
 *   kolejności gałęzi, z obcej szyny z deklaracją tej stacji, z deklaracją innej stacji,
 *   na zacisku wyłącznika głównego} × podrozdzielnica nN jako osobna `Substation` × szyna
 *   bez stacji × kolejność gałęzi {każdy obrót listy, odwrócona}.
 * Stacja A niesie jednocześnie zaciski pól SN i aparaty pól nN — kombinacja, na której
 * rozjeżdżały się dwie dawne połówki reguły (`szynaNalezyDoStacji`, `stationLoadBusRefs`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Substation } from '../../../types/enm';
import { stacjaPola, stacjaSzyn, szynaGlownaStacji, szynyStacji, type GalazDlaSzyn, type StacjaDlaSzyn } from '../szynyStacji';
import { selectStationDistributionTransformers, stationRefOfTransformer } from '../transformatoryStacji';
import { zaciskPola, zaciskRekorduPola } from '../zaciskPola';

const here = dirname(fileURLToPath(import.meta.url));
const { iloczyn } = JSON.parse(readFileSync(resolve(here, 'fixtures/szynyStacjiParytet.json'), 'utf8')) as {
  readonly iloczyn: {
    readonly model: { readonly substations: readonly StacjaDlaSzyn[]; readonly branches: readonly GalazDlaSzyn[] };
    readonly szyny: Readonly<Record<string, readonly string[]>>;
    readonly szyny_glowne: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
    readonly transformatory: Readonly<Record<string, readonly string[]>>;
    readonly zaciski_pol: Readonly<Record<string, string | null>>;
    readonly punkty_przylaczenia_rekordow_pol: Readonly<Record<string, string>>;
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
      expect(posortowane(szynyStacji(stacja(ref), galezie))).toEqual(oczekiwane[ref]);
    }
  });

  it('stacja A: zaciski pól SN i szyny za aparatami pól nN w JEDNYM zbiorze', () => {
    const szyny = szynyStacji(stacja('A/stacja'), model.branches);
    for (const zacisk of ['A/zacisk-in', 'A/zacisk-out', 'A/zacisk-oze', 'A/zacisk-pomiar', 'A/zacisk-tr']) {
      expect(szyny.has(zacisk)).toBe(true);
    }
    for (const zaAparatem of ['A/zacisk-wg-nn', 'A/odp-1', 'A/sekcja', 'A/odp-2', 'A/odp-3', 'B/board']) {
      expect(szyny.has(zaAparatem)).toBe(true);
    }
  });

  it('zacisk = szyna pola, pusty field_ref, brak bus_ref, pusta szyna główna — nie wchodzą', () => {
    const szyny = szynyStacji(stacja('A/stacja'), model.branches);
    for (const ref of ['A/zacisk-bez-refu', 'A/zacisk-bez-szyny', '  ', ' A/zacisk-tr ']) {
      expect(szyny.has(ref)).toBe(false);
    }
  });

  it('aparat z deklaracją pola INNEJ stacji nie dopisuje szyn; deklaracja tej stacji dopisuje oba końce', () => {
    const szyny = szynyStacji(stacja('A/stacja'), model.branches);
    expect(szyny.has('X/obca')).toBe(false);
    expect(szyny.has('Y/szyna-obca')).toBe(true);
  });

  it('szyna bez stacji nie należy do żadnej stacji', () => {
    for (const s of model.substations) expect(szynyStacji(s, model.branches).has('Z/wolna')).toBe(false);
    expect(stacjaSzyn(model.substations, model.branches).has('Z/wolna')).toBe(false);
  });
});

describe('stacjaSzyn — szyna wspólna dwóch stacji (podrozdzielnica nN)', () => {
  it('szyna podrozdzielnicy za aparatem pola stacji należy do PIERWSZEJ stacji modelu (jak topologia backendu)', () => {
    expect(stacjaSzyn(model.substations, model.branches).get('B/board')).toBe('A/stacja');
    expect(stacjaSzyn([...model.substations].reverse(), model.branches).get('B/board')).toBe('B/podrozdzielnica');
  });

  it('mapa = suma zbiorów lustra, każda szyna dokładnie raz', () => {
    const mapa = stacjaSzyn(model.substations, model.branches);
    const suma = new Set(model.substations.flatMap((s) => [...szynyStacji(s, model.branches)]));
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
      expect({ szyna, glowna: szynaGlownaStacji(stacja(ref), model.branches, szyna) }).toEqual({ szyna, glowna });
    }
  });

  it('zacisk → szyna pola, koniec aparatu z szyny głównej → ta szyna, łańcuch i szyna obca → null', () => {
    const a = stacja('A/stacja');
    expect(szynaGlownaStacji(a, model.branches, 'A/sn')).toBe('A/sn');
    expect(szynaGlownaStacji(a, model.branches, 'A/zacisk-tr')).toBe('A/sn');
    expect(szynaGlownaStacji(a, model.branches, 'A/odp-1')).toBe('A/nn');
    expect(szynaGlownaStacji(a, model.branches, 'A/odp-2')).toBeNull();
    expect(szynaGlownaStacji(a, model.branches, 'Z/wolna')).toBeNull();
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
    expect(stationRefOfTransformer(enm, 'T/deklarowany-w-C')).toBe('C/stacja-bez-meta');
    expect(stationRefOfTransformer(enm, 'T/obcy')).toBeNull();
  });
});

describe('zacisk pola — {klucz w meta pola / w szablonie / w obu, różne / brak} × czytnik', () => {
  it('specyfikacje pól: `zaciskPola` = backend `zacisk_pola`', () => {
    for (const s of model.substations) {
      const specs = (s.meta as { field_specs?: unknown } | undefined)?.field_specs;
      for (const spec of Array.isArray(specs) ? specs : []) {
        const ref = (spec as { field_ref?: string }).field_ref;
        if (!ref || !ref.trim()) continue;
        expect({ ref, z: zaciskPola(spec) }).toEqual({ ref, z: iloczyn.zaciski_pol[ref] });
      }
    }
  });

  it('rekordy `bays`: `zaciskRekorduPola` (meta rekordu, potem szablon) = backend `punkt_przylaczenia_pola`', () => {
    for (const bay of enm.bays ?? []) {
      const punkt = zaciskRekorduPola(bay as unknown as Record<string, unknown>) ?? bay.bus_ref;
      expect({ ref: bay.ref_id, punkt }).toEqual({ ref: bay.ref_id, punkt: iloczyn.punkty_przylaczenia_rekordow_pol[bay.ref_id] });
    }
  });
});

describe('stacja pola z danych — {pole SN, pole nN, rekord `bays`, nazwa niezgodna ze wzorcem}', () => {
  it('pole z `field_specs`, `nn_field_specs` i rekordu `bays` wskazuje stację z danych', () => {
    expect(stacjaPola(enm, 'A/pole-tr')).toBe('A/stacja');
    expect(stacjaPola(enm, 'A/nn-odp-1')).toBe('A/stacja');
    expect(stacjaPola(enm, 'B/odp')).toBe('B/podrozdzielnica');
    expect(stacjaPola(enm, 'B/pole-meta')).toBe('A/stacja');
  });

  it('ref pola o gramatyce „stn/<id>/…” bez deklaracji w danych NIE daje stacji (brak zgadywania po nazwie)', () => {
    const model2 = {
      substations: [{ ref_id: 'stn/abc/station', bus_refs: [], meta: { field_specs: [{ field_ref: 'pole-bez-wzorca' }] } }],
    };
    expect(stacjaPola(model2, 'stn/abc/sn_field/000')).toBeNull();
    expect(stacjaPola(model2, 'pole-bez-wzorca')).toBe('stn/abc/station');
  });
});
