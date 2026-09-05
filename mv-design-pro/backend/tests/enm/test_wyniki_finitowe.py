"""Polityka §35 w torze kanonicznym (CV-4.1, krok 0): wynik biegu bez NaN/inf i bez liczb bez fizyki.

Znalezisko przy zbieraniu złotych hashy assemblera (2026-09-05): dla wyspy nN bez
zasilania rozpływ oddawał NaN w ``node_voltage_kv`` (węzły nierozwiązane), a
zwarcie — κ ≈ 3·10¹², i_p ≈ 2·10¹⁴ A, I_th = inf (solver FROZEN liczy κ z R/X
impedancji zastępczej o ujemnym R albo X; IEC 60909-0 §4.3.1.1 ogranicza κ do
[1,02; 2,0]). Kontrakt wyjściowy nie może nieść takich liczb: węzeł nierozwiązany
ma ``None``, wiersz niefizyczny jest NIERAPORTOWALNY z wykazem pól.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from application.analyses.kontrakt_liczb import kwantyzuj_kontrakt
from application.result_mapping.canonical_run_to_resultset_v1 import (
    build_resultset_v1_from_canonical_run,
)
from enm.canonical_analysis import (
    OGRANICZENIE_WYNIK_NIEFIZYCZNY,
    _execute_power_flow,
    _execute_short_circuit,
)
from enm.models import EnergyNetworkModel

from tests.application.analyses.lv_domain.scenariusze_nn import SCENARIUSZE
from tests.golden.parytet_assemblera.harness import _bieg

_SC_3F = {"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0}


def _niefinitowe(obiekt: Any, sciezka: str = "$") -> list[str]:
    if isinstance(obiekt, bool):
        return []
    if isinstance(obiekt, float):
        return [] if math.isfinite(obiekt) else [sciezka]
    if isinstance(obiekt, dict):
        return [s for k, v in obiekt.items() for s in _niefinitowe(v, f"{sciezka}.{k}")]
    if isinstance(obiekt, list | tuple):
        return [s for i, v in enumerate(obiekt) for s in _niefinitowe(v, f"{sciezka}[{i}]")]
    return []


def _pf(enm: EnergyNetworkModel, klucz: str):
    run = _bieg(enm, klucz=klucz, analysis_type="PF", options={})
    _execute_power_flow(run)
    return run


@pytest.fixture(scope="module")
def siec_z_wyspa() -> tuple[str, EnergyNetworkModel, Any]:
    """Pierwszy scenariusz nN rejestru, w którym rozpływ zostawia węzły nierozwiązane."""
    for indeks, scenariusz in enumerate(SCENARIUSZE):
        enm = scenariusz.budowniczy()
        try:
            run = _pf(enm, f"wyspa-{indeks}")
        except ValueError:
            continue
        if run.raw_result["result_v1"].get("unsolved_node_ids"):
            return f"scenariusz {indeks}", enm, run
    pytest.fail(
        "Rejestr scenariuszy nN nie ma już sieci z wyspą bez zasilania — test wymaga fikstury"
    )


def test_rozplyw_wezly_nierozwiazane_maja_none_a_nie_nan(siec_z_wyspa) -> None:
    _, _, run = siec_z_wyspa
    raw = run.raw_result
    nierozwiazane = set(raw["result_v1"]["unsolved_node_ids"])
    assert nierozwiazane
    assert all(raw["node_voltage_kv"][n] is None for n in nierozwiazane)
    assert all(
        isinstance(v, float) and math.isfinite(v)
        for n, v in raw["node_voltage_kv"].items()
        if n not in nierozwiazane
    )
    # predykaty parami: NaN ⇔ węzeł nierozwiązany — inny NaN byłby wypisany, nie wygładzony
    assert "non_finite_fields" not in raw
    assert _niefinitowe(raw) == []
    assert _niefinitowe(run.white_box_trace) == []
    kwantyzuj_kontrakt(raw)  # tryb ścisły §35: nie podnosi
    assert build_resultset_v1_from_canonical_run(run) is not None


def test_zwarcie_wiersz_niefizyczny_jest_nieraportowalny_z_wykazem_pol(siec_z_wyspa) -> None:
    _, enm, _ = siec_z_wyspa
    run = _bieg(enm, klucz="wyspa-sc", analysis_type="short_circuit_sn", options=_SC_3F)
    _execute_short_circuit(run)
    raw = run.raw_result
    niefizyczne = [row for row in raw["results"] if row.get("non_physical_fields")]
    assert niefizyczne, "sieć z wyspą bez zasilania ma dać choć jeden wiersz niefizyczny"
    for row in niefizyczne:
        assert row["reporting_status"] == "not_reportable"
        assert row["reporting_status_pl"] == "nieraportowalny"
        assert row["dopuszczalnosc_raportowa"] is False
        assert row["proof_status"] == "partial"
        assert OGRANICZENIE_WYNIK_NIEFIZYCZNY in row["reporting_limitations"]
        assert row["non_physical_fields"] == sorted(set(row["non_physical_fields"]))
        assert any(p in ("$.ith_a", "$.kappa", "$.m_factor") for p in row["non_physical_fields"])
    zdrowe = [row for row in raw["results"] if not row.get("non_physical_fields")]
    assert zdrowe, "węzły zasilane liczą się normalnie"
    for row in zdrowe:
        assert row["reporting_status"] == "reportable"
        assert 1.02 <= row["kappa"] <= 2.0
    assert raw["reporting_limitations"] == [OGRANICZENIE_WYNIK_NIEFIZYCZNY]
    assert raw["non_reportable_fault_node_ids"] == sorted(
        str(row["fault_node_id"]) for row in niefizyczne
    )
    assert _niefinitowe(raw) == []
    assert _niefinitowe(run.white_box_trace) == []
    kwantyzuj_kontrakt(raw)
    kwantyzuj_kontrakt(run.white_box_trace)
    assert build_resultset_v1_from_canonical_run(run) is not None


def test_siec_zdrowa_bez_zmian_kontraktu() -> None:
    enm = SCENARIUSZE[0].budowniczy()
    pf = _pf(enm, "zdrowa-pf")
    assert "non_finite_fields" not in pf.raw_result
    assert pf.raw_result["result_v1"].get("unsolved_node_ids") in (None, [])
    sc = _bieg(enm, klucz="zdrowa-sc", analysis_type="short_circuit_sn", options=_SC_3F)
    _execute_short_circuit(sc)
    assert sc.raw_result["reporting_limitations"] == []
    assert "non_reportable_fault_node_ids" not in sc.raw_result
    assert all("non_physical_fields" not in row for row in sc.raw_result["results"])
    kwantyzuj_kontrakt(sc.raw_result)
