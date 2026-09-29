"""Kontrakt pól kroku śladu na PRZEBIEGU producentów backendu (karta DOWOD-CIEPLNY).

Strażnik ``scripts/slad_proza_bez_latex_guard.py`` sprawdza korpus fikstur frontu.
Ten plik uruchamia producentów kroków — także warianty, których żadna scena harnessu
nie ćwiczy — i stosuje TEN SAM predykat (moduł strażnika, jedno źródło reguły):
pole prozy (``substitution``, ``notes``, ``title``, ``symbol``, ``*_pl``) bez znaczników
LaTeX, pola ``*_latex`` bez ograniczników ``$``.

ILOCZYN CECH (każda kombinacja, w której pomyłka pól mogłaby się schować):
- rdzeń IEC 60909: typ zwarcia (3F, 2F, 1F, 2F+Z) × krok z rejestru granicy / krok
  spoza rejestru (``thevenin_flow_*``) × transformator sieciowy (kroki ``KT[...]``),
  na torze solvera i na torze biegu kanonicznego (wiersz wyniku i ślad biegu);
- przewód: pochodzenie k (katalog / wyprowadzone IEC 60949) × werdykt (spełnia /
  narusza) × przekrój (jest / brak) × rodzaj (kabel / przewód goły);
- krok czasu dowodu cieplnego: nastawa zależna / nastawa niezależna / założenie
  przypadku / czas nierozstrzygnięty;
- wyposażenie: CT (wariant pełny / uproszczony), VT (pomiarowe / zabezpieczeniowe),
  kabel (starzenie), transformator (straty z mocą / bez mocy);
- migotanie: kroki modułu i sumowania.
"""

from __future__ import annotations

import importlib.util
import sys
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

import pytest
from application.analyses.migotanie import build_migotanie_view
from application.analyses.wytrzymalosc_cieplna_przewodow import _krok_czasu
from application.slad_kroku import (
    KLUCZE_ZWARCIA_LATEX_W_PROZIE,
    WZOR_RDZENIA_BILANS,
    WZOR_RDZENIA_PRAD_GALEZI,
    krok_zwarcia_z_latex_w_prozie,
    kroki_zwarcia_w_kontrakcie,
    wzor_zwarcia_na_granicy,
)
from enm.canonical_analysis import (
    create_run,
    execute_run,
    pobierz_slad_rozplywu_biegu,
    reset_canonical_runs,
)
from enm.mapping import build_zero_sequence_zbus, map_enm_to_network_graph
from enm.store import reset_enm_store, set_enm
from network_model.solvers.conductor_thermal_withstand import (
    CONDUCTOR_KIND_BARE,
    CONDUCTOR_KIND_CABLE,
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)
from network_model.solvers.equipment_checks import (
    CableThermalAgingInput,
    CtBurdenInput,
    CtDeviceBurden,
    TransformerLossesInput,
    VtBurdenInput,
    VtDeviceBurden,
    check_cable_thermal_aging,
    check_ct_burden_saturation,
    check_vt_burden_voltage_drop,
    compute_transformer_losses,
)
from network_model.solvers.equipment_checks.vt_burden_voltage_drop import (
    KATEGORIA_POMIAROWA,
    KATEGORIA_ZABEZPIECZENIOWA,
)
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.application.analyses.test_migotanie import _bus, _ibg, _sc_run
from tests.cgmes.golden_enm import build_golden_enm

_SKRYPT = Path(__file__).resolve().parents[3] / "scripts" / "slad_proza_bez_latex_guard.py"
_spec = importlib.util.spec_from_file_location("slad_proza_bez_latex_guard", _SKRYPT)
assert _spec is not None and _spec.loader is not None
straznik = importlib.util.module_from_spec(_spec)
sys.modules["slad_proza_bez_latex_guard"] = straznik
_spec.loader.exec_module(straznik)


def _naruszenia(kroki: Iterable[Mapping[str, Any]]) -> list[tuple[str, str, str]]:
    return [
        (str(krok.get("key")), pole, opis)
        for krok in kroki
        for pole, opis in straznik.naruszenia_kroku(dict(krok))
    ]


