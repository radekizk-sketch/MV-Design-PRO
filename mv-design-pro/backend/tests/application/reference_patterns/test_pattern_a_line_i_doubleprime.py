"""
Tests for Reference Pattern A: Dobór I>> dla linii SN

STATUS (karta W3-C2, 2026-09-09): przebudowany na `ProtectionSettingsEngine`
(Hoppel/IRiESD) — poprzednio konsumował `line_overcurrent_setting` (FIX-12D,
skasowane). Oczekiwane liczby PRZELICZONE z faktycznych przebiegów silnika
Hoppla (nie hand-calc) — tabela PRZED/PO w meldunku karty W3-C2.

Tests cover:
- Verdict ZGODNE (valid window, all criteria pass)
- Verdict NIEZGODNE (invalid window, I_min > I_max)
- Verdict GRANICZNE (narrow window, SPZ blocked, or ZSZ blocking risk)
- Determinism (2× run → identical result)
- WHITE-BOX trace completeness
- Artifacts correctness
- Generacja lokalna (E-L) — rozszerzenie W3-C2

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Tests verify interpretation, not physics
- WHITE BOX: Tests verify trace generation
- DETERMINISM: Tests verify 2× run → identical result
"""

import json

import pytest
from application.protection_settings.engine import (
    ProtectionSettingsEngine,
    ProtectionSettingsInput,
)
from application.reference_patterns import (
    # Pattern A
    PATTERN_ID,
    PATTERN_NAME_PL,
    LineIDoublePrimeReferencePattern,
    compare_results_deterministic,
    run_pattern_a,
    # Helpers
    stable_json,
)

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def valid_input() -> ProtectionSettingsInput:
    """
    Valid input producing ZGODNE verdict.

    Numery jak case_A_zgodne.json: Al 150mm2, ik_max_next=1200A,
    ik3_min_beginning=3000A, k_b=1.2, SPZ wlaczone.
    """
    return ProtectionSettingsInput(
        line_id="line-test-zgodne",
        line_name="Linia SN 15kV - test ZGODNE",
        cross_section_mm2=150.0,
        conductor_material="Al",
        length_km=8.0,
        i_nominal_a=300.0,
        ik3_max_beginning_a=3500.0,
        ik3_min_beginning_a=3000.0,
        ik3_max_end_a=1800.0,
        ik3_min_end_a=1500.0,
        ik2_min_end_a=1300.0,
        ik_max_next_bus_a=1200.0,
        i_load_max_a=150.0,
        k_b=1.2,
        k_bth=1.1,
        spz_enabled=True,
        spz_pause_s=0.5,
    )


@pytest.fixture
def conflicting_input() -> ProtectionSettingsInput:
    """
    Input producing NIEZGODNE verdict (I_min > I_max).

    Numery jak case_B_niezgodne_konflikt.json.
    """
    return ProtectionSettingsInput(
        line_id="line-test-niezgodne",
        line_name="Linia SN 15kV - test NIEZGODNE",
        cross_section_mm2=150.0,
        conductor_material="Al",
        length_km=4.0,
        i_nominal_a=300.0,
        ik3_max_beginning_a=8000.0,
        ik3_min_beginning_a=6000.0,
        ik3_max_end_a=5000.0,
        ik3_min_end_a=4200.0,
        ik2_min_end_a=3600.0,
        ik_max_next_bus_a=6000.0,
        i_load_max_a=180.0,
        k_b=1.2,
        k_bth=1.1,
        spz_enabled=True,
        spz_pause_s=0.5,
    )


@pytest.fixture
def borderline_input() -> ProtectionSettingsInput:
    """
    Input producing GRANICZNE verdict (narrow window).

    Numery jak case_C_graniczne_waskie_okno.json:
    - I_min_sel = k_b * Ik_max_next = 1.2 * 1666.67 = 2000 A
    - I_max_sens = Ik3_min_beginning / k_b = 2496 / 1.2 = 2080 A
    - Window width = 80 A, relative width = 4.0% < 5%
    """
    return ProtectionSettingsInput(
        line_id="line-test-graniczne",
        line_name="Linia SN 15kV - test GRANICZNE",
        cross_section_mm2=150.0,
        conductor_material="Al",
        length_km=6.0,
        i_nominal_a=300.0,
        ik3_max_beginning_a=3500.0,
        ik3_min_beginning_a=2496.0,
        ik3_max_end_a=1800.0,
        ik3_min_end_a=1400.0,
        ik2_min_end_a=1200.0,
        ik_max_next_bus_a=1666.67,
        i_load_max_a=140.0,
        k_b=1.2,
        k_bth=1.1,
        spz_enabled=True,
        spz_pause_s=0.5,
    )


