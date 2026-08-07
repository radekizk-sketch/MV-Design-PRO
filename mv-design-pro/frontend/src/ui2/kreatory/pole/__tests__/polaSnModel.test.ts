import { describe, expect, it } from 'vitest';

import {
  APARAT_OPCJE,
  DANE_DOMYSLNE,
  RODZAJ_POMIARU_OPCJE,
  ROLE_OPCJE,
  aparatLabel,
  bayKindZRoli,
  maSzablonProducenta,
  maSzyne,
  rodzajPomiaruLabel,
  rolaLabel,
  walidujFormularz,
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
    expect(rolaLabel('OUT')).toBe('Pole liniowe odpływowe');
    expect(rolaLabel('IN')).toBe('Pole liniowe dopływowe');
    expect(rolaLabel('TR')).toBe('Pole transformatorowe');
    expect(aparatLabel('BREAKER')).toBe('Wyłącznik mocy');
    // Mapowanie totalne — dla każdej wartości kontraktu istnieje polska etykieta.
    for (const { value } of ROLE_OPCJE) expect(rolaLabel(value)).not.toBe('');
    for (const { value } of APARAT_OPCJE) expect(aparatLabel(value)).not.toBe('');
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

describe('polaSnModel — rodzaj pomiaru (POMIAR-RODZAJ, kontrakt §5)', () => {
  it('pole pomiarowe deklaruje rodzaj pomiaru JAWNIE w payloadzie add_sn_bay', () => {
    const payload = zbudujPayload(
      dane({ bay_role: 'MEASUREMENT', apparatus_kind: 'MEASUREMENT', rodzaj_pomiaru: 'ROZLICZENIOWY' }),
      KONTEKST,
    );
    expect(payload.rodzaj_pomiaru).toBe('ROZLICZENIOWY');
  });

  it('domyślny rodzaj = KONTROLNY (status rozliczeniowy nigdy z domysłu)', () => {
    expect(DANE_DOMYSLNE.rodzaj_pomiaru).toBe('KONTROLNY');
    const payload = zbudujPayload(
      dane({ bay_role: 'MEASUREMENT', apparatus_kind: 'MEASUREMENT' }),
      KONTEKST,
    );
    expect(payload.rodzaj_pomiaru).toBe('KONTROLNY');
  });

  it('rola niepomiarowa NIE wysyła rodzaju pomiaru (backend by ją odrzucił)', () => {
    for (const { value } of ROLE_OPCJE) {
      if (value === 'MEASUREMENT') continue;
      const payload = zbudujPayload(dane({ bay_role: value }), KONTEKST);
      expect(payload.rodzaj_pomiaru, value).toBeUndefined();
    }
  });

  it('każdy rodzaj ma polską etykietę (mapowanie totalne, bez surowych kodów)', () => {
    for (const { value, label } of RODZAJ_POMIARU_OPCJE) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(value);
      expect(/^[A-Z_]+$/.test(label)).toBe(false);
      expect(rodzajPomiaruLabel(value)).toBe(label);
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
