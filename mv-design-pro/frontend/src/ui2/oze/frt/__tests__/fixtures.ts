/*
 * Fixtures okna „Walidacja modelu falownika" (trajektorie FRT, karta U4 P38).
 * Kształty 1:1 z serializacją `application/analyses/frt_trajektorie.py::
 * build_frt_trajectories_view` i `frt_sekwencja.py::build_frt_sekwencja_view` PO
 * uczciwości natychmiastowej (2026-09-23): każdy scenariusz, zapad i widok niesie
 * rekord kontraktu werdyktu (`ocena`, `OcenaKryterium` o statusie `NIE_OCENIONO`), dawne
 * pole werdyktu ma jedyną wartość „nie oceniono", a pola solvera (status, utrzymanie,
 * marginesy, odzysk) są materiałem audytowym pod nagłówkiem `sekcja_audytowa_pl`.
 * Obwiednia profilu to informacja o wymaganiu (`opis` z backendu), nigdy podstawa oceny.
 * Rekordy oceny pochodzą z `rekordyOceny.json` — WYGENEROWANE przez backend na tych
 * samych danych (`backend/tests/uczciwosc/generuj_fixtury_ocen_fe.py`, parytet pilnuje
 * `test_fixtury_ocen_fe.py`), nie składane ręcznie.
 * Katalog NC RfG (`operators[]`) jak w `pobierzKatalogNcRfg` (klient V2 `ui2/oze/ncrfg/api`).
 *
 * Liczby odwzorowują moduł PV 1 MW / 15 kV (conv-pv-1mw-15kv) i profil PSE: zapad do
 * 0,05 p.u. przez 0,15 s (początek zakłócenia 0,5 s); trajektoria skrócona do
 * reprezentatywnych punktów (pola 1:1 z solverem). Deterministyczne, bez losowości.
 */

import katalogNcRfg from '../../../../harness-fixtures/generated/ncrfg_katalog.json';
import type { RekordOcenyFrt, WidokSekwencjiFrt, WidokTrajektoriiFrt } from '../../api';
import type { KatalogNcRfg } from '../../ncrfg/typy';
import rekordyOceny from './rekordyOceny.json';

interface RekordyWidoku {
  readonly widok: RekordOcenyFrt;
  readonly scenariusze?: readonly RekordOcenyFrt[];
  readonly zapady?: readonly RekordOcenyFrt[];
}

/** Rekordy oceny wygenerowane przez backend (widok + scenariusze/zapady). */
export const REKORDY_OCENY_FRT = rekordyOceny as unknown as {
  readonly trajektoria_lvrt: RekordyWidoku;
  readonly trajektoria_hvrt: RekordyWidoku;
  readonly sekwencja_bez_kontekstu: RekordyWidoku;
  readonly sekwencja_z_kontekstem: RekordyWidoku;
};

function rekordScenariusza(rekordy: RekordyWidoku, indeks: number): RekordOcenyFrt {
  const lista = rekordy.scenariusze ?? rekordy.zapady ?? [];
  const rekord = lista[indeks];
  if (rekord === undefined) throw new Error(`brak rekordu oceny scenariusza ${indeks}`);
  return rekord;
}

/** Nagłówek sekcji audytowej pól solvera — 1:1 z `SEKCJA_AUDYTOWA_FRT_PL`. */
export const SEKCJA_AUDYTOWA_FRT =
  'Wynik uproszczonego solvera trajektorii — nie jest wynikiem inżynierskim (napięcie zadane '
  + 'profilem wejściowym, kryterium utrzymania wobec tego samego profilu)';

/** Opis obwiedni — 1:1 z `opis_obwiedni_wymaganej(rodzaj)`. */
function opisObwiedni(rodzaj: 'lvrt' | 'hvrt'): string {
  return (
    `Wymagana obwiednia ${rodzaj.toUpperCase()} profilu operatora (informacja): dozwolony `
    + 'przebieg napięcia (czas→napięcie) wg profilu NC RfG — nie jest podstawą oceny, bo '
    + 'trajektoria nie jest rozwiązaniem sieci.'
  );
}

/**
 * Katalog NC RfG policzony backendem (`GET /api/ncrfg-tests/catalog`, fikstura generowana
 * `ncrfg_katalog.json`) zawężony do dwóch operatorów w stałej kolejności (PSE, PGE) — okno
 * FRT czyta z niego wyłącznie listę operatorów, więc podzbiór jest 1:1 z kontraktem V2.
 */
