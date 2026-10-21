"""Karta P0.3 — zwarcia nN: c per pasmo + scenariusz MIN + korekta temperaturowa R.

docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3, docs/nn/D_KONTRAKT_SN_NN_V1.md §4.

Covers:
1. ``network_model.core.voltage_factor.c_for_node`` — IEC 60909-0 Table 1
   (band × nN tolerance × scenario + the exact 1.0 kV boundary).
2. (przeniesione) Golden MV+LV z rachunkiem ręcznym, korektą R_θ i c per pasmo —
   na biegu kanonicznym w ``tests/enm/test_canonical_sc_c_per_pasmo.py``.
3. Dispatch input_hash differentiates the MIN/MAX scenario (separate cache).
"""

from __future__ import annotations

import pytest
from domain.execution import compute_solver_input_hash
from network_model.core.voltage_factor import OdmowaToleranciiNnError, c_for_node

# =============================================================================
# 1. c_for_node — IEC 60909-0 Table 1 lookup
# =============================================================================


class TestCForNode:
    """Table 1: nN +6 % -> 1.05/0.95; nN +10 % -> 1.10/0.90; >1.0 kV -> 1.10/1.00.

    Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: wiersz nN zależy od tolerancji sieci nN (jawny
    argument); intencja dawnych testów (pasmo × scenariusz × granica 1 kV) zachowana jako
    iloczyn z tolerancją.
    """

    @pytest.mark.parametrize(
        ("tolerancja", "c_max", "c_min"), [("PLUS_6", 1.05, 0.95), ("PLUS_10", 1.10, 0.90)]
    )
    def test_lv_band_per_tolerance(self, tolerancja, c_max, c_min):
        assert c_for_node(0.4, "MAX", tolerancja_nn=tolerancja) == c_max
        assert c_for_node(0.4, "MIN", tolerancja_nn=tolerancja) == c_min

    @pytest.mark.parametrize("tolerancja", [None, "PLUS_6", "PLUS_10"])
    def test_mv_band_ignores_tolerance(self, tolerancja):
        assert c_for_node(15.0, "MAX", tolerancja_nn=tolerancja) == 1.10
        assert c_for_node(15.0, "MIN", tolerancja_nn=tolerancja) == 1.00

    @pytest.mark.parametrize("scenario", ["MAX", "MIN"])
    @pytest.mark.parametrize("tolerancja", [None, "PLUS_7", ""])
    def test_lv_band_without_tolerance_is_refused(self, tolerancja, scenario):
        """Węzeł nN bez (albo z nieznaną) tolerancją sieci: odmowa nazwana, nie wiersz +6 %."""
        with pytest.raises(OdmowaToleranciiNnError) as blad:
            c_for_node(0.4, scenario, tolerancja_nn=tolerancja)
        # Postać strukturalna (partia 10): kod w polu odmowy nazwanej, nie w treści.
        assert blad.value.kod == "fault.c_tolerancja_nn_brak"
        assert "fault.c_tolerancja_nn_brak" not in str(blad.value)

    def test_boundary_at_exactly_1kv_is_lv_band(self):
        """1.0 kV itself is <=1.0 kV -> LV band (nN), not MV."""
        assert c_for_node(1.0, "MAX", tolerancja_nn="PLUS_6") == 1.05
        assert c_for_node(1.0, "MIN", tolerancja_nn="PLUS_6") == 0.95
        with pytest.raises(OdmowaToleranciiNnError):
            c_for_node(1.0, "MAX", tolerancja_nn=None)

    def test_just_above_boundary_is_mv_band(self):
        assert c_for_node(1.001, "MAX", tolerancja_nn=None) == 1.10
        assert c_for_node(1.001, "MIN", tolerancja_nn=None) == 1.00

    def test_unknown_scenario_raises(self):
        with pytest.raises(ValueError, match="MAX/MIN"):
            c_for_node(15.0, "NOMINAL", tolerancja_nn=None)  # type: ignore[arg-type]

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
            c_for_node(voltage_kv, scenario, tolerancja_nn="PLUS_6")

    @pytest.mark.parametrize(
        ("voltage_kv", "tolerancja", "c_max", "c_min"),
        [
            (0.23, "PLUS_6", 1.05, 0.95),
            (0.23, "PLUS_10", 1.10, 0.90),
            (0.4, "PLUS_6", 1.05, 0.95),
            (0.4, "PLUS_10", 1.10, 0.90),
            (0.69, "PLUS_6", 1.05, 0.95),
            (0.69, "PLUS_10", 1.10, 0.90),
            (1.0, "PLUS_6", 1.05, 0.95),
            (1.0, "PLUS_10", 1.10, 0.90),
            (1.001, None, 1.10, 1.00),
            (15.0, None, 1.10, 1.00),
            (109.999, None, 1.10, 1.00),
            (110.0, None, 1.10, 1.00),
            (400.0, None, 1.10, 1.00),
        ],
    )
    def test_every_band_boundary_both_scenarios(self, voltage_kv, tolerancja, c_max, c_min):
        """Granice pasm (nN do 1 kV włącznie, SN poniżej 110 kV, WN) × oba scenariusze ×
        tolerancja sieci nN."""
        assert c_for_node(voltage_kv, "MAX", tolerancja_nn=tolerancja) == c_max
        assert c_for_node(voltage_kv, "MIN", tolerancja_nn=tolerancja) == c_min


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
