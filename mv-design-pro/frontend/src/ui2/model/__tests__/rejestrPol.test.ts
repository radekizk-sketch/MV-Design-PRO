// @vitest-environment node
/**
 * Rejestr pól edytowalnych — przypięcie do kontraktu backendu (karta JEDNA-SCIEZKA-EDYCJI).
 *
 * Iloczyn cech, w którym chował się defekt „kontrolka wysyła klucz, który backend odrzuca":
 * typ elementu siatki × tryb pracy × pole edytowalne × klucz zapisu. Fikstura
 * `rejestr_pol_edycji.json` jest eksportem backendu (`eksport_fixtur_harnessu.py`,
 * `PARAMETRY_EDYTOWALNE_WG_KOLEKCJI` i kontrakt pól kolekcji) — nie listą przepisaną ręcznie.
 */

import { describe, expect, it } from 'vitest';

import kontrakt from '../../../harness-fixtures/generated/rejestr_pol_edycji.json';
import { getFieldDefinitionsForMode } from '../../../ui/property-grid/field-definitions';
import type { ElementType, OperatingMode } from '../../../ui/types';
import {
  POLA_SIATKI,
  POLE_DLUGOSC_ODCINKA,
  POLE_DLUGOSC_ODCINKA_KM,
  POLE_POLOZENIE_LACZNIKA,
  POLE_PRZELACZNIK_ZACZEPOW,
  POLE_WARUNKI_ULOZENIA_KABLA,
  POLE_ZACZEP_TRANSFORMATORA,
  POLE_COS_PHI_ODBIORU,
  type DefinicjaPola,
} from '../rejestrPol';

const dopuszczone = (kolekcja: string): ReadonlySet<string> => {
  const k = kontrakt as {
    kolekcje_z_lista: Record<string, string[]>;
    kolekcje_z_kontraktem: Record<string, string[]>;
    parametry_operacji: Record<string, string[]>;
  };
  return new Set([
    ...(k.kolekcje_z_lista[kolekcja] ?? []),
    ...(k.kolekcje_z_kontraktem[kolekcja] ?? []),
    ...(k.parametry_operacji[kolekcja] ?? []),
  ]);
};

const WSZYSTKIE: DefinicjaPola[] = [
  ...Object.values(POLA_SIATKI).flatMap((pola) => Object.values(pola)),
  POLE_DLUGOSC_ODCINKA,
  POLE_DLUGOSC_ODCINKA_KM,
  POLE_PRZELACZNIK_ZACZEPOW,
  POLE_WARUNKI_ULOZENIA_KABLA,
];

/** Próbki wartości ekranu, z których każda definicja buduje zapis. */
const PROBKI: readonly unknown[] = [
  'Nazwa', 'closed', 'open', 0.9, 2, 120, 'tc_detc_snnn_5_25', null,
  { set_name: 'ziemia_3_kable_warstwa_200mm' },
];

describe('rejestr pól × kontrakt update_element_parameters', () => {
  it.each(WSZYSTKIE.map((d) => [d.id, d] as const))(
    '%s: każdy klucz zapisu jest dopuszczony dla kolekcji',
    (_id, definicja) => {
      const dozwolone = dopuszczone(definicja.kolekcja);
      expect(dozwolone.size).toBeGreaterThan(0);
      for (const klucz of definicja.kluczeZapisu) expect(dozwolone.has(klucz)).toBe(true);
    },
  );

  it.each(WSZYSTKIE.map((d) => [d.id, d] as const))(
    '%s: zbudowany zapis wysyła wyłącznie klucze zadeklarowane w definicji',
    (_id, definicja) => {
      const elementy = [{}, { tap_changer: { current_position: 1, catalog_ref: 'tc_detc_snnn_5_25' } }];
      for (const element of elementy) {
        // Zapis ma warunek wstępny: wartość przeszła walidację tej samej definicji.
        for (const wartosc of PROBKI.filter((w) => definicja.waliduj(w) === null)) {
          const { operacja, ladunek } = definicja.zapis('el-1', wartosc, element);
          if (operacja !== 'update_element_parameters') continue;
          expect(ladunek.element_ref).toBe('el-1');
          const klucze = Object.keys(ladunek.parameters as Record<string, unknown>);
          for (const klucz of klucze) expect(definicja.kluczeZapisu).toContain(klucz);
        }
      }
    },
  );
});

