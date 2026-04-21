"""
Tests for Reference Pattern C: Wpływ generacji lokalnej na zabezpieczenia SN

Tests cover:
- Verdict ZGODNE (minor impact from local generation)
- Verdict GRANICZNE (borderline impact, 10-30% change)
- Verdict NIEZGODNE (significant impact, >30% change or blocking risk)
- Determinism (2× run → identical result)
- WHITE-BOX trace completeness
- Artifacts correctness

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Tests verify interpretation, not physics
- WHITE BOX: Tests verify trace generation
- DETERMINISM: Tests verify 2× run → identical result
"""

import json

import pytest
from application.reference_patterns import (
    PATTERN_C_ID,
    PATTERN_C_NAME_PL,
    PROG_GRANICZNY_PCT,
    PROG_INFORMACYJNY_PCT,
    DaneZwarciowePunktuZabezpieczenia,
    NastawyZabezpieczen,
    TypGeneracji,
    WzorzecCGeneracjaLokalna,
    WzorzecCInput,
    ZrodloGeneracji,
    compare_results_deterministic,
    fixture_to_input_c,
    load_fixture_c,
    run_pattern_c,
    # Helpers
    stable_json,
)

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def zgodny_input() -> WzorzecCInput:
    """
    Input producing ZGODNE verdict.

    Minor local generation (200 kW PV) with small impact on fault currents.
    """
    return WzorzecCInput(
        punkt_zabezpieczenia_id="pz-test-zgodne",
        punkt_zabezpieczenia_nazwa="Pole liniowe L-01 Test",
        szyny_id="szyny-test",
        szyny_nazwa="Szyny 15 kV Test",
        zrodla_generacji=(
            ZrodloGeneracji(
                id="pv-test",
                nazwa="PV Test",
                typ=TypGeneracji.PV,
                moc_znamionowa_kw=200.0,
                prad_zwarciowy_a=120.0,
            ),
        ),
        dane_bez_generacji=DaneZwarciowePunktuZabezpieczenia(
            scenariusz="bez_generacji",
            ik_3f_a=5200.0,
            ik_2f_a=4500.0,
            ik_1f_a=3800.0,
            wklad_generacji_a=0.0,
        ),
        dane_generacja_min=DaneZwarciowePunktuZabezpieczenia(
            scenariusz="generacja_min",
            ik_3f_a=5250.0,
            ik_2f_a=4545.0,
            ik_1f_a=3840.0,
            wklad_generacji_a=50.0,
        ),
        dane_generacja_max=DaneZwarciowePunktuZabezpieczenia(
            scenariusz="generacja_max",
            ik_3f_a=5320.0,
            ik_2f_a=4608.0,
            ik_1f_a=3895.0,
            wklad_generacji_a=120.0,
        ),
        nastawy=NastawyZabezpieczen(
            i_wyzszy_stopien_a=2700.0,
            i_nizszy_stopien_a=800.0,
            prog_blokady_szyn_a=1500.0,
        ),
        ik_za_nastepnym_zabezpieczeniem_a=1700.0,
    )


@pytest.fixture
def graniczny_input() -> WzorzecCInput:
    """
    Input producing GRANICZNE verdict.

    Large local generation (1.5 MW) causing 10-30% change in fault currents.
    """
    return WzorzecCInput(
        punkt_zabezpieczenia_id="pz-test-graniczne",
        punkt_zabezpieczenia_nazwa="Pole liniowe L-02 Test",
        szyny_id="szyny-test",
        szyny_nazwa="Szyny 15 kV Test",
        zrodla_generacji=(
            ZrodloGeneracji(
                id="pv-farm",
                nazwa="Farma PV Test",
                typ=TypGeneracji.PV,
                moc_znamionowa_kw=1000.0,
                prad_zwarciowy_a=580.0,
            ),
            ZrodloGeneracji(
                id="bess",
                nazwa="BESS Test",
                typ=TypGeneracji.BESS,
                moc_znamionowa_kw=500.0,
                prad_zwarciowy_a=350.0,
            ),
        ),
        dane_bez_generacji=DaneZwarciowePunktuZabezpieczenia(
            scenariusz="bez_generacji",
            ik_3f_a=4200.0,
            ik_2f_a=3640.0,
            ik_1f_a=3100.0,
            wklad_generacji_a=0.0,
        ),
        dane_generacja_min=DaneZwarciowePunktuZabezpieczenia(
            scenariusz="generacja_min",
            ik_3f_a=4450.0,
            ik_2f_a=3854.0,
            ik_1f_a=3285.0,
            wklad_generacji_a=250.0,
        ),
        dane_generacja_max=DaneZwarciowePunktuZabezpieczenia(
            scenariusz="generacja_max",
            ik_3f_a=5130.0,
            ik_2f_a=4443.0,
            ik_1f_a=3788.0,
            wklad_generacji_a=930.0,
        ),
        nastawy=NastawyZabezpieczen(
            i_wyzszy_stopien_a=2100.0,
            i_nizszy_stopien_a=700.0,
            prog_blokady_szyn_a=1800.0,
        ),
        ik_za_nastepnym_zabezpieczeniem_a=1400.0,
    )


