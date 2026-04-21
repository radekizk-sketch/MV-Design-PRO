"""
Testy generatorów OZE (odnawialnych źródeł energii) — SN i nN.

Weryfikuje:
- Tworzenie generatorów SN (PV, BESS)
- Tworzenie generatorów nN (GENSET, PV)
- Walidację transformatora blokowego dla PV SN (BLOCKER)
- Walidację zgodności napięcia (BLOCKER)
- Ostrzeżenie o przekroczeniu mocy transformatora (WARNING)
- Obliczenie wkładu zwarciowego Ik = k_sc * In
- Kompletność rejestrów walidatorów
- Serializację / deserializację (to_dict / from_dict)
"""

from __future__ import annotations

import math

import pytest
from network_model.core.generator import (
    ControlMode,
    GeneratorNN,
    GeneratorSN,
    GeneratorType,
)
from network_model.validation.oze_validators import (
    all_generator_types_have_handlers,
    get_nn_validators_for_type,
    get_sn_validators_for_type,
    validate_bess_parameters,
    validate_generator_nn_parameters,
    validate_power_limit,
    validate_pv_has_transformer,
    validate_voltage_compatibility,
)
from network_model.validation.validator import Severity

# ============================================================
# 1. test_pv_sn_creation
# ============================================================


class TestPVSNCreation:
    """Tworzenie generatora PV podłączonego do sieci SN."""

    def test_basic_pv_sn_creation(self) -> None:
        """PV SN z typowymi parametrami farmy fotowoltaicznej."""
        gen = GeneratorSN(
            id="pv-sn-001",
            name="PV Farma Południe",
            node_id="bus-sn-15",
            generator_type=GeneratorType.PV,
            rated_power_mw=2.0,
            cos_phi=0.95,
            internal_impedance_pu=complex(0.01, 0.10),
            transformer_ref="trafo-blok-001",
            k_sc=1.1,
            in_service=True,
        )

        assert gen.id == "pv-sn-001"
        assert gen.name == "PV Farma Południe"
        assert gen.node_id == "bus-sn-15"
        assert gen.generator_type == GeneratorType.PV
        assert gen.rated_power_mw == 2.0
        assert gen.cos_phi == 0.95
        assert gen.internal_impedance_pu == complex(0.01, 0.10)
        assert gen.transformer_ref == "trafo-blok-001"
        assert gen.k_sc == 1.1
        assert gen.in_service is True

    def test_pv_sn_is_frozen(self) -> None:
        """Frozen dataclass — assignment po utworzeniu jest zabroniony."""
        gen = GeneratorSN(
            id="pv-frozen-01",
            name="PV Frozen",
            node_id="bus-01",
            generator_type=GeneratorType.PV,
            rated_power_mw=1.0,
        )

        with pytest.raises(AttributeError):
            gen.name = "PV Modified"  # type: ignore[misc]

    def test_pv_sn_serialization_roundtrip(self) -> None:
        """to_dict() -> from_dict() zachowuje wszystkie pola."""
        gen = GeneratorSN(
            id="pv-sn-rt-01",
            name="PV Roundtrip",
            node_id="bus-rt-01",
            generator_type=GeneratorType.PV,
            rated_power_mw=5.0,
            cos_phi=0.90,
            internal_impedance_pu=complex(0.005, 0.08),
            transformer_ref="trafo-rt-01",
            k_sc=1.2,
            in_service=False,
        )

        data = gen.to_dict()
        restored = GeneratorSN.from_dict(data)

        assert restored.id == gen.id
        assert restored.name == gen.name
        assert restored.node_id == gen.node_id
        assert restored.generator_type == gen.generator_type
        assert restored.rated_power_mw == gen.rated_power_mw
        assert restored.cos_phi == gen.cos_phi
        assert restored.internal_impedance_pu == gen.internal_impedance_pu
        assert restored.transformer_ref == gen.transformer_ref
        assert restored.k_sc == gen.k_sc
        assert restored.in_service == gen.in_service

    def test_pv_sn_defaults(self) -> None:
        """Domyślne wartości dla GeneratorSN."""
        gen = GeneratorSN()

        assert gen.generator_type == GeneratorType.PV
        assert gen.rated_power_mw == 0.0
        assert gen.cos_phi == 0.9
        assert gen.internal_impedance_pu == complex(0.0, 0.0)
        assert gen.transformer_ref is None
        assert gen.k_sc == 1.1
        assert gen.in_service is True


