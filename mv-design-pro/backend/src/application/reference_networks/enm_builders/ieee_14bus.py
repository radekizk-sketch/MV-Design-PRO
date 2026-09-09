"""IEEE case14 (MATPOWER, przez pandapower) jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: MATPOWER case14 (IEEE 14-bus), via pandapower 3.4.0 — patrz
`application/reference_networks/builders/ieee_14bus.py`.

Topologia: TRZY poziomy napięcia połączone pięcioma transformatorami z
zaczepem pozanominalnym (konwencja MATPOWER `ratio` na gałęzi = `tau` po
stronie HV — patrz `enm/kompilator_grafu.py::dodaj_transformator`,
`off_nominal_ratio`):

  * 135 kV: B0(slack)-B1-B2-B3-B4 (oczko, 7 odcinków: BR0-BR6).
  * B3 --TR BR15(tap 0,978)--> B6 (14 kV); B6 --TR BR18(tap nominalny)--> B7 (12 kV).
  * B3 --TR BR16(tap 0,969)--> B8 (0,208 kV); B4 --TR BR17(tap 0,932)--> B5 (0,208 kV);
    B6 --TR BR19(tap nominalny)--> B8 (ta sama szyna co BR16 — DRUGA droga
    zasilania B8, stąd `lv_bus_ref` jawne, nie nowa szyna).
  * 0,208 kV: B5,B8 (zasilone dwoma niezależnymi transformatorami) + B9-B13
    (oczko, 8 odcinków: BR7-BR14) — budowane RĘCZNIE (`kontynuuj_z_szyny`/
    `zamknij_pierscien`), bo ma DWA korzenie (B5 i B8), a `zbuduj_topologie`
    zakłada jeden korzeń GPZ.

K1.1: transformatory BR15/16/17/18/19 były w starym dialekcie zakodowane
jako `LineBranch` z opcjonalnym `ratio` (konwencja MATPOWER — brak osobnej
listy `transformers`) — tu jako realne `Transformer` (`add_transformer_sn_nn`
+ zaczep DETC), zgodnie z K1.1 (żadna fizyka zmiany napięcia poza
transformatorem).

ZNALEZISKO K1 (2026-09-06) — ROZWIĄZANE 2026-09-09 (odbiór K7, CI run 4923 na
`fc24fc76`). Rozpływ kanoniczny tego bliźniaka ROZBIEGAŁ (30 iteracji, |U| do
320 p.u.) i miał TRZY przyczyny, żadna w solverze FROZEN:
(1) katalog `mv_benchmark_catalog.py` stemplował 8 odcinków obszaru 0,208 kV
    (BR7–BR14) bazą impedancji SYSTEMU 135 kV zamiast bazą ich własnego poziomu —
    impedancja (135/0,208)² ≈ 4,2·10⁵ razy za duża (`_POZIOM_LINII_KV`, test klasy
    `tests/network_model/test_mv_benchmark_catalog_poziomy.py`);
(2) `Source` ENM nie miał napięcia zadanego szyny bilansującej — assembler wpisywał
    1,0 p.u. każdemu źródłu, a literatura ma 1,06 p.u. (`Source.u_set_pu`);
(3) granice mocy biernej ±150 Mvar (3× baza) wiązały na stanie przejściowym
    iteracji 3 (−152,3 Mvar) — po (1)+(2) nie wiążą (0 przełączeń, test klasy
    `tests/network_model/test_blizniaki_pf_zbieznosc.py`).
Po naprawie: 5 iteracji, |U| 1,010–1,090 p.u., zgodność z pandapower 3.5.4
`pn.case14()` co do 3·10⁻⁵ p.u. na wszystkich 14 szynach (wyrocznia
`tests/golden/wyrocznie/test_pandapower_blizniaki_matpower.py`, przypięte napięcia
`tests/network_model/test_blizniaki_matpower_napiecia.py`). Hipotezy K1 (a)/(b)
— rozpiętość poziomów napięć i syntetyczne uk% — okazały się fałszywe: poziomy
0,208/12/14/135 kV są danymi pandapower `case14` (`vn_kv`), a uk% 55,6 % to
poprawne przeniesienie x_pu = 0,556 na bazę 100 MVA (pandapower: vk 5506 % przy
sn 9900 MVA — ta sama wartość p.u.).

Granice Q z literatury (MATPOWER: −40/50, 0/40, −6/24, −6/24 Mvar) NIE są użyte
świadomie: solver FROZEN egzekwuje granice na KAŻDEJ iteracji (także na stanie
przejściowym z płaskiego startu) i nie przywraca węzła do PV — z granicami z
literatury przełącza 4 węzły w iteracjach 1–3, choć Q zbieżne każdego generatora
mieści się w granicach, i oddaje wynik o 0,022 p.u. gorszy od pandapower. To
znalezisko rdzenia (B-01) jest zgłoszone właścicielowi jako OD-11
(`docs/evidence/CONVERGENCE_EVIDENCE.md` §I); bliźniak używa granic
nieograniczających z konstrukcji (`mv_benchmark_catalog.py::_q_bound`).
"""