@pytest.fixture
def niezgodny_input() -> WzorzecCInput:
    """
    Input producing NIEZGODNE verdict.

    Very large local generation (5 MW) causing >30% change and blocking risk.
    """
    return WzorzecCInput(
        punkt_zabezpieczenia_id="pz-test-niezgodne",
        punkt_zabezpieczenia_nazwa="Pole liniowe L-03 Test",
        szyny_id="szyny-test",
        szyny_nazwa="Szyny 15 kV Test",
        zrodla_generacji=(
            ZrodloGeneracji(
                id="pv-large",
                nazwa="Duża farma PV",
                typ=TypGeneracji.PV,
                moc_znamionowa_kw=3000.0,
                prad_zwarciowy_a=1750.0,
            ),
            ZrodloGeneracji(
                id="agregat-1",
                nazwa="Agregat CHP-1",
                typ=TypGeneracji.AGREGAT,
                moc_znamionowa_kw=1000.0,
                prad_zwarciowy_a=850.0,
            ),
            ZrodloGeneracji(
                id="agregat-2",
                nazwa="Agregat CHP-2",
                typ=TypGeneracji.AGREGAT,
                moc_znamionowa_kw=1000.0,
                prad_zwarciowy_a=850.0,
            ),
        ),
        dane_bez_generacji=DaneZwarciowePunktuZabezpieczenia(
            scenariusz="bez_generacji",
            ik_3f_a=3200.0,
            ik_2f_a=2770.0,
            ik_1f_a=2350.0,
            wklad_generacji_a=0.0,
        ),
        dane_generacja_min=DaneZwarciowePunktuZabezpieczenia(
            scenariusz="generacja_min",
            ik_3f_a=3650.0,
            ik_2f_a=3160.0,
            ik_1f_a=2685.0,
            wklad_generacji_a=450.0,
        ),
        dane_generacja_max=DaneZwarciowePunktuZabezpieczenia(
            scenariusz="generacja_max",
            ik_3f_a=6650.0,
            ik_2f_a=5757.0,
            ik_1f_a=4893.0,
            wklad_generacji_a=3450.0,
        ),
        nastawy=NastawyZabezpieczen(
            i_wyzszy_stopien_a=1600.0,
            i_nizszy_stopien_a=500.0,
            prog_blokady_szyn_a=2500.0,
        ),
        ik_za_nastepnym_zabezpieczeniem_a=1100.0,
    )


@pytest.fixture
def pattern() -> WzorzecCGeneracjaLokalna:
    """Pattern C validator instance."""
    return WzorzecCGeneracjaLokalna()


# =============================================================================
# TEST: VERDICT ZGODNE
# =============================================================================


