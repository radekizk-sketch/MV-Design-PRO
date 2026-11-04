/**
 * Karta techniczna K6 — każda informacja raz, bez sekcji i wierszy bez treści (decyzja architekta
 * 2026-11-04 po oględzinach karty GPZ, §10 kontraktu prezentacji). ILOCZYN CECH:
 *
 *   rodzaj stacji (9 wartości `station_type`)
 *   × treść modelu {same szyny SN · transformator SN/nN ze stroną nN · odbiór SN na szynie stacji}
 *   → zestaw i kolejność sekcji karty (identyfikacja, zasilanie, transformator, sekcje szyn,
 *     rozdzielnica SN, strona nN, przyłączenia) oraz wiersz „Podstawa rodzaju”;
 *
 *   GPZ × {sieć zasilająca przypisana do GPZ · sieć tylko na szynie GPZ · brak sieci}
 *       × {transformator 110 kV/SN w modelu · brak};
 *   tabela pól × numer pola {żadne pole nie ma numeru · jedno ma};
 *   wiersze „nie dotyczy” w kartach innych rodzajów: aparat {łącznik · przekładnik},
 *   odcinek {kabel · linia napowietrzna}, źródło {blokowe · po stronie nN},
 *   pole {z zaciskiem · bez zacisku}.
 *
 * Oczekiwania wypisane wprost (tabela), nie wyliczone ze słownika `SEKCJE_Z_DEFINICJI_STACJI`.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Substation } from '../../../../types/enm';
import type { DaneElementuKanwy } from '../daneElementuKanwy';
import { buildKartaTechniczna, kluczeKarty, type KartaTechniczna } from '../kartaTechnicznaElementu';

type RodzajStacji = Substation['station_type'];
type Tresc = 'szyny_sn' | 'transformator_nn' | 'odbior_sn';

const ST = 'st/stacja';

function szyna(ref_id: string, voltage_kv: number, name: string) {
  return { ref_id, id: ref_id, name, voltage_kv, tags: [], meta: {} };
}

function model(rodzaj: RodzajStacji, tresc: Tresc, opcje: { numerPola?: string | null } = {}): EnergyNetworkModel {
  const zNn = tresc === 'transformator_nn';
  return {
    header: { name: 'sekcje karty wg rodzaju stacji' },
    buses: [szyna('bus/sn', 15, 'Szyna SN'), szyna('bus/zacisk', 15, 'Zacisk pola'), ...(zNn ? [szyna('bus/nn', 0.4, 'Szyna nN')] : [])],
    substations: [
      {
        ref_id: ST,
        id: ST,
        name: 'Stacja badana',
        station_type: rodzaj,
        bus_refs: ['bus/sn', ...(zNn ? ['bus/nn'] : [])],
        transformer_refs: [],
        ...(rodzaj === 'gpz' ? { gpz_sections: [{ section_id: 's1', order: 0, name: 'Sekcja 1', bus_ref: 'bus/sn' }] } : {}),
      },
    ],
    bays: [
      {
        ref_id: 'bay/l1',
        id: 'bay/l1',
        name: 'Pole liniowe L1',
        substation_ref: ST,
        bus_ref: 'bus/sn',
        terminal_bus_ref: 'bus/zacisk',
        bay_role: 'LINIA_OUT',
        bay_number: opcje.numerPola ?? null,
        primary_devices: [],
        equipment_refs: [],
      },
    ],
    transformers: zNn
      ? [{ ref_id: 'tr/1', id: 'tr/1', name: 'T1', hv_bus_ref: 'bus/sn', lv_bus_ref: 'bus/nn', sn_mva: 0.63, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6 }]
      : [],
    loads: [
      ...(zNn ? [{ ref_id: 'load/nn', id: 'load/nn', name: 'Odbiór nN', bus_ref: 'bus/nn', p_mw: 0.2, q_mvar: 0.05 }] : []),
      ...(tresc === 'odbior_sn' ? [{ ref_id: 'load/sn', id: 'load/sn', name: 'Odbiór SN', bus_ref: 'bus/sn', p_mw: 1, q_mvar: 0.2 }] : []),
    ],
    branches: [],
    generators: [],
    sources: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

function kartaStacji(m: EnergyNetworkModel): KartaTechniczna {
  const k = buildKartaTechniczna(m, { kind: 'station', elementId: ST } as DaneElementuKanwy);
  if (!k) throw new Error('brak karty stacji');
  return k;
}

const SN_NN = ['identyfikacja', 'rozdzielnica_sn', 'transformator', 'strona_nn', 'przylaczenia'];

/** Sekcje karty przy SAMYCH szynach SN (bez transformatora i bez strony nN w modelu). */
const SEKCJE_SZYNY_SN: Readonly<Record<RodzajStacji, readonly string[]>> = {
  gpz: ['identyfikacja', 'zasilanie', 'sekcje_szyn', 'rozdzielnica_sn', 'przylaczenia'],
  mv_lv: SN_NN,
  customer: SN_NN,
  inline: SN_NN,
  branch: SN_NN,
  terminal: SN_NN,
  sectional: SN_NN,
  switching: ['identyfikacja', 'rozdzielnica_sn', 'przylaczenia'],
  // Rozdzielnica nN z polem SN w modelu — rozdzielnica SN pokazana, bo model ją niesie.
  rozdzielnica_nn: ['identyfikacja', 'rozdzielnica_sn', 'strona_nn', 'przylaczenia'],
};

