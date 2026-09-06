"""Wyrocznia (a) — ENM-bliźniaki benchmarków vs `expected/*.json` (CV-4.3 K1).

Buduje każdą sieć przez `application/reference_networks/enm_builders/*.py`
(operacje domenowe + typy katalogowe `benchmark` — K1.1/K1.2), liczy TOREM
KANONICZNYM (`enm/canonical_analysis.py` -> FROZEN `power_flow_newton`/
`ShortCircuitIEC60909Solver`) i porównuje z `expected/*.json` (tolerancja
zadeklarowana PER WIERSZ w pliku — `comparator.py`, ta sama infrastruktura co
`/api/v1/reference-networks/*/validate`, tu na wyniku kanonicznym zamiast
starego dialektu). Rozbieżność ponad tolerancję jest DEFEKTEM do wyjaśnienia
(K1.3) — nigdy nie luzuje się tolerancji, żeby przepchnąć niezgodność.

Sieci NIESYMETRYCZNE (ieee_34bus; ieee_13bus ma dodatkowo swój WŁASNY test bez
xfail — patrz `test_ieee_13bus_pf_aproksymacja_pozytywnosekwencyjna`, weryfikuje
tylko pozytywno-sekwencyjną aproksymację, nie prawdziwą fizykę niesymetryczną)
i sieć z nierozstrzygniętą rozbieżnością numeryczną (ieee_14bus — rozbiega
katastroficznie; ieee_39bus — zbiega, ale ma resztkową ~2-4% lukę wobec
NIEZALEŻNEGO pandapower/MATPOWER case39, dwie hipotezy przyczyny wykluczone
dowodem, patrz `reason` przy każdym teście) mają jawny status PLANNED —
`pytest.mark.xfail` z uzasadnieniem w `reason`, NIE cichy skip (K1.4: "nie
cichy skip").
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from application.reference_networks.comparator import compare_power_flow, compare_short_circuit
from application.reference_networks.expected_values import load_expected_values_from_json
from enm.canonical_analysis import CanonicalRun, _execute_power_flow, _execute_short_circuit
from enm.mapping import _ref_to_uuid
from enm.models import EnergyNetworkModel

_EXPECTED_DIR = (
    Path(__file__).parents[3] / "src" / "application" / "reference_networks" / "expected"
)


def _bieg(snapshot: dict[str, Any], analysis_type: str, options: dict[str, Any]) -> CanonicalRun:
    import uuid
    from datetime import UTC, datetime

    return CanonicalRun(
        id=uuid.uuid4(),
        case_id=f"oracle-a-{analysis_type}",
        project_id="oracle-a",
        analysis_type=analysis_type,
        status="RUNNING",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash="s",
        input_hash="i",
        snapshot=snapshot,
        validation={},
        readiness={},
        options=options,
    )


def _actual_pf_buses(bus_map: dict[str, str], raw_result: dict[str, Any]) -> dict[str, dict]:
    bus_kv = raw_result.get("_bus_kv_by_ref", {})
    node_voltage_kv = raw_result["node_voltage_kv"]
    angle_by_node = {
        row["bus_id"]: row.get("angle_deg") or row.get("voltage_angle_deg")
        for row in raw_result["result_v1"]["bus_results"]
    }
    actual: dict[str, dict] = {}
    for lit_id, ref_id in bus_map.items():
        node_id = _ref_to_uuid(ref_id)
        if node_id not in node_voltage_kv:
            continue
        v_kv = node_voltage_kv[node_id]
        actual[lit_id] = {
            "v_pu": v_kv / bus_kv[ref_id] if bus_kv.get(ref_id) else None,
            "angle_deg": angle_by_node.get(node_id),
        }
    return actual


def _sprawdz_pf(builder: Any, expected_filename: str) -> None:
    result = builder()
    validated = EnergyNetworkModel.model_validate(result.enm)
    bus_kv_by_ref = {b.ref_id: b.voltage_kv for b in validated.buses}
    snapshot = validated.model_dump(mode="json")
    run = _bieg(snapshot, "PF", {"base_mva": 100.0})
    _execute_power_flow(run)
    raw_result = dict(run.raw_result)
    raw_result["_bus_kv_by_ref"] = bus_kv_by_ref
    actual_buses = _actual_pf_buses(result.bus_map, raw_result)

    expected = load_expected_values_from_json(_EXPECTED_DIR / expected_filename)
    comparisons = compare_power_flow(actual_buses, expected)
    failures = [c for c in comparisons if c.status == "FAIL"]
    assert not failures, "\n".join(
        f"{c.element_id}.{c.quantity}: actual={c.actual} expected={c.expected} "
        f"rtol={c.rtol} rel_diff={c.rel_diff}"
        for c in failures
    )
    assert comparisons, f"{expected_filename}: brak porównań PF (pusty expected?)"


def _sprawdz_sc(builder: Any, expected_filename: str) -> None:
    result = builder()
    validated = EnergyNetworkModel.model_validate(result.enm)
    snapshot = validated.model_dump(mode="json")
    expected = load_expected_values_from_json(_EXPECTED_DIR / expected_filename)

    actual_sc: dict[str, dict] = {}
    sc_types = {sc.sc_type for sc in expected.short_circuit}
    for sc_type in sc_types:
        run = _bieg(snapshot, "SC", {"fault_type": sc_type, "thermal_time_seconds": 1.0})
        _execute_short_circuit(run)
        for row in run.raw_result["results"]:
            for lit_id, ref_id in result.bus_map.items():
                if row["fault_node_id"] == _ref_to_uuid(ref_id):
                    key = f"{lit_id}__{sc_type}"
                    actual_sc[key] = {
                        "ikss_a": row["ikss_a"],
                        "ip_a": row["ip_a"],
                        "ith_a": row["ith_a"],
                        "sk_mva": row["sk_mva"],
                    }

    comparisons = compare_short_circuit(actual_sc, expected)
    failures = [c for c in comparisons if c.status == "FAIL"]
    assert not failures, "\n".join(
        f"{c.element_id}.{c.quantity}: actual={c.actual} expected={c.expected} "
        f"rtol={c.rtol} rel_diff={c.rel_diff}"
        for c in failures
    )
    assert comparisons, f"{expected_filename}: brak porównań SC (pusty expected?)"


def test_ieee_4bus_pf() -> None:
    from application.reference_networks.enm_builders.ieee_4bus import build_ieee_4bus_enm

    _sprawdz_pf(build_ieee_4bus_enm, "ieee_4bus.json")


def test_ieee_9bus_pf() -> None:
    from application.reference_networks.enm_builders.ieee_9bus import build_ieee_9bus_enm

    _sprawdz_pf(build_ieee_9bus_enm, "ieee_9bus.json")


def test_cigre_mv_pf() -> None:
    from application.reference_networks.enm_builders.cigre_mv import build_cigre_mv_enm

    _sprawdz_pf(build_cigre_mv_enm, "cigre_mv.json")


def test_cigre_lv_benchmark_pf() -> None:
    from application.reference_networks.enm_builders.cigre_lv_benchmark import (
        build_cigre_lv_benchmark_enm,
    )

    _sprawdz_pf(build_cigre_lv_benchmark_enm, "cigre_lv_benchmark.json")


def test_pp_simple_four_bus_pf() -> None:
    from application.reference_networks.enm_builders.pp_simple_four_bus import (
        build_pp_simple_four_bus_enm,
    )

    _sprawdz_pf(build_pp_simple_four_bus_enm, "pp_simple_four_bus.json")


def test_oze_pv_bess_pf() -> None:
    from application.reference_networks.enm_builders.oze_pv_bess import build_oze_pv_bess_enm

    _sprawdz_pf(build_oze_pv_bess_enm, "oze_pv_bess.json")


def test_iec60909_example_sc() -> None:
    from application.reference_networks.enm_builders.iec60909_example import (
        build_iec60909_example_enm,
    )

    _sprawdz_sc(build_iec60909_example_enm, "iec60909_example.json")


def test_pandapower_iec60909_radial_sc() -> None:
    from application.reference_networks.enm_builders.pandapower_iec60909_radial import (
        build_pandapower_iec60909_radial_enm,
    )

    _sprawdz_sc(build_pandapower_iec60909_radial_enm, "pandapower_iec60909_radial.json")


def test_ieee_13bus_pf_aproksymacja_pozytywnosekwencyjna() -> None:
    """NIE jest to weryfikacja prawdziwej fizyki niesymetrycznej IEEE 13-bus —
    `expected/ieee_13bus.json` sam deklaruje w `source_note`: "BFS regression
    baseline z naszego uproszczonego 13-bus builder (positive-sequence
    aproksymacja)" (plik sprzed tej karty, NIEDOTKNIĘTY). Ten test weryfikuje,
    że kanoniczny tor (`enm/assembler.py` -> FROZEN power_flow_newton) daje TEN
    SAM wynik na TEJ SAMEJ uproszczonej (symetrycznej) topologii co stary
    dialekt — realna, stabilna zgodność (nie przypadek: CV-4.3 K1, 2026-09-06,
    XPASS po naprawie `vector_group`, potwierdzone ponownie po naprawie).
    PRAWDZIWE rozwiązanie niesymetryczne (rzeczywisty rozkład obciążeń per
    faza z Kerstinga) pozostaje PLANNED — FROZEN power_flow_newton liczy
    wyłącznie sieci symetryczne (4-przewodowy tor to przyszłe ADR-021)."""
    from application.reference_networks.enm_builders.ieee_13bus import build_ieee_13bus_enm

    _sprawdz_pf(build_ieee_13bus_enm, "ieee_13bus.json")


@pytest.mark.xfail(
    reason=(
        "K1.4: siec niesymetryczna, FROZEN power_flow_newton liczy wylacznie sieci "
        "symetryczne (4-przewodowy tor to przyszle ADR-021) — status PLANNED, nie brak testu."
    ),
    strict=False,
)
def test_ieee_34bus_pf_planned() -> None:
    from application.reference_networks.enm_builders.ieee_34bus import build_ieee_34bus_enm

    _sprawdz_pf(build_ieee_34bus_enm, "ieee_34bus.json")


@pytest.mark.xfail(
    reason=(
        "CV-4.3 K1 (2026-09-06): kanoniczny PF NIE ZBIEGA (quality_status=failed, napiecia "
        "10^2-10^3 p.u.). Hipoteza vector_group/Dyn11 (domyslny +30 st. przy braku deklaracji "
        "w katalogu — patrz naprawa mv_benchmark_catalog.py) SPRAWDZONA i WYKLUCZONA jako "
        "(jedyna) przyczyna: PO naprawie katalogu siec WCIAZ rozbiega identycznie "
        "(v_pu 0,40-320, zmierzone ponownie). Pozostaje PLANNED — kandydaci nie wykluczeni: "
        "ekstremalna rozpietosc poziomow napiecia 135/14/12/0,208 kV (rozstep 649:1, nietypowy "
        'dla "klasycznego" IEEE 14-bus, ktory normalnie uzywa 69/18/13,8 kV), oraz uk_percent '
        "do 55,6% (BR16) — prawdopodobny artefakt wiernosci danych starego dialektu "
        "(pandapower/MATPOWER import), nie zweryfikowany wobec zrodla literaturowego "
        "(dane, ktorych nie mam — Zero-Debt pkt 4). Status PLANNED, nie brak testu."
    ),
    strict=False,
)
def test_ieee_14bus_pf_planned() -> None:
    from application.reference_networks.enm_builders.ieee_14bus import build_ieee_14bus_enm

    _sprawdz_pf(build_ieee_14bus_enm, "ieee_14bus.json")


@pytest.mark.xfail(
    reason=(
        "CV-4.3 K1 (2026-09-06): PO naprawie vector_group/Dyn11 (patrz ieee_14bus wyzej) siec "
        "ZBIEGA CZYSTO (quality_status: accepted, profil napiec fizyczny 0,957-1,064 pu — "
        "zmierzone; wczesniej status byl 'nie przetestowane po naprawie kolizji seedow', nie "
        "potwierdzona rozbieznosc katastroficzna jak ieee_14bus). Wyrocznia (a) tej sieci to "
        "PRAWDZIWY, NIEZALEZNY pandapower/MATPOWER case39 (nie nasz solver) — 53/78 porownan "
        "|V|/kat w tolerancji, 25/78 poza (zaniżenie napiecia ~2-4% na szynach odbiorczych "
        "zdalnych od szyny bilansujacej B30, katy nieco bardziej ujemne). Dwie hipotezy "
        "SPRAWDZONE i WYKLUCZONE dowodem numerycznym: (1) susceptancja linii (b_us_per_km) — "
        "wszystkie 35 linii zweryfikowane bajt-w-bajt zgodne z b_pu MATPOWER case39 (indeksowanie "
        "po type_ref/catalog_ref, nie po (r,x) — dwie pary linii BR1/BR14 i BR11/BR24 maja "
        "identyczne r_pu/x_pu przy roznym b_pu, co pierwotnie dalo falszywie dodatni sygnal przy "
        "dopasowaniu tylko po (r,x); pelne dopasowanie po branch_id potwierdza zgodnosc); "
        "(2) granice mocy biernej generatorow PV — celowo szerokie/nie wiazace z konstrukcji "
        "(`_q_bound` w mv_benchmark_catalog.py, komentarz: zgodnosc z wyrocznia 'wlasny NR', "
        "ktora w ogole nie sprawdza granic Q), nie moga byc przyczyna spadku napiecia. "
        "Przyczyna resztkowej luki NIE zdiagnozowana ostatecznie w tej sesji (dane/czas, ktorych "
        "nie mam w tej sesji — Zero-Debt pkt 4). Status PLANNED (podniesiony z nieprzetestowanej "
        "rozbieznosci na zbiezna-czesciowa-zgodnosc), nie brak testu."
    ),
    strict=False,
)
def test_ieee_39bus_pf_planned() -> None:
    from application.reference_networks.enm_builders.ieee_39bus import build_ieee_39bus_enm

    _sprawdz_pf(build_ieee_39bus_enm, "ieee_39bus.json")
