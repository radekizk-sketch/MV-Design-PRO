/**
 * Kanon słownictwa ról pól SN (karta #141) — jedna nazwa roli w całym produkcie.
 *
 * Iloczyn cech: słownictwo wejścia {rola kanoniczna, alias modelu `Bay.bay_role` wielkimi
 * i małymi literami oraz z odstępami, rola źródłowa modelu `OZE`, pusta/brak, spoza kanonu}
 * × funkcja kanonu {rola kanoniczna, nazwa albo null, nazwa z nazwą ogólną, rola źródłowa}
 * oraz rodzaj pola katalogu (`BayKind`) × {nazwa z kanonu, zgodność z rolą operacji kreatora
 * stacji}. Parytet z backendem (`enm/rola_pola_sn.py`) przypina test backendu
 * `tests/enm/test_nazwy_pol_bez_kodow.py`, a brak drugiej listy etykiet — strażnik
 * `tests/ci/test_etykiety_rol_pol_sn.py`.
 */
import { describe, expect, it } from 'vitest';
import type { BayCanonicalRole } from '../../../../../types/enm';
import { bayKindLabelPl, type BayKind } from '../../../../catalog/BayTemplatePicker';
import { SN_FIELD_ROLES } from '../../../../network-build/forms/InsertStationFormHelpers';
import { ROLA_Z_FUNKCJI_POLA } from '../../../../../ui2/kreatory/stacja/konfiguratorRozdzielnicy';
import {
  FIELD_GENERIC_LABEL_PL,
  FIELD_ROLE_LABEL_PL,
  FIELD_SOURCE_LABEL_PL,
  MODEL_BAY_ROLE_TO_CANONICAL,
  FIELD_ROLE_SHORT_TAG,
  canonicalFieldRole,
  fieldLabelInSentencePl,
  fieldLabelPluralPl,
  fieldRoleLabelOrNullPl,
  fieldRoleLabelPl,
  fieldRoleShortTagPl,
  isSourceFieldRole,
} from '../contract';

const ROLE_KANONU = Object.keys(FIELD_ROLE_LABEL_PL) as BayCanonicalRole[];
const ROLE_ZRODLOWE_KANONU: readonly BayCanonicalRole[] = ['PV_SN', 'BESS_SN', 'FW_SN'];
const ALIASY_MODELU = Object.keys(MODEL_BAY_ROLE_TO_CANONICAL);

describe('kanon nazw ról pól SN', () => {
  it('dziewięć ról kanonu, każda nazwa „Pole …”, nazwy różne i bez kodów ról', () => {
    expect([...ROLE_KANONU].sort()).toEqual(
      ['BESS_SN', 'FW_SN', 'LINIA_IN', 'LINIA_ODG', 'LINIA_OUT', 'POMIAROWE', 'PV_SN', 'SPRZEGLO', 'TRANSFORMATOROWE'],
    );
    const nazwy = [...Object.values(FIELD_ROLE_LABEL_PL), FIELD_SOURCE_LABEL_PL, FIELD_GENERIC_LABEL_PL];
    expect(new Set(nazwy).size).toBe(nazwy.length);
    for (const nazwa of nazwy) {
      expect(nazwa.startsWith('Pole ')).toBe(true);
      expect(nazwa).not.toMatch(/_|\b(?:IN|OUT|FEEDER|TR|COUPLER|MEASUREMENT|OZE|LINIA|SPRZEGLO)\b/);
    }
  });

  it('mapa aliasów modelu prowadzi wyłącznie na role kanonu i nie zasłania ról kanonu', () => {
    expect([...ALIASY_MODELU].sort()).toEqual(['COUPLER', 'FEEDER', 'IN', 'MEASUREMENT', 'OUT', 'TR']);
    for (const alias of ALIASY_MODELU) {
      expect(ROLE_KANONU).toContain(MODEL_BAY_ROLE_TO_CANONICAL[alias]);
      expect(ROLE_KANONU).not.toContain(alias);
    }
  });
});

