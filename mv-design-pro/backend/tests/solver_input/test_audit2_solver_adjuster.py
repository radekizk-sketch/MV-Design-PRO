"""
Testy audit2_solver_adjuster (Phase 16) — pre-solver adjustments z audit2_extensions.
"""

from __future__ import annotations

from solver_input.audit2_solver_adjuster import (
    apply_audit2_to_network_model,
    compute_audit2_adjustments,
)


def test_compute_adjustments_none_returns_empty():
    adj = compute_audit2_adjustments(None)
    assert adj.is_empty()
    assert adj.to_dict()["tap_position_changes"] == {}


def test_compute_adjustments_empty_dict_returns_empty():
    adj = compute_audit2_adjustments({})
    assert adj.is_empty()


def test_compute_adjustments_tap_changer_neutral_position():
    extensions = {
        "power_flow_extensions": {
            "tap_changers": [
                {"id": "tc_oltc_110sn_19_125", "type": "oltc", "neutral_position": 0},
            ],
        },
    }
    adj = compute_audit2_adjustments(extensions)
    assert "tc_oltc_110sn_19_125" in adj.tap_position_changes
    assert adj.tap_position_changes["tc_oltc_110sn_19_125"] == 0


def test_rezerwa_mocy_magazynu_nie_wchodzi_juz_do_modelu():
    """Karta K-Q: `reserved_capacity_percent` bylo zgadniete PODWOJNIE.

    Poprzedni pin utrwalal wynik `reserved_pct * 10` z komentarzem
    „10 = 1000kW * 1%", czyli zalozenie, ze KAZDY magazyn ma 1 MW. Zgadniety byl
    i procent rezerwy (pole bez zrodla, usuniete z katalogu), i moc magazynu.
    Dzis rezerwa nie istnieje ani w kontrakcie zmian, ani w sladzie.
    """
    extensions = {
        "power_flow_extensions": {
            "bess_operation_modes_per_der": [
                {"der_id": "der_001", "mode": {"mode_code": "fcr_n"}},
            ],
        },
    }
    adj = compute_audit2_adjustments(extensions)
    assert not hasattr(adj, "bess_p_reserved_changes")
    assert "bess_p_reserved_changes" not in adj.to_dict()
    assert adj.is_empty()


def test_compute_adjustments_pf_droop_with_id_lookup():
    extensions = {
        "power_flow_extensions": {
            "p_f_curves_per_der": [
                {"der_id": "der_001", "curve": {"id": "pf_droop_5"}},
            ],
        },
    }
    adj = compute_audit2_adjustments(extensions)
    # Wariant nastawy nazwany statyzmem: pf_droop_5 -> 5%.
    assert adj.pf_droop_changes["der_001"] == 5.0


def test_compute_adjustments_block_transformer_z():
    extensions = {
        "sc_iec60909_extensions": {
            "block_transformers": [
                {"der_id": "der_001", "transformer": {"id": "btr_pv_15_069_2500"}},
            ],
        },
    }
    adj = compute_audit2_adjustments(extensions)
    z = adj.block_transformer_z_pu["der_001"]
    # btr_pv_15_069_2500 -> typ tr-sn-nn-15-0p69-2p5mva-dyn11-inverter:
    # uk=6%, pk=26,25 kW, sn=2500 kVA -> uR=26,25/2500=1,05%, uX≈√(36-1,1)≈5,91%
    assert abs(z["r_pu"] - 0.0105) < 0.001
    assert 0.05 < z["x_pu"] < 0.07  # ≈0.0592


def test_etykieta_uziemienia_nie_wyznacza_juz_stosunku_z0_z1():
    """Karta K-Q — PIN KLASY po WSZYSTKICH czterech wariantach uziemienia.

    Poprzedni pin utrwalal drabinke zgadnietych stalych (izolowana 100,
    skompensowana 50, przez rezystor 5, bezposrednia 1) i meldowal ja w sladzie
    jako „zastosowana". Zadna nie miala zrodla, a fizycznie stosunek Z0/Z1 zalezy
    od pojemnosci doziemnej sieci, nastrojenia dlawika albo rezystora RAZEM z
    impedancja petli. Impedancje kolejnosci zerowej niesie model
    (`Source.z0_z1_ratio` / `r0_ohm` / `x0_ohm`), nie nazwa wariantu.
    """
    for grounding_type in ("isolated", "petersen_coil", "resistor_grounded", "directly_grounded"):
        extensions = {
            "sc_iec60909_extensions": {
                "mv_neutral_grounding": {"grounding_type": grounding_type},
            },
        }
        adj = compute_audit2_adjustments(extensions)
        assert not hasattr(adj, "grounding_z0_z1_ratio"), grounding_type
        assert "grounding_z0_z1_ratio" not in adj.to_dict(), grounding_type
        assert adj.is_empty(), grounding_type