/** Sekcje karty, gdy model niesie transformator SN/nN i stronę nN stacji. */
const SEKCJE_Z_NN: Readonly<Record<RodzajStacji, readonly string[]>> = {
  gpz: ['identyfikacja', 'zasilanie', 'transformator', 'sekcje_szyn', 'rozdzielnica_sn', 'strona_nn', 'przylaczenia'],
  mv_lv: SN_NN,
  customer: SN_NN,
  inline: SN_NN,
  branch: SN_NN,
  terminal: SN_NN,
  sectional: SN_NN,
  switching: SN_NN,
  rozdzielnica_nn: ['identyfikacja', 'rozdzielnica_sn', 'transformator', 'strona_nn', 'przylaczenia'],
};

const BEZ_RODZAJU_TOPOLOGICZNEGO: ReadonlySet<RodzajStacji> = new Set(['gpz', 'rozdzielnica_nn']);
const RODZAJE = Object.keys(SEKCJE_SZYNY_SN) as RodzajStacji[];

describe('karta stacji — rodzaj stacji × treść modelu → sekcje', () => {
  for (const rodzaj of RODZAJE) {
    it(`${rodzaj} × same szyny SN: sekcje z definicji rodzaju, bez pustych sekcji spoza niej`, () => {
      const k = kartaStacji(model(rodzaj, 'szyny_sn'));
      expect(k.sekcje.map((s) => s.id)).toEqual(SEKCJE_SZYNY_SN[rodzaj]);
      // Komunikat o braku transformatora tylko tam, gdzie transformator wynika z definicji.
      const tr = k.sekcje.find((s) => s.id === 'transformator');
      expect(tr?.pustaPl ?? null).toBe(tr ? 'Stacja nie ma transformatora w modelu.' : null);
    });

    it(`${rodzaj} × transformator SN/nN ze stroną nN: sekcje niesione przez model`, () => {
      const k = kartaStacji(model(rodzaj, 'transformator_nn'));
      expect(k.sekcje.map((s) => s.id)).toEqual(SEKCJE_Z_NN[rodzaj]);
      expect(k.sekcje.find((s) => s.id === 'transformator')?.pustaPl).toBeUndefined();
      const nn = k.sekcje.find((s) => s.id === 'strona_nn')!;
      expect(nn.wiersze.find((w) => w.klucz === 'nn_odbiory')?.lista).toEqual(['Odbiór nN · 0,2 MW']);
    });

    it(`${rodzaj} × odbiór SN na szynie stacji: nie trafia na stronę nN`, () => {
      const k = kartaStacji(model(rodzaj, 'odbior_sn'));
      expect(k.sekcje.map((s) => s.id)).toEqual(SEKCJE_SZYNY_SN[rodzaj]);
      const odbiory = k.sekcje.find((s) => s.id === 'strona_nn')?.wiersze.find((w) => w.klucz === 'nn_odbiory');
      expect(odbiory?.lista ?? []).toEqual([]);
    });

    it(`${rodzaj}: wiersz „Podstawa rodzaju” ${BEZ_RODZAJU_TOPOLOGICZNEGO.has(rodzaj) ? 'nieobecny (rodzaj topologiczny nie dotyczy)' : 'obecny'}`, () => {
      const klucze = kluczeKarty(kartaStacji(model(rodzaj, 'szyny_sn')));
      expect(klucze.includes('podstawa_rodzaju')).toBe(!BEZ_RODZAJU_TOPOLOGICZNEGO.has(rodzaj));
      const tekst = JSON.stringify(kartaStacji(model(rodzaj, 'szyny_sn')));
      expect(tekst).not.toContain('nie dotyczy');
    });
  }

  it('GPZ: „Rozdzielnia SN” bez listy sekcji szyn (powtarzałaby tabelę „Sekcje szyn”); stacja SN/nN — z listą', () => {
    expect(kluczeKarty(kartaStacji(model('gpz', 'szyny_sn')))).not.toContain('sekcje_sn');
    expect(kluczeKarty(kartaStacji(model('mv_lv', 'szyny_sn')))).toContain('sekcje_sn');
  });

  it('żadna sekcja karty stacji nie niesie ogólnikowego „źródła danych” (sekcje szyn, tabela pól)', () => {
    for (const rodzaj of RODZAJE) {
      const k = kartaStacji(model(rodzaj, 'szyny_sn'));
      for (const s of k.sekcje) {
        if (s.id === 'transformator') continue; // źródło tabliczki konkretnego transformatora
        expect(s.zrodloPl ?? null, `${rodzaj}/${s.id}`).toBeNull();
        for (const t of s.tabele ?? []) expect(t.zrodloPl ?? null, `${rodzaj}/${t.klucz}`).toBeNull();
      }
    }
  });
});

