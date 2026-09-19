"""CV-4.3 K7: dane zwarciowe scenariusza MIN źródła sieciowego (S''kQmin / I''kQmin / R/X min).

IEC 60909-0:2016 §6.2.1 eq. (6): Z_Q = c·U_nQ²/S''_kQ. Do tej karty scenariusz MIN biegu
brał Z_Q z danych MAX (c_max, S''kQmax) i c_min wyłącznie w źródle napięciowym, więc
Ik''min(PCC) = (c_min/c_max)·I''kQmax — bez śladu, że S''kQmin nie ma (założenie
niekonserwatywne dla czułości zabezpieczeń: prawdziwe Z_Qmin ≥ Z_Qmax). Po K7:
- MIN z danymi: Z_Qmin = c_min·U²/S''kQmin (albo z I''kQmin), R/X = rx_ratio_min →
  rx_ratio → IEC 0,1; Ik''min(PCC) = I''kQmin DOKŁADNIE;
- MIN bez danych: to samo co dotąd, ale NIGDY cicho — ślad ``tryb: *_MAX_JAKO_MIN``,
  ``zalozenie: source.sk_min_missing`` i ``raw_result.zalozenia`` biegu;
- impedancja jawna (R+jX) jest fizyczna — bez wariantu MIN i bez założenia;
- źródło z samym I''kQ (tryb PRAD_ZWARCIOWY) jest policzalne (do K7 walidator je
  przepuszczał, a mapper pomijał — źródło znikało z grafu bez słowa).

Iloczyn cech: {110 kV, 15 kV, 0,4 kV} × {MAX, MIN} × {dane MIN: Sk''/Ik''/brak} ×
{tryb MAX: Sk'', Ik'', Z jawna} × {PCC, szyna za transformatorem} × {ślad, Z0, bieg
kanoniczny, gotowość, walidator, operacja domenowa, podgląd API, katalog}.
"""

from __future__ import annotations

import math

import pytest
from application.calculation_readiness.service import _check_short_circuit
from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.canonical_analysis import _execute_short_circuit, build_short_circuit_results
from enm.domain_operations import _compute_materialized_params, add_grid_source_sn
from enm.mapping import (
    _source_positive_impedance_ohm,
    _source_zero_impedance_ohm,
    build_grid_source_trace,
    impedancja_zrodla_sieciowego,
    map_enm_to_network_graph,
)
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source, Transformer
from enm.validator import ENMValidator
from enm.zrodlo_zwarcie import KOD_SK_MIN_BRAK, TrybDanych, dane_zwarciowe_zrodla
from network_model.catalog.types import SourceSystemType
from network_model.core.voltage_factor import c_for_node
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.golden.parytet_assemblera.harness import _bieg

PASMA = [(110.0, 4000.0, 2500.0), (15.0, 250.0, 150.0), (0.4, 10.0, 6.0)]
SQRT3 = math.sqrt(3.0)


def _ik_a(u_kv: float, sk_mva: float) -> float:
    return sk_mva / (SQRT3 * u_kv) * 1000.0


def _enm(u_kv: float, **pola: object) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="k7"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=u_kv)],
        sources=[
            Source(ref_id="s1", name="Grid", bus_ref="b1", model="short_circuit_power", **pola)  # type: ignore[arg-type]
        ],
    )


def _ik_biegu(enm: EnergyNetworkModel, scenariusz: str) -> float:
    graph = map_enm_to_network_graph(enm, scenario=scenariusz)  # type: ignore[arg-type]
    node_id = next(iter(graph.nodes))
    u_kv = enm.buses[0].voltage_kv
    return (
        ShortCircuitIEC60909Solver()
        .compute_3ph_short_circuit(
            graph, node_id, c_for_node(u_kv, scenariusz), 1.0  # type: ignore[arg-type]
        )
        .ikss_a
    )


# --------------------------------------------------------------------------------------
# Predykat danych (jedno źródło prawdy)
# --------------------------------------------------------------------------------------


