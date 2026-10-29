/**
 * Model kreatora „Zespół uziemiający SN" (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).
 *
 * Ładunek niesie WYŁĄCZNIE pola czytane przez handler `add_zespol_uziemiajacy_sn`.
 * Iloczyn cech: wariant {Z.13 dławik, Z.13 + AWSC, Z.14 dławik‖rezystor, Z.15 rezystor,
 * uziemienie bezpośrednie} × miejsce {pole ZU, szyna, oba — pole wygrywa} × nazwa {pusta,
 * podana} × nastawa dławika {pusta, podana}. Element spoza wariantu nie trafia do ładunku
 * (np. AWSC przy Z.14, rezystor przy Z.13) — inaczej operacja dostałaby układ, którego
 * projektant nie wybrał.
 */

import { describe, expect, it } from 'vitest';

import {
  DANE_DOMYSLNE,
  maMiejsce,
  transformatoryWnSn,
  walidujFormularz,
  zbudujPayload,
  type KontekstZespolu,
  type WariantZespolu,
  type ZespolFormData,
} from '../zespolModel';

const KOMPLET: ZespolFormData = {
  ...DANE_DOMYSLNE,
  catalog_ref: 'TU_ZNYN11_15KV_PW160',
  dlawik_catalog_ref: 'DL_40_400A_15KV_CIAGLY',
  rezystor_catalog_ref: 'REZ_200A_15KV',
  awsc: true,
  awsc_i_wymuszany_a: 30,
  awsc_czas_zalaczenia_s: 1.5,
  awsc_czas_zwloki_s: 0,
  awsc_strona: 'wtorna',
  spz: true,
  wylaczenie_od_transformatorow_refs: ['tr-b', 'tr-a'],
};

const MIEJSCA: Record<string, { kontekst: KontekstZespolu; oczekiwane: Record<string, string> }> = {
  pole: { kontekst: { bay_ref: ' pole-zu ' }, oczekiwane: { bay_ref: 'pole-zu' } },
  szyna: { kontekst: { bus_ref: 'szyna-s1' }, oczekiwane: { bus_ref: 'szyna-s1' } },
  oba: { kontekst: { bay_ref: 'pole-zu', bus_ref: 'szyna-s1' }, oczekiwane: { bay_ref: 'pole-zu' } },
};

const WARIANTY: readonly WariantZespolu[] = ['dlawik', 'dlawik_rezystor', 'rezystor', 'bezposrednie'];