# ============================================================
# 2. test_bess_sn_creation
# ============================================================


class TestBESSSNCreation:
    """Tworzenie generatora BESS podłączonego do sieci SN."""

    def test_basic_bess_sn_creation(self) -> None:
        """BESS SN z typowymi parametrami magazynu energii."""
        gen = GeneratorSN(
            id="bess-sn-001",
            name="BESS Magazyn Centrum",
            node_id="bus-sn-20",
            generator_type=GeneratorType.BESS,
            rated_power_mw=1.5,
            cos_phi=0.95,
            internal_impedance_pu=complex(0.01, 0.12),
            transformer_ref="trafo-bess-001",
            k_sc=1.1,
            in_service=True,
        )

        assert gen.id == "bess-sn-001"
        assert gen.generator_type == GeneratorType.BESS
        assert gen.rated_power_mw == 1.5
        assert gen.transformer_ref == "trafo-bess-001"

    def test_bess_sn_no_transformer(self) -> None:
        """BESS SN bez transformatora — poprawne (BESS nie wymaga trafo)."""
        gen = GeneratorSN(
            id="bess-sn-no-trafo",
            name="BESS bez trafo",
            node_id="bus-sn-10",
            generator_type=GeneratorType.BESS,
            rated_power_mw=0.5,
        )

        assert gen.transformer_ref is None


# ============================================================
# 3. test_genset_nn_creation
# ============================================================


class TestGensetNNCreation:
    """Tworzenie generatora zespołu prądotwórczego (GENSET) nN."""

    def test_basic_genset_nn_creation(self) -> None:
        """GENSET nN z typowymi parametrami zespołu prądotwórczego."""
        gen = GeneratorNN(
            id="genset-nn-001",
            name="Agregat G1",
            node_id="bus-nn-04",
            generator_type=GeneratorType.GENSET,
            rated_power_kw=100.0,
            inverter_rated_current_a=150.0,
            control_mode=ControlMode.STALY_COS_PHI,
            power_limit_kw=80.0,
            in_service=True,
        )

        assert gen.id == "genset-nn-001"
        assert gen.name == "Agregat G1"
        assert gen.generator_type == GeneratorType.GENSET
        assert gen.rated_power_kw == 100.0
        assert gen.inverter_rated_current_a == 150.0
        assert gen.control_mode == ControlMode.STALY_COS_PHI
        assert gen.power_limit_kw == 80.0
        assert gen.in_service is True

    def test_genset_nn_effective_power_with_limit(self) -> None:
        """Efektywna moc z ograniczeniem power_limit_kw."""
        gen = GeneratorNN(
            id="genset-eff",
            rated_power_kw=100.0,
            power_limit_kw=80.0,
            inverter_rated_current_a=150.0,
            generator_type=GeneratorType.GENSET,
        )

        assert gen.effective_power_kw == 80.0

    def test_genset_nn_effective_power_without_limit(self) -> None:
        """Efektywna moc bez ograniczenia = rated_power_kw."""
        gen = GeneratorNN(
            id="genset-no-limit",
            rated_power_kw=100.0,
            inverter_rated_current_a=150.0,
            generator_type=GeneratorType.GENSET,
        )

        assert gen.effective_power_kw == 100.0

    def test_genset_nn_is_frozen(self) -> None:
        """Frozen dataclass — assignment po utworzeniu jest zabroniony."""
        gen = GeneratorNN(
            id="genset-frozen",
            rated_power_kw=50.0,
            inverter_rated_current_a=75.0,
            generator_type=GeneratorType.GENSET,
        )

        with pytest.raises(AttributeError):
            gen.rated_power_kw = 60.0  # type: ignore[misc]

    def test_genset_nn_serialization_roundtrip(self) -> None:
        """to_dict() -> from_dict() zachowuje wszystkie pola."""
        gen = GeneratorNN(
            id="genset-rt-01",
            name="Genset Roundtrip",
            node_id="bus-nn-rt",
            generator_type=GeneratorType.GENSET,
            rated_power_kw=200.0,
            inverter_rated_current_a=300.0,
            control_mode=ControlMode.Q_OD_U,
            power_limit_kw=150.0,
            profile_p_t=((0, 100.0), (3600, 150.0), (7200, 200.0)),
            k_sc=1.2,
            in_service=False,
        )

        data = gen.to_dict()
        restored = GeneratorNN.from_dict(data)

        assert restored.id == gen.id
        assert restored.name == gen.name
        assert restored.node_id == gen.node_id
        assert restored.generator_type == gen.generator_type
        assert restored.rated_power_kw == gen.rated_power_kw
        assert restored.inverter_rated_current_a == gen.inverter_rated_current_a
        assert restored.control_mode == gen.control_mode
        assert restored.power_limit_kw == gen.power_limit_kw
        assert restored.k_sc == gen.k_sc
        assert restored.in_service == gen.in_service

    def test_genset_nn_all_control_modes(self) -> None:
        """Weryfikacja wszystkich trybów sterowania."""
        for mode in ControlMode:
            gen = GeneratorNN(
                id=f"genset-mode-{mode.value}",
                generator_type=GeneratorType.GENSET,
                rated_power_kw=50.0,
                inverter_rated_current_a=75.0,
                control_mode=mode,
            )
            assert gen.control_mode == mode