def test_apply_to_network_model_passes_through_when_no_extensions():
    """Brak extensions -> empty applied dict."""
    graph = {"branches": {}, "buses": {}}
    applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=None)
    assert applied == {
        "tap_position_changes": {},
        "block_transformer_z_changes": {},
        "pf_droop_changes": {},
    }


class _MockTransformerBranch:
    """Minimal stub for TransformerBranch used in apply tests."""

    def __init__(self, branch_id: str):
        self.id = branch_id
        self.tap_position = 5  # initial non-neutral
        self.tap_step_percent = 2.5
        self.uk_percent = 6.0
        self.pk_kw = 24.0
        self.p0_kw = 3.5
        self.i0_percent = 0.4


def test_apply_to_network_model_sets_tap_position_per_transformer():
    """Phase 22: per-transformer mapping rzeczywiscie modyfikuje branch.tap_position."""

    class _MockGraph:
        def __init__(self):
            self.branches = {
                "tr_001": _MockTransformerBranch("tr_001"),
                "tr_002": _MockTransformerBranch("tr_002"),
            }

    graph = _MockGraph()
    extensions = {
        "power_flow_extensions": {
            "transformer_to_tap_changer": {
                "tr_001": {
                    "id": "tc_oltc_110sn_19_125",
                    "neutral_position": 0,
                    "step_percent": 1.25,
                },
                "tr_002": {
                    "id": "tc_detc_snnn_5_25",
                    "neutral_position": 0,
                    "step_percent": 2.5,
                },
            },
        },
    }
    applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)

    # tr_001 i tr_002 dostaja neutral position + nowy step_percent.
    assert graph.branches["tr_001"].tap_position == 0
    assert graph.branches["tr_001"].tap_step_percent == 1.25
    assert graph.branches["tr_002"].tap_position == 0
    assert graph.branches["tr_002"].tap_step_percent == 2.5
    assert "tr_001" in applied["tap_position_changes"]
    assert applied["tap_position_changes"]["tr_001"]["tap_changer_id"] == "tc_oltc_110sn_19_125"


def test_apply_to_network_model_block_transformer_overrides_uk():
    """Phase 22: block-trafo applied per DER (tr_dedicated_{der_id} convention)."""

    class _MockGraph:
        def __init__(self):
            self.branches = {
                "tr_dedicated_der_pv_001": _MockTransformerBranch("tr_dedicated_der_pv_001"),
            }

    graph = _MockGraph()
    extensions = {
        "sc_iec60909_extensions": {
            "block_transformers": [
                {
                    "der_id": "der_pv_001",
                    "transformer": {
                        "id": "btr_pv_15_069_2500",
                        "uk_percent": 6.5,  # changed from default 6.0
                        "pk_kw": 25.0,
                        "p0_kw": 3.6,
                        "i0_percent": 0.42,
                    },
                }
            ],
        },
    }
    applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)
    branch = graph.branches["tr_dedicated_der_pv_001"]
    assert branch.uk_percent == 6.5
    assert branch.pk_kw == 25.0
    assert branch.p0_kw == 3.6
    assert "der_pv_001" in applied["block_transformer_z_changes"]


def test_uziemienie_nie_dopisuje_juz_zgadnietego_z0_z1_do_grafu():
    """Karta K-Q — PIN KLASY po WSZYSTKICH wariantach, takze na sciezce zapisu.

    Poprzedni pin utrwalal wpisanie stalej 50,0 do `graph.z0_z1_ratio` i do
    sladu. To bylo zgadniecie wchodzace do modelu przed solverem.
    """
    for grounding_type in ("isolated", "petersen_coil", "resistor_grounded", "directly_grounded"):
        graph: dict = {"branches": {}}
        extensions = {
            "sc_iec60909_extensions": {
                "mv_neutral_grounding": {"grounding_type": grounding_type},
            },
        }
        applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)
        assert "grounding_z0_z1_ratio" not in applied, grounding_type
        assert "z0_z1_ratio" not in graph, grounding_type


class _MockInverterSource:
    """Stub for InverterSource."""

    def __init__(self, source_id: str):
        self.id = source_id
        self.in_rated_a = 100.0


