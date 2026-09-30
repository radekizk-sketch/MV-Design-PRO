"""Karta P0.3 — zwarcia nN: c per pasmo + scenariusz MIN + korekta temperaturowa R.

docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3, docs/nn/D_KONTRAKT_SN_NN_V1.md §4.

Covers:
1. ``network_model.core.voltage_factor.c_for_node`` — IEC 60909-0 Table 1
   (4 band/scenario combinations + the exact 1.0 kV boundary).
2. (przeniesione) Golden MV+LV z rachunkiem ręcznym, korektą R_θ i c per pasmo —
   na biegu kanonicznym w ``tests/enm/test_canonical_sc_c_per_pasmo.py``.
3. Dispatch input_hash differentiates the MIN/MAX scenario (separate cache).
"""

from __future__ import annotations

import pytest
from domain.execution import compute_solver_input_hash
from network_model.core.voltage_factor import c_for_node

# =============================================================================
# 1. c_for_node — IEC 60909-0 Table 1 lookup
# =============================================================================


class TestCForNode:
    """Table 1: <=1.0 kV -> 1.05/0.95; >1.0 kV -> 1.10/1.00."""

    def test_lv_band_max(self):
        assert c_for_node(0.4, "MAX") == 1.05

    def test_lv_band_min(self):
        assert c_for_node(0.4, "MIN") == 0.95

    def test_mv_band_max(self):
        assert c_for_node(15.0, "MAX") == 1.10

    def test_mv_band_min(self):
        assert c_for_node(15.0, "MIN") == 1.00

    def test_boundary_at_exactly_1kv_is_lv_band(self):
        """1.0 kV itself is <=1.0 kV -> LV band (nN), not MV."""
        assert c_for_node(1.0, "MAX") == 1.05
        assert c_for_node(1.0, "MIN") == 0.95

    def test_just_above_boundary_is_mv_band(self):
        assert c_for_node(1.001, "MAX") == 1.10
        assert c_for_node(1.001, "MIN") == 1.00

    def test_unknown_scenario_raises(self):
        with pytest.raises(ValueError, match="MAX/MIN"):
            c_for_node(15.0, "NOMINAL")  # type: ignore[arg-type]

    @pytest.mark.parametrize("scenario", ["MAX", "MIN"])
    @pytest.mark.parametrize(
        "voltage_kv", [0.0, -0.4, -15.0, float("nan"), float("inf"), float("-inf")]
    )
    def test_non_physical_voltage_is_refused_not_lv_row(self, voltage_kv, scenario):
        """Napięcie spoza każdego pasma × scenariusz: odmowa nazwana, nie wiersz nN.

        Przed 2026-09-25 napięcie zerowe, ujemne albo nieskończone dawało po cichu wiersz
        niskiego napięcia (1,05/0,95) — domysł, który z błędnej danej robił wiarygodnie
        wyglądające c. Tabela 1 IEC 60909-0 nie ma wiersza dla takiego napięcia.
        """
        with pytest.raises(ValueError, match="IEC 60909-0, tabela 1"):
            c_for_node(voltage_kv, scenario)

    @pytest.mark.parametrize(
        ("voltage_kv", "c_max", "c_min"),
        [
            (0.23, 1.05, 0.95),
            (0.4, 1.05, 0.95),
            (0.69, 1.05, 0.95),
            (1.0, 1.05, 0.95),
            (1.001, 1.10, 1.00),
            (15.0, 1.10, 1.00),
            (109.999, 1.10, 1.00),
            (110.0, 1.10, 1.00),
            (400.0, 1.10, 1.00),
        ],
    )
    def test_every_band_boundary_both_scenarios(self, voltage_kv, c_max, c_min):
        """Granice pasm (nN do 1 kV włącznie, SN poniżej 110 kV, WN) × oba scenariusze."""
        assert c_for_node(voltage_kv, "MAX") == c_max
        assert c_for_node(voltage_kv, "MIN") == c_min


# =============================================================================
# 2. Golden MV+LV network — przeniesione na bieg kanoniczny
# =============================================================================
#
# Karta TORY-TYLKO-W-TESTACH (2026-09-30): rachunek ręczny Ik''max (szyna nN i SN),
# c per pasmo w scenariuszach MAX/MIN, korekta R_θ w scenariuszu MIN i jawna nota dla
# kabla bez θk były tu dowodzone na adapterze `execute_short_circuit`, który nie miał
# konsumenta w produkcie (skasowany). Te same dowody na tej samej sieci SN+nN, na biegu
# kanonicznym zwarć: `tests/enm/test_canonical_sc_c_per_pasmo.py` (sekcje 1–3 i 9).
# Reguła „override względem domyślnej klasy StudyCaseConfig” istniała wyłącznie w
# skasowanym adapterze — bieg kanoniczny ma override jawnym `c_factor` w opcjach biegu
# (tamże, sekcja 3).


# =============================================================================
# 3. Dispatch: MIN scenario changes input_hash (separate cache entry)
# =============================================================================


class TestDispatchInputHashDifferentiatesScenario:
    def test_scenario_changes_solver_input_hash(self):
        base_payload = {
            "analysis_type": "SC_3F",
            "fault_node_id": "N2_SZYNA_NN",
            "c_factor_max": 1.10,
        }
        payload_max = {**base_payload, "scenario": "MAX"}
        payload_min = {**base_payload, "scenario": "MIN"}

        hash_max = compute_solver_input_hash(payload_max)
        hash_min = compute_solver_input_hash(payload_min)

        assert hash_max != hash_min