def test_predykat_tryby_max_i_min() -> None:
    dane = dane_zwarciowe_zrodla(_enm(15.0, sk3_mva=250.0, sk3_min_mva=150.0).sources[0])
    assert dane.tryb_max is TrybDanych.MOC_ZWARCIOWA and dane.tryb_min is TrybDanych.MOC_ZWARCIOWA
    dane = dane_zwarciowe_zrodla(_enm(15.0, ik3_ka=9.6, ik3_min_ka=5.0).sources[0])
    assert dane.tryb_max is TrybDanych.PRAD_ZWARCIOWY and dane.tryb_min is TrybDanych.PRAD_ZWARCIOWY
    dane = dane_zwarciowe_zrodla(_enm(15.0, r_ohm=0.09, x_ohm=0.9, sk3_min_mva=1.0).sources[0])
    assert dane.tryb_max is TrybDanych.IMPEDANCJA_JAWNA and dane.policzalne
    dane = dane_zwarciowe_zrodla(_enm(15.0, sk3_mva=250.0).sources[0])
    assert dane.tryb_min is None and dane.policzalne
    assert not dane_zwarciowe_zrodla(_enm(15.0).sources[0]).policzalne


# --------------------------------------------------------------------------------------
# Z_Q i ślad — MIN z danymi (Sk'' i Ik''), MIN bez danych, impedancja jawna
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize(("u_kv", "sk_max", "sk_min"), PASMA)
def test_z_q_min_z_c_min_i_sk_min(u_kv: float, sk_max: float, sk_min: float) -> None:
    enm = _enm(u_kv, sk3_mva=sk_max, rx_ratio=0.1, sk3_min_mva=sk_min, rx_ratio_min=0.2)
    z_max = _source_positive_impedance_ohm(enm.sources[0], u_kv, "MAX")
    z_min = _source_positive_impedance_ohm(enm.sources[0], u_kv, "MIN")
    assert z_max is not None and z_min is not None
    assert abs(z_max) == pytest.approx(c_for_node(u_kv, "MAX") * u_kv**2 / sk_max, rel=1e-12)
    assert abs(z_min) == pytest.approx(c_for_node(u_kv, "MIN") * u_kv**2 / sk_min, rel=1e-12)
    assert z_max.real / z_max.imag == pytest.approx(0.1, rel=1e-12)
    assert z_min.real / z_min.imag == pytest.approx(0.2, rel=1e-12)
    wpis_max = build_grid_source_trace(enm, "MAX")[0]
    wpis_min = build_grid_source_trace(enm, "MIN")[0]
    assert wpis_max["tryb"] == "MOC_ZWARCIOWA" and wpis_max["scenariusz"] == "MAX"
    assert wpis_min["tryb"] == "MOC_ZWARCIOWA_MIN" and wpis_min["scenariusz"] == "MIN"
    assert wpis_min["c"] == c_for_node(u_kv, "MIN") and wpis_min["sk3_mva"] == sk_min
    assert wpis_min["rx_ratio_zrodlo"] == "MODEL_MIN" and wpis_min["rx_ratio"] == 0.2
    assert "c_min" in wpis_min["formula"] and "zalozenie" not in wpis_min
    assert "zalozenie" not in wpis_max


@pytest.mark.parametrize(("u_kv", "sk_max", "sk_min"), PASMA)
def test_bieg_min_w_pcc_odtwarza_ik_min_deklarowany(
    u_kv: float, sk_max: float, sk_min: float
) -> None:
    """Ik''(PCC, MIN) = I''kQmin = S''kQmin/(√3·U) DOKŁADNIE; Ik''(PCC, MAX) bez zmian."""
    enm = _enm(u_kv, sk3_mva=sk_max, rx_ratio=0.1, sk3_min_mva=sk_min)
    assert _ik_biegu(enm, "MAX") == pytest.approx(_ik_a(u_kv, sk_max), rel=1e-9)
    assert _ik_biegu(enm, "MIN") == pytest.approx(_ik_a(u_kv, sk_min), rel=1e-9)


