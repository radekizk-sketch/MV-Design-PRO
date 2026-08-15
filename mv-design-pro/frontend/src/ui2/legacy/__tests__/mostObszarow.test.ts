/**
 * Kontrakt mostu tras (D1 — JEDEN KANON NAWIGACJI).
 *
 * Test pilnuje ILOCZYNU CECH, na którym defekt mógłby się schować, a nie
 * pojedynczego przykładu z karty (reguła KLASA-NIE-INSTANCJA §2):
 *  cecha 1: źródło adresu — `ROUTES` (10 tras) × `ALIAS_ROUTES` (5 aliasów),
 *  cecha 2: projekcja — przestrzeń kanoniczna × obszar panelu kontekstu,
 *  cecha 3: rodzaj wiersza — trasa zwykła × nadrzędna × wygaszona × brak trasy.
 *
 * Sedno: KAŻDY adres, którym użytkownik może wejść do aplikacji, ma prowadzić
 * do jednej z siedmiu przestrzeni. Trasa bez wiersza w tabeli to trasa, która
 * zostawia pasek nawigacji na poprzednim etapie — dokładnie ta klasa defektu,
 * którą karta zamyka.
 */

import { describe, expect, it } from 'vitest';

import { ALIAS_ROUTES, ROUTES } from '../../../ui/navigation';
import { SPACE_IDS } from '../../shell/spaces';
import {
  OBSZARY_KONTEKSTU,
  TRASY_KANONICZNE,
  obszarDlaTrasy,
  przestrzenDlaTrasy,
  trasaNadrzedna,
  wpisTrasy,
  wpisTrasyWygaszonej,
} from '../mostObszarow';

const WSZYSTKIE_ADRESY = [
  ...Object.values(ROUTES).map((trasa) => trasa.hash),
  ...Object.values(ALIAS_ROUTES),
];

describe('most tras → siedem przestrzeni (kompletność)', () => {
  it('każdy adres z ROUTES i ALIAS_ROUTES ma wiersz w tabeli kanonicznej', () => {
    const bezWiersza = WSZYSTKIE_ADRESY.filter((adres) => TRASY_KANONICZNE[adres] == null);
    expect(bezWiersza).toEqual([]);
  });

  it('tabela nie zawiera adresu spoza rejestrów tras (zero wierszy-widm)', () => {
    const nadmiarowe = Object.keys(TRASY_KANONICZNE).filter(
      (adres) => !WSZYSTKIE_ADRESY.includes(adres),
    );
    expect(nadmiarowe).toEqual([]);
  });

  it('każdy adres ląduje w jednej z siedmiu przestrzeni powłoki', () => {
    for (const adres of WSZYSTKIE_ADRESY) {
      expect(SPACE_IDS).toContain(przestrzenDlaTrasy(adres));
    }
  });

  it('każdy adres wskazuje obszar z zamkniętej listy paneli kontekstu', () => {
    for (const adres of WSZYSTKIE_ADRESY) {
      expect(OBSZARY_KONTEKSTU).toContain(obszarDlaTrasy(adres));
    }
  });
});