# ============================================================
# 4. test_pv_without_transformer_blocker (CRITICAL)
# ============================================================


class TestPVWithoutTransformerBlocker:
    """KRYTYCZNY: PV SN bez transformatora musi generować BLOCKER."""

    def test_pv_sn_without_transformer_raises_blocker(self) -> None:
        """PV SN bez transformer_ref -> BLOCKER (Severity.ERROR)."""
        gen = GeneratorSN(
            id="pv-no-trafo",
            name="PV bez transformatora",
            node_id="bus-sn-01",
            generator_type=GeneratorType.PV,
            rated_power_mw=1.0,
            transformer_ref=None,  # BRAK transformatora!
        )

        snapshot: dict = {"transformers": {}}
        issues = validate_pv_has_transformer(gen, snapshot)

        assert len(issues) == 1
        assert issues[0].severity == Severity.ERROR
        assert issues[0].code == "oze.pv_sn_transformer_missing"
        assert issues[0].element_id == gen.id
        assert "transformatora blokowego" in issues[0].message

    def test_pv_sn_with_missing_transformer_ref_raises_blocker(self) -> None:
        """PV SN z transformer_ref do nieistniejącego trafo -> BLOCKER."""
        gen = GeneratorSN(
            id="pv-missing-trafo",
            name="PV z brakującym trafo",
            node_id="bus-sn-02",
            generator_type=GeneratorType.PV,
            rated_power_mw=2.0,
            transformer_ref="trafo-nie-istnieje",
        )

        snapshot: dict = {"transformers": {"trafo-001": {"id": "trafo-001"}}}
        issues = validate_pv_has_transformer(gen, snapshot)

        assert len(issues) == 1
        assert issues[0].severity == Severity.ERROR
        assert issues[0].code == "oze.pv_sn_transformer_not_found"

    def test_pv_sn_with_valid_transformer_no_issues(self) -> None:
        """PV SN z prawidłowym transformer_ref -> brak problemów."""
        gen = GeneratorSN(
            id="pv-valid-trafo",
            name="PV z prawidłowym trafo",
            node_id="bus-sn-03",
            generator_type=GeneratorType.PV,
            rated_power_mw=3.0,
            transformer_ref="trafo-001",
        )

        snapshot: dict = {"transformers": {"trafo-001": {"id": "trafo-001"}}}
        issues = validate_pv_has_transformer(gen, snapshot)

        assert len(issues) == 0

    def test_bess_without_transformer_not_blocker(self) -> None:
        """BESS SN bez transformer_ref -> brak BLOCKER (reguła nie dotyczy BESS)."""
        gen = GeneratorSN(
            id="bess-no-trafo",
            name="BESS bez trafo",
            node_id="bus-sn-04",
            generator_type=GeneratorType.BESS,
            rated_power_mw=1.0,
            transformer_ref=None,
        )

        snapshot: dict = {"transformers": {}}
        issues = validate_pv_has_transformer(gen, snapshot)

        assert len(issues) == 0  # BESS nie wymaga trafo w tej walidacji

    def test_pv_sn_with_transformer_list_snapshot(self) -> None:
        """PV SN z transformatorami w formacie listy w snapshot."""
        gen = GeneratorSN(
            id="pv-list-trafo",
            name="PV list trafo",
            node_id="bus-sn-05",
            generator_type=GeneratorType.PV,
            rated_power_mw=1.0,
            transformer_ref="trafo-list-01",
        )

        snapshot: dict = {
            "transformers": [
                {"id": "trafo-list-01", "name": "Trafo 1"},
                {"id": "trafo-list-02", "name": "Trafo 2"},
            ]
        }
        issues = validate_pv_has_transformer(gen, snapshot)

        assert len(issues) == 0