describe.each(ROLE_KANONU)('rola kanonu %s', (rola) => {
  it.each([rola, rola.toLowerCase(), `  ${rola} `])('wejście %j', (wejscie) => {
    expect(canonicalFieldRole(wejscie)).toBe(rola);
    expect(fieldRoleLabelOrNullPl(wejscie)).toBe(FIELD_ROLE_LABEL_PL[rola]);
    expect(fieldRoleLabelPl(wejscie)).toBe(FIELD_ROLE_LABEL_PL[rola]);
    expect(isSourceFieldRole(wejscie)).toBe(ROLE_ZRODLOWE_KANONU.includes(rola));
  });
});

describe.each(ALIASY_MODELU)('alias modelu %s', (alias) => {
  it.each([alias, alias.toLowerCase(), ` ${alias}  `])('wejście %j → nazwa roli kanonu', (wejscie) => {
    const rola = MODEL_BAY_ROLE_TO_CANONICAL[alias];
    expect(canonicalFieldRole(wejscie)).toBe(rola);
    expect(fieldRoleLabelPl(wejscie)).toBe(FIELD_ROLE_LABEL_PL[rola]);
    expect(isSourceFieldRole(wejscie)).toBe(false);
  });
});

describe('rola źródłowa modelu OZE (technologia nieznana)', () => {
  it.each(['OZE', 'oze', ' OZE '])('wejście %j → nazwa ogólna pola źródłowego, bez roli kanonu', (wejscie) => {
    expect(canonicalFieldRole(wejscie)).toBeNull();
    expect(fieldRoleLabelOrNullPl(wejscie)).toBe(FIELD_SOURCE_LABEL_PL);
    expect(fieldRoleLabelPl(wejscie)).toBe(FIELD_SOURCE_LABEL_PL);
    expect(isSourceFieldRole(wejscie)).toBe(true);
  });
});

describe('rola pusta albo spoza kanonu — bez zgadywania', () => {
  it.each([null, undefined, '', '   ', 'XYZ', 'LINE_OUT', 'FEEDER_X', 'PV', 'sprzęgło'])(
    'wejście %j → brak roli, nazwa ogólna „Pole SN”',
    (wejscie) => {
      expect(canonicalFieldRole(wejscie)).toBeNull();
      expect(fieldRoleLabelOrNullPl(wejscie)).toBeNull();
      expect(fieldRoleLabelPl(wejscie)).toBe(FIELD_GENERIC_LABEL_PL);
      expect(isSourceFieldRole(wejscie)).toBe(false);
    },
  );
});

describe('znacznik dyspozytorski roli (WE/WY/TR/ODG/SPR/POM) zamiast kodu roli', () => {
  it.each(Object.keys(FIELD_ROLE_SHORT_TAG))('rola kanonu %s i jej alias modelu dają ten sam znacznik', (rola) => {
    const znacznik = FIELD_ROLE_SHORT_TAG[rola as keyof typeof FIELD_ROLE_SHORT_TAG];
    expect(fieldRoleShortTagPl(rola)).toBe(znacznik);
    const alias = ALIASY_MODELU.find((a) => MODEL_BAY_ROLE_TO_CANONICAL[a] === rola);
    expect(alias).toBeDefined();
    expect(fieldRoleShortTagPl(alias)).toBe(znacznik);
    expect(fieldRoleShortTagPl(alias?.toLowerCase())).toBe(znacznik);
  });
  it.each(['OZE', 'PV_SN', 'BESS_SN', 'FW_SN', '', null, undefined, 'XYZ'])(
    'wejście %j → brak znacznika (pole źródłowe albo rola spoza kanonu), nigdy kod',
    (wejscie) => {
      expect(fieldRoleShortTagPl(wejscie)).toBeNull();
    },
  );
});

