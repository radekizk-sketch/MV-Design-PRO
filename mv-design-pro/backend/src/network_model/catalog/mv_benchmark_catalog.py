"""
Katalog benchmarkow IEEE/CIGRE/MATPOWER/pandapower/IEC 60909 (CV-4.3 K1).

Rekordy w tym module NIE sa wyrobami producenta — sa DOKLADNYM przeniesieniem
parametrow opublikowanych w literaturze (Stevenson 1982 / Kersting 2001 /
MATPOWER case9-case39 via pandapower / CIGRE TF C6.04.02 2014 / IEC 60909-4:2000
/ pandapower.shortcircuit) do postaci typu katalogowego — zeby elementy
FIZYCZNE 12 sieci referencyjnych (dawny `application/reference_networks/
library.py::REFERENCE_NETWORK_REGISTRY`, skasowany karta K2 2026-09-09 —
zastapiony przez `tests/golden/registry.py`) mogly wejsc do `EnergyNetworkModel`
przez operacje
domenowe z jawnym `catalog_ref` (K1.2 karty CV-4.3-A1: "Catalog Binding Rule bez
wyjatku dla elementow fizycznych"), zamiast surowego slownika z pominieciem
materializacji katalogowej.

Identyfikatory: ``bench_<siec>_<element>`` (K1.2). Prowenienacja: pole
``source_reference`` niesie DOKLADNY cytat z dawnego ``library.py`` (skasowany
karta K2, 2026-09-09; cytat przepisany raz do ``_SOURCE_*`` nizej, wiec zostaje
poprawny mimo kasacji zrodla) — jedna stala na siec, przepisana raz.
``verification_status=REFERENCYJNY``
/ ``catalog_status=REFERENCYJNY_V1`` (wartosci NIE sa produktem, ktory mozna
zamowic u producenta — to jest jawne odzwierciedlenie w metadanych jakosci
katalogu, ten sam wzorzec co ``mv_shunt_capacitor_catalog.py``).

Konwersja jednostek — linie/kable: siec referencyjna podaje impedancje w
PER-UNIT na bazie MOCY systemu (``base_mva`` z jej naglowka — dawniej
``library.py::ReferenceNetwork.builder_fn()().header``, skasowany karta K2;
dzis analogiczny naglowek ENM-bliznaka, ``tests/golden/enm_builders/*.py``)
i NAPIECIA POZIOMU, na ktorym lezy dana linia (pandapower/MATPOWER: ``vn_kv``
szyny poczatkowej; dla sieci jednopoziomowej = ``base_kv`` naglowka).
``_linia_z_pu`` przelicza na Om/km z konwencja dlugosci=1 km:
r_ohm_per_km = r_pu · U_linii²/S_base. Wzorzec dawnego
``application/reference_networks/frozen_solver_input.py`` (skasowany karta K2;
"a line is stamped with r_ohm_per_km = r_pu * z_base_system and
length_km = 1.0 — the global per-unit conversion then recovers exactly r_pu")
byl poprawny WYLACZNIE dla sieci, ktorych wszystkie linie leza na poziomie
bazy systemu; tor kanoniczny
(``enm/mapping.py``) przelicza Om -> p.u. baza WLASNEGO poziomu napiecia szyny,
wiec linia na innym poziomie stemplowana baza systemu dostaje impedancje
(U_systemu/U_linii)² razy za duza (ieee14bus, obszar 0,208 kV: ~4,2·10⁵ razy —
patrz ``_POZIOM_LINII_KV``). Domenowe operacje budujace odcinek trasy z jawna
dlugoscia (``continue_trunk_segment_sn`` itd.) czytaja juz gotowe Om/km. Formula ladowania linii —
``b_us_per_km = (b_pu / z_base) * 1e6`` — jest udokumentowana w TYM SAMYM
pliku (linia calkowita/1 km, solver dokłada połowę na każdym końcu, sumując
sie z powrotem do calosci).

Generatory synchroniczne (GENERATOR_SN): tabliczka ``rated_mva``/``rated_kv``/
``q_min_mvar``/``q_max_mvar``. Benchmarki Stevensona/Kerstinga/CIGRE nie podaja
mocy pozornej ani granic mocy biernej maszyny (testy DETERMINISTYCZNEGO
rozplywu mocy z zadanym |U|/P); benchmarki MATPOWER (case9/14/39) PODAJA granice
Q (``gen.Qmin``/``Qmax``), ale sa one tu swiadomie NIEUZYTE (KOREKTA 2026-09-09
dawnego zdania "zaden z 12 benchmarkow nie podaje granic"): solver FROZEN
egzekwuje granice na KAZDEJ iteracji, takze na stanie przejsciowym z plaskiego
startu, i nie przywraca wezla do PV — z granicami z literatury przelacza w
case14 cztery wezly w iteracjach 1–3, choc Q zbiezne kazdego generatora miesci
sie w granicach, i oddaje wynik o 0,022 p.u. gorszy od pandapower (OD-11 dla
wlasciciela, B-01). Tabliczka ``rated_mva`` jest ORIENTACYJNA (nie wplywa na
wynik rozplywu: solver czyta WYLACZNIE ``p_mw`` z payloadu operacji i
``q_min_mvar``/``q_max_mvar``/``rated_kv`` z KATALOGU), a granice mocy biernej
sa NIEOGRANICZAJACE Z KONSTRUKCJI (``_q_bound``; przy 3× bazie case14 wiazal na
stanie przejsciowym iteracji 3 przy blednej bazie impedancji linii — po
naprawie bazy i slacka zaden bliznik nie przelacza, co pilnuje test klasy
`tests/network_model/test_blizniaki_pf_zbieznosc.py`). Zerowanie granic byloby
fabrykacja zdolnosci maszyny — pole `source_reference` kazdego rekordu
generatora nazywa zalozenie wprost.
"""

from __future__ import annotations

import math

from network_model.pochodne import prad_roboczy_a

from .types import (
    CatalogStatus,
    CatalogVerificationStatus,
)