describe('zbudujPayload — iloczyn wariant × miejsce × nazwa × nastawa', () => {
  for (const wariant of WARIANTY) {
    for (const [miejsce, { kontekst, oczekiwane }] of Object.entries(MIEJSCA)) {
      for (const nazwa of ['', '  ZU sekcji 1 ']) {
        for (const nastawa of [null, 120]) {
          it(`${wariant} × ${miejsce} × nazwa „${nazwa.trim()}” × nastawa ${String(nastawa)}`, () => {
            const ladunek = zbudujPayload(
              { ...KOMPLET, wariant, name: nazwa, dlawik_i_nastawy_a: nastawa },
              kontekst,
            );
            // Miejsce: dokładnie jedno z pól (pole ZU wygrywa nad szyną).
            expect('bay_ref' in ladunek).toBe('bay_ref' in oczekiwane);
            expect('bus_ref' in ladunek).toBe('bus_ref' in oczekiwane);
            for (const [k, v] of Object.entries(oczekiwane)) expect(ladunek[k]).toBe(v);
            // Nazwa: pusta = nadana przez model (klucza brak).
            if (nazwa.trim()) expect(ladunek.name).toBe('ZU sekcji 1');
            else expect('name' in ladunek).toBe(false);
            expect(ladunek.catalog_binding).toMatchObject({
              catalog_namespace: 'TRANSFORMATOR_UZIEMIAJACY',
              catalog_item_id: 'TU_ZNYN11_15KV_PW160',
            });
            expect(ladunek.uziemienie_bezposrednie).toBe(wariant === 'bezposrednie');
            expect(ladunek.spz).toBe(true);
            expect(ladunek.wylaczenie_od_transformatorow_refs).toEqual(['tr-a', 'tr-b']);

            const dlawik = ladunek.dlawik as Record<string, unknown> | undefined;
            const rezystor = ladunek.rezystor as Record<string, unknown> | undefined;
            const zDlawikiem = wariant === 'dlawik' || wariant === 'dlawik_rezystor';
            const zRezystorem = wariant === 'rezystor' || wariant === 'dlawik_rezystor';
            expect(dlawik !== undefined).toBe(zDlawikiem);
            expect(rezystor !== undefined).toBe(zRezystorem);
            if (dlawik) {
              expect(dlawik.catalog_binding).toMatchObject({
                catalog_namespace: 'DLAWIK_GASZACY',
                catalog_item_id: 'DL_40_400A_15KV_CIAGLY',
              });
              expect(dlawik.stan_odlacznika).toBe('zamkniety');
              if (nastawa === null) expect('i_nastawy_a' in dlawik).toBe(false);
              else expect(dlawik.i_nastawy_a).toBe(nastawa);
              // AWSC tylko w układzie Z.13 (sam dławik) — w Z.14 rezystor stoi na stałe.
              if (wariant === 'dlawik') {
                expect(dlawik.awsc).toEqual({
                  i_wymuszany_a: 30,
                  czas_zalaczenia_s: 1.5,
                  czas_zwloki_s: 0,
                  strona: 'wtorna',
                });
              } else {
                expect('awsc' in dlawik).toBe(false);
              }
            }
            if (rezystor) {
              expect(rezystor).toEqual({
                catalog_binding: expect.objectContaining({
                  catalog_namespace: 'REZYSTOR_UZIEMIAJACY',
                  catalog_item_id: 'REZ_200A_15KV',
                }),
                stan_odlacznika: 'zamkniety',
              });
            }
          });
        }
      }
    }
  }

  it('AWSC wyłączone: dławik bez opisu automatyki', () => {
    const ladunek = zbudujPayload({ ...KOMPLET, wariant: 'dlawik', awsc: false }, { bus_ref: 's' });
    expect('awsc' in (ladunek.dlawik as Record<string, unknown>)).toBe(false);
  });

  it('AWSC włączone bez liczb: pusty opis automatyki (wartości robocze liczy backend)', () => {
    const ladunek = zbudujPayload(
      {
        ...KOMPLET,
        wariant: 'dlawik',
        awsc_i_wymuszany_a: null,
        awsc_czas_zalaczenia_s: Number.NaN,
        awsc_czas_zwloki_s: null,
        awsc_strona: null,
      },
      { bus_ref: 's' },
    );
    expect((ladunek.dlawik as Record<string, unknown>).awsc).toEqual({});
  });
});

describe('walidujFormularz — kompletność wg wariantu (bez reguł fizyki)', () => {
  it.each([
    ['dlawik', ['catalog_ref', 'dlawik.catalog_ref']],
    ['dlawik_rezystor', ['catalog_ref', 'dlawik.catalog_ref', 'rezystor.catalog_ref']],
    ['rezystor', ['catalog_ref', 'rezystor.catalog_ref']],
    ['bezposrednie', ['catalog_ref']],
  ] as const)('%s: puste pozycje katalogu → błędy %j', (wariant, pola) => {
    expect(walidujFormularz({ ...DANE_DOMYSLNE, wariant }).map((b) => b.pole)).toEqual(pola);
    expect(walidujFormularz({ ...KOMPLET, wariant })).toEqual([]);
  });
});

describe('maMiejsce i transformatoryWnSn', () => {
  it('miejsce: pole albo szyna; same spacje = brak', () => {
    expect(maMiejsce({ bay_ref: 'p' })).toBe(true);
    expect(maMiejsce({ bus_ref: 's' })).toBe(true);
    expect(maMiejsce({ bay_ref: '  ', bus_ref: '' })).toBe(false);
    expect(maMiejsce({})).toBe(false);
  });

  it('tylko transformatory WN/SN (strona górna WN, dolna SN), po nazwie', () => {
    const szyny = [
      { ref_id: 'wn', voltage_kv: 110 },
      { ref_id: 'sn', voltage_kv: 15 },
      { ref_id: 'nn', voltage_kv: 0.4 },
      { ref_id: 'bez', voltage_kv: null },
    ];
    const wynik = transformatoryWnSn(
      [
        { ref_id: 't-sn-nn', name: 'TR SN/nN', hv_bus_ref: 'sn', lv_bus_ref: 'nn' },
        { ref_id: 't2', name: 'T2', hv_bus_ref: 'wn', lv_bus_ref: 'sn' },
        { ref_id: 't1', name: 'T1', hv_bus_ref: 'wn', lv_bus_ref: 'sn' },
        { ref_id: 't-bez', name: 'T bez napięcia', hv_bus_ref: 'bez', lv_bus_ref: 'sn' },
      ],
      szyny,
    );
    expect(wynik.map((t) => t.ref_id)).toEqual(['t1', 't2']);
  });
});