# ---------------------------------------------------------------------------
# Rdzeń IEC 60909 (B-01): mapowanie po kluczu na granicy aplikacji
# ---------------------------------------------------------------------------

_TYPY_ZWARC = ("3F", "2F", "1F", "2F+Z")


def _slad_solvera(typ: str) -> list[dict[str, Any]]:
    enm = build_golden_enm()
    graf = map_enm_to_network_graph(enm)
    wezel = next(
        node_id for node_id, node in sorted(graf.nodes.items()) if node.voltage_level == 15.0
    )
    wspolne: dict[str, Any] = {
        "graph": graf,
        "fault_node_id": wezel,
        "c_factor": 1.1,
        "tk_s": 1.0,
    }
    if typ == "3F":
        wynik = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            **wspolne, include_branch_contributions=True
        )
    elif typ == "2F":
        wynik = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(**wspolne)
    elif typ == "1F":
        wynik = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            **wspolne, z0_bus=build_zero_sequence_zbus(enm, graf)
        )
    else:
        wynik = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
            **wspolne, z0_bus=build_zero_sequence_zbus(enm, graf)
        )
    return [dict(krok) for krok in wynik.white_box_trace] + [
        dict(krok) for krok in (getattr(wynik, "branch_flow_trace", None) or [])
    ]


@pytest.mark.parametrize("typ", _TYPY_ZWARC)
def test_rdzen_zwarcia_niesie_kopie_latex_w_prozie_dokladnie_w_krokach_rejestru(typ: str) -> None:
    """Przesłanka mapowania (deklaracja w ``application/slad_kroku.py``) przypięta testem:
    w krokach z rejestru ``substitution`` jest BAJTOWĄ kopią ``substitution_latex``, a
    kroki spoza rejestru nie niosą LaTeX-u w prozie. Zmiana rdzenia, która złamie
    którąkolwiek połowę, zapali ten test zamiast cicho zgubić prozę albo przepuścić LaTeX.
    """
    kroki = _slad_solvera(typ)
    klucze = {str(krok["key"]) for krok in kroki}
    assert KLUCZE_ZWARCIA_LATEX_W_PROZIE <= klucze
    assert any(klucz.startswith("KT[") for klucz in klucze), "sieć złota ma transformator"
    for krok in kroki:
        if krok_zwarcia_z_latex_w_prozie(krok["key"]):
            assert krok["substitution"] == krok["substitution_latex"], krok["key"]
        else:
            assert straznik.naruszenia_kroku(krok) == [], krok["key"]
        # Druga przesłanka: kroki podziału prądu niosą w rdzeniu indeks `ga\l`
        # (nieskładalny w KaTeX-u) — dokładnie ten tekst, który granica podmienia.
        if wzor_zwarcia_na_granicy(krok["key"]) is not None:
            assert krok["formula_latex"] in {WZOR_RDZENIA_PRAD_GALEZI, WZOR_RDZENIA_BILANS}
    if typ == "3F":
        assert any(wzor_zwarcia_na_granicy(k) is not None for k in klucze), "ślad podziału"


@pytest.mark.parametrize("typ", _TYPY_ZWARC)
def test_granica_aplikacji_zdejmuje_latex_z_prozy_i_zachowuje_zapis(typ: str) -> None:
    surowe = _slad_solvera(typ)
    zmapowane = kroki_zwarcia_w_kontrakcie(surowe)

    assert _naruszenia(zmapowane) == []
    assert [k["key"] for k in zmapowane] == [k["key"] for k in surowe]
    for przed, po in zip(surowe, zmapowane, strict=True):
        # Zapis podstawienia nietknięty; wejście (wynik FROZEN) niezmienione.
        assert po.get("substitution_latex") == przed.get("substitution_latex")
        assert "substitution" in przed
        wzor = wzor_zwarcia_na_granicy(przed["key"])
        if krok_zwarcia_z_latex_w_prozie(przed["key"]):
            assert "substitution" not in po
        elif wzor is not None:
            assert po["formula_latex"] == wzor and "ga\\l" not in wzor
            assert {k: v for k, v in po.items() if k != "formula_latex"} == {
                k: v for k, v in przed.items() if k != "formula_latex"
            }
        else:
            assert po == przed
        assert "ga\\l" not in str(po.get("formula_latex"))


