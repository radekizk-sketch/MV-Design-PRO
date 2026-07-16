/*
 * Fixtures okna „Walidacja modelu falownika" (trajektorie FRT, karta U4 P38).
 * Kształty 1:1 z serializacją `application/analyses/frt_trajektorie.py::
 * build_frt_trajectories_view`: `modul_der` (ConverterType), `operator` (profil
 * NC RfG), `obwiednia_profilu` (NcRfgRideThroughPoint z profilu PSE), `scenariusze`
 * (FrtScenarioResult + werdykt PL z pól solvera). Katalog NC RfG (`operators[]`)
 * jak w `pobierzKatalogKlasNcRfg`. Deterministyczne, bez losowości.
 *
 * Liczby odwzorowują moduł PV 1 MW / 15 kV (conv-pv-1mw-15kv) testowany profilem
 * PSE: LVRT zapad do 0,05 p.u. przez 0,15 s (fault_start 0,5 s), odzysk P po
 * zakłóceniu; trajektoria skrócona do reprezentatywnych punktów (pola 1:1 z solverem).
 */

import type { OdpowiedzKatalogNcRfg, WidokTrajektoriiFrt } from '../../api';

/** Katalog NC RfG: dwóch operatorów (progi klas nieistotne dla okna FRT). */
export function katalogNcRfgFixture(): OdpowiedzKatalogNcRfg {
  return {
    operators: [
      {
        operator_id: 'pse',
        operator_name_pl: 'PSE — Polskie Sieci Elektroenergetyczne',
        module_types: [],
      },
      {
        operator_id: 'pge',
        operator_name_pl: 'PGE Dystrybucja',
        module_types: [],
      },
    ],
  };
}

/** Obwiednia LVRT profilu PSE (czas→napięcie, p.u.) — 1:1 z `pse.yaml`. */
function obwiedniaLvrtPse() {
  return {
    rodzaj: 'lvrt' as const,
    opis:
      'Krzywa LVRT operatora: dozwolony przebieg napięcia (czas→napięcie) wg profilu NC RfG.',
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
    opis:
      'Krzywa HVRT operatora: dozwolony przebieg napięcia (czas→napięcie) wg profilu NC RfG.',
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

/**
 * Widok LVRT „w obwiedni": moduł utrzymał pracę, margines do krzywej 0,0 p.u.
 * (napięcie zrównane z dolną krzywą), odzysk P po 0,31 s — werdykt „w obwiedni".
 */
export function widokLvrtWObwiedniFixture(): WidokTrajektoriiFrt {
  const trajektoria = trajektoriaLvrtBazowa();
  return {
    modul_der: modulPv1Mw(),
    operator: operatorPse(),
    test_kind: 'lvrt',
    status_solvera: 'ok',
    obwiednia_profilu: obwiedniaLvrtPse(),
    scenariusze: [
      {
        scenario_id: 'lvrt_conv-pv-1mw-15kv',
        status: 'ok',
        stayed_connected: true,
        margin_to_curve_s: null,
        margin_to_curve_pu: 0.0,
        p_recovery_time_s: 0.31,
        werdykt_pl: 'w obwiedni',
        liczba_punktow_trajektorii: trajektoria.length,
        trajektoria,
      },
    ],
  };
}

/**
 * Widok LVRT „poza obwiednią": moduł utrzymał pracę, ale trajektoria zeszła
 * pod krzywą profilu (margines −0,020 p.u.) — werdykt „poza obwiednią".
 */
export function widokPozaObwiedniaFixture(): WidokTrajektoriiFrt {
  const trajektoria = trajektoriaLvrtBazowa().map((pt) =>
    pt.czas_s === 0.6 || pt.czas_s === 0.65
      ? { ...pt, napiecie_pu: 0.03 }
      : pt,
  );
  return {
    modul_der: modulPv1Mw(),
    operator: operatorPse(),
    test_kind: 'lvrt',
    status_solvera: 'ok',
    obwiednia_profilu: obwiedniaLvrtPse(),
    scenariusze: [
      {
        scenario_id: 'lvrt_conv-pv-1mw-15kv',
        status: 'ok',
        stayed_connected: true,
        margin_to_curve_s: null,
        margin_to_curve_pu: -0.02,
        p_recovery_time_s: 0.31,
        werdykt_pl: 'poza obwiednią',
        liczba_punktow_trajektorii: trajektoria.length,
        trajektoria,
      },
    ],
  };
}

/**
 * Widok LVRT „moduł wypadł": napięcie spadło poniżej progu utrzymania, moduł
 * wypadł z synchronizacji (`stayed_connected=false`, status der_dropped).
 */
export function widokModulWypadlFixture(): WidokTrajektoriiFrt {
  const trajektoria = trajektoriaLvrtBazowa().map((pt) =>
    pt.czas_s >= 0.5 && pt.czas_s <= 0.65
      ? { ...pt, napiecie_pu: 0.0, p_czynna_pu: 0.0 }
      : pt,
  );
  return {
    modul_der: modulPv1Mw(),
    operator: operatorPse(),
    test_kind: 'lvrt',
    status_solvera: 'der_dropped',
    obwiednia_profilu: obwiedniaLvrtPse(),
    scenariusze: [
      {
        scenario_id: 'lvrt_conv-pv-1mw-15kv',
        status: 'der_dropped',
        stayed_connected: false,
        margin_to_curve_s: null,
        margin_to_curve_pu: -0.05,
        p_recovery_time_s: null,
        werdykt_pl: 'moduł wypadł',
        liczba_punktow_trajektorii: trajektoria.length,
        trajektoria,
      },
    ],
  };
}

/** Widok HVRT „w obwiedni": wzrost napięcia do 1,30 p.u.; moduł utrzymał pracę. */
export function widokHvrtWObwiedniFixture(): WidokTrajektoriiFrt {
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
    obwiednia_profilu: obwiedniaHvrtPse(),
    scenariusze: [
      {
        scenario_id: 'hvrt_conv-pv-1mw-15kv',
        status: 'ok',
        stayed_connected: true,
        margin_to_curve_s: null,
        margin_to_curve_pu: 0.0,
        p_recovery_time_s: 0.2,
        werdykt_pl: 'w obwiedni',
        liczba_punktow_trajektorii: trajektoria.length,
        trajektoria,
      },
    ],
  };
}