@pytest.mark.parametrize(("u_kv", "sk_max", "sk_min"), PASMA)
def test_min_z_pradem_ik_min(u_kv: float, sk_max: float, sk_min: float) -> None:
    """Dane MIN jako I''kQmin: Z_Qmin = c_min·U/(√3·I''kQmin); bieg MIN w PCC = I''kQmin."""
    ik_min_ka = _ik_a(u_kv, sk_min) / 1000.0
    enm = _enm(u_kv, sk3_mva=sk_max, rx_ratio=0.1, ik3_min_ka=ik_min_ka)
    z_min = _source_positive_impedance_ohm(enm.sources[0], u_kv, "MIN")
    assert z_min is not None
    assert abs(z_min) == pytest.approx(
        c_for_node(u_kv, "MIN") * u_kv / (SQRT3 * ik_min_ka), rel=1e-12
    )
    wpis = build_grid_source_trace(enm, "MIN")[0]
    assert wpis["tryb"] == "PRAD_ZWARCIOWY_MIN" and wpis["ik3_ka"] == ik_min_ka
    assert wpis["rx_ratio_zrodlo"] == "MODEL_MAX" and wpis["rx_ratio"] == 0.1
    assert _ik_biegu(enm, "MIN") == pytest.approx(ik_min_ka * 1000.0, rel=1e-9)


@pytest.mark.parametrize(("u_kv", "sk_max", "sk_min"), PASMA)
def test_min_bez_danych_jawne_zalozenie(u_kv: float, sk_max: float, sk_min: float) -> None:
    """Fallback K6 (Z_Q z danych MAX, c_min w źródle napięciowym) — z NAZWANYM założeniem."""
    enm = _enm(u_kv, sk3_mva=sk_max, rx_ratio=0.1)
    z_max = _source_positive_impedance_ohm(enm.sources[0], u_kv, "MAX")
    z_min = _source_positive_impedance_ohm(enm.sources[0], u_kv, "MIN")
    assert z_min == z_max
    wpis = build_grid_source_trace(enm, "MIN")[0]
    assert wpis["tryb"] == "MOC_ZWARCIOWA_MAX_JAKO_MIN" and wpis["c"] == c_for_node(u_kv, "MAX")
    assert wpis["zalozenie"] == KOD_SK_MIN_BRAK == "source.sk_min_missing"
    assert "niekonserwatywne" in wpis["zalozenie_opis"]
    c_min, c_max = c_for_node(u_kv, "MIN"), c_for_node(u_kv, "MAX")
    assert _ik_biegu(enm, "MIN") == pytest.approx(_ik_a(u_kv, sk_max) * c_min / c_max, rel=1e-9)


def test_rx_min_domyslne_iec_gdy_brak_obu() -> None:
    enm = _enm(15.0, sk3_mva=250.0, sk3_min_mva=150.0)
    wpis = build_grid_source_trace(enm, "MIN")[0]
    assert wpis["rx_ratio"] == 0.1 and wpis["rx_ratio_zrodlo"] == "IEC_60909_DOMYSLNY_0_1"


def test_impedancja_jawna_bez_wariantu_min_i_bez_zalozenia() -> None:
    enm = _enm(15.0, r_ohm=0.09, x_ohm=0.9)
    for scenariusz in ("MAX", "MIN"):
        wynik = impedancja_zrodla_sieciowego(enm.sources[0], 15.0, scenariusz)  # type: ignore[arg-type]
        assert wynik is not None
        z_q, wpis = wynik
        assert z_q == complex(0.09, 0.9)
        assert wpis["tryb"] == "IMPEDANCJA_JAWNA" and wpis["scenariusz"] == scenariusz
        assert "zalozenie" not in wpis and "c" not in wpis
    c_min, c_max = c_for_node(15.0, "MIN"), c_for_node(15.0, "MAX")
    assert _ik_biegu(enm, "MIN") == pytest.approx(_ik_biegu(enm, "MAX") * c_min / c_max, rel=1e-9)


def test_zrodlo_z_samym_ik_max_jest_policzalne() -> None:
    """Tryb PRAD_ZWARCIOWY dla MAX: do K7 mapper pomijał takie źródło (graf bez bocznika)."""
    enm = _enm(15.0, ik3_ka=9.6)
    z_q = _source_positive_impedance_ohm(enm.sources[0], 15.0, "MAX")
    assert z_q is not None
    assert abs(z_q) == pytest.approx(1.1 * 15.0 / (SQRT3 * 9.6), rel=1e-12)
    assert map_enm_to_network_graph(enm).get_grid_sc_sources()
    assert _ik_biegu(enm, "MAX") == pytest.approx(9600.0, rel=1e-9)
    wpis = build_grid_source_trace(enm)[0]
    assert wpis["tryb"] == "PRAD_ZWARCIOWY" and "I''_kQ" in wpis["formula"]