describe('tabele zwarte (w szerokości inspektora) × rodzaj karty', () => {
  it('każda tabela karty stacji (każdy rodzaj stacji) jest zwarta', () => {
    for (const rodzaj of RODZAJE) {
      for (const tresc of ['szyny_sn', 'transformator_nn'] as const) {
        const tabele = kartaStacji(model(rodzaj, tresc)).sekcje.flatMap((s) => s.tabele ?? []);
        expect(tabele.length, `${rodzaj}/${tresc}`).toBeGreaterThan(0);
        for (const t of tabele) expect(t.zwarta, `${rodzaj}/${tresc}/${t.klucz}`).toBe(true);
      }
    }
  });

  it('tabela aparatów pola (liczby znamionowe z jednostką) NIE jest zwarta — wiersz w jednej linii', () => {
    const k = buildKartaTechniczna(model('mv_lv', 'szyny_sn'), { kind: 'bay', elementId: 'bay/l1' } as DaneElementuKanwy)!;
    const aparaty = k.sekcje.flatMap((s) => s.tabele ?? []).find((t) => t.klucz === 'aparaty')!;
    expect(aparaty.zwarta).toBeUndefined();
  });
});

describe('tabela pól stacji × numer pola', () => {
  it.each([
    ['żadne pole nie ma numeru', null, ['Pole', 'Aparat główny', 'Stan']],
    ['pole ma numer', '07', ['Pole', 'Nr', 'Aparat główny', 'Stan']],
  ] as const)('%s → kolumny %j', (_opis, numer, kolumny) => {
    const k = kartaStacji(model('mv_lv', 'szyny_sn', { numerPola: numer }));
    const tabela = k.sekcje.find((s) => s.id === 'rozdzielnica_sn')!.tabele!.find((t) => t.klucz === 'pola_sn')!;
    expect(tabela.kolumny.map((c) => c.etykieta)).toEqual(kolumny);
    expect(tabela.wiersze[0].komorki.nr).toBe(numer);
  });
});

