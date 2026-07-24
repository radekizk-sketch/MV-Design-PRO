"""Dowód end-to-end „do ostatniego klika" (karta EARTHING-1): grupa połączeń
transformatora steruje prądem zwarcia doziemnego 1F, a ten — przez PRODUKCYJNY
most SC_1F → pakiet dowodowy uziemień — steruje NAPIĘCIEM DOTYKOWYM/KROKOWYM.

Rozszerza dowód V-SM-1 (nastawy 50N/51N) o drugiego konsumenta prądu doziemnego:
decyzję uziemieniową. Łańcuch (każde ogniwo to realny kod produkcyjny):

    vector_group ─► compute_1ph_short_circuit
                 ─► ShortCircuitResult.ikss_a  (I″k1)
                 ─► build_earthing_ground_fault_input  (most produkcyjny)
                 ─► generate_earthing_ground_fault_pack
                 ─► U_d = r·I″k1·R_u  (napięcie dotykowe, z packa)

Dwie sieci różniące się WYŁĄCZNIE grupą (reszta identyczna, ten sam R_u i r):
Dyn11 → I″k1 większy (delta blokuje Z0 źródła), YNyn0 → I″k1 mniejszy. Przy tym
samym uziomie napięcie dotykowe MUSI odziedziczyć tę różnicę: U_d(Dyn) > U_d(YNyn),
proporcjonalnie do I″k1. Gdyby most/pack liczył od stałej zamiast od prądu 1F —
asercje by padły.

Wartości referencyjne I″k1 (hand-calc, z V-SM-1): Dyn11=9750.24 A, YNyn0=8649.10 A.
Uziom testowy R_u=10 Ω, r=0.6 ⇒ U_d(Dyn)=58501.44 V, U_d(YNyn)=51894.60 V.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from application.analyses.earthing.ground_fault_bridge import (
    EARTHING_ELECTRODE_DATA_MISSING,
    EARTHING_WRONG_FAULT_TYPE,
    build_earthing_ground_fault_input,
)
from application.proof_engine.packs.earthing_ground_fault_sn import (
    generate_earthing_ground_fault_pack,
)
from network_model.solvers.short_circuit_core import ShortCircuitType

from .test_vector_group_earth_fault_chain import _run_1ph_on_lv

_R_U_OHM = 10.0  # rezystancja uziomu stanowiska [Ω] (dana projektowa testu)
_SPLIT_R = 0.6  # współczynnik podziału r — udział prądu wracający uziomem
_TS = datetime(2026, 7, 24, tzinfo=UTC)


def _touch_voltage_for(vector_group: str) -> float:
    """Pełny łańcuch: SC 1F → most → pack → U_d [V] (napięcie dotykowe z packa)."""
    sc_result = _run_1ph_on_lv(vector_group)
    bridge = build_earthing_ground_fault_input(
        sc_result,
        project_name="EARTHING-1 chain",
        case_name="case-earthing",
        run_timestamp=_TS,
        solver_version="test",
        earth_electrode_resistance_ohm=_R_U_OHM,
        earth_return_split_factor=_SPLIT_R,
        earthing_mode="rezystor",
        element_id="BN-nN",
    )
    assert bridge.is_ready, bridge.readiness_issues
    assert bridge.pack_input is not None
    document = generate_earthing_ground_fault_pack(bridge.pack_input)
    u_touch = document.summary.key_results["u_touch_v"].value
    assert isinstance(u_touch, float)
    return u_touch


# ---------------------------------------------------------------------------
# Ogniwo 1: most przekazuje prąd doziemny 1F z solvera (I_E = I″k1)
# ---------------------------------------------------------------------------


class TestBridgePassesEarthFaultCurrent:
    def test_earth_current_equals_solver_ik1(self) -> None:
        """I_E w packu = I_u + I_p = I″k1 z solvera (most nie gubi/ nie dokłada prądu)."""
        for vg in ("Dyn11", "YNyn0"):
            sc_result = _run_1ph_on_lv(vg)
            bridge = build_earthing_ground_fault_input(
                sc_result,
                project_name="p",
                case_name="c",
                run_timestamp=_TS,
                solver_version="test",
                earth_electrode_resistance_ohm=_R_U_OHM,
                earth_return_split_factor=_SPLIT_R,
            )
            assert bridge.pack_input is not None
            i_e = bridge.pack_input.i_u_a + bridge.pack_input.i_p_a
            assert i_e == pytest.approx(sc_result.ikss_a)


# ---------------------------------------------------------------------------
# Ogniwo 2: napięcie dotykowe dziedziczy różnicę grupy (dowód „do ostatniego klika")
# ---------------------------------------------------------------------------


class TestTouchVoltageReactsToGroup:
    def test_group_changes_touch_voltage(self) -> None:
        """Zmiana grupy zmienia U_d w tym samym kierunku co I″k1 (Dyn > YNyn)."""
        u_dyn = _touch_voltage_for("Dyn11")
        u_ynyn = _touch_voltage_for("YNyn0")
        assert u_dyn > u_ynyn
        # Różnica realna (nie szum) — słabe źródło daje ~11 %.
        assert (u_dyn - u_ynyn) / u_dyn > 0.05

    def test_touch_voltage_proportional_to_ik1(self) -> None:
        """U_d proporcjonalne do I″k1 — ten sam stosunek co prądy (pack liczy od 1F)."""
        u_dyn = _touch_voltage_for("Dyn11")
        u_ynyn = _touch_voltage_for("YNyn0")
        assert u_ynyn / u_dyn == pytest.approx(8649.10 / 9750.24, rel=1e-3)

    def test_reference_touch_voltages(self) -> None:
        """Wartości referencyjne dla audytu (U_d = r·I″k1·R_u)."""
        assert _touch_voltage_for("Dyn11") == pytest.approx(58501.44, rel=1e-4)
        assert _touch_voltage_for("YNyn0") == pytest.approx(51894.60, rel=1e-4)


# ---------------------------------------------------------------------------
# Ogniwo 3: ZERO fabrykacji — brak danych uziomu ⇒ readiness (fix-action)
# ---------------------------------------------------------------------------


class TestBridgeReadinessOnMissingData:
    def test_missing_resistance_yields_readiness(self) -> None:
        """Brak R_u ⇒ pack nie liczony, readiness z jawnym kodem/komunikatem."""
        sc_result = _run_1ph_on_lv("Dyn11")
        bridge = build_earthing_ground_fault_input(
            sc_result,
            project_name="p",
            case_name="c",
            run_timestamp=_TS,
            solver_version="test",
            earth_electrode_resistance_ohm=None,
            earth_return_split_factor=_SPLIT_R,
            element_id="BN-nN",
        )
        assert not bridge.is_ready
        assert bridge.pack_input is None
        codes = {issue.code for issue in bridge.readiness_issues}
        assert EARTHING_ELECTRODE_DATA_MISSING in codes
        issue = bridge.readiness_issues[0]
        assert "Z_E" in issue.message_pl and "r" in issue.message_pl
        assert issue.element_id == "BN-nN"

    def test_missing_split_factor_yields_readiness(self) -> None:
        sc_result = _run_1ph_on_lv("Dyn11")
        bridge = build_earthing_ground_fault_input(
            sc_result,
            project_name="p",
            case_name="c",
            run_timestamp=_TS,
            solver_version="test",
            earth_electrode_resistance_ohm=_R_U_OHM,
            earth_return_split_factor=None,
        )
        assert not bridge.is_ready
        assert {i.code for i in bridge.readiness_issues} == {EARTHING_ELECTRODE_DATA_MISSING}

    def test_wrong_fault_type_yields_readiness(self) -> None:
        """Typ zwarcia inny niż 1F-Z ⇒ readiness (napięcia dotykowe wymagają 1F)."""
        sc_result = _run_1ph_on_lv("Dyn11")
        object.__setattr__(sc_result, "short_circuit_type", ShortCircuitType.THREE_PHASE)
        bridge = build_earthing_ground_fault_input(
            sc_result,
            project_name="p",
            case_name="c",
            run_timestamp=_TS,
            solver_version="test",
            earth_electrode_resistance_ohm=_R_U_OHM,
            earth_return_split_factor=_SPLIT_R,
        )
        assert not bridge.is_ready
        assert {i.code for i in bridge.readiness_issues} == {EARTHING_WRONG_FAULT_TYPE}


# ---------------------------------------------------------------------------
# Ogniwo 4: determinizm łańcucha
# ---------------------------------------------------------------------------


class TestChainDeterminism:
    def test_deterministic_touch_voltage(self) -> None:
        assert _touch_voltage_for("Dyn11") == _touch_voltage_for("Dyn11")
