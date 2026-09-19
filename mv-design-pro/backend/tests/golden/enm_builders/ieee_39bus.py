"""IEEE case39 (MATPOWER, przez pandapower) jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: MATPOWER case39 (New England 39-bus); dawny dialekt słownikowy
`builders/ieee_39bus.py` usunięty kartą K2.

Topologia: JEDEN poziom napięcia (345 kV) — w odróżnieniu od ieee_14bus,
gałęzie BR35-45 (`ratio`≠1) NIE zmieniają napięcia znamionowego (hv_kv=
lv_kv=345 kV), to transformatory blokowe/regulacyjne w tej samej sieci
przesyłowej. Szyna bilansująca B30 wchodzi do sieci WYŁĄCZNIE przez
transformator BR36 (nie pole liniowe GPZ) — stąd `rozbuduj_z_dowolnej_szyny`
(`enm/kompilator_grafu.py`, nowa zdolność tej karty), nie `zbuduj_topologie` (zakłada
korzeń = pole GPZ). Główna siatka (35 linii BR0-BR34) ma DWA fragmenty poza
głównym komponentem liniowym: B11 (osiągalna WYŁĄCZNIE przez transformatory
BR38/BR39, żadna linia jej nie dotyka) i siedem szyn generatorowych
(B29,B31-34,B36,B37 — przez transformatory blokowe BR35/37/41/42/43/44/45;
B35/B38 WCHODZĄ do głównej siatki wprost liniami BR29/BR1/BR14, bez
transformatora).

STATUS (zmierzony, CV-4.3 K1, 2026-09-06). Kanoniczny PF
(`enm/assembler.py` -> FROZEN `power_flow_newton`) ZBIEGA CZYSTO
(`quality_status: accepted`, profil napięć fizyczny 0,957-1,064 pu) — to
PO naprawie defektu katalogowego `vector_group=None` -> domyślne "Dyn11"
w `enm/mapping.py` (+30° na wszystkich 11 transformatorach tej sieci,
naprawione na "Yy0" w `mv_benchmark_catalog.py`; przed naprawą stan tej
sieci był NIEPRZETESTOWANY po naprawie kolizji seedów `add_transformer_sn_nn`
— nie ma zapisu potwierdzonej katastroficznej rozbieżności jak ieee_14bus).
Wyrocznia (a) `expected/ieee_39bus.json` jest PRAWDZIWYM, NIEZALEŻNYM
pandapower/MATPOWER case39 (plik sprzed tej karty, NIEDOTKNIĘTY,
`source: "MATPOWER case39 via pandapower 3.4.0"`) — 53 z 78 porównań
|V|/kąt w tolerancji zadeklarowanej w pliku; pozostałe ~2-4% zaniżenia
napięcia na szynach odbiorczych zdalnych od szyny bilansującej B30 (kąty
też nieco bardziej ujemne — więcej realnego przepływu mocy niż w
referencji). DWIE hipotezy SPRAWDZONE i WYKLUCZONE dowodem numerycznym
(nie domysłem):
  (1) susceptancja linii (`b_us_per_km`) — wszystkie 35 linii zweryfikowane
      PO `branch_id` (jednoznaczna identyfikacja, NIE po parze (r_pu,x_pu) —
      BR1/BR14 i BR11/BR24 mają identyczne r_pu/x_pu przy różnym b_pu, co
      dało fałszywie dodatni sygnał przy pierwszym, mniej precyzyjnym
      dopasowaniu) bajt-w-bajt zgodne z `b_pu` z MATPOWER case39.
  (2) granice mocy biernej generatorów PV — `_q_bound()` w
      `mv_benchmark_catalog.py` jest CELOWO szeroka/nie wiążąca
      (`max(abs(p_mw),1,0.5*base_mva)*3`, komentarz: zgodność z wyrocznią
      "własny NR", która w ogóle nie sprawdza granic Q) — potwierdzone, że
      żaden generator nie osiąga granicy przy tym rozpływie.
Przyczyna resztkowej luki NIE zdiagnozowana ostatecznie w tej sesji (Zero-Debt
pkt 4 — dalsza diagnoza wymagałaby albo surowej tabeli gałęzi MATPOWER
case39.m (kierunek fbus/tbus dla `ratio` transformatorów blokowych, do
potwierdzenia strony HV/LV konwencji `off_nominal_ratio` per transformator),
albo bilansu mocy czynnej generacja-vs-obciążenie-vs-straty per szyna — poza
zasięgiem tego wykonawcy w tej sesji). Status PLANNED w rejestrze — podniesiony
z "nieprzetestowane po naprawie kolizji seedów" na "zbieżne, częściowa zgodność
zmierzona (53/78), przyczyna resztkowej luki zawężona (2 hipotezy wykluczone)".
"""