# ---------------------------------------------------------------------------
# Cytaty zrodel — DOKLADNIE dawny `library.py::REFERENCE_NETWORK_REGISTRY[...].source`
# (application/reference_networks/library.py, skasowany karta K2, 2026-09-09)
# ---------------------------------------------------------------------------

_SOURCE_IEEE4 = "Stevenson, Elements of Power System Analysis (1982), Example 9.5, p.337"
_SOURCE_IEEE9 = "MATPOWER case9 (WSCC 9-bus) via pandapower 3.4.0"
_SOURCE_IEEE14 = "MATPOWER case14 (IEEE 14-bus) via pandapower 3.4.0"
_SOURCE_IEEE39 = "MATPOWER case39 (New England 39-bus) via pandapower 3.4.0"
_SOURCE_IEC60909 = (
    "IEC 60909-4:2000 Examples for the calculation of short-circuit currents, Section 4"
)
_SOURCE_PP_RADIAL = (
    "pandapower.shortcircuit.calc_sc, IEC 60909 equivalent voltage source method; "
    "fixture LINE-20KV-01"
)
_SOURCE_CIGRE_MV = (
    "CIGRE TF C6.04.02 (2014), Benchmark Systems for Network Integration of DER, Section 6"
)
_SOURCE_PP_SIMPLE = "pandapower.networks.example_simple() (deterministic Newton-Raphson)"
_SOURCE_OZE = "Custom; expected via pandapower cross-check; NC RfG Annex II compliant"
_SOURCE_KERSTING = (
    "Kersting W.H. (2001), 'Radial Distribution Test Feeders', IEEE Trans. PWRS 6(3) p.975"
)
_SOURCE_CIGRE_LV = (
    "CIGRE TF C6.04.02 (2014), Benchmark Systems for Network Integration of DER, Section 7"
)


def _z_base(base_kv: float, base_mva: float) -> float:
    return (base_kv * base_kv) / base_mva


def _i_base_a(base_kv: float, base_mva: float) -> float:
    # Prąd bazowy sieci per-unit: I_base = S_base·1000/(√3·U_base) — TA SAMA formuła
    # (bit w bit) co ``network_model.pochodne.prad_roboczy_a``; katalog nie niesie
    # własnej kopii √3 (``backend_no_physics_guard``, rodzina A_sqrt3).
    return prad_roboczy_a(base_mva, base_kv)


#: Sieć referencyjna z literatury (Stevenson/MATPOWER/Kersting/CIGRE) opisuje
#: linię jako impedancję per-unit — bez przekroju/materiału/temperatury
#: granicznej przewodnika (to jest abstrakcja rozpływu mocy, nie tabliczka
#: znamionowa produktu). Zero fabrykacji: pola tabliczkowe są zadeklarowane
#: JAWNYM ``None`` (kontrakt `LineType` + `ir_fields.wymagany_float_lub_nieznany`:
#: brak klucza to nadal błąd autora rekordu, jawne ``None`` to „dana nieznana z
#: definicji źródła") — kontrola termiczna IEC 60949 oddaje brak wyniku zamiast
#: fałszywego werdyktu; verification_note nazywa to wprost.
#: Żadne z tych pól NIE wchodzi do Y-bus rozpływu mocy (czytane tam są
#: wyłącznie r_ohm_per_km/x_ohm_per_km/b_us_per_km).
_BRAK_TABLICZKI_TERMICZNEJ = (
    "Model per-unit z literatury nie podaje przekroju/materiału/temperatury "
    "granicznej przewodnika (nie jest to tabliczka znamionowa produktu). "
    "Pola tabliczkowe zadeklarowane JAWNIE jako nieznane (None; odbiór CV-4.3 K1, "
    "2026-09-09; `ir_fields.wymagany_float_lub_nieznany`): kontrola termiczna oddaje "
    "brak wyniku zamiast fałszywego werdyktu, korekty temperaturowe nie mają danej; "
    "żadne z tych pól nie wchodzi do Y-bus rozpływu mocy (czytane są wyłącznie "
    "r_ohm_per_km/x_ohm_per_km/b_us_per_km)."
)


def _linia_z_pu(
    *,
    type_id: str,
    name: str,
    r_pu: float,
    x_pu: float,
    b_pu: float,
    base_kv: float,
    base_mva: float,
    source: str,
) -> dict:
    """Zbuduj rekord LINIA_SN z impedancji per-unit systemu (patrz docstring modulu)."""
    zb = _z_base(base_kv, base_mva)
    r_ohm_per_km = r_pu * zb
    x_ohm_per_km = x_pu * zb
    b_us_per_km = (b_pu / zb) * 1e6 if zb else 0.0
    return {
        "id": type_id,
        "name": name,
        "params": {
            "r_ohm_per_km": r_ohm_per_km,
            "x_ohm_per_km": x_ohm_per_km,
            "b_us_per_km": b_us_per_km,
            "rated_current_a": _i_base_a(base_kv, base_mva),
            "voltage_rating_kv": base_kv,
            "max_temperature_c": None,
            "cross_section_mm2": None,
            "manufacturer": None,
            "verification_status": CatalogVerificationStatus.REFERENCYJNY.value,
            "source_reference": source,
            "catalog_status": CatalogStatus.REFERENCYJNY_V1.value,
            "verification_note": _BRAK_TABLICZKI_TERMICZNEJ,
        },
    }


def _linia_z_ohm(
    *,
    type_id: str,
    name: str,
    r_ohm_per_km: float,
    x_ohm_per_km: float,
    b_us_per_km: float,
    rated_current_a: float,
    voltage_rating_kv: float,
    source: str,
) -> dict:
    """Zbuduj rekord LINIA_SN — siec referencyjna JUZ podaje wartosci w Om/km
    (np. `pandapower-iec60909-radial`, ktora sama jest fikstura katalogowa
    IEC 60909 — bez konwersji per-unit)."""
    return {
        "id": type_id,
        "name": name,
        "params": {
            "r_ohm_per_km": r_ohm_per_km,
            "x_ohm_per_km": x_ohm_per_km,
            "b_us_per_km": b_us_per_km,
            "rated_current_a": rated_current_a,
            "voltage_rating_kv": voltage_rating_kv,
            "max_temperature_c": None,
            "cross_section_mm2": None,
            "manufacturer": None,
            "verification_status": CatalogVerificationStatus.REFERENCYJNY.value,
            "source_reference": source,
            "catalog_status": CatalogStatus.REFERENCYJNY_V1.value,
            "verification_note": _BRAK_TABLICZKI_TERMICZNEJ,
        },
    }