def test_apply_nie_ustawia_juz_rezerwy_mocy_na_zrodle_falownikowym():
    """Karta K-Q: zgadniety procent rezerwy nie dotyka juz zrodla w grafie."""

    class _MockGraph:
        def __init__(self):
            self.branches = {}
            self.inverter_sources = {
                "der_bess_001": _MockInverterSource("der_bess_001"),
            }

    graph = _MockGraph()
    extensions = {
        "power_flow_extensions": {
            "bess_operation_modes_per_der": [
                {
                    "der_id": "der_bess_001",
                    "mode": {
                        "mode_code": "fcr_n",
                        "reserved_capacity_percent": 50,
                    },
                },
            ],
        },
    }
    applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)
    inv = graph.inverter_sources["der_bess_001"]
    assert not hasattr(inv, "reserved_capacity_percent")
    assert "bess_reserved_changes" not in applied


def test_apply_to_network_model_pf_droop():
    """Phase 28: P(f) droop ustawia inverter.frequency_droop_percent + f_min/max/deadband."""

    class _MockGraph:
        def __init__(self):
            self.branches = {}
            self.inverter_sources = {
                "der_pv_001": _MockInverterSource("der_pv_001"),
            }

    graph = _MockGraph()
    extensions = {
        "power_flow_extensions": {
            "p_f_curves_per_der": [
                {
                    "der_id": "der_pv_001",
                    "curve": {
                        "droop_percent": 5.0,
                        "f_min_hz": 47.5,
                        "f_max_hz": 51.5,
                        "deadband_hz": 0.2,
                    },
                },
            ],
        },
    }
    applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)
    inv = graph.inverter_sources["der_pv_001"]
    assert inv.frequency_droop_percent == 5.0
    assert inv.f_min_hz == 47.5
    assert inv.f_max_hz == 51.5
    assert inv.deadband_hz == 0.2
    assert applied["pf_droop_changes"]["der_pv_001"]["droop_percent"] == 5.0


def test_apply_to_network_model_combines_all_adjustments():
    """Pelna kombinacja: zaczep + block-trafo + P(f); uziemienie i rezerwa BESS
    nie wnosza juz zadnej liczby (karta K-Q)."""

    class _MockGraph:
        def __init__(self):
            self.branches = {
                "tr_001": _MockTransformerBranch("tr_001"),
                "tr_dedicated_der_pv_001": _MockTransformerBranch("tr_dedicated_der_pv_001"),
            }
            self.inverter_sources = {
                "der_bess_001": _MockInverterSource("der_bess_001"),
                "der_pv_001": _MockInverterSource("der_pv_001"),
            }

    graph = _MockGraph()
    extensions = {
        "power_flow_extensions": {
            "transformer_to_tap_changer": {
                "tr_001": {
                    "id": "tc_oltc_110sn_19_125",
                    "neutral_position": 0,
                    "step_percent": 1.25,
                },
            },
            "bess_operation_modes_per_der": [
                {
                    "der_id": "der_bess_001",
                    "mode": {"mode_code": "fcr_n", "reserved_capacity_percent": 50},
                },
            ],
            "p_f_curves_per_der": [
                {
                    "der_id": "der_pv_001",
                    "curve": {
                        "droop_percent": 5,
                        "f_min_hz": 47.5,
                        "f_max_hz": 51.5,
                        "deadband_hz": 0.2,
                    },
                },
            ],
        },
        "sc_iec60909_extensions": {
            "block_transformers": [
                {
                    "der_id": "der_pv_001",
                    "transformer": {
                        "id": "btr",
                        "uk_percent": 6.5,
                        "pk_kw": 25,
                        "p0_kw": 3.6,
                        "i0_percent": 0.42,
                    },
                },
            ],
            "mv_neutral_grounding": {"grounding_type": "petersen_coil"},
        },
    }
    applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)
    # Trzy tory adjustments, ktore maja pokrycie w danych: zaczep, block-trafo, P(f).
    assert graph.branches["tr_001"].tap_position == 0
    assert graph.branches["tr_dedicated_der_pv_001"].uk_percent == 6.5
    assert graph.inverter_sources["der_pv_001"].frequency_droop_percent == 5
    # Dwa tory bez pokrycia (karta K-Q) nie zostawiaja sladu ANI na grafie.
    assert "grounding_z0_z1_ratio" not in applied
    assert "bess_reserved_changes" not in applied
    assert not hasattr(graph.inverter_sources["der_bess_001"], "reserved_capacity_percent")


def test_determinism_same_extensions_same_adjustments():
    extensions = {
        "power_flow_extensions": {
            "tap_changers": [{"id": "tc_oltc_110sn_19_125", "neutral_position": 0}],
            "p_f_curves_per_der": [
                {"der_id": "d1", "curve": {"id": "pf_droop_5"}},
            ],
        },
    }
    a1 = compute_audit2_adjustments(extensions)
    a2 = compute_audit2_adjustments(extensions)
    assert a1.to_dict() == a2.to_dict()