# ============================================================
# 5. test_voltage_mismatch_blocker
# ============================================================


class TestVoltageMismatchBlocker:
    """Niezgodność napięcia generatora z szyną/transformatorem."""

    def test_voltage_mismatch_raises_blocker(self) -> None:
        """Napięcie strony DN trafo niezgodne z szyną -> BLOCKER."""
        gen = GeneratorSN(
            id="pv-voltage-mm",
            name="PV mismatch",
            node_id="bus-sn-15kv",
            generator_type=GeneratorType.PV,
            rated_power_mw=1.0,
        )

        # Szyna 15 kV, trafo strona DN 20 kV -> mismatch
        issues = validate_voltage_compatibility(
            generator=gen,
            bus_voltage_kv=15.0,
            transformer_voltage_lv_kv=20.0,
        )

        assert len(issues) == 1
        assert issues[0].severity == Severity.ERROR
        assert issues[0].code == "oze.voltage_mismatch"

    def test_voltage_compatible_no_issues(self) -> None:
        """Napięcia zgodne (w tolerancji 5%) -> brak problemów."""
        gen = GeneratorSN(
            id="pv-voltage-ok",
            name="PV ok voltage",
            node_id="bus-sn-15kv",
            generator_type=GeneratorType.PV,
            rated_power_mw=1.0,
        )

        # Szyna 15 kV, trafo strona DN 15 kV -> OK
        issues = validate_voltage_compatibility(
            generator=gen,
            bus_voltage_kv=15.0,
            transformer_voltage_lv_kv=15.0,
        )

        assert len(issues) == 0

    def test_voltage_within_tolerance_no_issues(self) -> None:
        """Napięcia w tolerancji 5% -> brak problemów."""
        gen = GeneratorSN(
            id="pv-voltage-tol",
            name="PV voltage tolerance",
            node_id="bus-sn-15kv",
            generator_type=GeneratorType.PV,
            rated_power_mw=1.0,
        )

        # Szyna 15 kV, trafo strona DN 15.5 kV -> 3.3% < 5% -> OK
        issues = validate_voltage_compatibility(
            generator=gen,
            bus_voltage_kv=15.0,
            transformer_voltage_lv_kv=15.5,
        )

        assert len(issues) == 0

    def test_bus_voltage_zero_raises_blocker(self) -> None:
        """Napięcie szyny = 0 -> BLOCKER."""
        gen = GeneratorSN(
            id="pv-voltage-zero",
            name="PV zero voltage",
            node_id="bus-bad",
            generator_type=GeneratorType.PV,
            rated_power_mw=1.0,
        )

        issues = validate_voltage_compatibility(
            generator=gen,
            bus_voltage_kv=0.0,
        )

        assert len(issues) == 1
        assert issues[0].severity == Severity.ERROR
        assert issues[0].code == "oze.bus_voltage_invalid"

    def test_no_transformer_no_voltage_check(self) -> None:
        """Bez transformer_voltage_lv_kv nie sprawdza zgodności."""
        gen = GeneratorSN(
            id="pv-no-trafo-volt",
            name="PV no trafo voltage",
            node_id="bus-sn-15kv",
            generator_type=GeneratorType.PV,
            rated_power_mw=1.0,
        )

        issues = validate_voltage_compatibility(
            generator=gen,
            bus_voltage_kv=15.0,
            transformer_voltage_lv_kv=None,
        )

        assert len(issues) == 0


