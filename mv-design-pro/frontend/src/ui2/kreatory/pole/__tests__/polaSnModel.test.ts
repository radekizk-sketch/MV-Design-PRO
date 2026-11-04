// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FIELD_ROLE_LABEL_PL, FIELD_SOURCE_LABEL_PL } from '../../../../ui/sld/v2/station-rozdzielnia/contract';
import { BAY_MODEL_ROLES } from '../../../../types/enm';

import {
  APARAT_OPCJE,
  DANE_DOMYSLNE,
  ROLE_OPCJE,
  WYBOR_POMIARU_OPCJE,
  aparatLabel,
  bayKindZRoli,
  maSzablonProducenta,
  maSzyne,
  noweSprzeglo,
  rolaLabel,
  sekcjeDoSprzegla,
  stanSprzeglaPoczatkowy,
  walidujFormularz,
  wyborPomiaruLabel,
  zbudujPayload,
  type PolaSnFormData,
} from '../polaSnModel';

function dane(over: Partial<PolaSnFormData> = {}): PolaSnFormData {
  return { ...DANE_DOMYSLNE, catalog_ref: 'app-1', ...over };
}

const KONTEKST = { bus_ref: 'bus-1', station_ref: 'st-1', station_label: 'ST-1' };

describe('polaSnModel — szyna/stacja', () => {
  it('wykrywa obecność szyny i stacji', () => {
    expect(maSzyne({})).toBe(false);
    expect(maSzyne({ bus_ref: 'b' })).toBe(false);
    expect(maSzyne(KONTEKST)).toBe(true);
  });
});

describe('polaSnModel — walidacja', () => {
  it('wymaga aparatu z katalogu', () => {
    expect(walidujFormularz(dane({ catalog_ref: null })).some((e) => e.field === 'catalog_ref')).toBe(true);
    expect(walidujFormularz(dane()).length).toBe(0);
  });
});

describe('polaSnModel — nazewnictwo (kod backendu vs polska etykieta)', () => {
  it('każda opcja roli/aparatu ma polską etykietę (bez surowych kodów w UI)', () => {
    // Etykiety = warstwa prezentacji: polskie, nie angielskie kody kontraktu.
    for (const { value, label } of [...ROLE_OPCJE, ...APARAT_OPCJE]) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(value); // etykieta ≠ kod backendu
      expect(/^[A-Z_]+$/.test(label)).toBe(false); // etykieta nie jest surowym kodem (IN/OUT/FEEDER…)
    }
  });
  it('rolaLabel/aparatLabel mapują totalnie na polskie nazwy (bez wycieku kodu)', () => {
    // Karta #141: nazwa roli z kanonu słownictwa ról pól — ta sama co na schemacie i w nazwie
    // pola nadanej przez backend (nie „odpływowe”/„dopływowe”).
    expect(rolaLabel('OUT')).toBe(FIELD_ROLE_LABEL_PL.LINIA_OUT);
    expect(rolaLabel('IN')).toBe(FIELD_ROLE_LABEL_PL.LINIA_IN);
    expect(rolaLabel('FEEDER')).toBe(FIELD_ROLE_LABEL_PL.LINIA_ODG);
    expect(rolaLabel('TR')).toBe(FIELD_ROLE_LABEL_PL.TRANSFORMATOROWE);
    expect(rolaLabel('COUPLER')).toBe(FIELD_ROLE_LABEL_PL.SPRZEGLO);
    expect(rolaLabel('MEASUREMENT')).toBe(FIELD_ROLE_LABEL_PL.POMIAROWE);
    expect(rolaLabel('OZE')).toBe(FIELD_SOURCE_LABEL_PL);
    expect(aparatLabel('BREAKER')).toBe('Wyłącznik mocy');
    // Mapowanie totalne — dla każdej wartości kontraktu istnieje polska etykieta.
    for (const { value } of ROLE_OPCJE) expect(rolaLabel(value)).not.toBe('');
    for (const { value } of APARAT_OPCJE) expect(aparatLabel(value)).not.toBe('');
  });
  it('kreator oferuje KAŻDĄ rolę z jednej listy ról modelu dokładnie raz (karta UX-04/POLE-BKR-MODEL)', () => {
    // Lista kolejności kreatora jest kopią zbioru ról — bez tej równości nowa rola modelu
    // (BKR) nie trafiłaby do wyboru projektanta.
    const role = ROLE_OPCJE.map((o) => o.value);
    expect(new Set(role).size).toBe(role.length);
    expect([...role].sort()).toEqual([...BAY_MODEL_ROLES].sort());
    expect(rolaLabel('BKR')).toBe(FIELD_ROLE_LABEL_PL.BATERIA_KONDENSATOROW);
    expect(bayKindZRoli('BKR')).toBe('bateria_kondensatorow');
    expect(rolaLabel('ZU')).toBe(FIELD_ROLE_LABEL_PL.ZESPOL_UZIEMIAJACY);
    expect(bayKindZRoli('ZU')).toBe('zespol_uziemiajacy');
  });
});