from __future__ import annotations

from enm.kompilator_grafu import (
    BenchmarkEnm,
    EdgeSpec,
    dodaj_bocznik,
    dodaj_generator_pv,
    dodaj_obciazenie,
    dodaj_transformator,
    dodaj_zrodlo_slack,
    kontynuuj_z_szyny,
    pusty_enm,
    zamknij_pierscien,
    zbuduj_topologie,
)

_EDGES_135KV = [
    EdgeSpec("BR0", "B0", "B1", "bench_ieee14bus_br0"),
    EdgeSpec("BR1", "B0", "B4", "bench_ieee14bus_br1"),
    EdgeSpec("BR2", "B1", "B2", "bench_ieee14bus_br2"),
    EdgeSpec("BR3", "B1", "B3", "bench_ieee14bus_br3"),
    EdgeSpec("BR4", "B1", "B4", "bench_ieee14bus_br4"),
    EdgeSpec("BR5", "B2", "B3", "bench_ieee14bus_br5"),
    EdgeSpec("BR6", "B3", "B4", "bench_ieee14bus_br6"),
]

_LOADS_MW_MVAR = {
    "B1": (21.7, 12.7),
    "B2": (94.2, 19.0),
    "B3": (47.8, -3.9),
    "B4": (7.6, 1.6),
    "B5": (11.2, 7.5),
    "B8": (29.5, 16.6),
    "B9": (9.0, 5.8),
    "B10": (3.5, 1.8),
    "B11": (6.1, 1.6),
    "B12": (13.5, 5.8),
    "B13": (14.9, 5.0),
}

_GENERATORS = {
    "B1": ("bench_ieee14bus_gen1", 40.0, 1.045),
    "B2": ("bench_ieee14bus_gen2", 0.0, 1.01),
    "B5": ("bench_ieee14bus_gen5", 0.0, 1.07),
    "B7": ("bench_ieee14bus_gen7", 0.0, 1.09),
}