def test_sekwencja_zerowa_idzie_za_z_q_scenariusza() -> None:
    enm = _enm(110.0, sk3_mva=4000.0, rx_ratio=0.1, sk3_min_mva=2500.0, z0_z1_ratio=1.5)
    for scenariusz in ("MAX", "MIN"):
        z1 = _source_positive_impedance_ohm(enm.sources[0], 110.0, scenariusz)  # type: ignore[arg-type]
        z0 = _source_zero_impedance_ohm(enm.sources[0], 110.0, scenariusz)  # type: ignore[arg-type]
        assert z1 is not None and z0 == z1 * 1.5
    assert abs(_source_zero_impedance_ohm(enm.sources[0], 110.0, "MIN") or 0) == pytest.approx(
        1.5 * 1.0 * 110.0**2 / 2500.0, rel=1e-12
    )


# --------------------------------------------------------------------------------------
# Szyna za transformatorem — pełne wyprowadzenie IEC 60909 z Z_Qmin
# --------------------------------------------------------------------------------------


def _enm_za_transformatorem(**pola_min: float) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="k7-trafo"),
        buses=[
            Bus(ref_id="hv", name="HV", voltage_kv=110.0),
            Bus(ref_id="mv", name="MV", voltage_kv=33.0),
        ],
        sources=[
            Source(
                ref_id="s1",
                name="Grid",
                bus_ref="hv",
                model="short_circuit_power",
                sk3_mva=4000.0,
                rx_ratio=0.1,
                **pola_min,
            )
        ],
        transformers=[
            Transformer(
                ref_id="t1",
                name="T1",
                hv_bus_ref="hv",
                lv_bus_ref="mv",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=33.0,
                uk_percent=10.0,
                pk_kw=0.0,
                vector_group="YNd11",
            )
        ],
    )


def test_szyna_za_transformatorem_min_z_z_q_min() -> None:
    """Ik''min przy 33 kV: Z_Qmin' = c_min·110²/S''kQmin·(33/110)², K_T, c_min w węźle."""
    enm = _enm_za_transformatorem(sk3_min_mva=2500.0)
    graph = map_enm_to_network_graph(enm, scenario="MIN")
    z_q = graph.get_grid_sc_sources()[0].z_ohm
    assert abs(z_q) == pytest.approx(1.0 * 110.0**2 / 2500.0, rel=1e-12)
    mv = next(n for n in graph.nodes.values() if n.voltage_level == 33.0)
    res = ShortCircuitIEC60909Solver().compute_3ph_short_circuit(graph, mv.id, 1.0, 1.0)
    z_q_33 = z_q * (33.0 / 110.0) ** 2
    # K_T = 0,95·c_max/(1+0,6·x_T) (IEC 60909-0:2016 eq. 12) — c_max TAKŻE w scenariuszu MIN;
    # c_min wchodzi wyłącznie do źródła napięciowego w węźle zwarcia.
    k_t = 0.95 * 1.1 / (1.0 + 0.6 * 0.10)
    z_t = complex(0.0, 0.10 * 33.0**2 / 25.0) * k_t
    assert res.ikss_a == pytest.approx(1.0 * 33000.0 / (SQRT3 * abs(z_q_33 + z_t)), rel=1e-6)


# --------------------------------------------------------------------------------------
# Bieg kanoniczny — ślad, założenia, brak założeń
# --------------------------------------------------------------------------------------


def _bieg_sc(enm: EnergyNetworkModel, scenario: str, klucz: str):
    run = _bieg(
        enm,
        klucz=klucz,
        analysis_type="short_circuit_sn",
        options={"fault_type": "3F", "scenario": scenario, "thermal_time_seconds": 1.0},
    )
    _execute_short_circuit(run)
    return run


def test_bieg_kanoniczny_min_bez_danych_publikuje_zalozenie() -> None:
    run = _bieg_sc(_enm_za_transformatorem(), "min", "k7-min-brak")
    slad = run.raw_result["zrodla_sieciowe"]
    assert slad[0]["scenariusz"] == "MIN" and slad[0]["tryb"] == "MOC_ZWARCIOWA_MAX_JAKO_MIN"
    zalozenia = run.raw_result["zalozenia"]
    assert len(zalozenia) == 1
    assert zalozenia[0]["code"] == "source.sk_min_missing"
    assert zalozenia[0]["element_ref"] == "s1" and zalozenia[0]["scenariusz"] == "MIN"
    assert "niekonserwatywne" in zalozenia[0]["message_pl"]