# ============================================================
# 6. test_power_exceeds_transformer_warning
# ============================================================


class TestPowerExceedsTransformerWarning:
    """Moc generatora > moc znamionowa transformatora -> WARNING."""

    def test_power_exceeds_transformer_warning(self) -> None:
        """Generator 5 MW / cos0.9 = 5.56 MVA > 5 MVA trafo -> WARNING."""
        gen = GeneratorSN(
            id="pv-overload",
            name="PV overloaded",
            node_id="bus-sn-01",
            generator_type=GeneratorType.PV,
            rated_power_mw=5.0,
            cos_phi=0.9,
        )

        issues = validate_power_limit(
            generator=gen,
            transformer_rated_power_mva=5.0,
        )

        assert len(issues) == 1
        assert issues[0].severity == Severity.WARNING
        assert issues[0].code == "oze.power_exceeds_transformer"
        assert "przekracza" in issues[0].message

    def test_power_within_transformer_no_warning(self) -> None:
        """Generator 4 MW / cos0.9 = 4.44 MVA < 5 MVA trafo -> OK."""
        gen = GeneratorSN(
            id="pv-ok-power",
            name="PV ok power",
            node_id="bus-sn-02",
            generator_type=GeneratorType.PV,
            rated_power_mw=4.0,
            cos_phi=0.9,
        )

        issues = validate_power_limit(
            generator=gen,
            transformer_rated_power_mva=5.0,
        )

        assert len(issues) == 0

    def test_power_no_transformer_no_check(self) -> None:
        """Bez transformer_rated_power_mva nie sprawdza."""
        gen = GeneratorSN(
            id="pv-no-trafo-pwr",
            name="PV no trafo",
            node_id="bus-sn-03",
            generator_type=GeneratorType.PV,
            rated_power_mw=100.0,
        )

        issues = validate_power_limit(
            generator=gen,
            transformer_rated_power_mva=None,
        )

        assert len(issues) == 0

    def test_transformer_zero_power_error(self) -> None:
        """Moc transformatora <= 0 -> ERROR."""
        gen = GeneratorSN(
            id="pv-trafo-zero",
            name="PV trafo zero",
            node_id="bus-sn-04",
            generator_type=GeneratorType.PV,
            rated_power_mw=1.0,
        )

        issues = validate_power_limit(
            generator=gen,
            transformer_rated_power_mva=0.0,
        )

        assert len(issues) == 1
        assert issues[0].severity == Severity.ERROR
        assert issues[0].code == "oze.transformer_power_invalid"


# ============================================================
# 7. test_generator_sc_contribution
# ============================================================


