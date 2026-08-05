import { describe, it, expect } from 'vitest';
import {
  celDlaKodu,
  grupujProblemyWgCelu,
  wagaZSeverity,
  naProblemGotowosci,
  KOLEJNOSC_CELOW,
} from '../grupowanieCelow';
import { problemyWszystkieCele, readinessIssue } from './fixtures';

describe('celDlaKodu — mapowanie realnych kodów gotowości', () => {
  it('source.* -> zwarcia (SOURCES, canonical_operations.py:481-516)', () => {
    expect(celDlaKodu('source.grid_supply_missing')).toBe('zwarcia');
    expect(celDlaKodu('source.voltage_invalid')).toBe('zwarcia');
  });

  it('sources.no_short_circuit_params -> zwarcia (enm/validator.py:287)', () => {
    expect(celDlaKodu('sources.no_short_circuit_params')).toBe('zwarcia');
  });

  it('station.* -> stacje (STATIONS, poza get_blockers_for_analysis)', () => {
    expect(celDlaKodu('station.voltage_missing')).toBe('stacje');
    expect(celDlaKodu('station.required_field_missing')).toBe('stacje');
  });

  it('catalog.* / trunk.* -> wspolne (CATALOGS/TOPOLOGY, wymóg wspólny)', () => {
    expect(celDlaKodu('catalog.binding_missing')).toBe('wspolne');
    expect(celDlaKodu('trunk.segment_missing')).toBe('wspolne');
    expect(celDlaKodu('ring.nop_required')).toBe('wspolne');
  });

  it('oze.* / generator.* -> rozplyw (GENERATORS, wyłącznie LOAD_FLOW)', () => {
    expect(celDlaKodu('oze.transformer_required')).toBe('rozplyw');
    expect(celDlaKodu('generator.connection_variant_missing')).toBe('rozplyw');
    expect(celDlaKodu('pv_bess.transformer_required')).toBe('rozplyw');
  });

  it('protection.* / relay.* / tcc.* -> zabezpieczenia (PROTECTION)', () => {
    expect(celDlaKodu('protection.ct_required')).toBe('zabezpieczenia');
    expect(celDlaKodu('relay.ct_missing')).toBe('zabezpieczenia');
    expect(celDlaKodu('tcc.relay_missing')).toBe('zabezpieczenia');
  });

  it('wyjątek kodu dokładnego: oze.card_field_not_accepted -> wniosekOsd (nadpisuje prefiks oze->rozplyw)', () => {
    expect(celDlaKodu('oze.card_field_not_accepted')).toBe('wniosekOsd');
  });

  it('certyfikat PTPiREE przetwornicy DER -> wniosekOsd (wpis dokładny)', () => {
    // Skutkiem braku (albo warunkowego) powiązania certyfikatu jest ryzyko
    // odrzucenia WNIOSKU przez OSD, nie błąd rozpływu — mimo obszaru GENERATORS
    // w kanonicznym rejestrze. Ta sama droga, co `oze.card_field_not_accepted`.
    expect(celDlaKodu('der.inverter_certificate_unlinked')).toBe('wniosekOsd');
    expect(celDlaKodu('der.inverter_certificate_conditional')).toBe('wniosekOsd');
  });

  it('nieznany kod przestrzeni der.* -> Pozostałe (prefiks der NIE ma fallbacku)', () => {
    // Kody kreatora DER (`der.station_not_found` itd.) należą do kanału BŁĘDU
    // OPERACJI, nie do toru gotowości — mapa celów nie ma prawa udawać, że je
    // rozpoznaje. Wpis dokładny jest jedyną drogą do celu.
    expect(celDlaKodu('der.station_not_found')).toBe('pozostale');
  });

  it('kod bez kropki (brak przestrzeni nazw) -> Pozostałe, bez zgadywania', () => {
    expect(celDlaKodu('E010')).toBe('pozostale');
    expect(celDlaKodu('W001')).toBe('pozostale');
  });

  it('nieznany prefiks -> Pozostałe (bez zgadywania)', () => {
    expect(celDlaKodu('nieznany_prefiks.jakis_kod')).toBe('pozostale');
  });

  it('nn.* mapowany WYŁĄCZNIE kodem dokładnym (prefiks rozdzielony na obszary)', () => {
    expect(celDlaKodu('nn.bus_missing')).toBe('stacje');
    expect(celDlaKodu('nn.cable_catalog_missing')).toBe('wspolne');
    expect(celDlaKodu('nn.nieznany_kod')).toBe('pozostale');
  });

  it('transformer.* mapowany WYŁĄCZNIE kodem dokładnym (prefiks rozdzielony na obszary)', () => {
    expect(celDlaKodu('transformer.catalog_missing')).toBe('wspolne');
    expect(celDlaKodu('transformer.connection_missing')).toBe('stacje');
    expect(celDlaKodu('transformer.hv_invalid')).toBe('pozostale');
  });

  // Karta W4 (dług nazwany w V12K-317 poz. 8). Kody bram katalogowych trafiały
  // do „Wspólne" wyłącznie fallbackiem prefiksu — czyli były grupowane, ale
  // NIEROZPOZNANE: bez wpisu w kanonicznym rejestrze projektant nie dostawał
  // ani zdania po polsku, ani nawigacji naprawczej. Kompletność zbioru pilnuje
  // test klasy backendu (skan AST kodu bram czytający rejestr i tę mapę);
  // tutaj sprawdzamy SKUTEK dla projektanta: kod bramy ląduje we właściwym celu.
  it('kody bram katalogowych -> wspolne (karta W4, wpis dokładny w rejestrze)', () => {
    for (const kod of [
      'catalog.item_not_found',
      'catalog.ref_missing',
      'catalog.item_missing',
      'catalog.item_id_missing',
      'catalog.binding_required',
      'catalog.binding_invalid',
      'catalog.namespace_missing',
      'catalog.namespace_required',
      'catalog.unknown_namespace',
      'catalog.namespace_mismatch',
      'catalog.element_missing',
      'catalog.element_not_found',
      'catalog.clear_forbidden',
      'catalog.materialization_required',
      'catalog.materialization_incomplete',
      'catalog.nameplate_mismatch',
      'catalog.gate_result_mismatch',
    ]) {
      expect(celDlaKodu(kod)).toBe('wspolne');
    }
  });
});