describe('GPZ × zasilanie × transformator 110 kV/SN', () => {
  function gpz(siec: 'przypisana' | 'na_szynie' | 'brak', tr110: boolean): KartaTechniczna {
    const m = model('gpz', 'szyny_sn') as unknown as Record<string, unknown[]>;
    const zrodlo = {
      ref_id: 'src/siec',
      id: 'src/siec',
      name: 'Sieć 110 kV',
      bus_ref: tr110 ? 'bus/wn' : 'bus/sn',
      sk3_mva: 3000,
      rx_ratio: 0.1,
      ...(siec === 'przypisana' ? { substation_ref: ST } : {}),
    };
    const stacja = { ...(m.substations[0] as Substation), bus_refs: tr110 ? ['bus/wn', 'bus/sn'] : ['bus/sn'] };
    return kartaStacji({
      ...m,
      substations: [stacja],
      buses: [...m.buses, ...(tr110 ? [szyna('bus/wn', 110, 'Szyna 110 kV')] : [])],
      sources: siec === 'brak' ? [] : [zrodlo],
      transformers: tr110
        ? [{ ref_id: 'tr/wn', id: 'tr/wn', name: 'T1 110/15', hv_bus_ref: 'bus/wn', lv_bus_ref: 'bus/sn', sn_mva: 25, uhv_kv: 110, ulv_kv: 15, uk_percent: 11 }]
        : [],
    } as unknown as EnergyNetworkModel);
  }

  for (const siec of ['przypisana', 'na_szynie', 'brak'] as const) {
    for (const tr110 of [false, true]) {
      it(`sieć ${siec} × transformator 110 kV/SN ${tr110 ? 'jest' : 'brak'}`, () => {
        const k = gpz(siec, tr110);
        const zasilanie = k.sekcje.find((s) => s.id === 'zasilanie')!.tabele![0];
        // Sieć tylko „na szynie” bez transformatora leży na szynie SN GPZ; z transformatorem —
        // na szynie 110 kV, która jest szyną GPZ. Obie należą do GPZ.
        expect(zasilanie.wiersze.map((w) => w.komorki)).toEqual(
          siec === 'brak' ? [] : [{ siec: 'Sieć 110 kV', sk: '3000 MVA', rx: '0,1' }],
        );
        if (siec === 'brak') expect(zasilanie.pustaPl).toBe('GPZ nie ma w modelu sieci zasilającej.');
        const tr = k.sekcje.find((s) => s.id === 'transformator');
        if (tr110) {
          const w = new Map(tr!.wiersze.map((x) => [x.klucz, x.wartosc]));
          expect(w.get('tr_sn')).toBe('25 MVA');
          expect(w.get('tr_uk')).toBe('11 %');
          expect(w.get('tr_napiecia')).toContain('110 kV');
        } else {
          expect(tr).toBeUndefined();
        }
        expect(JSON.stringify(k)).not.toContain('nie ma transformatora');
        expect(k.sekcje.some((s) => s.id === 'strona_nn')).toBe(false);
      });
    }
  }
});