# ---------------------------------------------------------------------------
# Linie/kable — tabele (id_sufiks, r_pu, x_pu, b_pu) per siec + (base_kv, base_mva)
# ---------------------------------------------------------------------------

# (id_sufiks, r_pu, x_pu, b_pu)
_IEEE4_LINES: tuple[tuple[str, float, float, float], ...] = (
    ("l12", 0.01008, 0.0504, 0.1025),
    ("l13", 0.00744, 0.0372, 0.0775),
    ("l24", 0.00744, 0.0372, 0.0775),
    ("l34", 0.01272, 0.0636, 0.1280),
)

_IEEE9_LINES: tuple[tuple[str, float, float, float], ...] = (
    ("br0", 0.0, 0.0576, 0.0),
    ("br1", 0.017, 0.092, 0.158),
    ("br2", 0.039, 0.17, 0.358),
    ("br3", 0.0, 0.0586, 0.0),
    ("br4", 0.0119, 0.1008, 0.209),
    ("br5", 0.0085, 0.072, 0.149),
    ("br6", 0.0, 0.0625, 0.0),
    ("br7", 0.032, 0.161, 0.306),
    ("br8", 0.01, 0.085, 0.176),
)

# IEEE 14-bus: BR15/BR16/BR17 (poza tabela — transformatory generatorowe z
# odczepem off-nominal, `ratio` != 1.0) obsluguje builder sieci przez
# TRAFO_SN_NN (tap-changer), NIE ta tabela linii — patrz enm_builders/ieee_14bus.py.
_IEEE14_LINES: tuple[tuple[str, float, float, float], ...] = (
    ("br0", 0.01938, 0.05917, 0.0528),
    ("br1", 0.05403, 0.22304, 0.0492),
    ("br2", 0.04699, 0.19797, 0.0438),
    ("br3", 0.05811, 0.17632, 0.034),
    ("br4", 0.05695, 0.17388, 0.0346),
    ("br5", 0.06701, 0.17103, 0.0128),
    ("br6", 0.01335, 0.04211, 0.0),
    ("br7", 0.09498, 0.1989, 0.0),
    ("br8", 0.12291, 0.25581, 0.0),
    ("br9", 0.06615, 0.13027, 0.0),
    ("br10", 0.03181, 0.0845, 0.0),
    ("br11", 0.12711, 0.27038, 0.0),
    ("br12", 0.08205, 0.19207, 0.0),
    ("br13", 0.22092, 0.19988, 0.0),
    ("br14", 0.17093, 0.34802, 0.0),
)
# br15/br16/br17/br18/br19 NIE są w tej tabeli — w MATPOWER case14 to gałęzie
# ZMIENIAJĄCE napięcie (135/14/12/0,208 kV, konwencja `ratio` na gałęzi), więc
# tu jako realne Transformer (TRAFO_SN_NN, `get_all_benchmark_transformer_
# records`), nie LINIA_SN — patrz `enm_builders/ieee_14bus.py`. KOREKTA
# (CV-4.3 K1, 2026-09-06): br18/br19 były BŁĘDNIE w tej tabeli jako liniowe
# (r=0, x=0,17615/0,11001) — mimo że łączą B6(14 kV)/B7(12 kV) i B6(14 kV)/
# B8(0,208 kV), różne napięcia po obu stronach; `continue_trunk_segment_sn`
# propaguje napięcie ŹRÓDŁOWEJ szyny na nową, więc "linia" dałaby błędne
# napięcie znamionowe drugiej szyny. Przeniesione do TRAFO_SN_NN (tap
# nominalny, ratio=1,0 — MATPOWER `ratio` nieobecne/0 = brak odchylenia od
# stosunku baz napięciowych, ale WCIĄŻ transformator, nie linia).

# IEEE 39-bus: BR35..BR45 (odczep off-nominal) — jak wyzej, przez TRAFO_SN_NN.
_IEEE39_LINES: tuple[tuple[str, float, float, float], ...] = (
    ("br0", 0.0035, 0.0411, 0.6987),
    ("br1", 0.001, 0.025, 0.75),
    ("br2", 0.0013, 0.0151, 0.2572),
    ("br3", 0.007, 0.0086, 0.146),
    ("br4", 0.0013, 0.0213, 0.2214),
    ("br5", 0.0011, 0.0133, 0.2138),
    ("br6", 0.0008, 0.0128, 0.1342),
    ("br7", 0.0008, 0.0129, 0.1382),
    ("br8", 0.0002, 0.0026, 0.0434),
    ("br9", 0.0008, 0.0112, 0.1476),
    ("br10", 0.0006, 0.0092, 0.113),
    ("br11", 0.0007, 0.0082, 0.1389),
    ("br12", 0.0004, 0.0046, 0.078),
    ("br13", 0.0023, 0.0363, 0.3804),
    ("br14", 0.001, 0.025, 1.2),
    ("br15", 0.0004, 0.0043, 0.0729),
    ("br16", 0.0004, 0.0043, 0.0729),
    ("br17", 0.0009, 0.0101, 0.1723),
    ("br18", 0.0018, 0.0217, 0.366),
    ("br19", 0.0009, 0.0094, 0.171),
    ("br20", 0.0007, 0.0089, 0.1342),
    ("br21", 0.0016, 0.0195, 0.304),
    ("br22", 0.0008, 0.0135, 0.2548),
    ("br23", 0.0003, 0.0059, 0.068),
    ("br24", 0.0007, 0.0082, 0.1319),
    ("br25", 0.0013, 0.0173, 0.3216),
    ("br26", 0.0008, 0.014, 0.2565),
    ("br27", 0.0006, 0.0096, 0.1846),
    ("br28", 0.0022, 0.035, 0.361),
    ("br29", 0.0005, 0.0272, 0.0),
    ("br30", 0.0032, 0.0323, 0.531),
    ("br31", 0.0014, 0.0147, 0.2396),
    ("br32", 0.0043, 0.0474, 0.7802),
    ("br33", 0.0057, 0.0625, 1.029),
    ("br34", 0.0014, 0.0151, 0.249),
)