@pytest.fixture
def local_generation_input() -> ProtectionSettingsInput:
    """
    Input producing GRANICZNE verdict via ZSZ blocking risk (rozszerzenie W3-C2).

    Numery jak case_D_generacja_lokalna.json: okno szerokie i prawidlowe,
    SPZ dozwolone — jedynym powodem GRANICZNE jest ryzyko blokady ZSZ
    (udzial E-L 32% >= prog 30%).
    """
    return ProtectionSettingsInput(
        line_id="line-test-generacja-lokalna",
        line_name="Linia SN 15kV - test generacja lokalna",
        cross_section_mm2=150.0,
        conductor_material="Al",
        length_km=5.0,
        i_nominal_a=300.0,
        ik3_max_beginning_a=10000.0,
        ik3_min_beginning_a=3000.0,
        ik3_max_end_a=5000.0,
        ik3_min_end_a=1600.0,
        ik2_min_end_a=1400.0,
        ik_max_next_bus_a=1200.0,
        i_load_max_a=160.0,
        k_b=1.2,
        k_bth=1.1,
        spz_enabled=True,
        spz_pause_s=0.5,
        lokalna_generacja_aktywna=True,
        lokalna_generacja_typ_zrodla="SYNCHRONICZNE",
        lokalna_generacja_wklad_a=3200.0,
        lokalna_generacja_prog_udzialu_zsz=0.3,
    )


@pytest.fixture
def pattern() -> LineIDoublePrimeReferencePattern:
    """Pattern A validator instance."""
    return LineIDoublePrimeReferencePattern()


# =============================================================================
# TEST: VERDICT ZGODNE
# =============================================================================