def test_bieg_kanoniczny_min_z_danymi_bez_zalozen() -> None:
    run = _bieg_sc(_enm_za_transformatorem(sk3_min_mva=2500.0), "min", "k7-min-dane")
    slad = run.raw_result["zrodla_sieciowe"]
    assert slad[0]["tryb"] == "MOC_ZWARCIOWA_MIN" and slad[0]["c"] == 1.0
    assert "zalozenia" not in run.raw_result


def test_bieg_kanoniczny_max_nigdy_nie_niesie_zalozenia_min() -> None:
    run = _bieg_sc(_enm_za_transformatorem(), "max", "k7-max")
    assert run.raw_result["zrodla_sieciowe"][0]["tryb"] == "MOC_ZWARCIOWA"
    assert "zalozenia" not in run.raw_result


def test_odpowiedz_wynikow_zwarc_niesie_zrodla_i_zalozenia() -> None:
    """Ekran wyników zwarć (`ui2/wyniki/zwarcia`) czyta ślad źródeł sieciowych (Z_Q) i założenia
    biegu z odpowiedzi `GET /api/analysis-runs/{id}/results/short-circuit`, nie z `raw_result`.
    Luka wykryta przy odbiorze karty K7-FE: `build_short_circuit_results` nie przepuszczał
    tych kluczy — sekcja ekranu pokazywała brak danych mimo śladu w biegu. Klucze przechodzą
    bit w bit; `zalozenia` wyłącznie wtedy, gdy bieg je publikuje."""
    run_min = _bieg_sc(_enm_za_transformatorem(), "min", "k7-min-odpowiedz")
    odpowiedz_min = build_short_circuit_results(run_min)
    assert odpowiedz_min["zrodla_sieciowe"] == run_min.raw_result["zrodla_sieciowe"]
    assert odpowiedz_min["zalozenia"] == run_min.raw_result["zalozenia"]
    assert odpowiedz_min["zalozenia"][0]["code"] == "source.sk_min_missing"

    run_max = _bieg_sc(_enm_za_transformatorem(), "max", "k7-max-odpowiedz")
    odpowiedz_max = build_short_circuit_results(run_max)
    assert odpowiedz_max["zrodla_sieciowe"] == run_max.raw_result["zrodla_sieciowe"]
    assert odpowiedz_max["zrodla_sieciowe"][0]["tryb"] == "MOC_ZWARCIOWA"
    assert "zalozenia" not in odpowiedz_max


# --------------------------------------------------------------------------------------
# Walidator + most kodów + gotowość
# --------------------------------------------------------------------------------------


def _kody(enm: EnergyNetworkModel) -> list[str]:
    return [i.code for i in ENMValidator().validate(enm).issues]


def test_walidator_sk_min_wieksze_od_max_blokuje() -> None:
    kody = _kody(_enm(15.0, sk3_mva=250.0, rx_ratio=0.1, sk3_min_mva=300.0))
    assert "sources.sk_min_exceeds_max" in kody
    kody = _kody(_enm(15.0, ik3_ka=9.0, ik3_min_ka=9.5))
    assert "sources.sk_min_exceeds_max" in kody
    kody = _kody(_enm(15.0, sk3_mva=250.0, rx_ratio=0.1, sk3_min_mva=150.0))
    assert "sources.sk_min_exceeds_max" not in kody
    assert (
        ODWZOROWANIE_WALIDATOR_NA_KANON["sources.sk_min_exceeds_max"]
        == "source.sk_min_inconsistent"
    )


def test_walidator_niespojnosc_sk_min_ik_min_u() -> None:
    enm = _enm(15.0, sk3_mva=250.0, rx_ratio=0.1, sk3_min_mva=150.0, ik3_min_ka=9.0)
    assert "sources.sk_min_ik_min_voltage_inconsistent" in _kody(enm)
    ik_ok = 150.0 / (SQRT3 * 15.0)
    enm = _enm(15.0, sk3_mva=250.0, rx_ratio=0.1, sk3_min_mva=150.0, ik3_min_ka=ik_ok)
    assert "sources.sk_min_ik_min_voltage_inconsistent" not in _kody(enm)