class TestGeneratorSCContribution:
    """Weryfikacja wkładu zwarciowego: Ik = k_sc * In."""

    def test_generator_sn_ik_sc(self) -> None:
        """Ik = k_sc * In dla generatora SN przy danym napięciu."""
        gen = GeneratorSN(
            id="pv-sc-01",
            name="PV SC Test",
            node_id="bus-sn-15kv",
            generator_type=GeneratorType.PV,
            rated_power_mw=2.0,
            cos_phi=0.9,
            k_sc=1.1,
        )

        voltage_kv = 15.0
        in_rated = gen.get_rated_current_a(voltage_kv)
        ik_sc = gen.get_ik_sc_a(voltage_kv)

        # In = P / (sqrt(3) * U * cos_phi)
        # In = 2e6 / (sqrt(3) * 15e3 * 0.9) = 2e6 / 23382.69 = 85.55 A
        expected_in = 2e6 / (math.sqrt(3) * 15e3 * 0.9)
        expected_ik = 1.1 * expected_in

        assert abs(in_rated - expected_in) < 0.01
        assert abs(ik_sc - expected_ik) < 0.01

        # Verify the ratio
        assert abs(ik_sc / in_rated - 1.1) < 1e-10

    def test_generator_nn_ik_sc(self) -> None:
        """Ik = k_sc * In_inverter dla generatora nN."""
        gen = GeneratorNN(
            id="genset-sc-01",
            name="Genset SC Test",
            node_id="bus-nn-01",
            generator_type=GeneratorType.GENSET,
            rated_power_kw=100.0,
            inverter_rated_current_a=150.0,
            k_sc=1.1,
        )

        expected_ik = 1.1 * 150.0  # k_sc * In_inverter

        assert abs(gen.ik_sc_a - expected_ik) < 0.01
        assert gen.ik_sc_a == pytest.approx(165.0, abs=0.01)

    def test_generator_nn_ik_sc_custom_k(self) -> None:
        """Ik z niestandardowym k_sc = 1.5."""
        gen = GeneratorNN(
            id="bess-sc-custom",
            name="BESS custom k_sc",
            node_id="bus-nn-02",
            generator_type=GeneratorType.BESS,
            rated_power_kw=50.0,
            inverter_rated_current_a=80.0,
            k_sc=1.5,
        )

        expected_ik = 1.5 * 80.0
        assert gen.ik_sc_a == pytest.approx(expected_ik, abs=0.01)

    def test_generator_sn_zero_power_returns_zero(self) -> None:
        """Generator SN z mocą 0 -> In = 0, Ik = 0."""
        gen = GeneratorSN(
            id="pv-zero-power",
            rated_power_mw=0.0,
        )

        assert gen.get_rated_current_a(15.0) == 0.0
        assert gen.get_ik_sc_a(15.0) == 0.0

    def test_generator_sn_invalid_voltage_raises(self) -> None:
        """Generator SN z napięciem <= 0 -> ValueError."""
        gen = GeneratorSN(
            id="pv-bad-voltage",
            rated_power_mw=1.0,
        )

        with pytest.raises(ValueError, match="Napięcie musi być > 0"):
            gen.get_rated_current_a(0.0)

        with pytest.raises(ValueError, match="Napięcie musi być > 0"):
            gen.get_rated_current_a(-10.0)


# ============================================================
# 8. test_generator_types_complete
# ============================================================