describe('inne rodzaje kart — wiersze „nie dotyczy” bez treści nie trafiają na kartę', () => {
  function modelInne(): EnergyNetworkModel {
    return {
      header: { name: 'karty inne' },
      buses: [szyna('bus/sn', 15, 'Szyna SN'), szyna('bus/z', 15, 'Zacisk'), szyna('bus/nn', 0.4, 'Szyna nN'), szyna('bus/b', 15, 'Szyna B')],
      substations: [{ ref_id: ST, id: ST, name: 'Stacja', station_type: 'mv_lv', bus_refs: ['bus/sn', 'bus/nn'], transformer_refs: [] }],
      bays: [
        {
          ref_id: 'bay/z',
          id: 'bay/z',
          name: 'Pole z zaciskiem',
          substation_ref: ST,
          bus_ref: 'bus/sn',
          terminal_bus_ref: 'bus/z',
          bay_role: 'LINIA_OUT',
          primary_devices: [
            { device_ref: 'dev/cb', kind: 'CB' },
            { device_ref: 'dev/ct', kind: 'CT' },
          ],
          equipment_refs: [],
        },
        { ref_id: 'bay/s', id: 'bay/s', name: 'Sprzęgło', substation_ref: ST, bus_ref: 'bus/sn', bay_role: 'SPRZEGLO', primary_devices: [], equipment_refs: [] },
      ],
      branches: [
        { ref_id: 'kab', id: 'kab', name: 'Kabel', type: 'cable', from_bus_ref: 'bus/z', to_bus_ref: 'bus/b', length_km: 1 },
        { ref_id: 'lin', id: 'lin', name: 'Linia', type: 'line_overhead', from_bus_ref: 'bus/z', to_bus_ref: 'bus/b', length_km: 1 },
      ],
      generators: [
        { ref_id: 'gen/blok', id: 'gen/blok', name: 'PV blok', gen_type: 'pv_inverter', bus_ref: 'bus/sn', station_ref: ST, connection_variant: 'block_transformer', p_mw: 1 },
        { ref_id: 'gen/nn', id: 'gen/nn', name: 'PV nN', gen_type: 'pv_inverter', bus_ref: 'bus/nn', station_ref: ST, connection_variant: 'nn_side', p_mw: 0.05 },
      ],
      transformers: [],
      loads: [],
      sources: [],
      junctions: [],
      corridors: [],
      measurements: [],
      protection_assignments: [],
    } as unknown as EnergyNetworkModel;
  }

  function klucze(kind: string, elementId: string): string[] {
    const k = buildKartaTechniczna(modelInne(), { kind, elementId } as DaneElementuKanwy);
    expect(k, `${kind} ${elementId}`).not.toBeNull();
    // Wiersze karty bez „nie dotyczy” bez treści. Komórka TABELI zostaje („nie dotyczy” odróżnia
    // się tam od pustej komórki „brak danych” — rozróżnienie objęte wstrzymanym punktem 4).
    const wartosci = k!.sekcje.flatMap((s) => s.wiersze.map((w) => w.wartosc));
    expect(wartosci.filter((v) => v === 'nie dotyczy' || v === 'nie dotyczy (linia napowietrzna)' || v === 'nie dotyczy (przyłączenie po stronie nN stacji)')).toEqual([]);
    return kluczeKarty(k!);
  }

  it('aparat: łącznik ma położenie i zdolność wyłączalną; przekładnik — nie', () => {
    expect(klucze('apparatus', 'dev/cb')).toEqual(expect.arrayContaining(['stan', 'ik_wyl']));
    const ct = klucze('apparatus', 'dev/ct');
    expect(ct).not.toContain('stan');
    expect(ct).not.toContain('ik_wyl');
  });

  it('odcinek: kabel ma izolację; linia napowietrzna — nie', () => {
    expect(klucze('cable_run', 'kab')).toContain('izolacja');
    expect(klucze('cable_run', 'lin')).not.toContain('izolacja');
  });

  it('źródło: blokowe ma transformator blokowy i kabel SN; po stronie nN — nie', () => {
    expect(klucze('generator', 'gen/blok')).toEqual(expect.arrayContaining(['tr_blokowy', 'kabel_sn']));
    const nn = klucze('generator', 'gen/nn');
    expect(nn).not.toContain('tr_blokowy');
    expect(nn).not.toContain('kabel_sn');
  });

  it('źródło: sekcja zgodności NC RfG bez ogólnikowego „źródła danych”', () => {
    const k = buildKartaTechniczna(modelInne(), { kind: 'generator', elementId: 'gen/blok' } as DaneElementuKanwy)!;
    expect(k.sekcje.find((s) => s.id === 'zgodnosc_ncrfg')?.zrodloPl ?? null).toBeNull();
  });

  it('pole: z zaciskiem ma sekcję „Przyłączenie”; sprzęgło bez zacisku — nie', () => {
    expect(klucze('bay', 'bay/z')).toContain('przylaczenie');
    expect(klucze('bay', 'bay/s')).not.toContain('przylaczenie');
  });
});
