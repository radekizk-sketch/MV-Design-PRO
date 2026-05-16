"""
Tests for P0.9 StudyCaseConfig extensions (V12K-014 operator profile + sc_input_mode toggle).

Verifies the domain.study_case.StudyCaseConfig class (not domain.study_case_engine —
the two are parallel; see test_study_case_engine.py docstring for context).

Scope:
- Default values per /goal V12K (ENEA Operator + simplified SC mode)
- Round-trip serialization (to_dict + from_dict)
- Backward-compat with legacy data (older study case JSON without new fields)
- All 5 operator profiles supported
- SC input mode toggle (simplified | advanced)
"""

from domain.study_case import StudyCaseConfig


class TestOperatorProfileDefaults:
    """P0.9a — operator_profile_id default ENEA per /goal V12K."""

    def test_default_operator_is_enea(self) -> None:
        cfg = StudyCaseConfig()
        assert cfg.operator_profile_id == "enea"

    def test_dict_serialization_includes_operator(self) -> None:
        cfg = StudyCaseConfig()
        d = cfg.to_dict()
        assert "operator_profile_id" in d
        assert d["operator_profile_id"] == "enea"

    def test_round_trip_preserves_operator(self) -> None:
        for op in ("pse", "energa", "tauron", "enea", "pge"):
            cfg = StudyCaseConfig(operator_profile_id=op)
            d = cfg.to_dict()
            restored = StudyCaseConfig.from_dict(d)
            assert restored.operator_profile_id == op

    def test_legacy_dict_falls_back_to_enea(self) -> None:
        """Backward-compat: legacy study case JSON without operator_profile_id."""
        legacy = {"c_factor_max": 1.10}
        cfg = StudyCaseConfig.from_dict(legacy)
        assert cfg.operator_profile_id == "enea"


class TestScInputModeDefaults:
    """P0.9b — sc_input_mode default 'simplified' + simplified fields."""

    def test_default_mode_is_simplified(self) -> None:
        cfg = StudyCaseConfig()
        assert cfg.sc_input_mode == "simplified"

    def test_default_simplified_fields(self) -> None:
        cfg = StudyCaseConfig()
        # S″k not set by default — must be filled by user
        assert cfg.sc_simplified_sk_mva is None
        # R/X has sensible default 0.1
        assert cfg.sc_simplified_r_x_ratio == 0.1

    def test_advanced_mode_round_trip(self) -> None:
        cfg = StudyCaseConfig(sc_input_mode="advanced")
        d = cfg.to_dict()
        restored = StudyCaseConfig.from_dict(d)
        assert restored.sc_input_mode == "advanced"

    def test_simplified_with_sk_mva(self) -> None:
        cfg = StudyCaseConfig(
            sc_input_mode="simplified",
            sc_simplified_sk_mva=250.0,
            sc_simplified_r_x_ratio=0.08,
        )
        d = cfg.to_dict()
        restored = StudyCaseConfig.from_dict(d)
        assert restored.sc_input_mode == "simplified"
        assert restored.sc_simplified_sk_mva == 250.0
        assert restored.sc_simplified_r_x_ratio == 0.08

    def test_legacy_dict_falls_back_to_simplified(self) -> None:
        legacy = {"c_factor_max": 1.10}
        cfg = StudyCaseConfig.from_dict(legacy)
        assert cfg.sc_input_mode == "simplified"
        assert cfg.sc_simplified_sk_mva is None
        assert cfg.sc_simplified_r_x_ratio == 0.1


class TestCombined:
    """Combined assertions: full P0.9 default config."""

    def test_full_default_config(self) -> None:
        cfg = StudyCaseConfig()
        assert cfg.operator_profile_id == "enea"
        assert cfg.sc_input_mode == "simplified"
        assert cfg.sc_simplified_sk_mva is None
        assert cfg.sc_simplified_r_x_ratio == 0.1
        # Pre-existing defaults preserved
        assert cfg.c_factor_max == 1.10
        assert cfg.c_factor_min == 0.95
        assert cfg.base_mva == 100.0

    def test_full_round_trip_all_p09_fields(self) -> None:
        cfg = StudyCaseConfig(
            operator_profile_id="tauron",
            sc_input_mode="simplified",
            sc_simplified_sk_mva=400.0,
            sc_simplified_r_x_ratio=0.12,
        )
        d = cfg.to_dict()
        restored = StudyCaseConfig.from_dict(d)
        assert restored.operator_profile_id == "tauron"
        assert restored.sc_input_mode == "simplified"
        assert restored.sc_simplified_sk_mva == 400.0
        assert restored.sc_simplified_r_x_ratio == 0.12