@pytest.fixture
def _magazyn_czysty() -> Iterable[None]:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.mark.usefixtures("_magazyn_czysty")
@pytest.mark.parametrize("typ", _TYPY_ZWARC)
def test_bieg_kanoniczny_zwarcia_ma_slad_i_wiersze_w_kontrakcie(typ: str) -> None:
    """Tor projektanta: bieg kanoniczny (ślad biegu i wiersze wyniku) — ta sama reguła."""
    set_enm("case-slad-proza", build_golden_enm())
    run = execute_run(
        create_run(
            case_id="case-slad-proza",
            klucz_twin="case-slad-proza",
            analysis_type="short_circuit_sn",
            options={"fault_type": typ},
        ).id
    )
    assert run.status == "FINISHED"
    assert run.white_box_trace
    assert _naruszenia(run.white_box_trace) == []
    wiersze = (run.raw_result or {}).get("results") or []
    assert wiersze
    for wiersz in wiersze:
        assert _naruszenia(wiersz.get("white_box_trace") or []) == []
        # Ślad podziału prądu punktu (inline albo policzony na żądanie) — ta sama granica.
        slad_podzialu = pobierz_slad_rozplywu_biegu(run, str(wiersz["fault_node_id"])) or []
        assert _naruszenia(slad_podzialu) == []
        assert all("ga\\l" not in str(k.get("formula_latex")) for k in slad_podzialu)


# ---------------------------------------------------------------------------
# Kryterium cieplne przewodu (solver spoza B-01 — naprawa u źródła)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("k_z_katalogu", [True, False])
@pytest.mark.parametrize("ith_a", [8000.0, 30000.0])
@pytest.mark.parametrize("przekroj", [120.0, None])
@pytest.mark.parametrize("rodzaj", [CONDUCTOR_KIND_CABLE, CONDUCTOR_KIND_BARE])
def test_slad_przewodu_w_kontrakcie(
    k_z_katalogu: bool, ith_a: float, przekroj: float | None, rodzaj: str
) -> None:
    wynik = check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=ith_a,
            fault_duration_s=0.5,
            ith_1s_a=94.0 * 120.0 if k_z_katalogu else None,
            jth_1s_a_per_mm2=94.0 if k_z_katalogu else None,
            cross_section_mm2=przekroj,
            conductor_material="AL",
            insulation="XLPE" if rodzaj == CONDUCTOR_KIND_CABLE else None,
            temp_operating_c=90.0 if rodzaj == CONDUCTOR_KIND_CABLE else 70.0,
            temp_short_circuit_c=250.0 if rodzaj == CONDUCTOR_KIND_CABLE else 200.0,
            conductor_kind=rodzaj,
        )
    )
    assert _naruszenia(wynik.white_box_trace) == []
    for krok in wynik.white_box_trace:
        assert "substitution" not in krok, krok["key"]
    if wynik.white_box_trace:
        assert all(krok.get("formula_latex") for krok in wynik.white_box_trace)


@pytest.mark.parametrize(
    "wpis",
    [
        {
            "zrodlo": "nastawa_zabezpieczenia",
            "tk_s": 0.42,
            "tms": 0.1,
            "stala_a": 0.14,
            "stala_b": 0.02,
            "prad_galezi_a": 2400.0,
            "prad_rozruchowy_a": 400.0,
            "powod_pl": "Czas z charakterystyki zależnej nastawy.",
        },
        {
            "zrodlo": "nastawa_zabezpieczenia",
            "tk_s": 0.3,
            "prad_galezi_a": 2400.0,
            "powod_pl": "Czas nastawionej zwłoki członu niezależnego.",
        },
        {"zrodlo": "zalozenie_przypadku", "tk_s": 1.0, "powod_pl": "Założenie przypadku."},
        {"zrodlo": "zalozenie_przypadku", "tk_s": None, "powod_pl": "Czas nierozstrzygnięty."},
    ],
    ids=["nastawa-zalezna", "nastawa-niezalezna", "zalozenie", "czas-nierozstrzygniety"],
)
def test_krok_czasu_dowodu_cieplnego_w_kontrakcie(wpis: dict[str, Any]) -> None:
    krok = _krok_czasu(wpis)
    assert _naruszenia([krok]) == []
    assert "substitution" not in krok
    if wpis["tk_s"] is None:
        # Brak liczby do podstawienia to brak pola, nie znak zapytania w dowodzie.
        assert "substitution_latex" not in krok
    else:
        assert krok["substitution_latex"].startswith("t_k = ")