from __future__ import annotations

from enm.kompilator_grafu import (
    BenchmarkEnm,
    EdgeSpec,
    dodaj_generator_pv,
    dodaj_obciazenie,
    dodaj_transformator,
    dodaj_zrodlo_slack,
    pusty_enm,
    rozbuduj_z_dowolnej_szyny,
)

_MAIN_MESH_PAIRS = (
    (0, 1),
    (0, 38),
    (1, 2),
    (1, 24),
    (2, 3),
    (2, 17),
    (3, 4),
    (3, 13),
    (4, 5),
    (4, 7),
    (5, 6),
    (5, 10),
    (6, 7),
    (7, 8),
    (8, 38),
    (9, 10),
    (9, 12),
    (12, 13),
    (13, 14),
    (14, 15),
    (15, 16),
    (15, 18),
    (15, 20),
    (15, 23),
    (16, 17),
    (16, 26),
    (20, 21),
    (21, 22),
    (22, 23),
    (22, 35),
    (24, 25),
    (25, 26),
    (25, 27),
    (25, 28),
    (27, 28),
)
_MAIN_MESH_EDGES = [
    EdgeSpec(f"BR{i}", f"B{fb}", f"B{tb}", f"bench_ieee39bus_br{i}")
    for i, (fb, tb) in enumerate(_MAIN_MESH_PAIRS)
]

_LOADS_MW_MVAR = {
    "B0": (97.6, 44.2),
    "B2": (322.0, 2.4),
    "B3": (500.0, 184.0),
    "B6": (233.8, 84.0),
    "B7": (522.0, 176.6),
    "B8": (6.5, -66.6),
    "B14": (320.0, 153.0),
    "B15": (329.0, 32.3),
    "B17": (158.0, 30.0),
    "B19": (680.0, 103.0),
    "B20": (274.0, 115.0),
    "B22": (247.5, 84.6),
    "B23": (308.6, -92.2),
    "B24": (224.0, 47.2),
    "B25": (139.0, 17.0),
    "B26": (281.0, 75.5),
    "B27": (206.0, 27.6),
    "B28": (283.5, 26.9),
    "B30": (9.2, 4.6),
    "B38": (1104.0, 250.0),
    "B11": (8.53, 88.0),
}

_GENERATORS = {
    "B29": ("bench_ieee39bus_gen29", 250.0, 1.0499),
    "B31": ("bench_ieee39bus_gen31", 650.0, 0.9841),
    "B32": ("bench_ieee39bus_gen32", 632.0, 0.9972),
    "B33": ("bench_ieee39bus_gen33", 508.0, 1.0123),
    "B34": ("bench_ieee39bus_gen34", 650.0, 1.0494),
    "B35": ("bench_ieee39bus_gen35", 560.0, 1.0636),
    "B36": ("bench_ieee39bus_gen36", 540.0, 1.0275),
    "B37": ("bench_ieee39bus_gen37", 830.0, 1.0265),
    "B38": ("bench_ieee39bus_gen38", 1000.0, 1.03),
}