def build_ieee_14bus_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="IEEE case14 (MATPOWER, via pandapower 3.4.0)", sn_nominal_kv=135.0)
    enm, bus_slack = dodaj_zrodlo_slack(
        enm,
        voltage_kv=135.0,
        sk3_mva=5000.0,
        rx_ratio=0.1,
        line_fields_count=2,
        source_name="External grid (slack)",
        u_set_pu=1.06,  # MATPOWER case14 bus 1 Vm (pandapower ext_grid.vm_pu)
    )

    enm, bus_map, branch_map = zbuduj_topologie(
        enm, slack_lit="B0", slack_ref=bus_slack, edges=_EDGES_135KV
    )

    # Pięć transformatorów — kolejność WYMUSZONA zależnościami (BR19 wymaga,
    # by B8 już istniało — utworzone przez BR16).
    enm, bus_b6 = dodaj_transformator(
        enm,
        hv_bus_ref=bus_map["B3"],
        catalog_ref="bench_ieee14bus_br15",
        lv_voltage_kv=14.0,
        off_nominal_ratio=0.978,
    )
    bus_map["B6"] = bus_b6
    enm, bus_b8 = dodaj_transformator(
        enm,
        hv_bus_ref=bus_map["B3"],
        catalog_ref="bench_ieee14bus_br16",
        lv_voltage_kv=0.208,
        off_nominal_ratio=0.969,
    )
    bus_map["B8"] = bus_b8
    enm, bus_b5 = dodaj_transformator(
        enm,
        hv_bus_ref=bus_map["B4"],
        catalog_ref="bench_ieee14bus_br17",
        lv_voltage_kv=0.208,
        off_nominal_ratio=0.932,
    )
    bus_map["B5"] = bus_b5
    enm, bus_b7 = dodaj_transformator(
        enm,
        hv_bus_ref=bus_map["B6"],
        catalog_ref="bench_ieee14bus_br18",
        lv_voltage_kv=12.0,
    )
    bus_map["B7"] = bus_b7
    # BR19: B6 -> B8 — B8 JUŻ ISTNIEJE (utworzone przez BR16) — druga,
    # równoległa droga zasilania (nie nowa szyna).
    enm, _bus_b8_again = dodaj_transformator(
        enm,
        hv_bus_ref=bus_map["B6"],
        catalog_ref="bench_ieee14bus_br19",
        lv_bus_ref=bus_map["B8"],
    )

    # 0,208 kV: oczko z DWOMA korzeniami (B5, B8) — ręcznie, bez zbuduj_topologie.
    enm, bus_b10 = kontynuuj_z_szyny(
        enm,
        from_bus_ref=bus_map["B5"],
        catalog_ref="bench_ieee14bus_br7",
        dlugosc_m=1000.0,
        name="BR7",
        bus_name="B10",
    )
    bus_map["B10"] = bus_b10
    enm, bus_b11 = kontynuuj_z_szyny(
        enm,
        from_bus_ref=bus_map["B5"],
        catalog_ref="bench_ieee14bus_br8",
        dlugosc_m=1000.0,
        name="BR8",
        bus_name="B11",
    )
    bus_map["B11"] = bus_b11
    enm, bus_b12 = kontynuuj_z_szyny(
        enm,
        from_bus_ref=bus_map["B5"],
        catalog_ref="bench_ieee14bus_br9",
        dlugosc_m=1000.0,
        name="BR9",
        bus_name="B12",
    )
    bus_map["B12"] = bus_b12
    enm, bus_b9 = kontynuuj_z_szyny(
        enm,
        from_bus_ref=bus_map["B8"],
        catalog_ref="bench_ieee14bus_br10",
        dlugosc_m=1000.0,
        name="BR10",
        bus_name="B9",
    )
    bus_map["B9"] = bus_b9
    enm, bus_b13 = kontynuuj_z_szyny(
        enm,
        from_bus_ref=bus_map["B8"],
        catalog_ref="bench_ieee14bus_br11",
        dlugosc_m=1000.0,
        name="BR11",
        bus_name="B13",
    )
    bus_map["B13"] = bus_b13
    enm = zamknij_pierscien(
        enm,
        from_bus_ref=bus_map["B9"],
        to_bus_ref=bus_map["B10"],
        catalog_ref="bench_ieee14bus_br12",
        dlugosc_m=1000.0,
        name="BR12",
    )
    enm = zamknij_pierscien(
        enm,
        from_bus_ref=bus_map["B11"],
        to_bus_ref=bus_map["B12"],
        catalog_ref="bench_ieee14bus_br13",
        dlugosc_m=1000.0,
        name="BR13",
    )
    enm = zamknij_pierscien(
        enm,
        from_bus_ref=bus_map["B12"],
        to_bus_ref=bus_map["B13"],
        catalog_ref="bench_ieee14bus_br14",
        dlugosc_m=1000.0,
        name="BR14",
    )

    for lit_id, (p_mw, q_mvar) in _LOADS_MW_MVAR.items():
        enm = dodaj_obciazenie(
            enm, bus_ref=bus_map[lit_id], p_mw=p_mw, q_mvar=q_mvar, name=f"LOAD-{lit_id}"
        )
    for lit_id, (catalog_ref, p_mw, v_set) in _GENERATORS.items():
        enm = dodaj_generator_pv(
            enm,
            bus_ref=bus_map[lit_id],
            p_mw=p_mw,
            u_set_pu=v_set,
            catalog_ref=catalog_ref,
            name=f"GEN-{lit_id}",
        )
    enm = dodaj_bocznik(enm, bus_ref=bus_map["B8"], catalog_ref="bench_ieee14bus_sh8", name="SH8")

    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