describe('siatka właściwości × rejestr — żadne pole edytowalne bez ścieżki zapisu', () => {
  const TYPY: ElementType[] = ['Bus', 'LineBranch', 'TransformerBranch', 'Switch', 'Source', 'Load'];
  const TRYBY: OperatingMode[] = ['MODEL_EDIT', 'CASE_CONFIG', 'RESULT_VIEW'];
  it.each(TYPY.flatMap((typ) => TRYBY.map((tryb) => [typ, tryb] as const)))(
    '%s × %s',
    (typ, tryb) => {
      for (const pole of getFieldDefinitionsForMode(typ, tryb).flatMap((s) => s.fields)) {
        // Przypisanie typu katalogowego ma własną operację (`assign_catalog_to_element`).
        if (!pole.editable || pole.type === 'type_ref_with_actions') continue;
        expect(POLA_SIATKI[typ]?.[pole.key], `${typ}.${pole.key}`).toBeDefined();
      }
    },
  );
});

describe('definicje o niestandardowym zapisie', () => {
  it('położenie łącznika idzie operacją otwarcia/zamknięcia, nie korektą parametrów', () => {
    expect(POLE_POLOZENIE_LACZNIKA.zapis('Q1', 'open', {})).toEqual({ operacja: 'open_switch', ladunek: { switch_ref: 'Q1' } });
    expect(POLE_POLOZENIE_LACZNIKA.zapis('Q1', 'closed', {})).toEqual({ operacja: 'close_switch', ladunek: { switch_ref: 'Q1' } });
  });

  it('zaczep: podzespół tap_changer, gdy istnieje; inaczej tap_position', () => {
    const zPodzespolem = { tap_changer: { catalog_ref: 'tc_detc_snnn_5_25', current_position: 0 } };
    expect(POLE_ZACZEP_TRANSFORMATORA.odczyt(zPodzespolem)).toBe(0);
    expect(POLE_ZACZEP_TRANSFORMATORA.zapis('T1', 2, zPodzespolem).ladunek).toEqual({
      element_ref: 'T1',
      parameters: { tap_changer: { catalog_ref: 'tc_detc_snnn_5_25', current_position: 2 } },
    });
    expect(POLE_ZACZEP_TRANSFORMATORA.odczyt({ tap_position: -1 })).toBe(-1);
    expect(POLE_ZACZEP_TRANSFORMATORA.zapis('T1', 1, {}).ladunek).toEqual({
      element_ref: 'T1',
      parameters: { tap_position: 1 },
    });
    expect(POLE_ZACZEP_TRANSFORMATORA.odczyt({})).toBeNull();
  });

  it('długość: metry na ekranie, kilometry w modelu, jedna walidacja', () => {
    expect(POLE_DLUGOSC_ODCINKA.odczyt({ length_km: 0.85 })).toBe(850);
    expect(POLE_DLUGOSC_ODCINKA.zapis('K1', 850, {}).ladunek).toEqual({ element_ref: 'K1', parameters: { length_km: 0.85 } });
    expect(POLE_DLUGOSC_ODCINKA.waliduj).toBe(POLE_DLUGOSC_ODCINKA_KM.waliduj);
  });

  it('cos φ odbioru: model go nie niesie (odczyt pusty), zapis to parametr operacji', () => {
    expect(POLE_COS_PHI_ODBIORU.odczyt({ p_mw: 1, q_mvar: 0.3 })).toBeNull();
    expect(POLE_COS_PHI_ODBIORU.zapis('L1', 0.95, {}).ladunek).toEqual({ element_ref: 'L1', parameters: { cos_phi: 0.95 } });
  });
});

describe('warunki ułożenia kabla', () => {
  it('odczyt z meta, zapis pod kluczem operacji, walidacja współczynników', () => {
    const odcinek = { meta: { cable_laying_conditions: { set_name: 'wlasne', f_grunt: 0.9, opis_pl: 'grunt suchy' } } };
    expect(POLE_WARUNKI_ULOZENIA_KABLA.odczyt(odcinek)).toBe('wlasne');
    expect(POLE_WARUNKI_ULOZENIA_KABLA.odczyt({})).toBeNull();
    expect(POLE_WARUNKI_ULOZENIA_KABLA.waliduj({ set_name: 'wlasne', f_grunt: 0 })).not.toBeNull();
    expect(POLE_WARUNKI_ULOZENIA_KABLA.waliduj({ set_name: '' })).not.toBeNull();
    expect(POLE_WARUNKI_ULOZENIA_KABLA.waliduj(null)).toBeNull();
    expect(POLE_WARUNKI_ULOZENIA_KABLA.zapis('K1', { set_name: 'warunki_katalogowe' }, {}).ladunek).toEqual({
      element_ref: 'K1',
      parameters: { cable_laying_conditions: { set_name: 'warunki_katalogowe' } },
    });
  });
});