_CIGRE_MV_LINES: tuple[tuple[str, float, float, float], ...] = tuple(
    (f"l{i:02d}-{i + 1:02d}", 0.005, 0.012, 0.0) for i in range(14)
)

_PP_SIMPLE_LINES: tuple[tuple[str, float, float, float], ...] = (
    ("l23", 0.0001, 0.0006, 0.0),
    ("l34", 0.0001, 0.0006, 0.0),
)

_OZE_LINES: tuple[tuple[str, float, float, float], ...] = (("l23", 0.005, 0.015, 0.0),)

_IEEE13_LINES: tuple[tuple[str, float, float, float], ...] = (
    ("l650-632", 0.0001, 0.0003, 0.0),
    ("l632-633", 0.018, 0.024, 0.0),
    ("l632-645", 0.022, 0.03, 0.0),
    ("l632-671", 0.025, 0.034, 0.0),
    ("l645-646", 0.015, 0.022, 0.0),
    ("l671-692", 0.001, 0.001, 0.0),
    ("l671-680", 0.025, 0.034, 0.0),
    ("l671-684", 0.018, 0.024, 0.0),
    ("l684-611", 0.015, 0.022, 0.0),
    ("l684-652", 0.022, 0.03, 0.0),
    ("l692-675", 0.025, 0.034, 0.0),
)
# L633-634 (r_pu=0.001, x_pu=0.001) NIE jest w tej tabeli — w Kerstingu jest to
# transformator obnizajacy 4.16 kV -> 0.48 kV (XFM-1), nie odcinek linii; patrz
# enm_builders/ieee_13bus.py (TRAFO_SN_NN, sekcja transformatorow benchmarku).

_IEEE34_TRUNK_LINES: tuple[tuple[str, float, float, float], ...] = tuple(
    (
        f"l{fb}-{tb}",
        0.01,
        0.02,
        0.0,
    )
    for fb, tb in (
        (800, 802),
        (802, 806),
        (806, 808),
        (808, 812),
        (812, 814),
        (814, 850),
        (850, 816),
        (816, 824),
        (824, 828),
        (828, 830),
        (830, 854),
        (854, 856),
        (856, 852),
        (852, 832),
        (832, 858),
        (858, 834),
        (834, 842),
        (842, 844),
        (844, 846),
        (846, 848),
    )
)
_IEEE34_LATERAL_LINES: tuple[tuple[str, float, float, float], ...] = tuple(
    (f"l{fb}-{tb}", 0.015, 0.028, 0.0)
    for fb, tb in (
        (808, 810),
        (810, 836),
        (816, 818),
        (818, 820),
        (820, 822),
        (824, 826),
        (832, 888),
        (888, 890),
        (858, 864),
        (862, 838),
    )
)
_IEEE34_LINES: tuple[tuple[str, float, float, float], ...] = (
    _IEEE34_TRUNK_LINES + _IEEE34_LATERAL_LINES
)

_CIGRE_LV_LINES: tuple[tuple[str, float, float, float], ...] = (
    ("l-main-01", 0.025, 0.005, 0.0),
    ("l-main-02", 0.03, 0.005, 0.0),
    ("l-main-03", 0.035, 0.005, 0.0),
    ("l-main-04", 0.04, 0.005, 0.0),
    ("l-main-05", 0.045, 0.005, 0.0),
)

#: Poziom napięcia LINII inny niż baza systemu sieci (slug -> sufiks -> kV).
#: Impedancja per-unit linii z literatury jest wyrażona na bazie JEJ WŁASNEGO
#: poziomu napięcia (pandapower/MATPOWER: ``vn_kv`` szyny początkowej), więc Ω/km
#: = r_pu · U_linii²/S_base — NIE r_pu · U_systemu²/S_base. Konwencja „jedna
#: globalna z_base" z dawnego `frozen_solver_input.py` (skasowany karta K2) jest
#: poprawna WYŁĄCZNIE dla sieci
#: jednopoziomowych (wszystkie pozostałe benchmarki tej tabeli). Znalezisko
#: (CI run 4923 na `fc24fc76`, 2026-09-09): ieee14bus ma 8 odcinków w obszarze
#: 0,208 kV (B5/B8–B13; pandapower ``case14`` ``vn_kv``) stemplowanych bazą
#: 135 kV — impedancja ~4,2·10⁵ razy za duża, rozpływ kanoniczny rozbieżny
#: (30 iteracji, |U| do 320 p.u.), a złoty parytet asemblera przypinał wynik
#: NIEZBIEŻNY (zależny od maszyny). Test klasy: `tests/network_model/
#: test_mv_benchmark_catalog_poziomy.py` (każdy odcinek każdego bliźniaka ma
#: `voltage_rating_kv` równe napięciu obu swoich szyn).
_POZIOM_LINII_KV: dict[str, dict[str, float]] = {
    "ieee14bus": {f"br{i}": 0.208 for i in range(7, 15)},
}