describe('most tras — mapowanie C.2 (obszar → przestrzeń)', () => {
  it.each([
    [ROUTES.DASHBOARD.hash, 'projekt', 'MODEL_SIECI'],
    [ROUTES.SLD.hash, 'schemat', 'SCHEMAT_TOPOLOGIA'],
    [ROUTES.SLD_VIEW.hash, 'schemat', 'SCHEMAT_TOPOLOGIA'],
    [ROUTES.ANALYSIS.hash, 'wyniki', 'WYNIKI_ANALIZY'],
    [ROUTES.REPORT.hash, 'dokumentacja', 'RAPORTY_UZASADNIENIA'],
    [ROUTES.VARIANTS.hash, 'obliczenia', 'STUDIA_OBLICZENIOWE'],
    [ROUTES.CASE_CONFIG.hash, 'obliczenia', 'STUDIA_OBLICZENIOWE'],
    [ROUTES.FAULT_SCENARIOS.hash, 'obliczenia', 'STUDIA_OBLICZENIOWE'],
    [ROUTES.ENM_INSPECTOR.hash, 'model', 'HISTORIA_AUDYT'],
    [ROUTES.CATALOG.hash, 'model', 'KATALOGI_TECHNICZNE'],
    [ALIAS_ROUTES.RESULTS, 'wyniki', 'WYNIKI_ANALIZY'],
    [ALIAS_ROUTES.PROOF, 'wyniki', 'WYNIKI_ANALIZY'],
    [ALIAS_ROUTES.COMPARE, 'wyniki', 'WYNIKI_ANALIZY'],
    [ALIAS_ROUTES.PROTECTION_RESULTS, 'wyniki', 'WYNIKI_ANALIZY'],
    [ALIAS_ROUTES.POWER_FLOW_RESULTS, 'wyniki', 'WYNIKI_ANALIZY'],
  ])('%s → przestrzeń %s, obszar %s', (adres, przestrzen, obszar) => {
    expect(przestrzenDlaTrasy(adres)).toBe(przestrzen);
    expect(obszarDlaTrasy(adres)).toBe(obszar);
  });
});

describe('most tras — przypadki brzegowe', () => {
  it('adres bez trasy nie narzuca przestrzeni, ale daje obszar schematu', () => {
    // Zimny start `/` oraz „sam kontekst" (`#?run=…`) po wyczyszczeniu trasy:
    // o zawartości decyduje wtedy przestrzeń wybrana w powłoce.
    expect(przestrzenDlaTrasy('')).toBeNull();
    expect(obszarDlaTrasy('')).toBe('SCHEMAT_TOPOLOGIA');
  });

  it('adres spoza kanonu nie przestawia powłoki i daje domyślny obszar', () => {
    expect(wpisTrasy('#trasa-ktorej-nie-ma')).toBeNull();
    expect(przestrzenDlaTrasy('#trasa-ktorej-nie-ma')).toBeNull();
    expect(obszarDlaTrasy('#trasa-ktorej-nie-ma')).toBe('MODEL_SIECI');
  });

  it('trasy nadrzędne to dokładnie te, które nadpisują zawartość przestrzeni', () => {
    const nadrzedne = WSZYSTKIE_ADRESY.filter((adres) => trasaNadrzedna(adres)).sort();
    expect(nadrzedne).toEqual(
      [
        ROUTES.DASHBOARD.hash,
        ROUTES.SLD.hash,
        ROUTES.SLD_VIEW.hash,
        ROUTES.FAULT_SCENARIOS.hash,
        ROUTES.ENM_INSPECTOR.hash,
      ].sort(),
    );
  });

  it('trasy wygaszone to dokładnie te, których dostawcą jest okno ui2', () => {
    const wygaszone = WSZYSTKIE_ADRESY.filter((adres) => wpisTrasyWygaszonej(adres) != null).sort();
    expect(wygaszone).toEqual(
      [
        ALIAS_ROUTES.POWER_FLOW_RESULTS,
        ALIAS_ROUTES.PROTECTION_RESULTS,
        ROUTES.CASE_CONFIG.hash,
        ROUTES.VARIANTS.hash,
      ].sort(),
    );
  });

  it('zakładkę warsztatu wyników niosą wyłącznie trasy wygaszone wyników', () => {
    expect(wpisTrasyWygaszonej(ALIAS_ROUTES.POWER_FLOW_RESULTS)?.zakladkaWynikow).toBe('rozplyw');
    expect(wpisTrasyWygaszonej(ALIAS_ROUTES.PROTECTION_RESULTS)?.zakladkaWynikow).toBe(
      'koordynacja',
    );
    expect(wpisTrasyWygaszonej(ROUTES.VARIANTS.hash)?.zakladkaWynikow).toBeUndefined();
  });
});