def test_walidator_e008_i_w002_przez_predykat() -> None:
    assert "sources.no_short_circuit_params" not in _kody(_enm(15.0, ik3_ka=9.6))
    assert "sources.no_short_circuit_params" in _kody(_enm(15.0))
    assert "W002" in _kody(_enm(15.0, sk3_mva=250.0))
    assert "W002" not in _kody(_enm(15.0, sk3_mva=250.0, z0_z1_ratio=1.5))


def test_gotowosc_nazywa_brak_danych_min_bez_obnizania_statusu() -> None:
    raport = _check_short_circuit(_enm(15.0, sk3_mva=250.0, rx_ratio=0.1))
    assert raport.status == "ready"
    assert raport.recommended_action_pl is not None
    assert (
        "source.sk_min_missing" in raport.recommended_action_pl
        and "s1" in raport.recommended_action_pl
    )
    raport = _check_short_circuit(_enm(15.0, sk3_mva=250.0, rx_ratio=0.1, sk3_min_mva=150.0))
    assert raport.status == "ready" and raport.recommended_action_pl is None
    raport = _check_short_circuit(_enm(15.0, r_ohm=0.09, x_ohm=0.9))
    assert raport.status == "ready" and raport.recommended_action_pl is None
    raport = _check_short_circuit(_enm(15.0, ik3_ka=9.6))
    assert raport.status == "ready" and "source.sk_min_missing" in (
        raport.recommended_action_pl or ""
    )


# --------------------------------------------------------------------------------------
# Operacja domenowa add_grid_source_sn (manual_equivalent) i materializacja
# --------------------------------------------------------------------------------------


def _enm_pusty() -> dict:
    return {"header": {"name": "k7", "defaults": {"sn_nominal_kv": 15.0}}}


def _dodaj(manual: dict) -> dict:
    return add_grid_source_sn(
        _enm_pusty(),
        {"voltage_kv": 15.0, "manual_equivalent": {"skip_hv_transformer": True, **manual}},
    )


def _zrodlo(wynik: dict) -> dict:
    assert not wynik.get("error"), wynik
    zrodla = wynik["snapshot"]["sources"]
    assert len(zrodla) == 1
    return zrodla[0]


def test_operacja_domenowa_niesie_dane_min() -> None:
    zrodlo = _zrodlo(
        _dodaj({"sk3_mva": 250.0, "rx_ratio": 0.1, "sk3_min_mva": 150.0, "rx_ratio_min": 0.2})
    )
    assert zrodlo["sk3_min_mva"] == 150.0 and zrodlo["rx_ratio_min"] == 0.2
    assert zrodlo["materialized_params"]["sk3_min_mva"] == 150.0
    assert "ik3_min_ka" not in zrodlo or zrodlo["ik3_min_ka"] is None
    zrodlo = _zrodlo(_dodaj({"sk3_mva": 250.0, "rx_ratio": 0.1, "ik3_min_ka": 5.0}))
    assert zrodlo["ik3_min_ka"] == 5.0


def test_operacja_domenowa_odrzuca_sprzeczne_i_niedozwolone_dane_min() -> None:
    wynik = _dodaj({"sk3_mva": 250.0, "rx_ratio": 0.1, "sk3_min_mva": 300.0})
    assert wynik.get("error") and wynik["error_code"] == "source.manual_equivalent_invalid"
    wynik = _dodaj({"sk3_mva": 250.0, "rx_ratio": 0.1, "ik3_ka": 9.6, "ik3_min_ka": 10.0})
    assert wynik.get("error") and wynik["error_code"] == "source.manual_equivalent_invalid"
    wynik = _dodaj({"sk3_mva": 250.0, "rx_ratio": 0.1, "rx_ratio_min": 0.2})
    assert wynik.get("error") and wynik["error_code"] == "source.manual_equivalent_invalid"
    wynik = _dodaj({"sk3_mva": 250.0, "rx_ratio": 0.1, "sk3_min_mva": -1.0})
    assert wynik.get("error") and wynik["error_code"] == "source.manual_equivalent_invalid"
    wynik = _dodaj(
        {"short_circuit_mode": "IMPEDANCE", "r_ohm": 0.09, "x_ohm": 0.9, "sk3_min_mva": 150.0}
    )
    assert wynik.get("error") and wynik["error_code"] == "source.manual_equivalent_invalid"