class TestVerdictZgodne:
    """Tests for ZGODNE (compliant) verdict."""

    def test_verdict_ok_from_input(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test ZGODNE verdict from valid input."""
        result = pattern.validate(input_data=valid_input)

        assert result.verdict == "ZGODNE"
        assert result.pattern_id == PATTERN_ID
        assert result.name_pl == PATTERN_NAME_PL

    def test_verdict_ok_from_fixture(self, pattern: LineIDoublePrimeReferencePattern):
        """Test ZGODNE verdict from fixture file."""
        result = pattern.validate(fixture_file="line_i_doubleprime_case_a.json")

        assert result.verdict == "ZGODNE"

    def test_verdict_ok_via_public_api(self, valid_input: ProtectionSettingsInput):
        """Test ZGODNE verdict via run_pattern_a function."""
        result = run_pattern_a(input_data=valid_input)

        assert result.verdict == "ZGODNE"

    def test_summary_pl_for_zgodne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test Polish summary for ZGODNE verdict."""
        result = pattern.validate(input_data=valid_input)

        assert "ZGODNY" in result.summary_pl
        assert "okno nastaw" in result.summary_pl.lower()

    def test_checks_all_pass_for_zgodne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test all criterion checks PASS for ZGODNE verdict (E-L nieaktywne -> INFO)."""
        result = pattern.validate(input_data=valid_input)

        check_names = [c["name_pl"] for c in result.checks]
        assert "Selektywność I>>" in check_names
        assert "Czułość I>>" in check_names
        assert "Kryterium cieplne" in check_names
        assert "Okno nastaw" in check_names
        assert "SPZ: dozwolone/blokować" in check_names
        assert "Generacja lokalna (E-L)" in check_names

        for check in result.checks:
            if check["name_pl"] == "Generacja lokalna (E-L)":
                assert check["status"] == "INFO"
            else:
                assert check["status"] == "PASS", f"{check['name_pl']} should be PASS"


# =============================================================================
# TEST: VERDICT NIEZGODNE
# =============================================================================


class TestVerdictNiezgodne:
    """Tests for NIEZGODNE (non-compliant) verdict."""

    def test_verdict_conflict_from_input(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        conflicting_input: ProtectionSettingsInput,
    ):
        """Test NIEZGODNE verdict from conflicting input."""
        result = pattern.validate(input_data=conflicting_input)

        assert result.verdict == "NIEZGODNE"

    def test_window_invalid_for_niezgodne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        conflicting_input: ProtectionSettingsInput,
    ):
        """Test window is invalid for NIEZGODNE verdict."""
        result = pattern.validate(input_data=conflicting_input)

        assert result.artifacts["window_valid"] is False
        assert (
            result.artifacts["window_i_min_primary_a"] > result.artifacts["window_i_max_primary_a"]
        )

    def test_summary_pl_for_niezgodne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        conflicting_input: ProtectionSettingsInput,
    ):
        """Test Polish summary for NIEZGODNE verdict."""
        result = pattern.validate(input_data=conflicting_input)

        assert "NIEZGODNY" in result.summary_pl
        assert "konflikt" in result.summary_pl.lower()

    def test_window_check_fail_for_niezgodne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        conflicting_input: ProtectionSettingsInput,
    ):
        """Test window check is FAIL for NIEZGODNE verdict."""
        result = pattern.validate(input_data=conflicting_input)

        window_check = next(c for c in result.checks if c["name_pl"] == "Okno nastaw")
        assert window_check["status"] == "FAIL"

    def test_selectivity_and_sensitivity_marked_fail_on_conflict(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        conflicting_input: ProtectionSettingsInput,
    ):
        """Selektywnosc (dolna granica) i czulosc (limitujaca gorna) -> FAIL."""
        result = pattern.validate(input_data=conflicting_input)

        sel_check = next(c for c in result.checks if c["name_pl"] == "Selektywność I>>")
        sens_check = next(c for c in result.checks if c["name_pl"] == "Czułość I>>")
        thermal_check = next(c for c in result.checks if c["name_pl"] == "Kryterium cieplne")
        assert sel_check["status"] == "FAIL"
        assert sens_check["status"] == "FAIL"
        assert thermal_check["status"] == "PASS"  # cieplne nie limituje w tym przypadku


# =============================================================================
# TEST: VERDICT GRANICZNE (waskie okno)
# =============================================================================


class TestVerdictGraniczne:
    """Tests for GRANICZNE (borderline) verdict — narrow window."""

    def test_verdict_borderline_from_input(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        borderline_input: ProtectionSettingsInput,
    ):
        """Test GRANICZNE verdict from borderline input."""
        result = pattern.validate(input_data=borderline_input)

        assert result.verdict == "GRANICZNE"

    def test_window_valid_but_narrow_for_graniczne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        borderline_input: ProtectionSettingsInput,
    ):
        """Test window is valid but narrow for GRANICZNE verdict."""
        result = pattern.validate(input_data=borderline_input)

        assert result.artifacts["window_valid"] is True

        i_min = result.artifacts["window_i_min_primary_a"]
        i_max = result.artifacts["window_i_max_primary_a"]
        relative_width = (i_max - i_min) / i_min

        assert relative_width < 0.05, "Window should be narrow (< 5%)"

    def test_summary_pl_for_graniczne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        borderline_input: ProtectionSettingsInput,
    ):
        """Test Polish summary for GRANICZNE verdict."""
        result = pattern.validate(input_data=borderline_input)

        assert "GRANICZNY" in result.summary_pl

    def test_window_check_warn_for_graniczne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        borderline_input: ProtectionSettingsInput,
    ):
        """Test window check is WARN for GRANICZNE verdict."""
        result = pattern.validate(input_data=borderline_input)

        window_check = next(c for c in result.checks if c["name_pl"] == "Okno nastaw")
        assert window_check["status"] == "WARN"


# =============================================================================
# TEST: VERDICT GRANICZNE via generacja lokalna (rozszerzenie W3-C2)
# =============================================================================


class TestVerdictGranicznePrzezGeneracjeLokalna:
    """GRANICZNE wylacznie przez ryzyko blokady ZSZ od generacji lokalnej."""

    def test_verdict_graniczne_from_local_generation_risk(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        local_generation_input: ProtectionSettingsInput,
    ):
        result = pattern.validate(input_data=local_generation_input)
        assert result.verdict == "GRANICZNE"
        # Okno i SPZ pozostaja PASS -> jedynym powodem jest generacja lokalna.
        assert result.artifacts["window_valid"] is True
        assert result.artifacts["spz_allowed"] is True

    def test_local_generation_check_is_warn(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        local_generation_input: ProtectionSettingsInput,
    ):
        result = pattern.validate(input_data=local_generation_input)
        lg_check = next(c for c in result.checks if c["name_pl"] == "Generacja lokalna (E-L)")
        assert lg_check["status"] == "WARN"
        assert "ZSZ" in lg_check["description_pl"]

    def test_local_generation_artifacts_present(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        local_generation_input: ProtectionSettingsInput,
    ):
        result = pattern.validate(input_data=local_generation_input)
        assert result.artifacts["generacja_lokalna_aktywna"] is True
        assert result.artifacts["generacja_lokalna_wklad_el_a"] == pytest.approx(3200.0)
        assert result.artifacts["generacja_lokalna_wklad_systemu_a"] == pytest.approx(6800.0)
        assert result.artifacts["generacja_lokalna_udzial_el"] == pytest.approx(0.32)
        assert result.artifacts["generacja_lokalna_ryzyko_zsz"] is True

    def test_local_generation_inactive_gives_info_not_warn(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Kontrola KLASA-NIE-INSTANCJA: nieaktywna generacja -> INFO, nie WARN."""
        result = pattern.validate(input_data=valid_input)
        lg_check = next(c for c in result.checks if c["name_pl"] == "Generacja lokalna (E-L)")
        assert lg_check["status"] == "INFO"

    def test_local_generation_active_without_threshold_gives_info(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        local_generation_input: ProtectionSettingsInput,
    ):
        """Bez progu (zero zgadywania) -> INFO, NIE PASS ani WARN."""
        from dataclasses import replace

        input_bez_progu = replace(local_generation_input, lokalna_generacja_prog_udzialu_zsz=None)
        result = pattern.validate(input_data=input_bez_progu)
        lg_check = next(c for c in result.checks if c["name_pl"] == "Generacja lokalna (E-L)")
        assert lg_check["status"] == "INFO"
        assert "niedostępne" in lg_check["description_pl"].lower()
        # Bez ryzyka WARN, okno i SPZ nadal PASS -> werdykt wraca do ZGODNE.
        assert result.verdict == "ZGODNE"


# =============================================================================
# TEST: DETERMINISM
# =============================================================================


class TestDeterminism:
    """Tests for deterministic behavior."""

    def test_identical_results_twice(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test 2× run produces identical results."""
        result1 = pattern.validate(input_data=valid_input)
        result2 = pattern.validate(input_data=valid_input)

        assert compare_results_deterministic(result1, result2)

    def test_stable_json_identical(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test stable_json produces identical output for 2× run."""
        result1 = pattern.validate(input_data=valid_input)
        result2 = pattern.validate(input_data=valid_input)

        json1 = stable_json(result1.to_dict())
        json2 = stable_json(result2.to_dict())

        assert json1 == json2

    def test_trace_deterministic(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test trace is deterministic."""
        result1 = pattern.validate(input_data=valid_input)
        result2 = pattern.validate(input_data=valid_input)

        assert result1.trace == result2.trace

    def test_checks_deterministic(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test checks are deterministic (same order)."""
        result1 = pattern.validate(input_data=valid_input)
        result2 = pattern.validate(input_data=valid_input)

        assert result1.checks == result2.checks

    def test_json_serializable(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test result is JSON serializable."""
        result = pattern.validate(input_data=valid_input)
        data = result.to_dict()

        json_str = json.dumps(data, ensure_ascii=False)
        assert len(json_str) > 0

        loaded = json.loads(json_str)
        assert loaded["pattern_id"] == PATTERN_ID
        assert loaded["verdict"] == result.verdict


# =============================================================================
# TEST: WHITE-BOX TRACE
# =============================================================================


class TestWhiteBoxTrace:
    """Tests for WHITE-BOX trace generation."""

    def test_trace_steps_present(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test trace steps are present."""
        result = pattern.validate(input_data=valid_input)

        assert len(result.trace) > 0

    def test_trace_has_required_steps(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test trace covers all required steps (incl. NEW check_local_generation)."""
        result = pattern.validate(input_data=valid_input)

        step_names = [s["step"] for s in result.trace]

        assert "run_analysis" in step_names
        assert "extract_values" in step_names
        assert "check_selectivity" in step_names
        assert "check_sensitivity" in step_names
        assert "check_thermal" in step_names
        assert "check_window" in step_names
        assert "check_spz" in step_names
        assert "check_local_generation" in step_names
        assert "determine_verdict" in step_names

    def test_trace_has_required_keys(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test each trace step has required keys."""
        result = pattern.validate(input_data=valid_input)

        for step in result.trace:
            assert "step" in step
            assert "description_pl" in step
            assert "inputs" in step or "outputs" in step

    def test_trace_has_formulas(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test criterion steps have formulas."""
        result = pattern.validate(input_data=valid_input)

        criteria_steps = ["check_selectivity", "check_sensitivity", "check_thermal"]
        for step in result.trace:
            if step["step"] in criteria_steps:
                assert "formula" in step, f"{step['step']} should have formula"


# =============================================================================
# TEST: ARTIFACTS
# =============================================================================


class TestArtifacts:
    """Tests for artifacts correctness."""

    def test_artifacts_present(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test artifacts dictionary is present."""
        result = pattern.validate(input_data=valid_input)

        assert result.artifacts is not None
        assert len(result.artifacts) > 0

    def test_artifacts_has_key_values(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test artifacts has required keys — w tym klucze konsumowane przez
        `api/reference_patterns.py` (bez zmiany struktury dokumentu PDF/DOCX,
        `recommended_setting_primary_a` zastapil `recommended_setting_secondary_a`
        — Hoppel nie ma strony wtornej/przekladni CT) oraz nowe (W3-C2)."""
        result = pattern.validate(input_data=valid_input)

        required_keys = [
            "tk_total_s",
            "ithn_a",
            "ithdop_a",
            "i_min_sel_primary_a",
            "i_max_sens_primary_a",
            "i_max_th_primary_a",
            "window_i_min_primary_a",
            "window_i_max_primary_a",
            "window_valid",
            "limiting_criterion_min",
            "limiting_criterion_max",
            "recommended_setting_primary_a",
            "window_conflict_pl",
            "window_recommendations_pl",
            "spz_i_th_required_a",
            "spz_allowed",
            "generacja_lokalna_aktywna",
            "generacja_lokalna_wklad_el_a",
            "generacja_lokalna_wklad_systemu_a",
            "generacja_lokalna_udzial_el",
            "generacja_lokalna_ryzyko_zsz",
        ]

        for key in required_keys:
            assert key in result.artifacts, f"Missing artifact: {key}"

    def test_artifacts_no_dead_secondary_keys(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Klucze *_secondary_a (poza recommended_setting_primary_a) nie wracaja
        — Hoppel nie modeluje strony wtornej/przekladni CT (tabela roznic W3-C2)."""
        result = pattern.validate(input_data=valid_input)
        martwe = [
            "i_min_sel_secondary_a",
            "i_max_sens_secondary_a",
            "i_max_th_secondary_a",
            "window_i_min_secondary_a",
            "window_i_max_secondary_a",
            "recommended_setting_secondary_a",
        ]
        for klucz in martwe:
            assert klucz not in result.artifacts, f"Martwy klucz nie powinien wrocic: {klucz}"

    def test_artifacts_values_correct(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test artifact values are correct for reference case (z faktycznego
        przebiegu silnika Hoppla, karta W3-C2)."""
        result = pattern.validate(input_data=valid_input)

        assert result.artifacts["i_min_sel_primary_a"] == pytest.approx(1440.0, rel=0.01)
        assert result.artifacts["i_max_sens_primary_a"] == pytest.approx(2500.0, rel=0.01)
        assert result.artifacts["window_valid"] is True
        assert result.artifacts["tk_total_s"] == pytest.approx(0.6, rel=0.01)
        assert result.artifacts["ithn_a"] == pytest.approx(14100.0, rel=0.01)
        assert result.artifacts["ithdop_a"] == pytest.approx(18203.0, rel=0.01)
        assert result.artifacts["recommended_setting_primary_a"] == pytest.approx(1970.0, rel=0.01)
        assert result.artifacts["spz_allowed"] is True


# =============================================================================
# TEST: POLISH LABELS
# =============================================================================


class TestPolishLabels:
    """Tests for Polish labels compliance."""

    def test_verdict_description_pl(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test verdict description is in Polish."""
        result = pattern.validate(input_data=valid_input)
        data = result.to_dict()

        assert "verdict_description_pl" in data
        assert "spełnione" in data["verdict_description_pl"].lower()

    def test_check_names_pl(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test check names are in Polish."""
        result = pattern.validate(input_data=valid_input)

        for check in result.checks:
            assert "name_pl" in check
            name = check["name_pl"].lower()
            assert any(
                w in name
                for w in ["selektywność", "czułość", "cieplne", "okno", "spz", "generacja"]
            )

    def test_check_status_pl(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test check status_pl is in Polish."""
        result = pattern.validate(input_data=valid_input)

        polish_statuses = ["Spełnione", "Niespełnione", "Ostrzeżenie", "Informacja"]
        for check in result.checks:
            assert "status_pl" in check
            assert check["status_pl"] in polish_statuses

    def test_no_codenames(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: ProtectionSettingsInput,
    ):
        """Test no project codenames appear in output."""
        result = pattern.validate(input_data=valid_input)
        json_str = json.dumps(result.to_dict(), ensure_ascii=False)

        codenames = ["P7", "P11", "P14", "P17", "P20"]
        for codename in codenames:
            assert codename not in json_str, f"Codename {codename} should not appear"


# =============================================================================
# TEST: FIXTURE LOADING
# =============================================================================


class TestFixtureLoading:
    """Tests for fixture loading."""

    def test_load_fixture_case_a(self):
        """Test loading case A fixture."""
        from application.reference_patterns import load_fixture

        fixture = load_fixture("line_i_doubleprime_case_a.json")

        assert fixture["line_id"] == "linia-ref-001"
        assert fixture["conductor_material"] == "Al"
        assert fixture["cross_section_mm2"] == 150.0

    def test_fixture_to_input_conversion(self):
        """Test fixture to input conversion."""
        from application.reference_patterns import fixture_to_input, load_fixture

        fixture = load_fixture("line_i_doubleprime_case_a.json")
        input_data = fixture_to_input(fixture)

        assert input_data.line_id == "linia-ref-001"
        assert input_data.conductor_material == "Al"
        assert input_data.cross_section_mm2 == 150.0
        assert input_data.lokalna_generacja_aktywna is False


# =============================================================================
# TEST: EDGE CASES
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_spz_disabled_info_check(self, pattern: LineIDoublePrimeReferencePattern):
        """Test SPZ check is INFO when SPZ disabled."""
        input_data = ProtectionSettingsInput(
            line_id="line-no-spz",
            line_name="Linia bez SPZ",
            cross_section_mm2=150.0,
            conductor_material="Al",
            length_km=8.0,
            i_nominal_a=300.0,
            ik3_max_beginning_a=3500.0,
            ik3_min_beginning_a=3000.0,
            ik3_max_end_a=1800.0,
            ik3_min_end_a=1500.0,
            ik2_min_end_a=1300.0,
            ik_max_next_bus_a=1200.0,
            i_load_max_a=150.0,
            k_b=1.2,
            k_bth=1.1,
            spz_enabled=False,
        )

        result = pattern.validate(input_data=input_data)

        spz_check = next(c for c in result.checks if "SPZ" in c["name_pl"])
        assert spz_check["status"] == "INFO"
        assert result.artifacts["spz_enabled"] is False

    def test_validates_without_fixture(self, pattern: LineIDoublePrimeReferencePattern):
        """Test validation works without fixture file."""
        input_data = ProtectionSettingsInput(
            line_id="line-direct",
            line_name="Linia bezpośrednia",
            cross_section_mm2=95.0,
            conductor_material="Cu",
            length_km=3.0,
            i_nominal_a=260.0,
            ik3_max_beginning_a=5000.0,
            ik3_min_beginning_a=4000.0,
            ik3_max_end_a=2500.0,
            ik3_min_end_a=2000.0,
            ik2_min_end_a=1700.0,
            ik_max_next_bus_a=2000.0,
            i_load_max_a=120.0,
        )

        result = pattern.validate(input_data=input_data)

        assert result.verdict in ["ZGODNE", "GRANICZNE", "NIEZGODNE"]

    def test_validates_with_precomputed_result(self, valid_input: ProtectionSettingsInput):
        """Test validation with pre-computed analysis result — `ithn_a` w tej
        sciezce jest None (silnik nie przenosi przekroju/materialu w wyniku)."""
        analysis_result = ProtectionSettingsEngine.calculate(valid_input)

        pattern = LineIDoublePrimeReferencePattern()
        result = pattern.validate(analysis_result=analysis_result)

        assert result.verdict == "ZGODNE"
        step_names = [s["step"] for s in result.trace]
        assert "run_analysis" not in step_names
        assert result.artifacts["ithn_a"] is None


# =============================================================================
# TEST: FIXTURE-BASED VERDICTS (CASE A, B, C, D)
# =============================================================================


class TestFixtureVerdicts:
    """Tests for verdicts from the four reference fixtures."""

    def test_case_A_verdict_zgodne(self, pattern: LineIDoublePrimeReferencePattern):
        """Test ZGODNE verdict from case_A_zgodne.json fixture."""
        result = pattern.validate(fixture_file="case_A_zgodne.json")

        assert result.verdict == "ZGODNE"
        assert result.artifacts["window_valid"] is True

        i_min = result.artifacts["window_i_min_primary_a"]
        i_max = result.artifacts["window_i_max_primary_a"]
        relative_width = (i_max - i_min) / i_min
        assert relative_width > 0.05, "Window should not be narrow for ZGODNE"

    def test_case_B_verdict_niezgodne(self, pattern: LineIDoublePrimeReferencePattern):
        """Test NIEZGODNE verdict from case_B_niezgodne_konflikt.json fixture."""
        result = pattern.validate(fixture_file="case_B_niezgodne_konflikt.json")

        assert result.verdict == "NIEZGODNE"
        assert result.artifacts["window_valid"] is False

        i_min = result.artifacts["window_i_min_primary_a"]
        i_max = result.artifacts["window_i_max_primary_a"]
        assert i_min > i_max, "I_min should be > I_max for NIEZGODNE"

    def test_case_C_verdict_graniczne(self, pattern: LineIDoublePrimeReferencePattern):
        """Test GRANICZNE verdict from case_C_graniczne_waskie_okno.json fixture."""
        result = pattern.validate(fixture_file="case_C_graniczne_waskie_okno.json")

        assert result.verdict == "GRANICZNE"
        assert result.artifacts["window_valid"] is True

        i_min = result.artifacts["window_i_min_primary_a"]
        i_max = result.artifacts["window_i_max_primary_a"]
        relative_width = (i_max - i_min) / i_min
        assert relative_width < 0.05, "Window should be narrow for GRANICZNE"

    def test_case_D_verdict_graniczne_generacja_lokalna(
        self, pattern: LineIDoublePrimeReferencePattern
    ):
        """Test GRANICZNE verdict from case_D_generacja_lokalna.json (W3-C2, nowy)."""
        result = pattern.validate(fixture_file="case_D_generacja_lokalna.json")

        assert result.verdict == "GRANICZNE"
        assert result.artifacts["window_valid"] is True
        assert result.artifacts["spz_allowed"] is True
        assert result.artifacts["generacja_lokalna_ryzyko_zsz"] is True


# =============================================================================
# TEST: DETERMINISM WITH FIXTURES
# =============================================================================


class TestDeterminismWithFixtures:
    """Tests for deterministic behavior using fixtures."""

    @pytest.mark.parametrize(
        "nazwa_fixture",
        [
            "case_A_zgodne.json",
            "case_B_niezgodne_konflikt.json",
            "case_C_graniczne_waskie_okno.json",
            "case_D_generacja_lokalna.json",
        ],
    )
    def test_determinism_case(self, pattern: LineIDoublePrimeReferencePattern, nazwa_fixture: str):
        """Test 2× run with each fixture produces identical results."""
        result1 = pattern.validate(fixture_file=nazwa_fixture)
        result2 = pattern.validate(fixture_file=nazwa_fixture)

        assert compare_results_deterministic(result1, result2)

        json1 = stable_json(result1.to_dict())
        json2 = stable_json(result2.to_dict())
        assert json1 == json2


# =============================================================================
# TEST: TRACE ORDERING
# =============================================================================


class TestTraceOrdering:
    """Tests for deterministic trace/checks/artifacts ordering."""

    def test_trace_ordering_case_A(self, pattern: LineIDoublePrimeReferencePattern):
        """Test trace steps have deterministic order for case_A."""
        result1 = pattern.validate(fixture_file="case_A_zgodne.json")
        result2 = pattern.validate(fixture_file="case_A_zgodne.json")

        assert result1.trace == result2.trace

        step_names = [s["step"] for s in result1.trace]
        expected_order = [
            "load_fixture",
            "run_analysis",
            "analysis_completed",
            "extract_values",
            "check_selectivity",
            "check_sensitivity",
            "check_thermal",
            "check_window",
            "check_spz",
            "check_local_generation",
            "determine_verdict",
        ]
        assert step_names == expected_order

    def test_checks_ordering_deterministic(self, pattern: LineIDoublePrimeReferencePattern):
        """Test checks are sorted alphabetically by name_pl."""
        result = pattern.validate(fixture_file="case_A_zgodne.json")

        check_names = [c["name_pl"] for c in result.checks]
        assert check_names == sorted(check_names), "Checks should be sorted alphabetically"

    def test_artifacts_keys_sorted(self, pattern: LineIDoublePrimeReferencePattern):
        """Test artifacts dictionary has sorted keys."""
        result = pattern.validate(fixture_file="case_A_zgodne.json")

        artifact_keys = list(result.artifacts.keys())
        assert artifact_keys == sorted(artifact_keys), "Artifact keys should be sorted"


# =============================================================================
# TEST: FIXTURE LOADING FROM SUBDIRECTORY
# =============================================================================


class TestFixtureSubdirectory:
    """Tests for fixture loading from pattern-specific subdirectory."""

    def test_load_case_A_from_subdirectory(self):
        """Test loading case_A fixture from subdirectory."""
        from application.reference_patterns import load_fixture

        fixture = load_fixture("case_A_zgodne.json")
        assert fixture["line_id"] == "linia-ref-a-zgodne"
        assert fixture["_expected_verdict"] == "ZGODNE"

    def test_load_case_B_from_subdirectory(self):
        """Test loading case_B fixture from subdirectory."""
        from application.reference_patterns import load_fixture

        fixture = load_fixture("case_B_niezgodne_konflikt.json")
        assert fixture["line_id"] == "linia-ref-b-niezgodne"
        assert fixture["_expected_verdict"] == "NIEZGODNE"

    def test_load_case_C_from_subdirectory(self):
        """Test loading case_C fixture from subdirectory."""
        from application.reference_patterns import load_fixture

        fixture = load_fixture("case_C_graniczne_waskie_okno.json")
        assert fixture["line_id"] == "linia-ref-c-graniczne"
        assert fixture["_expected_verdict"] == "GRANICZNE"

    def test_load_case_D_from_subdirectory(self):
        """Test loading case_D fixture from subdirectory (W3-C2, nowy)."""
        from application.reference_patterns import load_fixture

        fixture = load_fixture("case_D_generacja_lokalna.json")
        assert fixture["line_id"] == "linia-ref-d-generacja-lokalna"
        assert fixture["_expected_verdict"] == "GRANICZNE"
        assert fixture["lokalna_generacja_aktywna"] is True

    def test_backwards_compatibility_with_root_fixture(self):
        """Test loading fixture from root directory (backwards compatibility)."""
        from application.reference_patterns import load_fixture

        fixture = load_fixture("line_i_doubleprime_case_a.json")
        assert fixture["line_id"] == "linia-ref-001"

    def test_fixture_not_found_error(self):
        """Test helpful error message when fixture not found."""
        from application.reference_patterns import load_fixture

        with pytest.raises(FileNotFoundError) as exc_info:
            load_fixture("nonexistent_fixture.json")

        assert "nie znaleziony" in str(exc_info.value)


# =============================================================================
# TEST: CASE-SPECIFIC ARTIFACTS
# =============================================================================


class TestCaseSpecificArtifacts:
    """Tests for case-specific artifact values (z faktycznych przebiegow)."""

    def test_case_A_artifacts_correctness(self, pattern: LineIDoublePrimeReferencePattern):
        """Test case A artifacts match expected values."""
        result = pattern.validate(fixture_file="case_A_zgodne.json")

        assert result.artifacts["tk_total_s"] == pytest.approx(0.6, rel=0.01)
        assert result.artifacts["ithn_a"] == pytest.approx(14100.0, rel=0.01)
        assert result.artifacts["i_min_sel_primary_a"] == pytest.approx(1440.0, rel=0.01)
        assert result.artifacts["i_max_sens_primary_a"] == pytest.approx(2500.0, rel=0.01)

    def test_case_B_artifacts_conflict(self, pattern: LineIDoublePrimeReferencePattern):
        """Test case B artifacts show conflict correctly."""
        result = pattern.validate(fixture_file="case_B_niezgodne_konflikt.json")

        assert result.artifacts["i_min_sel_primary_a"] == pytest.approx(7200.0, rel=0.01)
        assert result.artifacts["i_max_sens_primary_a"] == pytest.approx(5000.0, rel=0.01)
        assert (
            result.artifacts["window_i_min_primary_a"] > result.artifacts["window_i_max_primary_a"]
        )
        assert "2.20 kA" in result.artifacts["window_conflict_pl"]

    def test_case_C_narrow_window(self, pattern: LineIDoublePrimeReferencePattern):
        """Test case C artifacts show narrow window correctly."""
        result = pattern.validate(fixture_file="case_C_graniczne_waskie_okno.json")

        assert result.artifacts["i_min_sel_primary_a"] == pytest.approx(2000.0, rel=0.01)
        assert result.artifacts["i_max_sens_primary_a"] == pytest.approx(2080.0, rel=0.01)

        window_width = (
            result.artifacts["window_i_max_primary_a"] - result.artifacts["window_i_min_primary_a"]
        )
        assert window_width == pytest.approx(80.0, rel=0.02)

    def test_case_D_generacja_lokalna_artifacts(self, pattern: LineIDoublePrimeReferencePattern):
        """Test case D artifacts show local generation contribution correctly."""
        result = pattern.validate(fixture_file="case_D_generacja_lokalna.json")

        assert result.artifacts["generacja_lokalna_wklad_el_a"] == pytest.approx(3200.0)
        assert result.artifacts["generacja_lokalna_wklad_systemu_a"] == pytest.approx(6800.0)
        assert result.artifacts["generacja_lokalna_udzial_el"] == pytest.approx(0.32)