#: (hv_lit, lv_lit_nowa, catalog_ref, ratio) — transformatory tworzące NOWĄ
#: szynę, w kolejności ZALEŻNOŚCI (BR40 tworzy B19 zanim BR42 z niej odejdzie).
_STEP_UP_TRANSFORMERS = (
    ("B1", "B29", "bench_ieee39bus_br35", 1.025),
    ("B9", "B31", "bench_ieee39bus_br37", 1.07),
    ("B18", "B19", "bench_ieee39bus_br40", 1.06),
    ("B18", "B32", "bench_ieee39bus_br41", 1.07),
    ("B19", "B33", "bench_ieee39bus_br42", 1.009),
    ("B21", "B34", "bench_ieee39bus_br43", 1.025),
    ("B24", "B36", "bench_ieee39bus_br44", 1.025),
    ("B28", "B37", "bench_ieee39bus_br45", 1.025),
)


def build_ieee_39bus_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="IEEE case39 (MATPOWER, via pandapower 3.4.0)", sn_nominal_kv=345.0)
    enm, bus_b30 = dodaj_zrodlo_slack(
        enm,
        voltage_kv=345.0,
        sk3_mva=20000.0,
        rx_ratio=0.1,
        line_fields_count=1,
        source_name="External grid (slack)",
        u_set_pu=0.982,  # MATPOWER case39 bus 31 Vm (pandapower ext_grid.vm_pu)
    )
    # BR36 = gałąź MATPOWER 6–31 z zaczepem τ=1,07 przy szynie 6 („from"): szyna 6 (B5)
    # jest uzwojeniem HV (zaczep), szyna bilansująca 31 (B30) — LV. Budowa dochodzi tu
    # od strony 31, więc B5 powstaje jako NOWA szyna HV (`hv_voltage_kv`), nie LV —
    # z odwróconą orientacją bliźniak odbiegał od pandapower o 0,05 p.u. (B4–B7).
    enm, bus_b5 = dodaj_transformator(
        enm,
        hv_voltage_kv=345.0,
        lv_bus_ref=bus_b30,
        catalog_ref="bench_ieee39bus_br36",
        off_nominal_ratio=1.07,
    )

    bus_map: dict[str, str] = {"B30": bus_b30, "B5": bus_b5}
    enm, branch_map = rozbuduj_z_dowolnej_szyny(
        enm, bus_map=bus_map, korzenie=["B5"], edges=_MAIN_MESH_EDGES
    )

    for hv_lit, lv_lit, catalog_ref, ratio in _STEP_UP_TRANSFORMERS:
        enm, bus_lv = dodaj_transformator(
            enm,
            hv_bus_ref=bus_map[hv_lit],
            catalog_ref=catalog_ref,
            lv_voltage_kv=345.0,
            off_nominal_ratio=ratio,
        )
        bus_map[lv_lit] = bus_lv

    # B11: WYŁĄCZNIE przez transformatory BR38 (nowa szyna od B10)/BR39
    # (druga, równoległa droga do JUŻ istniejącej B12).
    # BR38 = gałąź MATPOWER 12–11 z zaczepem τ=1,006 przy szynie 12 (B11): B11 jest
    # uzwojeniem HV — powstaje jako nowa szyna HV nad istniejącą B10 (szyna 11).
    enm, bus_b11 = dodaj_transformator(
        enm,
        hv_voltage_kv=345.0,
        lv_bus_ref=bus_map["B10"],
        catalog_ref="bench_ieee39bus_br38",
        off_nominal_ratio=1.006,
    )
    bus_map["B11"] = bus_b11
    enm, _bus_b12_again = dodaj_transformator(
        enm,
        hv_bus_ref=bus_map["B11"],
        catalog_ref="bench_ieee39bus_br39",
        lv_bus_ref=bus_map["B12"],
        off_nominal_ratio=1.006,
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

    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