class TestGeneratorTypesComplete:
    """Kompletność rejestrów GeneratorType w walidatorach."""

    def test_all_generator_types_have_handlers(self) -> None:
        """Wszystkie wartości GeneratorType mają handlery SN i nN."""
        assert all_generator_types_have_handlers() is True

    def test_all_generator_types_enumerated(self) -> None:
        """Enum GeneratorType zawiera 6 oczekiwanych wartości."""
        expected_types = {"PV", "BESS", "WIND", "GENSET", "UPS", "BIOGAS"}
        actual_types = {gt.value for gt in GeneratorType}

        assert actual_types == expected_types

    def test_sn_validators_cover_all_types(self) -> None:
        """Każdy GeneratorType ma wpis w _SN_VALIDATORS."""
        for gen_type in GeneratorType:
            validators = get_sn_validators_for_type(gen_type)
            assert isinstance(validators, list), f"Brak walidatorów SN dla typu {gen_type.value}"

    def test_nn_validators_cover_all_types(self) -> None:
        """Każdy GeneratorType ma wpis w _NN_VALIDATORS."""
        for gen_type in GeneratorType:
            validators = get_nn_validators_for_type(gen_type)
            assert isinstance(validators, list), f"Brak walidatorów nN dla typu {gen_type.value}"

    def test_all_control_modes_enumerated(self) -> None:
        """Enum ControlMode zawiera 3 oczekiwane wartości."""
        expected = {"STALY_COS_PHI", "Q_OD_U", "P_OD_U"}
        actual = {cm.value for cm in ControlMode}

        assert actual == expected


# ============================================================
# Dodatkowe testy walidacji BESS
# ============================================================


class TestBESSValidation:
    """Walidacja parametrów BESS."""

    def test_bess_sn_valid_parameters(self) -> None:
        """BESS SN z prawidłowymi parametrami -> brak problemów."""
        gen = GeneratorSN(
            id="bess-valid",
            name="BESS Valid",
            generator_type=GeneratorType.BESS,
            rated_power_mw=1.0,
            internal_impedance_pu=complex(0.01, 0.1),
            k_sc=1.1,
        )

        issues = validate_bess_parameters(gen)
        assert len(issues) == 0

    def test_bess_sn_zero_power_error(self) -> None:
        """BESS SN z mocą 0 -> ERROR."""
        gen = GeneratorSN(
            id="bess-zero-power",
            name="BESS Zero Power",
            generator_type=GeneratorType.BESS,
            rated_power_mw=0.0,
            internal_impedance_pu=complex(0.01, 0.1),
        )

        issues = validate_bess_parameters(gen)
        error_issues = [i for i in issues if i.code == "oze.bess_power_invalid"]
        assert len(error_issues) == 1
        assert error_issues[0].severity == Severity.ERROR

    def test_bess_sn_ksc_out_of_range_warning(self) -> None:
        """BESS SN z k_sc = 3.0 (poza [1.0, 2.0]) -> WARNING."""
        gen = GeneratorSN(
            id="bess-bad-ksc",
            name="BESS Bad k_sc",
            generator_type=GeneratorType.BESS,
            rated_power_mw=1.0,
            k_sc=3.0,
            internal_impedance_pu=complex(0.01, 0.1),
        )

        issues = validate_bess_parameters(gen)
        ksc_issues = [i for i in issues if i.code == "oze.bess_ksc_out_of_range"]
        assert len(ksc_issues) == 1
        assert ksc_issues[0].severity == Severity.WARNING

    def test_bess_sn_zero_impedance_warning(self) -> None:
        """BESS SN z impedancją 0+0j -> WARNING."""
        gen = GeneratorSN(
            id="bess-zero-z",
            name="BESS Zero Z",
            generator_type=GeneratorType.BESS,
            rated_power_mw=1.0,
            internal_impedance_pu=complex(0.0, 0.0),
        )

        issues = validate_bess_parameters(gen)
        z_issues = [i for i in issues if i.code == "oze.bess_impedance_zero"]
        assert len(z_issues) == 1
        assert z_issues[0].severity == Severity.WARNING

    def test_bess_nn_valid_parameters(self) -> None:
        """BESS nN z prawidłowymi parametrami -> brak problemów."""
        gen = GeneratorNN(
            id="bess-nn-valid",
            name="BESS nN Valid",
            generator_type=GeneratorType.BESS,
            rated_power_kw=50.0,
            inverter_rated_current_a=80.0,
            k_sc=1.1,
        )

        issues = validate_bess_parameters(gen)
        assert len(issues) == 0

    def test_non_bess_generator_skipped(self) -> None:
        """Walidacja BESS pomija inne typy generatorów."""
        gen = GeneratorSN(
            id="pv-skip-bess",
            generator_type=GeneratorType.PV,
            rated_power_mw=1.0,
        )

        issues = validate_bess_parameters(gen)
        assert len(issues) == 0