describe('polaSnModel — payload', () => {
  it('buduje payload add_sn_bay z rolą, aparatem i katalogiem APARAT_SN', () => {
    const payload = zbudujPayload(
      dane({ bay_role: 'TR', apparatus_kind: 'BREAKER', field_name: 'Pole TR-1' }),
      KONTEKST,
    );
    expect(payload).toMatchObject({
      bus_ref: 'bus-1',
      station_ref: 'st-1',
      bay_role: 'TR',
      apparatus_kind: 'BREAKER',
      field_name: 'Pole TR-1',
      catalog_binding: expect.objectContaining({ catalog_namespace: 'APARAT_SN', catalog_item_id: 'app-1' }),
    });
  });

  it('pomija puste pola opcjonalne (nazwa, existing_field_ref, gpz_section_id)', () => {
    const payload = zbudujPayload(dane({ field_name: '   ' }), { bus_ref: 'b', station_ref: 's' });
    expect(payload.field_name).toBeUndefined();
    expect(payload.existing_field_ref).toBeUndefined();
    expect(payload.gpz_section_id).toBeUndefined();
  });

  it('przekazuje existing_field_ref i gpz_section_id z kontekstu', () => {
    const payload = zbudujPayload(dane(), {
      ...KONTEKST,
      existing_field_ref: 'field-9',
      gpz_section_id: 'sec-2',
    });
    expect(payload.existing_field_ref).toBe('field-9');
    expect(payload.gpz_section_id).toBe('sec-2');
  });

  it('dołącza powiązanie z szablonem producenta addytywnie (Reference Engine)', () => {
    const payload = zbudujPayload(
      dane({
        switchgear_family_ref: 'fam-1',
        bay_template_ref: 'tmpl-tr-1',
        manufacturer_ref: 'ZPUE',
      }),
      KONTEKST,
    );
    expect(payload).toMatchObject({
      switchgear_family_ref: 'fam-1',
      bay_template_ref: 'tmpl-tr-1',
      manufacturer_ref: 'ZPUE',
    });
  });

  it('pomija puste referencje producenckie (exclude_none)', () => {
    const payload = zbudujPayload(dane(), KONTEKST);
    expect(payload.switchgear_family_ref).toBeUndefined();
    expect(payload.bay_template_ref).toBeUndefined();
    expect(payload.manufacturer_ref).toBeUndefined();
  });
});

describe('polaSnModel — pomiar pola (POMIAR-RODZAJ, kontrakt §5, V12K-336)', () => {
  it('układ pomiarowy energii deklaruje funkcję i rodzaj JAWNIE w payloadzie add_sn_bay', () => {
    for (const rodzaj of ['PODSTAWOWY', 'REZERWOWY', 'ROWNOWAZNY', 'KONTROLNY'] as const) {
      const payload = zbudujPayload(
        dane({ bay_role: 'MEASUREMENT', apparatus_kind: 'MEASUREMENT', wybor_pomiaru: rodzaj }),
        KONTEKST,
      );
      expect(payload.funkcja_pomiaru, rodzaj).toBe('UKLAD_ENERGII');
      expect(payload.rodzaj_pomiaru, rodzaj).toBe(rodzaj);
    }
  });

  it('pomiar napięcia szyn wysyła funkcję NAPIECIA_SZYN bez rodzaju układu', () => {
    const payload = zbudujPayload(
      dane({ bay_role: 'MEASUREMENT', apparatus_kind: 'MEASUREMENT', wybor_pomiaru: 'NAPIECIA_SZYN' }),
      KONTEKST,
    );
    expect(payload.funkcja_pomiaru).toBe('NAPIECIA_SZYN');
    expect(payload.rodzaj_pomiaru).toBeUndefined();
  });

  it('domyślny wybór = pomiar napięcia szyn (układ energii nigdy z domysłu)', () => {
    expect(DANE_DOMYSLNE.wybor_pomiaru).toBe('NAPIECIA_SZYN');
  });

  it('rola niepomiarowa NIE wysyła pomiaru (backend by go odrzucił)', () => {
    for (const { value } of ROLE_OPCJE) {
      if (value === 'MEASUREMENT') continue;
      const payload = zbudujPayload(dane({ bay_role: value }), KONTEKST);
      expect(payload.funkcja_pomiaru, value).toBeUndefined();
      expect(payload.rodzaj_pomiaru, value).toBeUndefined();
    }
  });

  it('każdy wybór pomiaru ma polską etykietę (mapowanie totalne, bez surowych kodów)', () => {
    expect(WYBOR_POMIARU_OPCJE.map((o) => o.value)).toEqual([
      'NAPIECIA_SZYN',
      'PODSTAWOWY',
      'REZERWOWY',
      'ROWNOWAZNY',
      'KONTROLNY',
    ]);
    for (const { value, label } of WYBOR_POMIARU_OPCJE) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(value);
      expect(/^[A-Z_]+$/.test(label)).toBe(false);
      expect(wyborPomiaruLabel(value)).toBe(label);
    }
  });
});

