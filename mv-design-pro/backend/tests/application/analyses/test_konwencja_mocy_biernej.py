"""Testy kontraktowe adaptera konwencji znaku mocy biernej (K2, V12K-040 opcja B).

WYMÓG WŁAŚCICIELA — 7 scenariuszy (§2 karty ``U4_K2_ADAPTER_KONWENCJI_Q.md``).
Przypadki MINIMALNE wzorowane na K1 (``test_diagnostyka_znaku_shunt.py``): slack +
odbiór + jedna gałąź o znanej impedancji, rachunek w komentarzu. Rozpływ liczy
RZECZYWISTY solver przez produkcyjną ścieżkę ``enm.canonical_analysis.execute_run``;
testy stosują adapter (``application/analyses/konwencja_mocy.py``) do wyniku i
asertują KANONICZNĄ konwencję (P>0 pobór czynnej, Q>0 indukcyjny, Q<0 pojemnościowy).

Reguła znaku wyprowadzona z fixtur K1 (twarda prawda liczbowa; rekalibracja K3
po naprawie F9.8 — commit ``6508c12f``, karta ``U4_K3_REKALIBRACJA_PO_F98.md``):
- ``test_znaki_przeplywu_galezi_bez_i_z_shuntem`` — odbiór indukcyjny 1,0 + j0,5 →
  na końcu przy punkcie ``q_to = −0,5`` (injekcja punktu DO gałęzi), więc
  odwzorowanie kanoniczne = NEGACJA końca incydentnego (``Q = +0,5`` pobór),
- po F9.8 przepływ gałęzi ZAWIERA efekt baterii (``Q_przekroju = Q_load −
  rated·V²``), więc zapotrzebowanie odbioru odzyskuje się jako ``Q_load =
  Q_przekroju + Q_cap_eff``, a wielkość STEROWNIKA doboru pozostaje
  ``Q_netto = Q_load − Q_cap_eff`` (Wymóg 2 właściciela — rozdział pojęciowy).
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from typing import Any

import pytest
from application.analyses.konwencja_mocy import (
    moc_kanoniczna_punktu,
    q_netto_po_kompensacji,
)
from enm.assembler import (
    _graph_id_from_ref,
)
from enm.canonical_analysis import (
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import (
    BranchRating,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    OverheadLine,
    ShuntCapacitor,
    Source,
)
from enm.store import reset_enm_store, set_enm


@pytest.fixture(autouse=True)
def _reset() -> Iterator[None]:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _minimal_net(
    *,
    load_q_mvar: float,
    cap_mvar: float | None = None,
    gen_p_mw: float | None = None,
) -> EnergyNetworkModel:
    """Slack (bus_slack) — linia 5 km — odbiór (bus_load) 1,0 MW + j``load_q_mvar``,
    15 kV. Opcjonalnie bateria ``ShuntCapacitor`` i/lub generator OZE przy odbiorze.
    Parametry identyczne jak w K1 (deterministyczny punkt odniesienia solvera)."""
    shunts: list[ShuntCapacitor] = []
    if cap_mvar is not None:
        shunts.append(
            ShuntCapacitor(
                ref_id="cap",
                name="Bateria",
                bus_ref="bus_load",
                rated_mvar=cap_mvar,
                rated_kv=15.0,
                status="closed",
                catalog_ref="KOMP",
                catalog_namespace="KOMPENSATOR_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        )
    generators: list[Generator] = []
    if gen_p_mw is not None:
        generators.append(
            Generator(
                ref_id="gen",
                name="OZE",
                bus_ref="bus_load",
                p_mw=gen_p_mw,
                q_mvar=0.0,
                gen_type="synchronous",
                catalog_ref="gen-x",
            )
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="Kontrakt K2"),
        buses=[
            Bus(ref_id="bus_slack", name="Slack SN", voltage_kv=15.0),
            Bus(ref_id="bus_load", name="Odbior SN", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="src",
                name="System",
                bus_ref="bus_slack",
                model="short_circuit_power",
                sk3_mva=2500.0,
                r_ohm=0.5,
                x_ohm=5.0,
                rx_ratio=0.1,
                r0_ohm=0.6,
                x0_ohm=6.0,
                catalog_ref="src-x",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        branches=[
            OverheadLine(
                ref_id="line",
                name="Linia SN",
                from_bus_ref="bus_slack",
                to_bus_ref="bus_load",
                length_km=5.0,
                r_ohm_per_km=0.306,
                x_ohm_per_km=0.34,
                b_siemens_per_km=0.0,
                r0_ohm_per_km=0.46,
                x0_ohm_per_km=1.2,
                rating=BranchRating(in_a=210.0),
                catalog_ref="line-afl-70",
                catalog_namespace="LINIA_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        loads=[Load(ref_id="ld", name="Odbior", bus_ref="bus_load", p_mw=1.0, q_mvar=load_q_mvar)],
        shunt_capacitors=shunts,
        generators=generators,
    )


# Jedna gałąź (slack→load): ID krawędzi i węzłów w przestrzeni grafu solvera.
_LINE = _graph_id_from_ref("line")
_ENDPOINTS = {_LINE: (_graph_id_from_ref("bus_slack"), _graph_id_from_ref("bus_load"))}
_NODE_LOAD = _graph_id_from_ref("bus_load")
_NODE_SLACK = _graph_id_from_ref("bus_slack")


def _result_v1(net: EnergyNetworkModel) -> dict[str, Any]:
    set_enm("c", net)
    result = execute_run(create_run(case_id="c", klucz_twin="c", analysis_type="PF").id)
    rv: dict[str, Any] = (result.raw_result or {}).get("result_v1") or {}
    assert rv.get("converged") is True
    return rv


def _v_pu(rv: dict[str, Any], node: str) -> float:
    return next(float(b["v_pu"]) for b in rv["bus_results"] if str(b["bus_id"]) == node)


def _cosfi(p: float, q: float) -> float:
    return abs(p) / math.hypot(p, q)


def _metryki_punktu(load_q_mvar: float, cap_mvar: float | None) -> dict[str, float]:
    """Kanoniczne wielkości punktu odbioru po adapterze + model baterii rated·V².

    Q_przekroju = kanoniczny przepływ gałęzi na końcu przy punkcie (adapter, negacja),
    Q_cap_eff   = rated·V² (nameplate skalowany napięciem),
    Q_load      = Q_przekroju + Q_cap_eff (odzysk zapotrzebowania odbioru — po F9.8
                  przepływ zawiera efekt baterii, K3),
    Q_netto     = Q_load − Q_cap_eff (kompensacja pojemnościowa, Q<0 = przekompensowanie).
    """
    rv = _result_v1(_minimal_net(load_q_mvar=load_q_mvar, cap_mvar=cap_mvar))
    kanon = moc_kanoniczna_punktu(
        branch_results=rv["branch_results"], endpoints=_ENDPOINTS, point_node=_NODE_LOAD
    )
    p = kanon["p_mw"]
    q_przekroju = kanon["q_mvar"]
    v = _v_pu(rv, _NODE_LOAD)
    q_cap_eff = (cap_mvar or 0.0) * v**2
    q_load = q_przekroju + q_cap_eff
    q_netto = q_netto_po_kompensacji(q_load, q_cap_eff)
    return {
        "p": p,
        "q_przekroju": q_przekroju,
        "q_cap_eff": q_cap_eff,
        "q_load": q_load,
        "q_netto": q_netto,
        "v": v,
        "cosfi_przekroju": _cosfi(p, q_przekroju),
        "cosfi_punktu": _cosfi(p, q_netto),
    }


# ---------------------------------------------------------------------------
# 1. Odbiór indukcyjny BEZ kompensacji → Q netto > 0, cosφ < 1.
# ---------------------------------------------------------------------------


def test_1_odbior_indukcyjny_bez_kompensacji() -> None:
    """Odbiór 1,0 + j0,5 (indukcyjny). Adapter: (P, Q) = (+1,0, +0,5) — kanonicznie
    Q>0 (pobór indukcyjny). cosφ = 1/√(1²+0,5²) = 0,894427 < 1.
    Rachunek: hypot(1, 0.5) = 1.118034 → 1/1.118034 = 0.894427."""
    m = _metryki_punktu(load_q_mvar=0.5, cap_mvar=None)
    assert m["p"] == pytest.approx(1.0, abs=1e-6)  # P>0 pobór czynnej
    assert m["q_netto"] == pytest.approx(0.5, abs=1e-5)  # Q>0 indukcyjny
    assert m["q_netto"] > 0.0
    assert m["cosfi_punktu"] == pytest.approx(0.894427, abs=1e-5)
    assert m["cosfi_punktu"] < 1.0


# ---------------------------------------------------------------------------
# 2. CZĘŚCIOWA kompensacja → cosφ ROŚNIE względem (1) — asercja kierunku (kluczowa).
# ---------------------------------------------------------------------------


def test_2_kompensacja_czesciowa_podnosi_cosfi() -> None:
    """Bateria 0,3 Mvar na odbiorze indukcyjnym 0,5. Q_cap_eff = 0,3·V² ≈ 0,2950,
    Q_netto = 0,5 − 0,2950 ≈ +0,2050 (wciąż indukcyjny, ale mniejszy). cosφ punktu
    ≈ 0,97962 > 0,894427 (bez kompensacji). To NAPRAWA V12K-040: kondensator na
    odbiorze indukcyjnym PODNOSI cosφ punktu (wartości po F9.8, K3)."""
    bez = _metryki_punktu(load_q_mvar=0.5, cap_mvar=None)
    czesc = _metryki_punktu(load_q_mvar=0.5, cap_mvar=0.3)
    assert czesc["q_netto"] > 0.0  # nadal indukcyjny (niedokompensowanie)
    assert czesc["q_netto"] < bez["q_netto"]  # |Q netto| MALEJE
    assert czesc["cosfi_punktu"] > bez["cosfi_punktu"]  # KLUCZOWA asercja kierunku
    assert czesc["cosfi_punktu"] == pytest.approx(0.97962, abs=1e-4)


# ---------------------------------------------------------------------------
# 3. PEŁNA kompensacja → cosφ ≈ 1 (Q netto ≈ 0).
# ---------------------------------------------------------------------------


def test_3_kompensacja_pelna_cosfi_blisko_jeden() -> None:
    """Bateria 0,5 Mvar ≈ dopasowana do odbioru 0,5. Q_cap_eff = 0,5·V² ≈ 0,4931,
    Q_netto = 0,5 − 0,4931 ≈ +0,0069 ≈ 0. cosφ punktu ≈ 0,99998 ≈ 1 (po F9.8, K3)."""
    pelna = _metryki_punktu(load_q_mvar=0.5, cap_mvar=0.5)
    assert abs(pelna["q_netto"]) < 0.02  # Q netto ≈ 0
    assert pelna["cosfi_punktu"] == pytest.approx(0.99998, abs=1e-4)
    assert pelna["cosfi_punktu"] > 0.999


# ---------------------------------------------------------------------------
# 4. PRZEKOMPENSOWANIE → Q netto < 0 (pojemnościowy), cosφ < 1 z drugiej strony.
# ---------------------------------------------------------------------------


def test_4_przekompensowanie_q_netto_pojemnosciowy() -> None:
    """Bateria 0,6 Mvar > odbiór 0,5. Q_cap_eff = 0,6·V² ≈ 0,5926,
    Q_netto = 0,5 − 0,5926 ≈ −0,0926 < 0 (POJEMNOŚCIOWY). cosφ punktu ≈ 0,99574 < 1
    — spadek z DRUGIEJ strony jedynki (nadmiar kompensacji; wartości po F9.8, K3)."""
    pelna = _metryki_punktu(load_q_mvar=0.5, cap_mvar=0.5)
    nad = _metryki_punktu(load_q_mvar=0.5, cap_mvar=0.6)
    assert nad["q_netto"] < 0.0  # kanonicznie pojemnościowy
    assert nad["cosfi_punktu"] < 1.0
    assert nad["cosfi_punktu"] < pelna["cosfi_punktu"]  # spadek po przekroczeniu pełnej
    assert nad["cosfi_punktu"] == pytest.approx(0.99574, abs=1e-4)


# ---------------------------------------------------------------------------
# 5. Przepływ ODWROTNY (OZE/BESS, generacja > pobór) → znak kanoniczny spójny.
# ---------------------------------------------------------------------------


def test_5_przeplyw_odwrotny_oze_bess() -> None:
    """Generator 2,0 MW przy odbiorze 1,0 MW + j0,5 → punkt EKSPORTUJE moc czynną
    (netto 1 MW do sieci). Adapter: P = −1,0 (kanonicznie P<0 = oddawanie), a znak
    mocy biernej odbioru pozostaje spójny (Q = +0,5 indukcyjny). Dowodzi, że
    przełożenie znaku działa też dla przepływu odwrotnego."""
    rv = _result_v1(_minimal_net(load_q_mvar=0.5, gen_p_mw=2.0))
    kanon = moc_kanoniczna_punktu(
        branch_results=rv["branch_results"], endpoints=_ENDPOINTS, point_node=_NODE_LOAD
    )
    assert kanon["p_mw"] == pytest.approx(-1.0, abs=1e-4)  # P<0 = eksport (generacja > pobór)
    assert kanon["p_mw"] < 0.0
    assert kanon["q_mvar"] == pytest.approx(0.5, abs=1e-5)  # znak Q spójny (indukcyjny)
    assert kanon["incydentne"] == 1


# ---------------------------------------------------------------------------
# 6. Bilans q_from/q_to gałęzi — spójność adaptera na OBU końcach.
# ---------------------------------------------------------------------------


def test_6_bilans_galezi_oba_konce() -> None:
    """Ta sama gałąź czytana z obu stron (po F9.8, K3): punkt=to (bus_load) →
    kanonicznie +0,5 (negacja q_to=−0,5); punkt=from (bus_slack) → kanonicznie
    −0,509650 (negacja q_from=+0,509650; slack ODDAJE moc bierną indukcyjną).
    Suma q_from+q_to (surowe) = strata bierna I²X gałęzi (``losses_q``,
    ``power_flow_result.py:239``) ≈ +0,00965, więc suma wielkości KANONICZNYCH obu
    punktów = −strata. Adapter dobiera właściwy koniec dla każdego punktu."""
    rv = _result_v1(_minimal_net(load_q_mvar=0.5, cap_mvar=None))
    k_load = moc_kanoniczna_punktu(
        branch_results=rv["branch_results"], endpoints=_ENDPOINTS, point_node=_NODE_LOAD
    )
    k_slack = moc_kanoniczna_punktu(
        branch_results=rv["branch_results"], endpoints=_ENDPOINTS, point_node=_NODE_SLACK
    )
    assert k_load["q_mvar"] == pytest.approx(0.5, abs=1e-5)  # koniec to (pobór indukcyjny)
    assert k_slack["q_mvar"] == pytest.approx(-0.509650, abs=1e-5)  # koniec from (oddawanie)
    # Ślad WHITE BOX: właściwy koniec per punkt.
    assert k_load["slad"][0]["koniec"] == "to"
    assert k_slack["slad"][0]["koniec"] == "from"
    # Suma kanonicznych obu końców = −strata bierna gałęzi (z branch_results — spójność).
    feeder = next(b for b in rv["branch_results"] if abs(float(b["q_to_mvar"])) > 0.1)
    strata_q = float(feeder["losses_q_mvar"])
    assert k_load["q_mvar"] + k_slack["q_mvar"] == pytest.approx(-strata_q, abs=1e-9)
    assert strata_q == pytest.approx(0.009650, abs=1e-5)


# ---------------------------------------------------------------------------
# 7. Bilans mocy biernej CAŁEGO układu (suma Q netto punktów vs slack_q + generacja,
#    w granicach strat — tolerancja jawna).
# ---------------------------------------------------------------------------


def test_7_bilans_ukladu_z_generacja() -> None:
    """Odbiór 1,0 + j0,8 z lokalnym generatorem OZE (P=0,3 MW). Bilans bierny układu
    w konwencji kanonicznej: suma Q netto punktów NIE-slack (tu: bus_load) równoważy
    się z mocą bierną węzła bilansującego (``slack_q ≡ Q_from`` gałęzi, karta §2a) w
    granicach STRAT biernych gałęzi:

        Σ Q_netto(punkty ≠ slack) + slack_q = strata bierna układu (≈ 0).

    Tolerancja jawna = |strata bierna| + margines. To dowód, że adapter zachowuje
    bilans mocy biernej (nie wprowadza fikcyjnych źródeł/upustów Q)."""
    rv = _result_v1(_minimal_net(load_q_mvar=0.8, gen_p_mw=0.3))
    k_load = moc_kanoniczna_punktu(
        branch_results=rv["branch_results"], endpoints=_ENDPOINTS, point_node=_NODE_LOAD
    )
    k_slack = moc_kanoniczna_punktu(
        branch_results=rv["branch_results"], endpoints=_ENDPOINTS, point_node=_NODE_SLACK
    )
    slack_q = float(rv["summary"]["slack_q_mvar"])
    # Tożsamość karty §2a: slack_q ≡ Q_from (surowy koniec gałęzi przy slack) — więc
    # wielkość KANONICZNA slacka (negacja, K3) = −slack_q, 6 miejsc.
    assert k_slack["q_mvar"] == pytest.approx(-slack_q, abs=1e-6)
    # Bilans kanoniczny: Σ Q_netto(punkty) = −strata bierna (mała). Tolerancja jawna.
    feeder = next(b for b in rv["branch_results"] if abs(float(b["q_to_mvar"])) > 0.05)
    strata_q = abs(float(feeder["losses_q_mvar"]))
    niebilans = k_load["q_mvar"] + k_slack["q_mvar"]
    assert abs(niebilans) == pytest.approx(strata_q, abs=1e-6)
    assert abs(niebilans) <= strata_q + 0.02  # w granicach strat (tolerancja jawna)


# ---------------------------------------------------------------------------
# 8. FAB-E (E1): brak pola mocy w rekordzie branch_results podnosi wyjątek,
#    NIE fabrykuje zera (rekord result_v1 uszkodzony/niekompletny to fakt do
#    zgłoszenia, a nie milcząco zaniżony wkład gałęzi do mocy punktu).
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "klucz_do_usuniecia",
    ["p_to_mw", "q_to_mvar"],
)
def test_8_brak_pola_mocy_na_koncu_to_podnosi_wyjatek(klucz_do_usuniecia: str) -> None:
    """Punkt = koniec ``to`` gałęzi. Brak ``p_to_mw``/``q_to_mvar`` w rekordzie
    branch_results (np. wynik solvera niekompletny) → ``ValueError`` nazywający
    pole i ``branch_id`` — nie cichy wkład zerowy do mocy kanonicznej punktu."""
    br: dict[str, Any] = {
        "branch_id": _LINE,
        "p_to_mw": -1.0,
        "q_to_mvar": -0.5,
        "p_from_mw": 1.0,
        "q_from_mvar": 0.509650,
    }
    del br[klucz_do_usuniecia]
    with pytest.raises(ValueError, match=klucz_do_usuniecia):
        moc_kanoniczna_punktu(branch_results=[br], endpoints=_ENDPOINTS, point_node=_NODE_LOAD)


@pytest.mark.parametrize(
    "klucz_do_usuniecia",
    ["p_from_mw", "q_from_mvar"],
)
def test_8_brak_pola_mocy_na_koncu_from_podnosi_wyjatek(klucz_do_usuniecia: str) -> None:
    """Punkt = koniec ``from`` gałęzi — ten sam kontrakt jak dla końca ``to``
    (iloczyn cech: oba końce × brakujące P/Q), tak samo podnosi wyjątek."""
    br: dict[str, Any] = {
        "branch_id": _LINE,
        "p_to_mw": -1.0,
        "q_to_mvar": -0.5,
        "p_from_mw": 1.0,
        "q_from_mvar": 0.509650,
    }
    del br[klucz_do_usuniecia]
    with pytest.raises(ValueError, match=klucz_do_usuniecia):
        moc_kanoniczna_punktu(branch_results=[br], endpoints=_ENDPOINTS, point_node=_NODE_SLACK)


def test_8_kompletny_rekord_regresja_liczy_normalnie() -> None:
    """Regresja: rekord z kompletem pól liczy się identycznie jak przed FAB-E —
    brak wyjątku, wynik liczbowy zgodny ze znaną prawdą K3 (test 1 powyżej)."""
    br: dict[str, Any] = {
        "branch_id": _LINE,
        "p_to_mw": -1.0,
        "q_to_mvar": -0.5,
        "p_from_mw": 1.0,
        "q_from_mvar": 0.509650,
    }
    kanon = moc_kanoniczna_punktu(branch_results=[br], endpoints=_ENDPOINTS, point_node=_NODE_LOAD)
    assert kanon["p_mw"] == pytest.approx(1.0, abs=1e-9)
    assert kanon["q_mvar"] == pytest.approx(0.5, abs=1e-9)
    assert kanon["incydentne"] == 1