class TestVerdictZgodne:
    """Tests for ZGODNE (compliant) verdict."""

    def test_verdict_ok_from_input(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test ZGODNE verdict from valid input."""
        result = pattern.validate(input_data=zgodny_input)

        assert result.verdict == "ZGODNE"
        assert result.pattern_id == PATTERN_C_ID
        assert result.name_pl == PATTERN_C_NAME_PL

    def test_verdict_ok_from_fixture(self, pattern: WzorzecCGeneracjaLokalna):
        """Test ZGODNE verdict from fixture file."""
        result = pattern.validate(fixture_file="przypadek_zgodny.json")

        assert result.verdict == "ZGODNE"

    def test_verdict_ok_via_public_api(self, zgodny_input: WzorzecCInput):
        """Test ZGODNE verdict via run_pattern_c function."""
        result = run_pattern_c(input_data=zgodny_input)

        assert result.verdict == "ZGODNE"

    def test_summary_pl_for_zgodne(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test Polish summary for ZGODNE verdict."""
        result = pattern.validate(input_data=zgodny_input)

        assert "ZGODNY" in result.summary_pl
        assert "generacja" in result.summary_pl.lower()

    def test_zmiana_pradu_info_for_zgodne(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test fault current change is INFO for ZGODNE verdict."""
        result = pattern.validate(input_data=zgodny_input)

        # Zmiana prądu powinna być < 10%
        zmiana_pct = result.artifacts["zmiana_pradu_zwarciowego_pct"]
        assert zmiana_pct <= PROG_INFORMACYJNY_PCT


# =============================================================================
# TEST: VERDICT GRANICZNE
# =============================================================================


class TestVerdictGraniczne:
    """Tests for GRANICZNE (borderline) verdict."""

    def test_verdict_borderline_from_input(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        graniczny_input: WzorzecCInput,
    ):
        """Test GRANICZNE verdict from borderline input."""
        result = pattern.validate(input_data=graniczny_input)

        assert result.verdict == "GRANICZNE"

    def test_verdict_borderline_from_fixture(self, pattern: WzorzecCGeneracjaLokalna):
        """Test GRANICZNE verdict from fixture file."""
        result = pattern.validate(fixture_file="przypadek_graniczny.json")

        assert result.verdict == "GRANICZNE"

    def test_summary_pl_for_graniczne(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        graniczny_input: WzorzecCInput,
    ):
        """Test Polish summary for GRANICZNE verdict."""
        result = pattern.validate(input_data=graniczny_input)

        assert "GRANICZNY" in result.summary_pl

    def test_zmiana_pradu_in_borderline_range(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        graniczny_input: WzorzecCInput,
    ):
        """Test fault current change is in borderline range for GRANICZNE verdict."""
        result = pattern.validate(input_data=graniczny_input)

        zmiana_pct = result.artifacts["zmiana_pradu_zwarciowego_pct"]
        assert zmiana_pct > PROG_INFORMACYJNY_PCT
        assert zmiana_pct <= PROG_GRANICZNY_PCT


# =============================================================================
# TEST: VERDICT NIEZGODNE
# =============================================================================


class TestVerdictNiezgodne:
    """Tests for NIEZGODNE (non-compliant) verdict."""

    def test_verdict_noncompliant_from_input(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        niezgodny_input: WzorzecCInput,
    ):
        """Test NIEZGODNE verdict from non-compliant input."""
        result = pattern.validate(input_data=niezgodny_input)

        assert result.verdict == "NIEZGODNE"

    def test_verdict_noncompliant_from_fixture(self, pattern: WzorzecCGeneracjaLokalna):
        """Test NIEZGODNE verdict from fixture file."""
        result = pattern.validate(fixture_file="przypadek_niezgodny.json")

        assert result.verdict == "NIEZGODNE"

    def test_summary_pl_for_niezgodne(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        niezgodny_input: WzorzecCInput,
    ):
        """Test Polish summary for NIEZGODNE verdict."""
        result = pattern.validate(input_data=niezgodny_input)

        assert "NIEZGODNY" in result.summary_pl
        assert "ryzyko" in result.summary_pl.lower()

    def test_zmiana_pradu_exceeds_threshold(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        niezgodny_input: WzorzecCInput,
    ):
        """Test fault current change exceeds threshold for NIEZGODNE verdict."""
        result = pattern.validate(input_data=niezgodny_input)

        zmiana_pct = result.artifacts["zmiana_pradu_zwarciowego_pct"]
        assert zmiana_pct > PROG_GRANICZNY_PCT

    def test_blocking_risk_detected(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        niezgodny_input: WzorzecCInput,
    ):
        """Test blocking risk is detected for NIEZGODNE case."""
        result = pattern.validate(input_data=niezgodny_input)

        # Wkład generacji powinien przekraczać 80% progu blokady
        wklad = result.artifacts["wklad_generacji_max_a"]
        prog = result.artifacts["prog_blokady_szyn_a"]
        assert wklad >= prog * 0.8


# =============================================================================
# TEST: DETERMINISM
# =============================================================================


class TestDeterminism:
    """Tests for deterministic behavior."""

    def test_identical_results_twice(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test 2× run produces identical results."""
        result1 = pattern.validate(input_data=zgodny_input)
        result2 = pattern.validate(input_data=zgodny_input)

        assert compare_results_deterministic(result1, result2)

    def test_stable_json_identical(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test stable_json produces identical output for 2× run."""
        result1 = pattern.validate(input_data=zgodny_input)
        result2 = pattern.validate(input_data=zgodny_input)

        json1 = stable_json(result1.to_dict())
        json2 = stable_json(result2.to_dict())

        assert json1 == json2

    def test_trace_deterministic(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test trace is deterministic."""
        result1 = pattern.validate(input_data=zgodny_input)
        result2 = pattern.validate(input_data=zgodny_input)

        assert result1.trace == result2.trace

    def test_checks_deterministic(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test checks are deterministic (same order)."""
        result1 = pattern.validate(input_data=zgodny_input)
        result2 = pattern.validate(input_data=zgodny_input)

        assert result1.checks == result2.checks

    def test_json_serializable(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test result is JSON serializable."""
        result = pattern.validate(input_data=zgodny_input)
        data = result.to_dict()

        # Should not raise
        json_str = json.dumps(data, ensure_ascii=False)
        assert len(json_str) > 0

        # Should round-trip
        loaded = json.loads(json_str)
        assert loaded["pattern_id"] == PATTERN_C_ID
        assert loaded["verdict"] == result.verdict


# =============================================================================
# TEST: WHITE-BOX TRACE
# =============================================================================


class TestWhiteBoxTrace:
    """Tests for WHITE-BOX trace generation."""

    def test_trace_steps_present(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test trace steps are present."""
        result = pattern.validate(input_data=zgodny_input)

        assert len(result.trace) > 0

    def test_trace_has_required_steps(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test trace covers all required steps."""
        result = pattern.validate(input_data=zgodny_input)

        step_names = [s["step"] for s in result.trace]

        assert "inicjalizacja_diagnostyki" in step_names
        assert "sprawdzenie_zmiany_pradu" in step_names
        assert "sprawdzenie_blokady_szyn" in step_names
        assert "sprawdzenie_selektywnosci" in step_names
        assert "wyznaczenie_werdyktu" in step_names

    def test_trace_has_required_keys(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test each trace step has required keys."""
        result = pattern.validate(input_data=zgodny_input)

        for step in result.trace:
            assert "step" in step
            assert "description_pl" in step

    def test_trace_has_formulas(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test criterion steps have formulas."""
        result = pattern.validate(input_data=zgodny_input)

        formula_steps = [
            "sprawdzenie_zmiany_pradu",
            "sprawdzenie_blokady_szyn",
            "sprawdzenie_selektywnosci",
        ]
        for step in result.trace:
            if step["step"] in formula_steps:
                # Tylko sprawdzenia z pełnymi danymi mają formuły
                if "formula" in step:
                    assert len(step["formula"]) > 0


# =============================================================================
# TEST: ARTIFACTS
# =============================================================================


class TestArtifacts:
    """Tests for artifacts correctness."""

    def test_artifacts_present(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test artifacts dictionary is present."""
        result = pattern.validate(input_data=zgodny_input)

        assert result.artifacts is not None
        assert len(result.artifacts) > 0

    def test_artifacts_has_key_values(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test artifacts has required keys."""
        result = pattern.validate(input_data=zgodny_input)

        required_keys = [
            "punkt_zabezpieczenia_id",
            "punkt_zabezpieczenia_nazwa",
            "szyny_id",
            "liczba_zrodel_generacji",
            "sumaryczna_moc_generacji_kw",
            "ik_bez_generacji_3f_a",
            "ik_z_generacja_max_3f_a",
            "zmiana_pradu_zwarciowego_pct",
            "wklad_generacji_max_a",
            "i_wyzszy_stopien_a",
            "i_nizszy_stopien_a",
            "wynik_sprawdzenia_a",
            "wynik_sprawdzenia_b",
            "wynik_sprawdzenia_c",
        ]

        for key in required_keys:
            assert key in result.artifacts, f"Missing artifact: {key}"

    def test_artifacts_values_correct_zgodne(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test artifact values are correct for ZGODNE case."""
        result = pattern.validate(input_data=zgodny_input)

        # Liczba źródeł generacji
        assert result.artifacts["liczba_zrodel_generacji"] == 1

        # Moc generacji
        assert result.artifacts["sumaryczna_moc_generacji_kw"] == pytest.approx(200.0, rel=0.01)

        # Prądy zwarciowe
        assert result.artifacts["ik_bez_generacji_3f_a"] == pytest.approx(5200.0, rel=0.01)
        assert result.artifacts["ik_z_generacja_max_3f_a"] == pytest.approx(5320.0, rel=0.01)

        # Zmiana prądu: (5320 - 5200) / 5200 * 100 = 2.3%
        assert result.artifacts["zmiana_pradu_zwarciowego_pct"] == pytest.approx(2.31, rel=0.1)


# =============================================================================
# TEST: POLISH LABELS
# =============================================================================


class TestPolishLabels:
    """Tests for Polish labels compliance."""

    def test_verdict_description_pl(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test verdict description is in Polish."""
        result = pattern.validate(input_data=zgodny_input)
        data = result.to_dict()

        assert "verdict_description_pl" in data

    def test_check_names_pl(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test check names are in Polish."""
        result = pattern.validate(input_data=zgodny_input)

        for check in result.checks:
            assert "name_pl" in check
            # Names should contain Polish words
            name = check["name_pl"].lower()
            assert any(w in name for w in ["zmiana", "blokad", "selektywn", "prąd"])

    def test_check_status_pl(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test check status_pl is in Polish."""
        result = pattern.validate(input_data=zgodny_input)

        polish_statuses = ["Spełnione", "Niespełnione", "Ostrzeżenie", "Informacja"]
        for check in result.checks:
            assert "status_pl" in check
            assert check["status_pl"] in polish_statuses

    def test_no_codenames(
        self,
        pattern: WzorzecCGeneracjaLokalna,
        zgodny_input: WzorzecCInput,
    ):
        """Test no project codenames appear in output."""
        result = pattern.validate(input_data=zgodny_input)
        json_str = json.dumps(result.to_dict(), ensure_ascii=False)

        # Forbidden project codenames
        codenames = ["P7", "P11", "P14", "P17", "P20"]
        for codename in codenames:
            assert codename not in json_str, f"Codename {codename} should not appear"


# =============================================================================
# TEST: FIXTURE LOADING
# =============================================================================


class TestFixtureLoading:
    """Tests for fixture loading."""

    def test_load_fixture_zgodny(self):
        """Test loading przypadek_zgodny fixture."""
        fixture = load_fixture_c("przypadek_zgodny.json")

        assert fixture["punkt_zabezpieczenia_id"] == "pz-ref-C-zgodne"
        assert fixture["_expected_verdict"] == "ZGODNE"

    def test_load_fixture_graniczny(self):
        """Test loading przypadek_graniczny fixture."""
        fixture = load_fixture_c("przypadek_graniczny.json")

        assert fixture["punkt_zabezpieczenia_id"] == "pz-ref-C-graniczne"
        assert fixture["_expected_verdict"] == "GRANICZNE"

    def test_load_fixture_niezgodny(self):
        """Test loading przypadek_niezgodny fixture."""
        fixture = load_fixture_c("przypadek_niezgodny.json")

        assert fixture["punkt_zabezpieczenia_id"] == "pz-ref-C-niezgodne"
        assert fixture["_expected_verdict"] == "NIEZGODNE"

    def test_fixture_to_input_conversion(self):
        """Test fixture to input conversion."""
        fixture = load_fixture_c("przypadek_zgodny.json")
        input_data = fixture_to_input_c(fixture)

        assert input_data.punkt_zabezpieczenia_id == "pz-ref-C-zgodne"
        assert len(input_data.zrodla_generacji) == 1
        assert input_data.zrodla_generacji[0].typ == TypGeneracji.PV

    def test_fixture_not_found_error(self):
        """Test helpful error message when fixture not found."""
        with pytest.raises(FileNotFoundError) as exc_info:
            load_fixture_c("nieistniejacy_fixture.json")

        assert "nie znaleziony" in str(exc_info.value)


# =============================================================================
# TEST: FIXTURE-BASED VERDICTS
# =============================================================================


class TestFixtureVerdicts:
    """Tests for verdicts from the three reference fixtures."""

    def test_przypadek_zgodny_verdict(self, pattern: WzorzecCGeneracjaLokalna):
        """Test ZGODNE verdict from przypadek_zgodny.json fixture."""
        result = pattern.validate(fixture_file="przypadek_zgodny.json")

        assert result.verdict == "ZGODNE"
        assert result.artifacts["wynik_sprawdzenia_a"] == "INFO"
        assert result.artifacts["wynik_sprawdzenia_b"] == "PASS"
        assert result.artifacts["wynik_sprawdzenia_c"] == "PASS"

    def test_przypadek_graniczny_verdict(self, pattern: WzorzecCGeneracjaLokalna):
        """Test GRANICZNE verdict from przypadek_graniczny.json fixture."""
        result = pattern.validate(fixture_file="przypadek_graniczny.json")

        assert result.verdict == "GRANICZNE"
        assert result.artifacts["wynik_sprawdzenia_a"] == "GRANICZNE"

    def test_przypadek_niezgodny_verdict(self, pattern: WzorzecCGeneracjaLokalna):
        """Test NIEZGODNE verdict from przypadek_niezgodny.json fixture."""
        result = pattern.validate(fixture_file="przypadek_niezgodny.json")

        assert result.verdict == "NIEZGODNE"
        # Sprawdzenie A lub B powinno być NIEZGODNE
        assert (
            result.artifacts["wynik_sprawdzenia_a"] == "NIEZGODNE"
            or result.artifacts["wynik_sprawdzenia_b"] == "NIEZGODNE"
        )


# =============================================================================
# TEST: DETERMINISM WITH FIXTURES
# =============================================================================


class TestDeterminismWithFixtures:
    """Tests for deterministic behavior using fixtures."""

    def test_determinism_zgodny(self, pattern: WzorzecCGeneracjaLokalna):
        """Test 2× run with przypadek_zgodny produces identical results."""
        result1 = pattern.validate(fixture_file="przypadek_zgodny.json")
        result2 = pattern.validate(fixture_file="przypadek_zgodny.json")

        assert compare_results_deterministic(result1, result2)

        # Verify stable JSON is identical
        json1 = stable_json(result1.to_dict())
        json2 = stable_json(result2.to_dict())
        assert json1 == json2

    def test_determinism_graniczny(self, pattern: WzorzecCGeneracjaLokalna):
        """Test 2× run with przypadek_graniczny produces identical results."""
        result1 = pattern.validate(fixture_file="przypadek_graniczny.json")
        result2 = pattern.validate(fixture_file="przypadek_graniczny.json")

        assert compare_results_deterministic(result1, result2)

    def test_determinism_niezgodny(self, pattern: WzorzecCGeneracjaLokalna):
        """Test 2× run with przypadek_niezgodny produces identical results."""
        result1 = pattern.validate(fixture_file="przypadek_niezgodny.json")
        result2 = pattern.validate(fixture_file="przypadek_niezgodny.json")

        assert compare_results_deterministic(result1, result2)


# =============================================================================
# TEST: TRACE ORDERING
# =============================================================================


class TestTraceOrdering:
    """Tests for deterministic trace/checks/artifacts ordering."""

    def test_trace_ordering_zgodny(self, pattern: WzorzecCGeneracjaLokalna):
        """Test trace steps have deterministic order for przypadek_zgodny."""
        result1 = pattern.validate(fixture_file="przypadek_zgodny.json")
        result2 = pattern.validate(fixture_file="przypadek_zgodny.json")

        # Trace should have identical order
        assert result1.trace == result2.trace

        # Steps should be in expected order
        step_names = [s["step"] for s in result1.trace]
        expected_order = [
            "wczytanie_fixture",
            "inicjalizacja_diagnostyki",
            "sprawdzenie_zmiany_pradu",
            "sprawdzenie_blokady_szyn",
            "sprawdzenie_selektywnosci",
            "wyznaczenie_werdyktu",
        ]
        assert step_names == expected_order

    def test_checks_ordering_deterministic(self, pattern: WzorzecCGeneracjaLokalna):
        """Test checks are sorted alphabetically by name_pl."""
        result = pattern.validate(fixture_file="przypadek_zgodny.json")

        check_names = [c["name_pl"] for c in result.checks]
        assert check_names == sorted(check_names), "Checks should be sorted alphabetically"

    def test_artifacts_keys_sorted(self, pattern: WzorzecCGeneracjaLokalna):
        """Test artifacts dictionary has sorted keys."""
        result = pattern.validate(fixture_file="przypadek_zgodny.json")

        artifact_keys = list(result.artifacts.keys())
        assert artifact_keys == sorted(artifact_keys), "Artifact keys should be sorted"


# =============================================================================
# TEST: EDGE CASES
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_no_blocking_threshold(self, pattern: WzorzecCGeneracjaLokalna):
        """Test behavior when blocking threshold is None."""
        input_data = WzorzecCInput(
            punkt_zabezpieczenia_id="pz-no-blocking",
            punkt_zabezpieczenia_nazwa="Pole bez blokady szyn",
            szyny_id="szyny-test",
            szyny_nazwa="Szyny Test",
            zrodla_generacji=(
                ZrodloGeneracji(
                    id="pv-test",
                    nazwa="PV Test",
                    typ=TypGeneracji.PV,
                    moc_znamionowa_kw=500.0,
                    prad_zwarciowy_a=300.0,
                ),
            ),
            dane_bez_generacji=DaneZwarciowePunktuZabezpieczenia(
                scenariusz="bez_generacji",
                ik_3f_a=5000.0,
                ik_2f_a=4330.0,
                ik_1f_a=3670.0,
                wklad_generacji_a=0.0,
            ),
            dane_generacja_min=DaneZwarciowePunktuZabezpieczenia(
                scenariusz="generacja_min",
                ik_3f_a=5100.0,
                ik_2f_a=4416.0,
                ik_1f_a=3744.0,
                wklad_generacji_a=100.0,
            ),
            dane_generacja_max=DaneZwarciowePunktuZabezpieczenia(
                scenariusz="generacja_max",
                ik_3f_a=5300.0,
                ik_2f_a=4589.0,
                ik_1f_a=3891.0,
                wklad_generacji_a=300.0,
            ),
            nastawy=NastawyZabezpieczen(
                i_wyzszy_stopien_a=2500.0,
                i_nizszy_stopien_a=800.0,
                prog_blokady_szyn_a=None,  # No blocking threshold
            ),
        )

        result = pattern.validate(input_data=input_data)

        # Should still work
        assert result.verdict in ["ZGODNE", "GRANICZNE", "NIEZGODNE"]

        # Blocking check should be INFO
        blocking_check = next(c for c in result.checks if "blokad" in c["name_pl"].lower())
        assert blocking_check["status"] == "INFO"

    def test_multiple_generation_sources(self, pattern: WzorzecCGeneracjaLokalna):
        """Test with multiple generation sources."""
        input_data = WzorzecCInput(
            punkt_zabezpieczenia_id="pz-multi",
            punkt_zabezpieczenia_nazwa="Pole z wieloma źródłami",
            szyny_id="szyny-test",
            szyny_nazwa="Szyny Test",
            zrodla_generacji=(
                ZrodloGeneracji(
                    id="pv-1",
                    nazwa="PV 1",
                    typ=TypGeneracji.PV,
                    moc_znamionowa_kw=100.0,
                    prad_zwarciowy_a=60.0,
                ),
                ZrodloGeneracji(
                    id="pv-2",
                    nazwa="PV 2",
                    typ=TypGeneracji.PV,
                    moc_znamionowa_kw=150.0,
                    prad_zwarciowy_a=90.0,
                ),
                ZrodloGeneracji(
                    id="bess-1",
                    nazwa="BESS 1",
                    typ=TypGeneracji.BESS,
                    moc_znamionowa_kw=200.0,
                    prad_zwarciowy_a=120.0,
                ),
            ),
            dane_bez_generacji=DaneZwarciowePunktuZabezpieczenia(
                scenariusz="bez_generacji",
                ik_3f_a=5000.0,
                ik_2f_a=4330.0,
                ik_1f_a=3670.0,
                wklad_generacji_a=0.0,
            ),
            dane_generacja_min=DaneZwarciowePunktuZabezpieczenia(
                scenariusz="generacja_min",
                ik_3f_a=5100.0,
                ik_2f_a=4416.0,
                ik_1f_a=3744.0,
                wklad_generacji_a=100.0,
            ),
            dane_generacja_max=DaneZwarciowePunktuZabezpieczenia(
                scenariusz="generacja_max",
                ik_3f_a=5270.0,
                ik_2f_a=4564.0,
                ik_1f_a=3869.0,
                wklad_generacji_a=270.0,
            ),
            nastawy=NastawyZabezpieczen(
                i_wyzszy_stopien_a=2500.0,
                i_nizszy_stopien_a=800.0,
                prog_blokady_szyn_a=1500.0,
            ),
        )

        result = pattern.validate(input_data=input_data)

        # Verify number of sources
        assert result.artifacts["liczba_zrodel_generacji"] == 3

        # Total power should be sum
        assert result.artifacts["sumaryczna_moc_generacji_kw"] == pytest.approx(450.0, rel=0.01)


# =============================================================================
# TEST: CASE-SPECIFIC ARTIFACTS
# =============================================================================


class TestCaseSpecificArtifacts:
    """Tests for case-specific artifact values."""

    def test_przypadek_zgodny_artifacts(self, pattern: WzorzecCGeneracjaLokalna):
        """Test przypadek_zgodny artifacts match expected values."""
        result = pattern.validate(fixture_file="przypadek_zgodny.json")

        # Zmiana prądu: (5320 - 5200) / 5200 * 100 = 2.31%
        assert result.artifacts["zmiana_pradu_zwarciowego_pct"] == pytest.approx(2.31, rel=0.1)

        # Wkład generacji
        assert result.artifacts["wklad_generacji_max_a"] == pytest.approx(120.0, rel=0.01)

        # Wyniki sprawdzeń
        assert result.artifacts["wynik_sprawdzenia_a"] == "INFO"
        assert result.artifacts["wynik_sprawdzenia_b"] == "PASS"
        assert result.artifacts["wynik_sprawdzenia_c"] == "PASS"

    def test_przypadek_graniczny_artifacts(self, pattern: WzorzecCGeneracjaLokalna):
        """Test przypadek_graniczny artifacts match expected values."""
        result = pattern.validate(fixture_file="przypadek_graniczny.json")

        # Zmiana prądu: (5130 - 4200) / 4200 * 100 = 22.14%
        assert result.artifacts["zmiana_pradu_zwarciowego_pct"] == pytest.approx(22.14, rel=0.1)

        # Wynik sprawdzenia A powinien być GRANICZNE
        assert result.artifacts["wynik_sprawdzenia_a"] == "GRANICZNE"

    def test_przypadek_niezgodny_artifacts(self, pattern: WzorzecCGeneracjaLokalna):
        """Test przypadek_niezgodny artifacts match expected values."""
        result = pattern.validate(fixture_file="przypadek_niezgodny.json")

        # Zmiana prądu: (6650 - 3200) / 3200 * 100 = 107.8%
        assert result.artifacts["zmiana_pradu_zwarciowego_pct"] == pytest.approx(107.8, rel=0.1)

        # Wkład generacji przekracza próg blokady
        wklad = result.artifacts["wklad_generacji_max_a"]
        prog = result.artifacts["prog_blokady_szyn_a"]
        assert wklad > prog  # 3450 > 2500

        # Wyniki sprawdzeń A i B powinny być NIEZGODNE
        assert result.artifacts["wynik_sprawdzenia_a"] == "NIEZGODNE"
        assert result.artifacts["wynik_sprawdzenia_b"] == "NIEZGODNE"