export function katalogNcRfgFixture(): KatalogNcRfg {
  const katalog = katalogNcRfg as unknown as KatalogNcRfg;
  return {
    ...katalog,
    operators: ['pse', 'pge'].map((id) => {
      const operator = katalog.operators.find((o) => o.operator_id === id);
      if (!operator) throw new Error(`fikstura katalogu NC RfG: brak operatora ${id}`);
      return operator;
    }),
  };
}

/** Obwiednia LVRT profilu PSE (czas→napięcie, p.u.) — 1:1 z `pse.yaml`. */
function obwiedniaLvrtPse() {
  return {
    rodzaj: 'lvrt' as const,
    opis: opisObwiedni('lvrt'),
    punkty: [
      { czas_s: 0.0, napiecie_pu: 0.05 },
      { czas_s: 0.15, napiecie_pu: 0.05 },
      { czas_s: 0.7, napiecie_pu: 0.5 },
      { czas_s: 1.5, napiecie_pu: 0.85 },
      { czas_s: 3.0, napiecie_pu: 0.9 },
    ],
  };
}

/** Obwiednia HVRT profilu PSE (czas→napięcie, p.u.) — 1:1 z `pse.yaml`. */
function obwiedniaHvrtPse() {
  return {
    rodzaj: 'hvrt' as const,
    opis: opisObwiedni('hvrt'),
    punkty: [
      { czas_s: 0.0, napiecie_pu: 1.3 },
      { czas_s: 0.1, napiecie_pu: 1.25 },
      { czas_s: 0.5, napiecie_pu: 1.2 },
      { czas_s: 1.0, napiecie_pu: 1.15 },
      { czas_s: 60.0, napiecie_pu: 1.1 },
    ],
  };
}

