"""
Tests for P0.9 StudyCaseConfig extensions (sc_input_mode toggle; operator moved to the model).

Verifies the domain.study_case.StudyCaseConfig class (the parallel
domain.study_case_engine module and its tests were removed CV-3.2 — dead code,
0 importers in src; semantics live in enm/scenariusze.py::OperatingScenario).

Scope:
- Operator sieci NIE jest konfiguracją przypadku (dana modelu, dodatek GPZ-DANE-ANALIZ)
- Round-trip serialization (to_dict + from_dict)
- Backward-compat with legacy data (older study case JSON without new fields)
- SC input mode toggle (simplified | advanced)
"""

from domain.study_case import StudyCaseConfig


class TestOperatorNieJestKonfiguracjaPrzypadku:
    """Dodatek karty GPZ-DANE-ANALIZ: operator sieci jest JEDNĄ daną MODELU
    (`header.connection_conditions.operator_sieci`), nie konfiguracją przypadku — dawne
    `operator_profile_id` (domyślnie „enea", domysł) usunięte bez warstwy zgodności."""

    def test_konfiguracja_nie_niesie_operatora(self) -> None:
        cfg = StudyCaseConfig()
        assert not hasattr(cfg, "operator_profile_id")
        assert "operator_profile_id" not in cfg.to_dict()

    def test_zapisany_dawny_klucz_nie_wraca_do_konfiguracji(self) -> None:
        cfg = StudyCaseConfig.from_dict({"base_mva": 100.0, "operator_profile_id": "pse"})
        assert "operator_profile_id" not in cfg.to_dict()


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
        legacy = {"base_mva": 100.0}
        cfg = StudyCaseConfig.from_dict(legacy)
        assert cfg.sc_input_mode == "simplified"
        assert cfg.sc_simplified_sk_mva is None
        assert cfg.sc_simplified_r_x_ratio == 0.1


class TestCombined:
    """Combined assertions: full P0.9 default config."""

    def test_full_default_config(self) -> None:
        cfg = StudyCaseConfig()
        assert cfg.sc_input_mode == "simplified"
        assert cfg.sc_simplified_sk_mva is None
        assert cfg.sc_simplified_r_x_ratio == 0.1
        # Pre-existing defaults preserved (c i t_k skasowane z przypadku — karta
        # WSPOLCZYNNIK-C-JEDEN-NOSNIK, nośnikiem jest scenariusz zwarciowy)
        assert cfg.base_mva == 100.0

    def test_full_round_trip_all_p09_fields(self) -> None:
        cfg = StudyCaseConfig(
            sc_input_mode="simplified",
            sc_simplified_sk_mva=400.0,
            sc_simplified_r_x_ratio=0.12,
        )
        d = cfg.to_dict()
        restored = StudyCaseConfig.from_dict(d)
        assert restored.sc_input_mode == "simplified"
        assert restored.sc_simplified_sk_mva == 400.0
        assert restored.sc_simplified_r_x_ratio == 0.12