def test_operacja_domenowa_przyjmuje_samo_ik_max() -> None:
    zrodlo = _zrodlo(_dodaj({"ik3_ka": 9.6, "rx_ratio": 0.1}))
    assert zrodlo["ik3_ka"] == 9.6 and zrodlo.get("sk3_mva") is None
    assert dane_zwarciowe_zrodla(Source(**zrodlo)).tryb_max is TrybDanych.PRAD_ZWARCIOWY
    wynik = _dodaj({"rx_ratio": 0.1})
    assert wynik.get("error") and wynik["error_code"] == "source.manual_equivalent_incomplete"


def test_materializacja_zrodel_niesie_dane_min() -> None:
    wynik = _dodaj({"sk3_mva": 250.0, "rx_ratio": 0.1, "sk3_min_mva": 150.0})
    enm = wynik["snapshot"]
    enm["sources"][0]["catalog_ref"] = "recznie"  # sources_sn wymaga catalog_ref
    zrodla = _compute_materialized_params(enm)["sources_sn"]
    wpis = next(iter(zrodla.values()))
    assert (
        wpis["sk3_min_mva"] == 150.0 and wpis["ik3_min_ka"] is None and wpis["rx_ratio_min"] is None
    )


def test_katalog_zrodla_systemowego_dane_min_opcjonalne() -> None:
    typ = SourceSystemType.from_dict(
        {"id": "x", "name": "X", "voltage_rating_kv": 15.0, "sk3_mva": 250.0, "rx_ratio": 0.1}
    )
    assert typ.sk3_min_mva is None and typ.ik3_min_ka is None and typ.rx_ratio_min is None
    assert typ.to_dict()["sk3_min_mva"] is None
    typ = SourceSystemType.from_dict({**typ.to_dict(), "sk3_min_mva": 150, "rx_ratio_min": 0.2})
    assert typ.sk3_min_mva == 150.0 and typ.rx_ratio_min == 0.2
    assert SourceSystemType.from_dict(typ.to_dict()) == typ


def test_materializacja_katalogu_pomija_pola_min_bez_wartosci() -> None:
    """``MaterializationContract.pola_opcjonalne`` (K7): pole addytywne bez wartości w katalogu
    NIE trafia do ``materialized_params`` (inaczej każdy istniejący element z wiązaniem
    katalogowym dostałby ``sk3_min_mva: None`` i zmienił odcisk migawki bez zmiany danych —
    pomiar: odciski widoku N-1 gn01/gn03); pole z wartością trafia."""
    from network_model.catalog.materialization import materialize_catalog_binding
    from network_model.catalog.types import CatalogBinding

    class _Katalog:
        def __init__(self, typ: SourceSystemType) -> None:
            self._typ = typ

        def get_source_system_type(self, item_id: str) -> SourceSystemType | None:
            return self._typ if item_id == self._typ.id else None

    bez_min = SourceSystemType(
        id="k7-src", name="GPZ", voltage_rating_kv=15.0, sk3_mva=250.0, rx_ratio=0.1
    )
    z_min = SourceSystemType(
        id="k7-src",
        name="GPZ",
        voltage_rating_kv=15.0,
        sk3_mva=250.0,
        rx_ratio=0.1,
        sk3_min_mva=150.0,
    )
    wiazanie = CatalogBinding.from_dict(
        {
            "catalog_namespace": "ZRODLO_SN",
            "catalog_item_id": "k7-src",
            "catalog_item_version": "1",
            "materialize": True,
        }
    )
    pola_bez = materialize_catalog_binding(wiazanie, _Katalog(bez_min)).solver_fields
    pola_z = materialize_catalog_binding(wiazanie, _Katalog(z_min)).solver_fields
    assert set(pola_bez) == {"voltage_rating_kv", "sk3_mva", "ik3_ka", "rx_ratio"}
    assert pola_bez["ik3_ka"] is None  # pole NIEopcjonalne kontraktu zostaje z None jak dotąd
    assert (
        pola_z["sk3_min_mva"] == 150.0
        and "ik3_min_ka" not in pola_z
        and "rx_ratio_min" not in pola_z
    )
