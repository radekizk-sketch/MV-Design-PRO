"""Wyrocznia (a) — ENM-bliźniaki benchmarków vs `expected/*.json` (CV-4.3 K1).

Buduje każdą sieć przez `tests/golden/enm_builders/*.py` (operacje domenowe +
typy katalogowe `benchmark` — K1.1/K1.2; przeniesione z `application/
reference_networks/enm_builders/` kartą K2, 2026-09-09, razem z `comparator.py`
i `expected_values.py` niżej — treść niezmieniona), liczy TOREM KANONICZNYM
(`enm/canonical_analysis.py` -> FROZEN `power_flow_newton`/
`ShortCircuitIEC60909Solver`) i porównuje z `expected/*.json` (tolerancja
zadeklarowana PER WIERSZ w pliku — `comparator.py`, DAWNIEJ ta sama
infrastruktura co `/api/v1/reference-networks/*/validate`, usunięte kartą K2 —
dziś wyłącznie tor kanoniczny). Rozbieżność ponad tolerancję jest DEFEKTEM do
wyjaśnienia (K1.3) — nigdy nie luzuje się tolerancji, żeby przepchnąć
niezgodność.

Sieć NIESYMETRYCZNA ieee_34bus: do karty W5-D (2026-09-16) nosiła `xfail` K1.4
(PLANNED — FROZEN `power_flow_newton` liczy wyłącznie sieci symetryczne); od W5-D
liczy ją bieg kanoniczny `rozplyw_niesymetryczny` (FROZEN `power_flow_unbalanced.py`
przez `enm/assembler.py`) — patrz `test_ieee_34bus_pf_niesymetryczny_zgodny_z_wyrocznia_a`
(zero xfail/skip w tym pliku). ieee_13bus ma swój WŁASNY test — patrz
`test_ieee_13bus_pf_aproksymacja_pozytywnosekwencyjna`, weryfikuje tylko
pozytywno-sekwencyjną aproksymację, nie prawdziwą fizykę niesymetryczną. Markery
`xfail` K1 dla ieee_14bus (rozbiegał katastroficznie) i ieee_39bus (resztkowa luka
2–4 %) ZDJĘTE w CV-4.3 K7 (2026-09-09): przyczyny leżały w DANYCH bliźniaków, nie
w solverze — patrz docstringi `test_ieee_14bus_pf_zgodny_z_wyrocznia_a` i
`test_ieee_39bus_pf_zgodny_z_wyrocznia_a`.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path
from typing import Any

from enm.canonical_analysis import CanonicalRun, _execute_power_flow, _execute_short_circuit
from enm.mapping import _ref_to_uuid
from enm.models import EnergyNetworkModel

from tests.golden.parytet_benchmarkow.comparator import compare_power_flow, compare_short_circuit
from tests.golden.parytet_benchmarkow.expected_values import load_expected_values_from_json

_EXPECTED_DIR = Path(__file__).parent / "expected"


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
    from tests.golden.enm_builders.ieee_4bus import build_ieee_4bus_enm

    _sprawdz_pf(build_ieee_4bus_enm, "ieee_4bus.json")


def test_ieee_9bus_pf() -> None:
    from tests.golden.enm_builders.ieee_9bus import build_ieee_9bus_enm

    _sprawdz_pf(build_ieee_9bus_enm, "ieee_9bus.json")


def test_cigre_mv_pf() -> None:
    from tests.golden.enm_builders.cigre_mv import build_cigre_mv_enm

    _sprawdz_pf(build_cigre_mv_enm, "cigre_mv.json")


def test_cigre_lv_benchmark_pf() -> None:
    from tests.golden.enm_builders.cigre_lv_benchmark import (
        build_cigre_lv_benchmark_enm,
    )

    _sprawdz_pf(build_cigre_lv_benchmark_enm, "cigre_lv_benchmark.json")


def test_pp_simple_four_bus_pf() -> None:
    from tests.golden.enm_builders.pp_simple_four_bus import (
        build_pp_simple_four_bus_enm,
    )

    _sprawdz_pf(build_pp_simple_four_bus_enm, "pp_simple_four_bus.json")


def test_oze_pv_bess_pf() -> None:
    from tests.golden.enm_builders.oze_pv_bess import build_oze_pv_bess_enm

    _sprawdz_pf(build_oze_pv_bess_enm, "oze_pv_bess.json")


def test_iec60909_example_sc() -> None:
    from tests.golden.enm_builders.iec60909_example import (
        build_iec60909_example_enm,
    )

    _sprawdz_sc(build_iec60909_example_enm, "iec60909_example.json")


def test_pandapower_iec60909_radial_sc() -> None:
    from tests.golden.enm_builders.pandapower_iec60909_radial import (
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
    from tests.golden.enm_builders.ieee_13bus import build_ieee_13bus_enm

    _sprawdz_pf(build_ieee_13bus_enm, "ieee_13bus.json")


#: Składowa zerowa linii IEEE 34 (Ω/km) z macierzy impedancji fazowych Kerstinga
#: (IEEE PES Distribution Test Feeders, konfiguracje 300 i 301; Z₀ = Z_s + 2·Z_m z
#: uśrednionej przekątnej/pozadiagonali, Ω/mila ÷ 1,609344). Bliźniak ENM
#: (`enm_builders/ieee_34bus.py`, tabela per-unit) i katalog `bench_ieee34bus_*` nie
#: niosą R0/X0 — bez nich bieg kanoniczny odmawia (`branch.zero_sequence_missing`,
#: bez podstawiania Z0 = Z1), więc test wpisuje je operacją domenową jako DANĄ
#: WEJŚCIOWĄ z nazwanym źródłem, a nie modyfikuje katalogu golden (odciski rejestru
#: sieci nietknięte). Dla obciążeń symetrycznych wynik NIE zależy od Z₀ (I_a+I_b+I_c ≡ 0
#: ⇒ spadek fazy = Z₁·I) — przypięte niżej dwoma różnymi kompletami.
_Z0_IEEE34_KERSTING_OHM_PER_KM: dict[str, tuple[float, float]] = {
    "cfg300": (1.0873, 1.4737),
    "cfg301": (1.4843, 1.5972),
}

#: Szyny wyroczni nieobecne w bliźniaku ENM — jawnie, z powodu (docstring buildera:
#: BUS-862 nieosiągalna w danych starego dialektu, BUS-838 za nią). Test PILNUJE, że
#: zbiór brakujących szyn jest DOKŁADNIE ten (nowa luka = czerwony test, nie cichy pomiń).
_SZYNY_IEEE34_POZA_BLIZNIAKIEM = frozenset({"BUS-838", "BUS-862"})


def _ieee34_z_skladowa_zerowa(snapshot: dict[str, Any], r0: float, x0: float) -> dict[str, Any]:
    from enm.domain_operations import execute_domain_operation

    for galaz in list(snapshot["branches"]):
        if galaz.get("type") not in ("cable", "line_overhead"):
            continue
        wynik = execute_domain_operation(
            enm_dict=snapshot,
            op_name="update_element_parameters",
            payload={
                "element_ref": galaz["ref_id"],
                "parameters": {"r0_ohm_per_km": r0, "x0_ohm_per_km": x0},
            },
        )
        assert not wynik.get("error"), wynik.get("error")
        snapshot = wynik["snapshot"]
    return snapshot


def _bieg_niesymetryczny_ieee34(konfiguracja: str) -> tuple[Any, CanonicalRun]:
    from enm.canonical_analysis import _wykonaj_analize_biegu

    from tests.golden.enm_builders.ieee_34bus import build_ieee_34bus_enm

    result = build_ieee_34bus_enm()
    r0, x0 = _Z0_IEEE34_KERSTING_OHM_PER_KM[konfiguracja]
    snapshot = _ieee34_z_skladowa_zerowa(
        EnergyNetworkModel.model_validate(result.enm).model_dump(mode="json"), r0, x0
    )
    run = _bieg(snapshot, "rozplyw_niesymetryczny", {"base_mva": 100.0})
    # Bieg kanoniczny przez JEDYNY dyspozytor (`no_direct_fault_params_guard`, CV-4).
    _wykonaj_analize_biegu(run)
    return result, run


def _napiecia_fazy_a(result: Any, run: CanonicalRun) -> dict[str, dict[str, float]]:
    szyny = {row["bus_id"]: row for row in run.raw_result["result_v1"]["bus_results"]}
    actual: dict[str, dict[str, float]] = {}
    for lit_id, ref_id in result.bus_map.items():
        row = szyny[_ref_to_uuid(ref_id)]
        assert row["solved"], f"{lit_id}: szyna nierozwiązana w biegu niesymetrycznym"
        # Sieć symetryczna (odbiory trójfazowe): |U_A| = |U_B| = |U_C| co do bitu
        # po zaokrągleniu kontraktu — faza A reprezentuje moduł i kąt (jak NR).
        assert row["faza_a"]["u_pu"] == row["faza_b"]["u_pu"] == row["faza_c"]["u_pu"]
        actual[lit_id] = {"v_pu": row["faza_a"]["u_pu"], "angle_deg": row["faza_a"]["angle_deg"]}
    return actual


def test_ieee_34bus_pf_niesymetryczny_zgodny_z_wyrocznia_a() -> None:
    """IEEE 34-bus przez bieg kanoniczny `rozplyw_niesymetryczny` (karta W5-D) wobec
    wyroczni (a) `expected/ieee_34bus.json`.

    Do W5-D test nosił `xfail` (K1.4: FROZEN `power_flow_newton` nie liczy sieci
    niesymetrycznych). Bieg niesymetryczny (assembler ES→TV→IR → FROZEN
    `power_flow_unbalanced.py`) liczy tę sieć naprawdę: 30 szyn zbieżnych, zero xfail.

    CO MÓWI WYROCZNIA (uczciwie): plik deklaruje w `source_note` „BFS regression baseline
    z naszego uproszczonego 34-bus builder" — stary dialekt (skasowany kartą K2) liczył
    BFS na BAZIE TRÓJFAZOWEJ (S_base, U_LL), która daje spadki napięcia 3× za małe
    (pomiar karty W5-D, `enm/assembler.py`, nagłówek sekcji rozpływu niesymetrycznego).
    Bieg kanoniczny liczy na bazie jednej fazy (S_base/3, U_LL/√3). Pomiar 2026-09-16:
    max|ΔU| = 2,83·10⁻⁴ pu, max|Δkąt| = 0,0121° — obie różnice mieszczą się w rtol
    0,005 zadeklarowanym per wiersz pliku, ale stosunek spadków napięcia wynosi
    DOKŁADNIE 3,00 — przypięty niżej, żeby „parytet" nie udawał tej samej fizyki.
    Klasa wyroczni: REGRESSION_ONLY (rejestr §32) — nie dowód fizyki niesymetrycznej.
    """
    result, run = _bieg_niesymetryczny_ieee34("cfg300")
    assert run.raw_result["result_v1"]["converged"] is True
    actual = _napiecia_fazy_a(result, run)

    expected = load_expected_values_from_json(_EXPECTED_DIR / "ieee_34bus.json")
    brakujace = {row.bus_id for row in expected.power_flow if row.bus_id not in result.bus_map}
    assert brakujace == _SZYNY_IEEE34_POZA_BLIZNIAKIEM, brakujace
    expected_w_blizniaku = dataclasses.replace(
        expected,
        power_flow=tuple(row for row in expected.power_flow if row.bus_id in result.bus_map),
    )
    comparisons = compare_power_flow(actual, expected_w_blizniaku)
    failures = [c for c in comparisons if c.status == "FAIL"]
    assert not failures, "\n".join(
        f"{c.element_id}.{c.quantity}: actual={c.actual} expected={c.expected} "
        f"rtol={c.rtol} rel_diff={c.rel_diff}"
        for c in failures
    )
    assert len(comparisons) == 2 * (len(expected.power_flow) - len(brakujace))
    max_dv = max(abs(c.actual - c.expected) for c in comparisons if c.quantity == "v_pu")
    assert max_dv <= 5e-4, f"pomiar karty: 2,83e-4 pu; teraz {max_dv:.3e}"

    # Baza jednej fazy vs baza trójfazowa wyroczni: spadek na najdalszej szynie 3× większy.
    spadek_biegu = 1.0 - min(v["v_pu"] for v in actual.values())
    spadek_wyroczni = 1.0 - min(row.v_pu for row in expected_w_blizniaku.power_flow)
    assert 2.9 <= spadek_biegu / spadek_wyroczni <= 3.1, (spadek_biegu, spadek_wyroczni)


def test_ieee_34bus_wynik_symetryczny_nie_zalezy_od_z0() -> None:
    """Dwa komplety Z₀ z literatury (cfg 300 i cfg 301) — napięcia bit w bit równe."""
    result_a, run_a = _bieg_niesymetryczny_ieee34("cfg300")
    result_b, run_b = _bieg_niesymetryczny_ieee34("cfg301")
    assert _napiecia_fazy_a(result_a, run_a) == _napiecia_fazy_a(result_b, run_b)


def test_ieee_14bus_pf_zgodny_z_wyrocznia_a() -> None:
    """IEEE case14 wobec MATPOWER/pandapower (wyrocznia (a) `expected/ieee_14bus.json`).

    Do CV-4.3 K7 (2026-09-09) test nosił `xfail` K1: kanoniczny PF NIE ZBIEGAŁ
    (|U| 0,40–320 p.u.). Przyczyny — żadna w solverze FROZEN, wszystkie w DANYCH
    bliźniaka: (1) katalog benchmark stemplował 8 odcinków obszaru 0,208 kV bazą
    impedancji 135 kV (`mv_benchmark_catalog._POZIOM_LINII_KV`: baza p.u. linii =
    napięcie jej szyn), (2) brak napięcia zadanego szyny bilansującej 1,06 p.u.
    (`Source.u_set_pu`), (3) granice Q ±150 Mvar wiązały na stanie przejściowym
    iteracji przy błędnej bazie (po (1)+(2): 0 przełączeń PV→PQ). Zgodność z
    `pandapower.networks.case14()` + `runpp`: max|ΔU| 3·10⁻⁵ p.u.
    (`tests/network_model/test_blizniaki_matpower_napiecia.py`).
    """
    from tests.golden.enm_builders.ieee_14bus import build_ieee_14bus_enm

    _sprawdz_pf(build_ieee_14bus_enm, "ieee_14bus.json")


def test_ieee_39bus_pf_zgodny_z_wyrocznia_a() -> None:
    """IEEE case39 wobec MATPOWER/pandapower (wyrocznia (a) `expected/ieee_39bus.json`).

    Do CV-4.3 K7 (2026-09-09) test nosił `xfail` K1: resztkowa luka 2–4 % na szynach
    odbiorczych (25/78 porównań poza tolerancją). Przyczyny — w danych bliźniaka, nie
    w solverze: (1) slack 1,0 zamiast 0,982 p.u. (`Source.u_set_pu`), (2) transformatory
    BR36 (6–31) i BR38 (12–11) z zaczepem MATPOWER po stronie „from” budowane od strony
    „to”, więc zaczep siedział na odwrotnym uzwojeniu (`add_transformer_sn_nn` z
    `hv_voltage_kv`: nowa szyna HV nad istniejącą LV). Zgodność z
    `pandapower.networks.case39()` + `runpp`: max|ΔU| < 1·10⁻⁵ p.u.
    """
    from tests.golden.enm_builders.ieee_39bus import build_ieee_39bus_enm

    _sprawdz_pf(build_ieee_39bus_enm, "ieee_39bus.json")