# (siec_slug, tabela, base_kv, base_mva, source)
_LINE_NETWORKS: tuple[
    tuple[str, tuple[tuple[str, float, float, float], ...], float, float, str], ...
] = (
    ("ieee4bus", _IEEE4_LINES, 132.0, 100.0, _SOURCE_IEEE4),
    ("ieee9bus", _IEEE9_LINES, 345.0, 100.0, _SOURCE_IEEE9),
    ("ieee14bus", _IEEE14_LINES, 135.0, 100.0, _SOURCE_IEEE14),
    ("ieee39bus", _IEEE39_LINES, 345.0, 100.0, _SOURCE_IEEE39),
    ("cigremv", _CIGRE_MV_LINES, 20.0, 100.0, _SOURCE_CIGRE_MV),
    ("ppsimple4bus", _PP_SIMPLE_LINES, 20.0, 100.0, _SOURCE_PP_SIMPLE),
    ("ozepvbess", _OZE_LINES, 15.0, 100.0, _SOURCE_OZE),
    ("ieee13bus", _IEEE13_LINES, 4.16, 100.0, _SOURCE_KERSTING),
    ("ieee34bus", _IEEE34_LINES, 24.9, 100.0, _SOURCE_KERSTING),
    ("cigrelv", _CIGRE_LV_LINES, 0.4, 1.0, _SOURCE_CIGRE_LV),
)


def get_all_benchmark_line_records() -> list[dict]:
    """Rekordy LINIA_SN dla wszystkich linii/kabli benchmarkow (K1.2)."""
    records: list[dict] = []
    for slug, table, base_kv, base_mva, source in _LINE_NETWORKS:
        poziomy_linii = _POZIOM_LINII_KV.get(slug, {})
        for suffix, r_pu, x_pu, b_pu in table:
            type_id = f"bench_{slug}_{suffix}"
            records.append(
                _linia_z_pu(
                    type_id=type_id,
                    name=f"Benchmark {slug} — odcinek {suffix}",
                    r_pu=r_pu,
                    x_pu=x_pu,
                    b_pu=b_pu,
                    base_kv=poziomy_linii.get(suffix, base_kv),
                    base_mva=base_mva,
                    source=source,
                )
            )
    # pandapower-iec60909-radial: siec JUZ w Om/km (jest fikstura katalogowa
    # IEC 60909 sama w sobie — zero konwersji per-unit).
    records.append(
        _linia_z_ohm(
            type_id="bench_pandapowerradial_line20kv01",
            name="Benchmark pandapowerradial — LINE-20KV-01",
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.4,
            b_us_per_km=0.0,
            rated_current_a=400.0,
            voltage_rating_kv=20.0,
            source=_SOURCE_PP_RADIAL,
        )
    )
    return records


# ---------------------------------------------------------------------------
# Transformatory (TRAFO_SN_NN)
# ---------------------------------------------------------------------------


def _transformator(
    *,
    type_id: str,
    name: str,
    sn_mva: float,
    uhv_kv: float,
    ulv_kv: float,
    uk_percent: float,
    pk_kw: float,
    p0_kw: float,
    i0_percent: float,
    vector_group: str | None,
    source: str,
) -> dict:
    return {
        "id": type_id,
        "name": name,
        "params": {
            # `TransformerType.from_dict` (i kontrakt materializacji TRAFO_SN_NN)
            # uzywaja tych nazw pol — `_apply_materialized_transformer_fields`
            # (enm/domain_operations.py) tlumaczy je z powrotem na nazwy pol
            # ENM `Transformer` (sn_mva/uhv_kv/ulv_kv).
            "rated_power_mva": sn_mva,
            "voltage_hv_kv": uhv_kv,
            "voltage_lv_kv": ulv_kv,
            "uk_percent": uk_percent,
            "pk_kw": pk_kw,
            "p0_kw": p0_kw,
            "i0_percent": i0_percent,
            "vector_group": vector_group,
            # Zaczep nominalny, bez regulacji — te benchmarki nie modeluja OLTC.
            "tap_min": 0,
            "tap_max": 0,
            "tap_step_percent": 0.0,
            "manufacturer": None,
            "verification_status": CatalogVerificationStatus.REFERENCYJNY.value,
            "source_reference": source,
            "catalog_status": CatalogStatus.REFERENCYJNY_V1.value,
        },
    }


def _uk_pk_z_pu(r_pu: float, x_pu: float, base_mva: float) -> tuple[float, float]:
    """uk_percent/pk_kw z impedancji podanej WPROST na bazie systemu (K1.2 —
    ta sama decyzja co `bench_ieee13bus_xfm1`: sn_mva=base_mva, więc r_pu/x_pu
    NIE wymagają przeliczenia bazy). uk% = |Z_pu|*100; pk_kw = R_pu*base_mva*1000
    (straty przy prądzie znamionowym, P_cu = I_n^2*R = S_n*R_pu, w kW)."""
    return math.sqrt(r_pu**2 + x_pu**2) * 100.0, r_pu * base_mva * 1000.0


#: IEEE case39 (MATPOWER): BR35-45 — gałęzie transformatorowe z zaczepem
#: pozanominalnym `ratio`, hv_kv=lv_kv=345 kV (BEZ zmiany poziomu napięcia —
#: w odróżnieniu od ieee14bus, to transformatory blokowe/regulacyjne w JEDNEJ
#: sieci przesyłowej 345 kV; patrz `enm_builders/ieee_39bus.py`).
_IEEE39_TRANSFORMER_BRANCHES: tuple[tuple[str, float, float, float], ...] = (
    ("br35", 0.0, 0.0181, 1.025),
    ("br36", 0.0, 0.025, 1.07),
    ("br37", 0.0, 0.02, 1.07),
    ("br38", 0.0016, 0.0435, 1.006),
    ("br39", 0.0016, 0.0435, 1.006),
    ("br40", 0.0007, 0.0138, 1.06),
    ("br41", 0.0007, 0.0142, 1.07),
    ("br42", 0.0009, 0.018, 1.009),
    ("br43", 0.0, 0.0143, 1.025),
    ("br44", 0.0006, 0.0232, 1.025),
    ("br45", 0.0008, 0.0156, 1.025),
)