# ---------------------------------------------------------------------------
# Kryteria wyposażenia (solvery spoza B-01 — naprawa u źródła)
# ---------------------------------------------------------------------------

_APARATY_CT = (CtDeviceBurden(nazwa="Przekaźnik", moc_va=2.5),)
_APARATY_VT = (VtDeviceBurden(nazwa="Licznik", moc_va=8.0),)


@pytest.mark.parametrize("rct_ohm", [0.2, None], ids=["wariant-pelny", "wariant-uproszczony"])
def test_slad_ct_w_kontrakcie(rct_ohm: float | None) -> None:
    wynik = check_ct_burden_saturation(
        CtBurdenInput(
            i2n_a=5.0,
            sn_va=10.0,
            alf=20.0,
            dlugosc_przewodu_m=25.0,
            przekroj_przewodu_mm2=4.0,
            obciazenia_aparatow=_APARATY_CT,
            rct_ohm=rct_ohm,
            alf_wymagany=15.0,
        )
    )
    assert len(wynik.white_box_trace) == 5
    assert _naruszenia(wynik.white_box_trace) == []


@pytest.mark.parametrize("kategoria", [KATEGORIA_POMIAROWA, KATEGORIA_ZABEZPIECZENIOWA])
def test_slad_vt_w_kontrakcie(kategoria: str) -> None:
    wynik = check_vt_burden_voltage_drop(
        VtBurdenInput(
            u2n_v=100.0,
            sn_va=30.0,
            kategoria_uzwojenia=kategoria,
            dlugosc_przewodu_m=40.0,
            przekroj_przewodu_mm2=2.5,
            obciazenia_aparatow=_APARATY_VT,
        )
    )
    assert wynik.white_box_trace
    assert _naruszenia(wynik.white_box_trace) == []


@pytest.mark.parametrize("temperatura_pracy_c", [80.0, 100.0])
def test_slad_starzenia_kabla_w_kontrakcie(temperatura_pracy_c: float) -> None:
    wynik = check_cable_thermal_aging(
        CableThermalAgingInput(
            temperatura_pracy_c=temperatura_pracy_c,
            temperatura_znamionowa_c=90.0,
            typ_izolacji="XLPE",
        )
    )
    assert len(wynik.white_box_trace) == 3
    assert _naruszenia(wynik.white_box_trace) == []


@pytest.mark.parametrize("sn_mva", [0.63, None])
def test_slad_strat_transformatora_w_kontrakcie(sn_mva: float | None) -> None:
    wynik = compute_transformer_losses(
        TransformerLossesInput(p0_kw=1.1, pk_kw=10.5, beta=0.6, sn_mva=sn_mva)
    )
    assert wynik.white_box_trace
    assert _naruszenia(wynik.white_box_trace) == []


# ---------------------------------------------------------------------------
# Migotanie — `symbol` jest prozą (ekran pokazuje go tekstem)
# ---------------------------------------------------------------------------


def test_slad_migotania_w_kontrakcie() -> None:
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=2.0, flicker_c=0.3)],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    wezel = build_migotanie_view(run)["buses"][0]
    kroki = list(wezel["white_box"]) + [
        krok for modul in wezel.get("modules") or [] for krok in modul.get("white_box") or []
    ]
    assert len(kroki) > len(wezel["white_box"])
    assert _naruszenia(kroki) == []