/** Trajektoria LVRT reprezentatywna (pre-fault → zapad 0,05 → odzysk → post). */
function trajektoriaLvrtBazowa() {
  return [
    { czas_s: 0.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
    { czas_s: 0.3, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
    { czas_s: 0.5, napiecie_pu: 0.05, iq_bierny_pu: 0.153, p_czynna_pu: 0.95 },
    { czas_s: 0.6, napiecie_pu: 0.05, iq_bierny_pu: 0.982, p_czynna_pu: 0.104 },
    { czas_s: 0.65, napiecie_pu: 0.05, iq_bierny_pu: 1.0, p_czynna_pu: 0.05 },
    { czas_s: 0.7, napiecie_pu: 0.525, iq_bierny_pu: 0.612, p_czynna_pu: 0.352 },
    { czas_s: 0.75, napiecie_pu: 1.0, iq_bierny_pu: 0.048, p_czynna_pu: 0.601 },
    { czas_s: 1.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 0.907 },
    { czas_s: 1.5, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 0.982 },
    { czas_s: 2.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
  ];
}

/** Moduł DER (typ katalogowy) PV 1 MW / 15 kV — 1:1 z `ConverterType.to_dict`. */
function modulPv1Mw() {
  return {
    id: 'conv-pv-1mw-15kv',
    nazwa: 'Farma PV 1 MW / 15 kV',
    kind: 'PV',
    pmax_mw: 1.0,
    un_kv: 15.0,
  };
}

/** Operator PSE (nazwa PL). */
function operatorPse() {
  return { id: 'pse', nazwa: 'PSE — Polskie Sieci Elektroenergetyczne' };
}

/** Wywód scenariusza — 1:1 z `_wywod_scenariusza` (echo → charakter → ocena niewykonana). */
function wywodScenariusza(id: string, rodzaj: 'LVRT' | 'HVRT', napiecie: string, czas: string) {
  return [
    {
      tekst:
        `Scenariusz ${id} (${rodzaj}): napiecie zaklocenia ${napiecie} p.u. przez ${czas} s `
        + '(echo wejscia solvera prob FRT/HVRT).',
      latex: null,
    },
    {
      tekst:
        'Trajektoria: napiecie zadane profilem wejsciowym scenariusza (nie rozwiazanie sieci); '
        + 'prad bierny i moc czynna z odpowiedzi inercyjnej uproszczonego modelu.',
      latex: null,
    },
    {
      tekst:
        'Ocena niewykonana: trajektoria obecnego solvera nie jest rozwiązaniem sieci — napięcie '
        + 'jest zadane profilem wejściowym scenariusza, a kryterium v > 0,05 p.u. liczone wobec '
        + 'tego samego profilu jest tautologią (sonda audytu 2026-09-23: zapad do 0,06 p.u. '
        + 'trwający 3 s był uznawany za dotrzymanie obwiedni).',
      latex: null,
    },
  ];
}

/**
 * Widok LVRT: solver meldował utrzymanie pracy i margines 0,0 p.u. (materiał audytowy),
 * odzysk P po 0,31 s — ocena niewykonana.
 */
export function widokLvrtFixture(): WidokTrajektoriiFrt {
  const trajektoria = trajektoriaLvrtBazowa();
  return {
    modul_der: modulPv1Mw(),
    operator: operatorPse(),
    test_kind: 'lvrt',
    status_solvera: 'ok',
    ocena: REKORDY_OCENY_FRT.trajektoria_lvrt.widok,
    sekcja_audytowa_pl: SEKCJA_AUDYTOWA_FRT,
    obwiednia_profilu: obwiedniaLvrtPse(),
    scenariusze: [
      {
        scenario_id: 'lvrt_conv-pv-1mw-15kv',
        // Nazwa w brzmieniu `nazwa_scenariusza_pl` backendu (`frt_trajektorie.py`,
        // karta #145) dla parametrów tej fikstury: 0,05 p.u. przez 0,15 s.
        nazwa_pl: 'Zapad napięcia (LVRT) do 0,0500 p.u. przez 0,1500 s',
        status: 'ok',
        stayed_connected: true,
        margin_to_curve_s: null,
        margin_to_curve_pu: 0.0,
        p_recovery_time_s: 0.31,
        werdykt_pl: 'nie oceniono',
        ocena: rekordScenariusza(REKORDY_OCENY_FRT.trajektoria_lvrt, 0),
        liczba_punktow_trajektorii: trajektoria.length,
        wywod: wywodScenariusza('lvrt_conv-pv-1mw-15kv', 'LVRT', '0.0500', '0.1500'),
        trajektoria,
      },
    ],
  };
}

/**
 * Widok LVRT, w którym solver meldował odłączenie modułu (`stayed_connected=false`,
 * status der_dropped) — to też tylko materiał audytowy; ocena niewykonana.
 */
export function widokModulOdlaczonyFixture(): WidokTrajektoriiFrt {
  const trajektoria = trajektoriaLvrtBazowa().map((pt) =>
    pt.czas_s >= 0.5 && pt.czas_s <= 0.65 ? { ...pt, napiecie_pu: 0.0, p_czynna_pu: 0.0 } : pt,
  );
  return {
    modul_der: modulPv1Mw(),
    operator: operatorPse(),
    test_kind: 'lvrt',
    status_solvera: 'der_dropped',
    ocena: REKORDY_OCENY_FRT.trajektoria_lvrt.widok,
    sekcja_audytowa_pl: SEKCJA_AUDYTOWA_FRT,
    obwiednia_profilu: obwiedniaLvrtPse(),
    scenariusze: [
      {
        scenario_id: 'lvrt_conv-pv-1mw-15kv',
        // Nazwa w brzmieniu `nazwa_scenariusza_pl` backendu (`frt_trajektorie.py`,
        // karta #145) dla parametrów tej fikstury: 0,05 p.u. przez 0,15 s.
        nazwa_pl: 'Zapad napięcia (LVRT) do 0,0500 p.u. przez 0,1500 s',
        status: 'der_dropped',
        stayed_connected: false,
        margin_to_curve_s: null,
        margin_to_curve_pu: -0.05,
        p_recovery_time_s: null,
        werdykt_pl: 'nie oceniono',
        ocena: rekordScenariusza(REKORDY_OCENY_FRT.trajektoria_lvrt, 0),
        liczba_punktow_trajektorii: trajektoria.length,
        trajektoria,
      },
    ],
  };
}

/**
 * Karta S-4 (W6-0): status solvera `no_module` zmapowany NA GRANICY na
 * `blocked` — widok bez `obwiednia_profilu`/`ocena_dowodowa`, z nazwanym
 * kodem gotowości i brakami (1:1 z `_widok_bez_modelu_dynamicznego`).
 */
export function widokBrakModeluFixture(): WidokTrajektoriiFrt {
  return {
    modul_der: modulPv1Mw(),
    operator: operatorPse(),
    test_kind: 'lvrt',
    status_solvera: 'blocked',
    kod_gotowosci: 'der.dynamic_profile_missing',
    missing_fields_pl: ['Brak modelu dynamicznego DER w wejściu solvera.'],
    scenariusze: [],
  };
}

/** Widok HVRT: wzrost napięcia do 1,30 p.u.; ocena niewykonana. */
export function widokHvrtFixture(): WidokTrajektoriiFrt {
  const trajektoria = [
    { czas_s: 0.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
    { czas_s: 0.5, napiecie_pu: 1.3, iq_bierny_pu: -0.6, p_czynna_pu: 0.95 },
    { czas_s: 0.6, napiecie_pu: 1.3, iq_bierny_pu: -0.6, p_czynna_pu: 0.9 },
    { czas_s: 0.7, napiecie_pu: 1.15, iq_bierny_pu: -0.3, p_czynna_pu: 0.95 },
    { czas_s: 1.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
  ];
  return {
    modul_der: modulPv1Mw(),
    operator: operatorPse(),
    test_kind: 'hvrt',
    status_solvera: 'ok',
    ocena: REKORDY_OCENY_FRT.trajektoria_hvrt.widok,
    sekcja_audytowa_pl: SEKCJA_AUDYTOWA_FRT,
    obwiednia_profilu: obwiedniaHvrtPse(),
    scenariusze: [
      {
        scenario_id: 'hvrt_conv-pv-1mw-15kv',
        // Nazwa w brzmieniu `nazwa_scenariusza_pl` backendu dla parametrów tej fikstury:
        // 1,30 p.u. przez 0,1 s (plateau trajektorii 0,5–0,6 s).
        nazwa_pl: 'Wzrost napięcia (HVRT) do 1,3000 p.u. przez 0,1000 s',
        status: 'ok',
        stayed_connected: true,
        margin_to_curve_s: null,
        margin_to_curve_pu: 0.0,
        p_recovery_time_s: 0.2,
        werdykt_pl: 'nie oceniono',
        ocena: rekordScenariusza(REKORDY_OCENY_FRT.trajektoria_hvrt, 0),
        liczba_punktow_trajektorii: trajektoria.length,
        trajektoria,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Sekwencja zapadów — kształty 1:1 z `build_frt_sekwencja_view`
// ---------------------------------------------------------------------------

/** Wejście solvera pojedynczego zapadu (ślad WHITE BOX). */
function wejscieSekwencji(depth: number, czas: number) {
  return {
    test_kind: 'lvrt',
    voltage_dip_depth_pu: depth,
    fault_duration_s: czas,
    target_der_ref: 'conv-pv-1mw-15kv',
  };
}

/** Założenia sekwencji — 1:1 z `_ZALOZENIA_PL` backendu. */
const ZALOZENIA_SEKWENCJI =
  'Stan modułu MIĘDZY zapadami (nagrzewanie, niepełny odzysk) nie jest modelowany: każdy '
  + 'zapad liczony od stanu ustalonego. Trajektoria każdego zapadu jest zadana profilem '
  + 'wejściowym, więc ani zapad, ani sekwencja nie są oceniane.';

/** Sekwencja dwóch zapadów bez kontekstu siły sieci (powód PL uczciwie podany). */
export function widokSekwencjiFixture(): WidokSekwencjiFrt {
  return {
    modul_der: modulPv1Mw(),
    operator: operatorPse(),
    status_solvera: 'ok',
    ocena: REKORDY_OCENY_FRT.sekwencja_bez_kontekstu.widok,
    sekcja_audytowa_pl: SEKCJA_AUDYTOWA_FRT,
    obwiednia_profilu: obwiedniaLvrtPse(),
    liczba_zapadow: 2,
    zapady: [
      {
        scenario_id: 'zapad_1',
        glebokosc_pu: 0.05,
        czas_s: 0.15,
        status: 'ok',
        stayed_connected: true,
        margin_to_curve_pu: 0.0,
        margin_to_curve_s: null,
        p_recovery_time_s: 0.31,
        werdykt_pl: 'nie oceniono',
        ocena: rekordScenariusza(REKORDY_OCENY_FRT.sekwencja_bez_kontekstu, 0),
        wejscie_solvera: wejscieSekwencji(0.05, 0.15),
      },
      {
        scenario_id: 'zapad_2',
        glebokosc_pu: 0.3,
        czas_s: 0.2,
        status: 'ok',
        stayed_connected: true,
        margin_to_curve_pu: 0.05,
        margin_to_curve_s: null,
        p_recovery_time_s: 0.28,
        werdykt_pl: 'nie oceniono',
        ocena: rekordScenariusza(REKORDY_OCENY_FRT.sekwencja_bez_kontekstu, 1),
        wejscie_solvera: wejscieSekwencji(0.3, 0.2),
      },
    ],
    werdykt_sekwencji_pl: 'nie oceniono',
    zalozenia_pl: ZALOZENIA_SEKWENCJI,
    kontekst_sily_sieci: null,
    kontekst_sily_sieci_powod_pl:
      'Nie wskazano przebiegu zwarciowego (run_id) ani węzła przyłączenia (bus_ref); '
      + 'kontekst siły sieci (SCR/WSCR) pominięty.',
    input_hash: 'seq-hash-bez-kontekstu',
  };
}

/**
 * Sekwencja, w której solver meldował odłączenie modułu w drugim zapadzie (materiał
 * audytowy), z kontekstem siły sieci (wiersz SCR/WSCR z widoku D1).
 */
export function widokSekwencjiZKontekstemFixture(): WidokSekwencjiFrt {
  return {
    modul_der: modulPv1Mw(),
    operator: operatorPse(),
    status_solvera: 'der_dropped',
    ocena: REKORDY_OCENY_FRT.sekwencja_z_kontekstem.widok,
    sekcja_audytowa_pl: SEKCJA_AUDYTOWA_FRT,
    obwiednia_profilu: obwiedniaLvrtPse(),
    liczba_zapadow: 2,
    zapady: [
      {
        scenario_id: 'zapad_1',
        glebokosc_pu: 0.05,
        czas_s: 0.15,
        status: 'ok',
        stayed_connected: true,
        margin_to_curve_pu: 0.0,
        margin_to_curve_s: null,
        p_recovery_time_s: 0.31,
        werdykt_pl: 'nie oceniono',
        ocena: rekordScenariusza(REKORDY_OCENY_FRT.sekwencja_z_kontekstem, 0),
        wejscie_solvera: wejscieSekwencji(0.05, 0.15),
      },
      {
        scenario_id: 'zapad_2',
        glebokosc_pu: 0.02,
        czas_s: 0.5,
        status: 'der_dropped',
        stayed_connected: false,
        margin_to_curve_pu: -0.05,
        margin_to_curve_s: null,
        p_recovery_time_s: null,
        werdykt_pl: 'nie oceniono',
        ocena: rekordScenariusza(REKORDY_OCENY_FRT.sekwencja_z_kontekstem, 1),
        wejscie_solvera: wejscieSekwencji(0.02, 0.5),
      },
    ],
    werdykt_sekwencji_pl: 'nie oceniono',
    zalozenia_pl: ZALOZENIA_SEKWENCJI,
    kontekst_sily_sieci: {
      bus_ref: 'bus-oze-1',
      nominal_kv: 15.0,
      s_sc_mva: 45.0,
      s_installed_mva: 20.0,
      scr: 2.25,
      verdict: 'sieć słaba',
      is_weak: true,
      why_pl: 'SCR = 2,25 poniżej progu sieci słabej (3,0).',
      missing_data: [],
      // Kroki śladu 1:1 z backendem (widok siły sieci D1): zapis symboliczny
      // ASCII + podstawienie i wynik zbudowane po stronie backendu.
      white_box: [
        {
          symbol: 'SCR',
          formula_latex: 'SCR = S_sc / S_n',
          substitution_pl: 'SCR = 45,0 / 20,0',
          result_pl: 'SCR = 2,25',
        },
      ],
      modules: [{ ref: 'gen-oze-1', name: 'Farma wiatrowa 1', sn_mva: 20.0 }],
    },
    kontekst_sily_sieci_powod_pl: null,
    input_hash: 'seq-hash-z-kontekstem',
  };
}