def get_all_benchmark_transformer_records() -> list[dict]:
    """Rekordy TRAFO_SN_NN dla transformatorow benchmarkow (K1.2)."""
    return [
        # IEC 60909-4 Section 4: TR 110/33 kV, 25 MVA, ukr=10% — bezstratny
        # (pk=i0=p0=0, uproszczenie podrecznikowe udokumentowane w
        # `expected/iec60909_example.json:source_note`, ta sama decyzja co
        # `builders/iec60909_example.py` — jawna dana, nie fabrykowany domysl).
        _transformator(
            type_id="bench_iec60909example_tr110_33",
            name="Benchmark iec60909example — TR-110-33",
            sn_mva=25.0,
            uhv_kv=110.0,
            ulv_kv=33.0,
            uk_percent=10.0,
            pk_kw=0.0,
            p0_kw=0.0,
            i0_percent=0.0,
            vector_group="YNd11",
            source=_SOURCE_IEC60909,
        ),
        # pandapower.networks.example_simple() (via naszej uproszczonej
        # 4-magistralowej fikstury `pp_simple_four_bus.py`): 25 MVA 110/20 kV,
        # ukr=12%. Literatura fikstury (builder) NIE podaje pk_kw/i0_percent —
        # zero strat czynnych/pradu jalowego jest jawnym, udokumentowanym
        # uproszczeniem (ten sam wzorzec co IEC 60909 wyzej), NIE fabrykacja
        # nieznanej wartosci: solver PF nie potrzebuje strat do zbieznosci
        # napiec, a siec nie ma testu strat mocy czynnej transformatora.
        _transformator(
            type_id="bench_ppsimple4bus_tr110_20",
            name="Benchmark ppsimple4bus — TR-110-20",
            sn_mva=25.0,
            uhv_kv=110.0,
            ulv_kv=20.0,
            uk_percent=12.0,
            pk_kw=0.0,
            p0_kw=0.0,
            i0_percent=0.0,
            vector_group="Yy0",  # CV-4.3 K1 fix: brak przesuniecia fazowego (SM-2/V12K-180 Dyn11=+30deg domyslne dla None) — literatura PF zaklada brak przesuniecia
            source=_SOURCE_PP_SIMPLE,
        ),
        # oze_pv_bess (custom fixture): 16 MVA 110/15 kV, ukr=10.5%.
        _transformator(
            type_id="bench_ozepvbess_tr110_15",
            name="Benchmark ozepvbess — TR-110-15",
            sn_mva=16.0,
            uhv_kv=110.0,
            ulv_kv=15.0,
            uk_percent=10.5,
            pk_kw=0.0,
            p0_kw=0.0,
            i0_percent=0.0,
            vector_group="Yy0",  # CV-4.3 K1 fix: brak przesuniecia fazowego (SM-2/V12K-180 Dyn11=+30deg domyslne dla None) — literatura PF zaklada brak przesuniecia
            source=_SOURCE_OZE,
        ),
        # IEEE 13-bus (Kersting): XFM-1, przyblizenie zbalansowane R/X=0.001pu
        # kazde na bazie 100 MVA / 0.48 kV LV (sn=100 MVA jest wprost baza
        # ukladu w builderze — Kersting podaje realna tabliczke XFM-1 500 kVA
        # w oryginalnym niezbalansowanym opisie, ale builder tej sieci UZYWA
        # juz zredukowanej reprezentacji zbalansowanej na bazie systemu, wiec
        # katalog benchmarku podaje TAKA SAMA impedancje jak builder, nie
        # oryginalna tabliczke Kerstinga — sieci 13-bus/34-bus maja status
        # PLANNED w rejestrze zlotych sieci, patrz K1.4/registry.py).
        _transformator(
            type_id="bench_ieee13bus_xfm1",
            name="Benchmark ieee13bus — XFM-1 (4.16/0.48 kV)",
            sn_mva=100.0,
            uhv_kv=4.16,
            ulv_kv=0.48,
            uk_percent=math.sqrt(0.001**2 + 0.001**2) * 100.0,
            pk_kw=0.001 * 1000.0 * 100.0,
            p0_kw=0.0,
            i0_percent=0.0,
            vector_group="Yy0",  # CV-4.3 K1 fix: brak przesuniecia fazowego (SM-2/V12K-180 Dyn11=+30deg domyslne dla None) — literatura PF zaklada brak przesuniecia
            source=_SOURCE_KERSTING,
        ),
        # IEEE case14 (MATPOWER via pandapower, ieee-14bus): pieć gałęzi z
        # różnym napięciem po obu stronach (135/14/12/0,208 kV) reprezentowane
        # w dawnym dialekcie jako `LineBranch` z opcjonalnym `ratio`
        # (konwencja MATPOWER: gałąź transformatorowa = linia + stosunek
        # pozanominalny) — tu jako realne `Transformer` z jawnym zaczepem
        # DETC (`enm_builders/ieee_14bus.py::dodaj_transformator(...,
        # off_nominal_ratio=...)`). sn_mva=100 = baza układu MATPOWER wprost
        # (r_pu/x_pu podane na tej bazie), więc uk_percent=x_pu*100 (r_pu=0
        # dla wszystkich pięciu => pk_kw=0) BEZ przeliczenia — ta sama
        # decyzja co `bench_ieee13bus_xfm1` wyżej (impedancja identyczna z
        # danych źródłowych, nie tabliczka rzeczywistego transformatora).
        _transformator(
            type_id="bench_ieee14bus_br15",
            name="Benchmark ieee14bus — BR15 (135/14 kV, tap 0.978)",
            sn_mva=100.0,
            uhv_kv=135.0,
            ulv_kv=14.0,
            uk_percent=0.20912 * 100.0,
            pk_kw=0.0,
            p0_kw=0.0,
            i0_percent=0.0,
            vector_group="Yy0",  # CV-4.3 K1 fix: brak przesuniecia fazowego (SM-2/V12K-180 Dyn11=+30deg domyslne dla None) — literatura PF zaklada brak przesuniecia
            source=_SOURCE_IEEE14,
        ),
        _transformator(
            type_id="bench_ieee14bus_br16",
            name="Benchmark ieee14bus — BR16 (135/0.208 kV, tap 0.969)",
            sn_mva=100.0,
            uhv_kv=135.0,
            ulv_kv=0.208,
            uk_percent=0.55618 * 100.0,
            pk_kw=0.0,
            p0_kw=0.0,
            i0_percent=0.0,
            vector_group="Yy0",  # CV-4.3 K1 fix: brak przesuniecia fazowego (SM-2/V12K-180 Dyn11=+30deg domyslne dla None) — literatura PF zaklada brak przesuniecia
            source=_SOURCE_IEEE14,
        ),
        _transformator(
            type_id="bench_ieee14bus_br17",
            name="Benchmark ieee14bus — BR17 (135/0.208 kV, tap 0.932)",
            sn_mva=100.0,
            uhv_kv=135.0,
            ulv_kv=0.208,
            uk_percent=0.25202 * 100.0,
            pk_kw=0.0,
            p0_kw=0.0,
            i0_percent=0.0,
            vector_group="Yy0",  # CV-4.3 K1 fix: brak przesuniecia fazowego (SM-2/V12K-180 Dyn11=+30deg domyslne dla None) — literatura PF zaklada brak przesuniecia
            source=_SOURCE_IEEE14,
        ),
        _transformator(
            type_id="bench_ieee14bus_br18",
            name="Benchmark ieee14bus — BR18 (14/12 kV, tap nominalny)",
            sn_mva=100.0,
            uhv_kv=14.0,
            ulv_kv=12.0,
            uk_percent=0.17615 * 100.0,
            pk_kw=0.0,
            p0_kw=0.0,
            i0_percent=0.0,
            vector_group="Yy0",  # CV-4.3 K1 fix: brak przesuniecia fazowego (SM-2/V12K-180 Dyn11=+30deg domyslne dla None) — literatura PF zaklada brak przesuniecia
            source=_SOURCE_IEEE14,
        ),
        _transformator(
            type_id="bench_ieee14bus_br19",
            name="Benchmark ieee14bus — BR19 (14/0.208 kV, tap nominalny)",
            sn_mva=100.0,
            uhv_kv=14.0,
            ulv_kv=0.208,
            uk_percent=0.11001 * 100.0,
            pk_kw=0.0,
            p0_kw=0.0,
            i0_percent=0.0,
            vector_group="Yy0",  # CV-4.3 K1 fix: brak przesuniecia fazowego (SM-2/V12K-180 Dyn11=+30deg domyslne dla None) — literatura PF zaklada brak przesuniecia
            source=_SOURCE_IEEE14,
        ),
    ] + [
        _transformator(
            type_id=f"bench_ieee39bus_{suffix}",
            name=f"Benchmark ieee39bus — {suffix.upper()} (345/345 kV, tap {ratio})",
            sn_mva=100.0,
            uhv_kv=345.0,
            ulv_kv=345.0,
            uk_percent=_uk_pk_z_pu(r_pu, x_pu, 100.0)[0],
            pk_kw=_uk_pk_z_pu(r_pu, x_pu, 100.0)[1],
            p0_kw=0.0,
            i0_percent=0.0,
            vector_group="Yy0",  # CV-4.3 K1 fix: brak przesuniecia fazowego (SM-2/V12K-180 Dyn11=+30deg domyslne dla None) — literatura PF zaklada brak przesuniecia
            source=_SOURCE_IEEE39,
        )
        for suffix, r_pu, x_pu, ratio in _IEEE39_TRANSFORMER_BRANCHES
    ]


