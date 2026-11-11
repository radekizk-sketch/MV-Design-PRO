/**
 * Miejsce braku danych nN nazywa element nazwą albo oznaczeniem — nigdy identyfikatorem
 * (karta komunikatów, commit 4).
 *
 * Wcześniej `miejsceBraku` wstawiało do zdania surowy przedrostek pozycji („element odplyw_7”,
 * „równoważnik sieci SN transformatora TR_1”), a etykieta kotwicy SN — identyfikator szyny
 * systemu („szyna SN sn”) i, przy braku nazw źródeł, identyfikatory źródeł.
 *
 * Iloczyn cech: miejsce {element, transformator równoważnika SN} × stan nazwy {nazwa jest,
 * tylko oznaczenie, brak nazwy i oznaczenia, elementu nie ma w modelu} × źródło nazwy
 * {widok domeny nN, migawka modelu (zapasowa)}; kotwica SN: {nazwy źródeł z backendu, same
 * identyfikatory źródeł, brak źródeł → szyna systemu} × stan nazwy.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { nazwaElementuMigawki } from '../../../../topology/snapshotStore';
import { anchorDetailLabel, anchorIdentityLabel } from '../composeLvDomainScene';
import { scenariusz } from '../fixtures/scenariusze';
import {
  nazwaElementuWidokuNn,
  opisBrakuDanychNn,
  opisyBrakowDanychNn,
  type NazwaElementuModelu,
} from '../opisyBrakowDanychNn';
import type { LvDomainGraphView, UpstreamEquivalentSnapshot } from '../types';

const REF_ELEMENTU = 'odplyw_7';
const REF_TRANSFORMATORA = 'TR_1';

type StanNazwy = 'nazwa' | 'oznaczenie' | 'brak' | 'spoza modelu';
const STANY: readonly StanNazwy[] = ['nazwa', 'oznaczenie', 'brak', 'spoza modelu'];

/** Migawka modelu z elementem `ref` w zadanym stanie nazwy (stacja niesie oznaczenie). */
function migawka(ref: string, stan: StanNazwy): EnergyNetworkModel {
  const element =
    stan === 'nazwa'
      ? { id: `id-${ref}`, ref_id: ref, name: 'Obwód oświetlenia' }
      : stan === 'oznaczenie'
        ? { id: `id-${ref}`, ref_id: ref, name: '', designation: 'ST-12/4' }
        : { id: `id-${ref}`, ref_id: ref, name: '   ' };
  return {
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: stan === 'spoza modelu' ? [] : [element],
  } as unknown as EnergyNetworkModel;
}

const OCZEKIWANA: Readonly<Record<StanNazwy, (rodzaj: string) => string>> = {
  nazwa: (rodzaj) => `${rodzaj} „Obwód oświetlenia”`,
  oznaczenie: (rodzaj) => `${rodzaj} „ST-12/4”`,
  brak: (rodzaj) => `${rodzaj} bez nazwy`,
  'spoza modelu': (rodzaj) => `${rodzaj} spoza modelu`,
};

const MIEJSCA = [
  { miejsce: 'element', ref: REF_ELEMENTU, wpis: `${REF_ELEMENTU}:lv_bus`, rodzaj: 'element' },
  {
    miejsce: 'transformator',
    ref: REF_TRANSFORMATORA,
    wpis: `upstream:${REF_TRANSFORMATORA}:upstream_network_source`,
    rodzaj: 'równoważnik sieci SN transformatora',
  },
] as const;

describe('opisBrakuDanychNn — miejsce braku z migawki modelu', () => {
  for (const { miejsce, ref, wpis, rodzaj } of MIEJSCA) {
    for (const stan of STANY) {
      it(`${miejsce} × ${stan}`, () => {
        const model = migawka(ref, stan);
        const tekst = opisBrakuDanychNn(wpis, (r) => nazwaElementuMigawki(model, r));
        expect(tekst.endsWith(`(${OCZEKIWANA[stan](rodzaj)})`)).toBe(true);
        expect(tekst).not.toContain(ref);
        expect(tekst).not.toMatch(/lv_bus|upstream_network_source|upstream:/);
      });
    }
  }

  it('bez migawki (model niewczytany) — „spoza modelu”, nie identyfikator', () => {
    const tekst = opisBrakuDanychNn(`upstream:${REF_TRANSFORMATORA}:lv_bus`, (r) =>
      nazwaElementuMigawki(null, r),
    );
    expect(tekst).toBe(
      'stacja bez szyny w paśmie nN (równoważnik sieci SN transformatora spoza modelu)',
    );
  });

  it('pozycja SWZ i pozycja bez przedrostka nie potrzebują nazwy elementu', () => {
    const nigdy: NazwaElementuModelu = () => {
      throw new Error('resolver nie powinien być wołany');
    };
    expect(opisBrakuDanychNn('swz:rcd', nigdy)).toBe(
      'brak wyłącznika różnicowoprądowego obwodu (ocena samoczynnego wyłączenia zasilania)',
    );
    expect(opisBrakuDanychNn('station', nigdy)).toBe('brak stacji w modelu sieci');
    expect(opisyBrakowDanychNn([], nigdy)).toBeNull();
    expect(opisyBrakowDanychNn(undefined, nigdy)).toBeNull();
  });
});

