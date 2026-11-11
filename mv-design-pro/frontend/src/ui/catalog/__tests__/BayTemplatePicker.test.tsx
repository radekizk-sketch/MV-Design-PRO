/**
 * Nazwy prezentacyjne szablonu pola SN (`BayTemplatePicker.tsx`): status źródła i nazwa
 * pakietu pola. Iloczyn: status źródła (każdy z unii `BayTemplateSourceStatus`) × etykieta,
 * oraz {nazwa katalogowa, rodzina znana, rodzina spoza katalogu, brak rodziny} × rodzaj pola
 * (każdy `BayKind`) × nazwa pakietu — nigdy referencja szablonu.
 */
import { describe, expect, it } from 'vitest';

import {
  bayKindLabelPl,
  RODZAJ_POLA_SPOZA_SLOWNIKA_PL,
  SZABLON_SPOZA_KATALOGU_PL,
  nazwaSzablonuPoReferencjiPl,
  etykietaStatusuZrodlaSzablonuPl,
  nazwaSzablonuPolaPl,
  type BayKind,
  type BayTemplateSourceStatus,
} from '../BayTemplatePicker';

const STATUSY = {
  official_catalog: true,
  repo_verified: true,
  user_defined: true,
  canonical_fallback: true,
  requires_catalog: true,
  incomplete_requires_review: true,
} as const satisfies Record<BayTemplateSourceStatus, true>;

const RODZAJE = {
  liniowe_doplywowe: true,
  liniowe_odplywowe: true,
  transformatorowe: true,
  pomiarowe: true,
  sprzeglowe_podluzne: true,
  sprzeglowe_poprzeczne: true,
  sekcyjne: true,
  potrzeb_wlasnych: true,
  odgromnikowe: true,
  pv: true,
  bess: true,
  fw: true,
  rezerwowe: true,
  kablowe: true,
  napowietrzne: true,
  nop_lacznikowe: true,
  bateria_kondensatorow: true,
} as const satisfies Record<BayKind, true>;

const RODZINY = new Map([['ABB__UNIGEAR_ZS1', 'UniGear ZS1']]);

describe('status źródła szablonu pola', () => {
  it.each(Object.keys(STATUSY) as BayTemplateSourceStatus[])('%s ma polską nazwę, nie kod', (status) => {
    const etykieta = etykietaStatusuZrodlaSzablonuPl(status);
    expect(etykieta).not.toBe('Nieznany status źródła');
    expect(etykieta).not.toContain(status);
  });

  it('status spoza unii (dane spoza kontraktu) mówi to wprost', () => {
    expect(etykietaStatusuZrodlaSzablonuPl('nowy_status' as BayTemplateSourceStatus)).toBe('Nieznany status źródła');
  });
});

describe('nazwa pakietu pola', () => {
  it.each(Object.keys(RODZAJE) as BayKind[])('%s: nazwa katalogowa, rodzina znana, spoza katalogu, brak rodziny', (bay_kind) => {
    const rodzaj = bayKindLabelPl(bay_kind);
    expect(rodzaj).not.toMatch(/_/);
    expect(nazwaSzablonuPolaPl({ template_name_pl: 'Pole 630 A', bay_kind, switchgear_family_ref: 'ABB__UNIGEAR_ZS1' }, RODZINY)).toBe('Pole 630 A');
    expect(nazwaSzablonuPolaPl({ template_name_pl: '  ', bay_kind, switchgear_family_ref: 'ABB__UNIGEAR_ZS1' }, RODZINY)).toBe(`${rodzaj} · UniGear ZS1`);
    expect(nazwaSzablonuPolaPl({ template_name_pl: null, bay_kind, switchgear_family_ref: 'NIEZNANA' }, RODZINY)).toBe(
      `${rodzaj} · rodzina rozdzielnicy spoza katalogu rodzin`,
    );
    expect(nazwaSzablonuPolaPl({ template_name_pl: undefined, bay_kind, switchgear_family_ref: null }, RODZINY)).toBe(
      `${rodzaj} · szablon kanoniczny ogólny`,
    );
  });
});


describe('wartości spoza słownika i referencje spoza katalogu', () => {
  it('rodzaj pola spoza słownika ma opis jawny (nie kod, nie wyjątek)', () => {
    expect(bayKindLabelPl('NOWY_RODZAJ' as BayKind)).toBe(RODZAJ_POLA_SPOZA_SLOWNIKA_PL);
    expect(bayKindLabelPl('toString' as BayKind)).toBe(RODZAJ_POLA_SPOZA_SLOWNIKA_PL);
    expect(
      nazwaSzablonuPolaPl({ template_name_pl: null, bay_kind: 'NOWY_RODZAJ' as BayKind, switchgear_family_ref: null }, new Map()),
    ).toBe(`${RODZAJ_POLA_SPOZA_SLOWNIKA_PL} · szablon kanoniczny ogólny`);
  });

  it('status źródła o nazwie klucza prototypu nie przecieka jako funkcja', () => {
    expect(etykietaStatusuZrodlaSzablonuPl('toString' as BayTemplateSourceStatus)).toBe('Nieznany status źródła');
  });

  it('szablon wskazany referencją: nazwa z katalogu albo opis jawny', () => {
    const szablony = [
      { template_ref: 'ABB__SAFERING__LINE_OUT', template_name_pl: null, bay_kind: 'liniowe_odplywowe', switchgear_family_ref: 'ABB__SAFERING' },
    ] as never;
    const nazwy = new Map([['ABB__SAFERING', 'SafeRing']]);
    expect(nazwaSzablonuPoReferencjiPl('ABB__SAFERING__LINE_OUT', szablony, nazwy)).toBe(
      `${bayKindLabelPl('liniowe_odplywowe')} · SafeRing`,
    );
    expect(nazwaSzablonuPoReferencjiPl('ZPUE__X__LINE_OUT', szablony, nazwy)).toBe(SZABLON_SPOZA_KATALOGU_PL);
  });
});