# ---------------------------------------------------------------------------
# Kompensatory bocznikowe (KOMPENSATOR_SN) — IEEE 14-bus SH8 (bateria B8)
# ---------------------------------------------------------------------------


def get_all_benchmark_shunt_capacitor_records() -> list[dict]:
    """Rekordy KOMPENSATOR_SN dla bocznikow benchmarkow (K1.2).

    MATPOWER case14 bus 8 (indeks 0-based B8): b_pu=0.19 w UKLADZIE JEDNOSTEK
    WZGLEDNYCH systemu (base_mva=100), czysta susceptancja pojemnosciowa
    (g_pu=0.0) — Q_rated = b_pu * base_mva = 19 Mvar NIEZALEZNIE od napiecia
    znamionowego szyny (w ukladzie p.u. Q_pu = b_pu * V_pu^2, V_pu=1,0
    nominalnie — kV nie wchodzi do tej formuly). KOREKTA (CV-4.3 K1,
    2026-09-06): poprzedni komentarz/wartosc twierdzily rated_kv=135 kV
    (rzekomo "napiecie szyny B8 = baza sieci 135 kV") — BLEDNE, B8 jest w
    tym builderze na 0,208 kV (patrz dawny `library.py`, skasowany karta K2/dump
    rejestru: B8 u_n_kv=
    0,208), NIE 135 kV. rated_mvar (19) pozostaje bez zmian (niezalezne od kV
    w ukladzie p.u.); poprawiono WYLACZNIE rated_kv na rzeczywiste napiecie
    szyny nosnej.
    """
    b_pu = 0.19
    base_mva = 100.0
    bus_kv = 0.208
    rated_mvar = b_pu * base_mva
    return [
        {
            "id": "bench_ieee14bus_sh8",
            "name": "Benchmark ieee14bus — SH8 (bateria B8)",
            "params": {
                "rated_mvar": rated_mvar,
                "rated_kv": bus_kv,
                "loss_kw": 0.0,
                "manufacturer": None,
                "verification_status": CatalogVerificationStatus.REFERENCYJNY.value,
                "source_reference": _SOURCE_IEEE14,
                "catalog_status": CatalogStatus.REFERENCYJNY_V1.value,
            },
        }
    ]


# ---------------------------------------------------------------------------
# Generatory synchroniczne (GENERATOR_SN)
# ---------------------------------------------------------------------------


def _generator(
    *,
    type_id: str,
    name: str,
    rated_mva: float,
    rated_kv: float,
    q_min_mvar: float,
    q_max_mvar: float,
    source: str,
) -> dict:
    return {
        "id": type_id,
        "name": name,
        "params": {
            "rated_mva": rated_mva,
            "rated_kv": rated_kv,
            "q_min_mvar": q_min_mvar,
            "q_max_mvar": q_max_mvar,
            "manufacturer": None,
            "verification_status": CatalogVerificationStatus.REFERENCYJNY.value,
            "source_reference": source,
            "catalog_status": CatalogStatus.REFERENCYJNY_V1.value,
        },
    }