describe('wagaZSeverity', () => {
  it('BLOCKER -> BLOKADA', () => {
    expect(wagaZSeverity('BLOCKER')).toBe('BLOKADA');
  });
  it('IMPORTANT -> OSTRZEZENIE', () => {
    expect(wagaZSeverity('IMPORTANT')).toBe('OSTRZEZENIE');
  });
  it('INFO -> OSTRZEZENIE (karta §3: wyłącznie dwie wagi w UI)', () => {
    expect(wagaZSeverity('INFO')).toBe('OSTRZEZENIE');
  });
});

describe('naProblemGotowosci — projekcja pojedynczego problemu', () => {
  it('przenosi code/elementRef/opisPl/fixAction i wyznacza wagę + cel', () => {
    const issue = readinessIssue({
      code: 'protection.ct_required',
      severity: 'IMPORTANT',
      element_ref: 'REL-9',
      message_pl: 'Przekaźnik wymaga CT.',
      fix_action: { action_type: 'OPEN_MODAL', element_ref: 'REL-9', payload_hint: null },
    });
    const problem = naProblemGotowosci(issue);
    expect(problem).toMatchObject({
      code: 'protection.ct_required',
      waga: 'OSTRZEZENIE',
      elementRef: 'REL-9',
      opisPl: 'Przekaźnik wymaga CT.',
      cel: 'zabezpieczenia',
    });
    expect(problem.fixAction).toEqual(issue.fix_action);
  });

  it('elementRef spada na element_refs[0], gdy element_ref jest null', () => {
    const issue = readinessIssue({ element_ref: null, element_refs: ['ST-7'] });
    expect(naProblemGotowosci(issue).elementRef).toBe('ST-7');
  });
});

describe('grupujProblemyWgCelu — grupowanie + postęp', () => {
  it('grupuje problemy z fixture obejmującej wszystkie cele', () => {
    const grupy = grupujProblemyWgCelu(problemyWszystkieCele());
    const cele = grupy.map((g) => g.cel);
    expect(cele).toEqual(
      expect.arrayContaining(['zwarcia', 'stacje', 'wspolne', 'rozplyw', 'zabezpieczenia', 'wniosekOsd', 'pozostale']),
    );
  });

  it('kolejność grup zgodna z KOLEJNOSC_CELOW, tylko grupy niepuste', () => {
    const grupy = grupujProblemyWgCelu(problemyWszystkieCele());
    const kolejnoscOczekiwana = KOLEJNOSC_CELOW.filter((c) => grupy.some((g) => g.cel === c));
    expect(grupy.map((g) => g.cel)).toEqual(kolejnoscOczekiwana);
  });

  it('liczy blokady/ostrzeżenia poprawnie per grupa', () => {
    const grupy = grupujProblemyWgCelu([
      readinessIssue({ code: 'protection.ct_required', severity: 'BLOCKER', element_ref: 'R1' }),
      readinessIssue({ code: 'protection.vt_required', severity: 'IMPORTANT', element_ref: 'R2' }),
      readinessIssue({ code: 'protection.settings_incomplete', severity: 'IMPORTANT', element_ref: 'R3' }),
    ]);
    const zabezp = grupy.find((g) => g.cel === 'zabezpieczenia')!;
    expect(zabezp.blokady).toBe(1);
    expect(zabezp.ostrzezenia).toBe(2);
    expect(zabezp.problemy).toHaveLength(3);
  });

  it('postępProcent = 100, gdy brak blokad w grupie', () => {
    const grupy = grupujProblemyWgCelu([
      readinessIssue({ code: 'protection.vt_required', severity: 'IMPORTANT', element_ref: 'R2' }),
    ]);
    expect(grupy.find((g) => g.cel === 'zabezpieczenia')!.postepProcent).toBe(100);
  });

  it('postępProcent proporcjonalny do udziału ostrzeżeń, gdy są blokady', () => {
    const grupy = grupujProblemyWgCelu([
      readinessIssue({ code: 'protection.ct_required', severity: 'BLOCKER', element_ref: 'R1' }),
      readinessIssue({ code: 'protection.vt_required', severity: 'IMPORTANT', element_ref: 'R2' }),
      readinessIssue({ code: 'protection.settings_incomplete', severity: 'IMPORTANT', element_ref: 'R3' }),
      readinessIssue({ code: 'protection.settings_incomplete', severity: 'IMPORTANT', element_ref: 'R4' }),
    ]);
    // 1 blokada, 3 ostrzeżenia -> 75%
    expect(grupy.find((g) => g.cel === 'zabezpieczenia')!.postepProcent).toBe(75);
  });

  it('pusta lista wejściowa -> brak grup', () => {
    expect(grupujProblemyWgCelu([])).toEqual([]);
  });

  it('wynik nie zależy od kolejności wejścia (determinizm)', () => {
    const problemy = problemyWszystkieCele();
    const odwrocone = [...problemy].reverse();
    const a = grupujProblemyWgCelu(problemy).map((g) => [g.cel, g.blokady, g.ostrzezenia]);
    const b = grupujProblemyWgCelu(odwrocone).map((g) => [g.cel, g.blokady, g.ostrzezenia]);
    expect(a).toEqual(b);
  });
});