describe('formy nazwy w zdaniu i w liczbie mnogiej', () => {
  it.each(ROLE_KANONU)('%s', (rola) => {
    const nazwa = FIELD_ROLE_LABEL_PL[rola];
    expect(fieldLabelInSentencePl(nazwa)).toBe(`pole ${nazwa.slice('Pole '.length)}`);
    expect(fieldLabelPluralPl(nazwa)).toBe(`Pola ${nazwa.slice('Pole '.length)}`);
  });
  it('określenie i skróty technologii zostają bez zmian', () => {
    expect(fieldLabelInSentencePl('Pole źródłowe PV')).toBe('pole źródłowe PV');
    expect(fieldLabelPluralPl('Pole źródłowe BESS')).toBe('Pola źródłowe BESS');
  });
});

describe('rodzaj pola katalogu (BayKind) — nazwa z kanonu ról', () => {
  const RODZAJE = Object.keys(ROLA_Z_FUNKCJI_POLA) as BayKind[];

  it('rodzaje z rolą kanonu biorą nazwę kanonu, sprzęgło z określeniem rodzaju', () => {
    expect(bayKindLabelPl('liniowe_doplywowe')).toBe(FIELD_ROLE_LABEL_PL.LINIA_IN);
    expect(bayKindLabelPl('liniowe_odplywowe')).toBe(FIELD_ROLE_LABEL_PL.LINIA_OUT);
    expect(bayKindLabelPl('transformatorowe')).toBe(FIELD_ROLE_LABEL_PL.TRANSFORMATOROWE);
    expect(bayKindLabelPl('pomiarowe')).toBe(FIELD_ROLE_LABEL_PL.POMIAROWE);
    expect(bayKindLabelPl('sprzeglowe_podluzne')).toBe(`${FIELD_ROLE_LABEL_PL.SPRZEGLO} podłużnego`);
    expect(bayKindLabelPl('sprzeglowe_poprzeczne')).toBe(`${FIELD_ROLE_LABEL_PL.SPRZEGLO} poprzecznego`);
    expect(bayKindLabelPl('pv')).toBe(FIELD_ROLE_LABEL_PL.PV_SN);
    expect(bayKindLabelPl('bess')).toBe(FIELD_ROLE_LABEL_PL.BESS_SN);
    expect(bayKindLabelPl('fw')).toBe(FIELD_ROLE_LABEL_PL.FW_SN);
  });

  it('rodzaje bez roli kanonu mają własną nazwę, różną od każdej nazwy roli', () => {
    const nazwyRol = new Set(Object.values(FIELD_ROLE_LABEL_PL));
    for (const rodzaj of ['sekcyjne', 'potrzeb_wlasnych', 'odgromnikowe', 'rezerwowe', 'kablowe', 'napowietrzne', 'nop_lacznikowe'] as BayKind[]) {
      const nazwa = bayKindLabelPl(rodzaj);
      expect(nazwa.startsWith('Pole ')).toBe(true);
      expect(nazwyRol.has(nazwa)).toBe(false);
    }
  });

  it.each(RODZAJE)('%s: nazwa rodzaju zgodna z rolą, którą kreator stacji nada polu', (rodzaj) => {
    // Predykaty parami: kreator zamienia rodzaj jednostki na rolę operacji stacyjnej
    // (`ROLA_Z_FUNKCJI_POLA`); utworzone pole nazywa się wg roli — nazwa rodzaju w katalogu
    // musi zaczynać się od tej samej nazwy, a rodzaj bez roli operacji nie może udawać roli.
    const rolaOperacji = ROLA_Z_FUNKCJI_POLA[rodzaj];
    const nazwa = bayKindLabelPl(rodzaj);
    if (rolaOperacji) {
      expect(nazwa.startsWith(FIELD_ROLE_LABEL_PL[rolaOperacji])).toBe(true);
    } else {
      for (const rola of SN_FIELD_ROLES) {
        expect(nazwa.startsWith(FIELD_ROLE_LABEL_PL[rola])).toBe(false);
      }
    }
  });
});