# ============================================================
# Testy walidacji nN (ogólne)
# ============================================================


class TestGeneratorNNValidation:
    """Walidacja parametrów generatorów nN."""

    def test_nn_valid_generator_no_issues(self) -> None:
        """Generator nN z prawidłowymi parametrami."""
        gen = GeneratorNN(
            id="nn-valid",
            name="Valid nN",
            generator_type=GeneratorType.PV,
            rated_power_kw=50.0,
            inverter_rated_current_a=80.0,
        )

        issues = validate_generator_nn_parameters(gen)
        assert len(issues) == 0

    def test_nn_zero_power_error(self) -> None:
        """Generator nN z mocą 0 -> ERROR."""
        gen = GeneratorNN(
            id="nn-zero-power",
            generator_type=GeneratorType.PV,
            rated_power_kw=0.0,
            inverter_rated_current_a=80.0,
        )

        issues = validate_generator_nn_parameters(gen)
        power_issues = [i for i in issues if i.code == "oze.nn_power_invalid"]
        assert len(power_issues) == 1

    def test_nn_zero_inverter_current_error(self) -> None:
        """Generator nN z prądem falownika 0 -> ERROR."""
        gen = GeneratorNN(
            id="nn-zero-current",
            generator_type=GeneratorType.PV,
            rated_power_kw=50.0,
            inverter_rated_current_a=0.0,
        )

        issues = validate_generator_nn_parameters(gen)
        current_issues = [i for i in issues if i.code == "oze.nn_inverter_current_invalid"]
        assert len(current_issues) == 1

    def test_nn_negative_power_limit_warning(self) -> None:
        """Generator nN z power_limit_kw < 0 -> WARNING."""
        gen = GeneratorNN(
            id="nn-neg-limit",
            generator_type=GeneratorType.PV,
            rated_power_kw=50.0,
            inverter_rated_current_a=80.0,
            power_limit_kw=-10.0,
        )

        issues = validate_generator_nn_parameters(gen)
        limit_issues = [i for i in issues if i.code == "oze.nn_power_limit_invalid"]
        assert len(limit_issues) == 1
        assert limit_issues[0].severity == Severity.WARNING


# ============================================================
# Testy typów generatorów i enum
# ============================================================


class TestGeneratorTypes:
    """Weryfikacja enum GeneratorType."""

    def test_generator_type_values(self) -> None:
        """Wartości enum GeneratorType."""
        assert GeneratorType.PV.value == "PV"
        assert GeneratorType.BESS.value == "BESS"
        assert GeneratorType.WIND.value == "WIND"
        assert GeneratorType.GENSET.value == "GENSET"
        assert GeneratorType.UPS.value == "UPS"
        assert GeneratorType.BIOGAS.value == "BIOGAS"

    def test_generator_type_from_string(self) -> None:
        """Tworzenie GeneratorType ze stringa."""
        assert GeneratorType("PV") == GeneratorType.PV
        assert GeneratorType("BESS") == GeneratorType.BESS
        assert GeneratorType("WIND") == GeneratorType.WIND

    def test_generator_type_invalid_raises(self) -> None:
        """Nieprawidłowy typ generatora -> ValueError."""
        with pytest.raises(ValueError):
            GeneratorType("INVALID")

    def test_control_mode_values(self) -> None:
        """Wartości enum ControlMode."""
        assert ControlMode.STALY_COS_PHI.value == "STALY_COS_PHI"
        assert ControlMode.Q_OD_U.value == "Q_OD_U"
        assert ControlMode.P_OD_U.value == "P_OD_U"