describe('nazwaElementuWidokuNn — widok domeny nN przed migawką modelu', () => {
  const p = scenariusz('01_single_tr');

  function widok(nazwaTransformatora: string, nazwaOdbioru: string): LvDomainGraphView {
    return {
      ...p.graph,
      transformers: p.graph.transformers.map((t) => ({ ...t, name: nazwaTransformatora })),
      loads: p.graph.loads.map((l, i) => (i === 0 ? { ...l, name: nazwaOdbioru } : l)),
    };
  }

  const refTransformatora = p.graph.transformers[0]!.ref_id;
  const refOdbioru = p.graph.loads[0]!.ref_id;

  for (const { miejsce, wpis, rodzaj, nazwy } of [
    {
      miejsce: 'transformator',
      wpis: `upstream:${refTransformatora}:upstream_network_source`,
      rodzaj: 'równoważnik sieci SN transformatora',
      nazwy: (n: string) => widok(n, 'Odbiór 1'),
    },
    {
      miejsce: 'element',
      wpis: `${refOdbioru}:lv_bus`,
      rodzaj: 'element',
      nazwy: (n: string) => widok('T1', n),
    },
  ] as const) {
    it(`${miejsce} × nazwa w widoku`, () => {
      const resolver = nazwaElementuWidokuNn(nazwy('Transformator główny RGnN'), () => undefined);
      expect(opisBrakuDanychNn(wpis, resolver)).toContain(`(${rodzaj} „Transformator główny RGnN”)`);
    });

    it(`${miejsce} × pusta nazwa w widoku — „bez nazwy”, migawka nie jest pytana`, () => {
      const resolver = nazwaElementuWidokuNn(nazwy('  '), () => 'Nazwa z migawki');
      const tekst = opisBrakuDanychNn(wpis, resolver);
      expect(tekst).toContain(`(${rodzaj} bez nazwy)`);
      expect(tekst).not.toContain('Nazwa z migawki');
    });
  }

  it('element spoza widoku — nazwa (albo oznaczenie) z migawki modelu', () => {
    for (const stan of STANY) {
      const model = migawka(REF_ELEMENTU, stan);
      const resolver = nazwaElementuWidokuNn(p.graph, (r) => nazwaElementuMigawki(model, r));
      expect(opisBrakuDanychNn(`${REF_ELEMENTU}:lv_bus`, resolver)).toContain(
        `(${OCZEKIWANA[stan]('element')})`,
      );
    }
  });
});

describe('kotwica SN — tożsamość i opis braku bez identyfikatorów', () => {
  const p = scenariusz('01_single_tr');
  const rownowaznik = p.upstream_equivalents[0]!;

  it('nazwy źródeł z backendu', () => {
    const tekst = anchorIdentityLabel(rownowaznik, 'sn', 15, () => undefined);
    expect(tekst).toBe('SN 15 kV · GPZ');
  });

  for (const stan of STANY) {
    it(`same identyfikatory źródeł (migawka bez nazw) × ${stan}`, () => {
      const model = migawka('src', stan);
      const bezNazw = { ...rownowaznik, upstream_source_names: undefined } as UpstreamEquivalentSnapshot;
      const tekst = anchorIdentityLabel(bezNazw, 'sn', 15, (r) => nazwaElementuMigawki(model, r));
      expect(tekst).toBe(`SN 15 kV · ${OCZEKIWANA[stan]('źródło')}`);
    });

    it(`brak źródeł — szyna systemu SN × ${stan}`, () => {
      const model = migawka('sn', stan);
      const bezZrodel = {
        ...rownowaznik,
        upstream_source_ids: [],
        upstream_source_names: [],
      } as UpstreamEquivalentSnapshot;
      const tekst = anchorIdentityLabel(bezZrodel, 'sn', 15, (r) => nazwaElementuMigawki(model, r));
      expect(tekst).toBe(`SN 15 kV · ${OCZEKIWANA[stan]('szyna SN')}`);
    });

    it(`opis braku równoważnika × ${stan}`, () => {
      const model = migawka(REF_TRANSFORMATORA, stan);
      const brak = {
        ...rownowaznik,
        status: 'brak danych',
        missing_data: [`upstream:${REF_TRANSFORMATORA}:upstream_network_source`],
      } as unknown as UpstreamEquivalentSnapshot;
      const tekst = anchorDetailLabel(brak, (r) => nazwaElementuMigawki(model, r));
      expect(tekst).toBe(
        'Sk″/Ik″ SN: brak danych — brak źródła zasilania sieci SN '
          + `(${OCZEKIWANA[stan]('równoważnik sieci SN transformatora')})`,
      );
      expect(tekst).not.toContain(REF_TRANSFORMATORA);
    });
  }
});