describe('polaSnModel — szablon producenta (Reference Engine)', () => {
  it('mapuje rolę pola na BayKind szablonu producenta', () => {
    expect(bayKindZRoli('IN')).toBe('liniowe_doplywowe');
    expect(bayKindZRoli('TR')).toBe('transformatorowe');
    expect(bayKindZRoli('MEASUREMENT')).toBe('pomiarowe');
    expect(bayKindZRoli('COUPLER')).toBe('sprzeglowe_podluzne');
    expect(bayKindZRoli('OUT')).toBe('liniowe_odplywowe');
    expect(bayKindZRoli('FEEDER')).toBe('liniowe_odplywowe');
    expect(bayKindZRoli('OZE')).toBe('liniowe_odplywowe');
  });

  it('wykrywa powiązanie z szablonem po bay_template_ref', () => {
    expect(maSzablonProducenta(dane())).toBe(false);
    expect(maSzablonProducenta(dane({ bay_template_ref: 'tmpl-1' }))).toBe(true);
  });
});

describe('polaSnModel — pole sprzęgła (dwie sekcje, karta KATALOG-PRZEJECIE-PR)', () => {
  const SPRZEGLO = dane({ bay_role: 'COUPLER', coupled_bus_ref: 'bus-2', coupler_normal_state: 'open' });

  it('nowe sprzęgło wymaga drugiej sekcji; rekonfiguracja i inna rola — nie', () => {
    expect(walidujFormularz(dane({ bay_role: 'COUPLER' }), KONTEKST).map((e) => e.field)).toEqual(['coupled_bus_ref']);
    expect(walidujFormularz(SPRZEGLO, KONTEKST)).toEqual([]);
    expect(walidujFormularz(dane({ bay_role: 'COUPLER' }), { ...KONTEKST, existing_field_ref: 'pole-sp' })).toEqual([]);
    expect(walidujFormularz(dane({ bay_role: 'OUT' }), KONTEKST)).toEqual([]);
  });

  it.each([
    ['nowe sprzęgło', SPRZEGLO, KONTEKST, { coupled_bus_ref: 'bus-2', coupler_normal_state: 'open' }],
    ['rekonfiguracja sprzęgła', SPRZEGLO, { ...KONTEKST, existing_field_ref: 'pole-sp' }, { coupled_bus_ref: undefined, coupler_normal_state: undefined }],
    ['inna rola z pozostałą sekcją', { ...SPRZEGLO, bay_role: 'OUT' as const }, KONTEKST, { coupled_bus_ref: undefined, coupler_normal_state: undefined }],
  ])('%s → klucze sprzęgła w payloadzie tylko dla nowego pola sprzęgła', (_opis, d, k, oczekiwane) => {
    expect(zbudujPayload(d, k)).toMatchObject(oczekiwane);
    expect(noweSprzeglo(d, k)).toBe(oczekiwane.coupled_bus_ref !== undefined);
  });

  it('stan normalny z kontekstu: tylko „open” otwiera, reszta = zamknięte', () => {
    expect(stanSprzeglaPoczatkowy('open')).toBe('open');
    expect(stanSprzeglaPoczatkowy('closed')).toBe('closed');
    expect(stanSprzeglaPoczatkowy(undefined)).toBe('closed');
    expect(stanSprzeglaPoczatkowy('half')).toBe('closed');
  });

  const MODEL = {
    buses: [
      { ref_id: 'g1', name: 'Szyna 1' },
      { ref_id: 'g2', name: 'Szyna 2' },
      { ref_id: 'g3', name: 'Szyna 3' },
      { ref_id: 'z1', name: 'Zacisk', tags: ['helper_bus'] },
    ],
    substations: [
      {
        ref_id: 'gpz',
        station_type: 'gpz',
        bus_refs: ['g1', 'g2', 'g3'],
        gpz_sections: [
          { section_id: 'c', order: 2, name: '', bus_ref: 'g3' },
          { section_id: 'a', order: 0, name: 'Sekcja A', bus_ref: 'g1' },
          { section_id: 'b', order: 1, name: 'Sekcja B', bus_ref: 'g2' },
        ],
      },
      { ref_id: 'st', station_type: 'sectional', bus_refs: ['g1', 'g2', 'z1'] },
    ],
  } as never;

  it.each([
    ['GPZ: sekcje SN w kolejności, bez własnej szyny, nazwa sekcji albo szyny', 'gpz', 'g2', [['g1', 'Sekcja A'], ['g3', 'Szyna 3']]],
    ['stacja: szyny stacji bez zacisków pól i bez własnej', 'st', 'g1', [['g2', 'Szyna 2']]],
    ['nieznana stacja', 'x', 'g1', []],
  ])('sekcjeDoSprzegla — %s', (_opis, stacja, szyna, oczekiwane) => {
    expect(sekcjeDoSprzegla(MODEL, stacja, szyna).map((s) => [s.id, s.etykieta])).toEqual(oczekiwane);
  });

  it('sekcjeDoSprzegla bez szyny albo bez modelu → pusto', () => {
    expect(sekcjeDoSprzegla(MODEL, 'gpz', undefined)).toEqual([]);
    expect(sekcjeDoSprzegla(null, 'gpz', 'g1')).toEqual([]);
  });
});