# (id_sufiks, bus_kv, p_mw, source) — q_bound wyprowadzone z p_mw (patrz
# docstring modulu: szerokie, nieograniczajace granice — zgodnosc z wyrocznia
# "wlasny NR", ktora w ogole nie sprawdza granic Q wezla PV).
def _q_bound(p_mw: float, base_mva: float) -> float:
    return max(abs(p_mw), 1.0, 0.5 * base_mva) * 3.0


def get_all_benchmark_synchronous_generator_records() -> list[dict]:
    """Rekordy GENERATOR_SN dla generatorow/PV/BESS benchmarkow (K1.2).

    Kazdy wpis rejestru "generators" siedmiu sieci PF-wlasciwych (ieee-4bus,
    ieee-9bus, ieee-14bus, ieee-39bus, cigre-mv-14, cigre-lv-benchmark,
    oze-pv-bess) trafia tu jako WEZEL PV rozplywu mocy (control_mode=
    REGULACJA_NAPIECIA) niezaleznie od etykiety `gen_kind` w dawnym dialekcie
    (pv/pv_inverter/bess_inverter/pv_residential) — dawny `computation.py::
    _classify_buses` (wlasny NR, wyrocznia (b), skasowany karta K2) TEZ nie
    rozroznial `gen_kind`:
    kazdy wpis listy `generators` jest wezlem PV bez wyjatku. Bezposrednie
    przylaczenie do SN bez transformatora blokowego jest zarezerwowane dla
    generatora synchronicznego wprost w kodzie `enm/domain_operations_v2.py::
    _add_converter_source_der_sn` — falowniki PV/BESS w tych siedmiu sieciach
    NIE maja odrebnego toru TR blokowego w literaturze (przylaczone wprost do
    szyny), wiec ta sama operacja `add_generator_sn` jest wlasciwym mechanizmem
    dla wszystkich, PV/BESS wlacznie.
    """
    records: list[dict] = []

    def add(
        slug: str, suffix: str, bus_kv: float, p_mw: float, base_mva: float, source: str
    ) -> None:
        q_bound = _q_bound(p_mw, base_mva)
        records.append(
            _generator(
                type_id=f"bench_{slug}_{suffix}",
                name=f"Benchmark {slug} — generator {suffix}",
                rated_mva=max(abs(p_mw), 0.1) / 0.85,
                rated_kv=bus_kv,
                q_min_mvar=-q_bound,
                q_max_mvar=q_bound,
                source=source,
            )
        )

    add("ieee4bus", "gen4", 132.0, 318.0, 100.0, _SOURCE_IEEE4)

    add("ieee9bus", "gen1", 345.0, 163.0, 100.0, _SOURCE_IEEE9)
    add("ieee9bus", "gen2", 345.0, 85.0, 100.0, _SOURCE_IEEE9)

    add("ieee14bus", "gen1", 135.0, 40.0, 100.0, _SOURCE_IEEE14)
    add("ieee14bus", "gen2", 135.0, 0.0, 100.0, _SOURCE_IEEE14)
    add("ieee14bus", "gen5", 0.208, 0.0, 100.0, _SOURCE_IEEE14)
    add("ieee14bus", "gen7", 12.0, 0.0, 100.0, _SOURCE_IEEE14)

    add("ieee39bus", "gen29", 345.0, 250.0, 100.0, _SOURCE_IEEE39)
    add("ieee39bus", "gen31", 345.0, 650.0, 100.0, _SOURCE_IEEE39)
    add("ieee39bus", "gen32", 345.0, 632.0, 100.0, _SOURCE_IEEE39)
    add("ieee39bus", "gen33", 345.0, 508.0, 100.0, _SOURCE_IEEE39)
    add("ieee39bus", "gen34", 345.0, 650.0, 100.0, _SOURCE_IEEE39)
    add("ieee39bus", "gen35", 345.0, 560.0, 100.0, _SOURCE_IEEE39)
    add("ieee39bus", "gen36", 345.0, 540.0, 100.0, _SOURCE_IEEE39)
    add("ieee39bus", "gen37", 345.0, 830.0, 100.0, _SOURCE_IEEE39)
    add("ieee39bus", "gen38", 345.0, 1000.0, 100.0, _SOURCE_IEEE39)

    add("cigremv", "pv05", 20.0, 0.5, 100.0, _SOURCE_CIGRE_MV)
    add("cigremv", "pv10", 20.0, 0.3, 100.0, _SOURCE_CIGRE_MV)

    add("cigrelv", "pvhouse02", 0.4, 0.003, 1.0, _SOURCE_CIGRE_LV)
    add("cigrelv", "pvhouse04", 0.4, 0.003, 1.0, _SOURCE_CIGRE_LV)

    # oze-pv-bess: sn_mva JEST podane w literaturze fikstury (1.2/0.6 MVA) —
    # uzyte wprost jako rated_mva zamiast wyprowadzenia z P.
    q_bound_pv = _q_bound(1.0, 100.0)
    records.append(
        _generator(
            type_id="bench_ozepvbess_pv2",
            name="Benchmark ozepvbess — generator pv2",
            rated_mva=1.2,
            rated_kv=15.0,
            q_min_mvar=-q_bound_pv,
            q_max_mvar=q_bound_pv,
            source=_SOURCE_OZE,
        )
    )
    q_bound_bess = _q_bound(0.5, 100.0)
    records.append(
        _generator(
            type_id="bench_ozepvbess_bess2",
            name="Benchmark ozepvbess — generator bess2",
            rated_mva=0.6,
            rated_kv=15.0,
            q_min_mvar=-q_bound_bess,
            q_max_mvar=q_bound_bess,
            source=_SOURCE_OZE,
        )
    )
    return records
