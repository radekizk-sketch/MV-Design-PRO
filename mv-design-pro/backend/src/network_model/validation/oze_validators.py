"""
Walidatory OZE (odnawialnych źródeł energii) dla generatorów SN i nN.

Moduł walidacji pre-solverowej (warstwa Application) dla generatorów OZE.
NIE wykonuje obliczeń fizycznych — sprawdza poprawność konfiguracji.

Walidowane reguły:
1. PV SN wymaga transformatora blokowego → BLOCKER
2. Zgodność napięcia generator-szyna-transformator → BLOCKER
3. Moc generatora vs moc znamionowa transformatora → WARNING
4. Parametry BESS (impedancja, tryb) → BLOCKER/WARNING

Diagnostyki w formacie PowerFactory "Check Network Data".
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from network_model.core.generator import (
    GeneratorNN,
    GeneratorSN,
    GeneratorType,
)
from network_model.validation.validator import Severity, ValidationIssue

if TYPE_CHECKING:
    pass


def validate_pv_has_transformer(
    generator: GeneratorSN,
    snapshot: dict[str, Any],
) -> list[ValidationIssue]:
    """
    Waliduje, czy generator PV SN posiada transformator blokowy.

    Reguła: Źródło PV podłączone do sieci SN MUSI posiadać transformator
    blokowy (block transformer). Brak transformatora blokuje obliczenia.

    Args:
        generator: Generator SN do walidacji.
        snapshot: Słownik snapshot'u sieci z kluczami:
            - "transformers": dict[str, transformer_data] lub lista.
            Służy do weryfikacji czy transformer_ref istnieje.

    Returns:
        Lista ValidationIssue (pusta jeśli poprawne).

    BLOCKER gdy:
        - generator_type == PV i transformer_ref is None
        - generator_type == PV i transformer_ref nie istnieje w snapshot
    """
    issues: list[ValidationIssue] = []

    # Reguła dotyczy tylko PV SN
    if generator.generator_type != GeneratorType.PV:
        return issues

    if generator.transformer_ref is None:
        issues.append(
            ValidationIssue(
                code="oze.pv_sn_transformer_missing",
                message=(
                    f"Generator PV '{generator.name}' (SN) wymaga "
                    f"transformatora blokowego (block transformer)"
                ),
                severity=Severity.ERROR,
                element_id=generator.id,
                field="transformer_ref",
                suggested_fix=(
                    "Przypisz transformator blokowy do generatora PV SN " "w inspektorze parametrów"
                ),
            )
        )
        return issues

    # Sprawdź czy transformator istnieje w snapshot
    transformers = snapshot.get("transformers", {})
    if isinstance(transformers, dict):
        transformer_exists = generator.transformer_ref in transformers
    elif isinstance(transformers, list | tuple):
        transformer_ids = {
            t.get("id") or t.get("ref_id", "") for t in transformers if isinstance(t, dict)
        }
        transformer_exists = generator.transformer_ref in transformer_ids
    else:
        transformer_exists = False

    if not transformer_exists:
        issues.append(
            ValidationIssue(
                code="oze.pv_sn_transformer_not_found",
                message=(
                    f"Generator PV '{generator.name}' — transformator blokowy "
                    f"'{generator.transformer_ref}' nie istnieje w modelu sieci"
                ),
                severity=Severity.ERROR,
                element_id=generator.id,
                field="transformer_ref",
                suggested_fix=(
                    "Sprawdź referencję transformatora blokowego "
                    "lub dodaj brakujący transformator"
                ),
            )
        )

    return issues


def validate_voltage_compatibility(
    generator: GeneratorSN,
    bus_voltage_kv: float,
    transformer_voltage_lv_kv: float | None = None,
) -> list[ValidationIssue]:
    """
    Waliduje zgodność napięcia generatora z szyną i transformatorem.

    Reguła: Napięcie znamionowe szyny musi odpowiadać poziomowi SN.
    Jeśli generator ma transformator blokowy, napięcie strony DN
    transformatora musi odpowiadać napięciu generatora.

    Args:
        generator: Generator SN do walidacji.
        bus_voltage_kv: Napięcie znamionowe szyny [kV].
        transformer_voltage_lv_kv: Napięcie strony DN transformatora [kV]
            (opcjonalne, podawane gdy transformer_ref istnieje).

    Returns:
        Lista ValidationIssue (pusta jeśli poprawne).

    BLOCKER gdy:
        - Napięcie szyny <= 0 (nieprawidłowe)
        - Napięcie strony DN transformatora niezgodne z napięciem szyny
    """
    issues: list[ValidationIssue] = []

    # Sprawdź napięcie szyny
    if bus_voltage_kv <= 0:
        issues.append(
            ValidationIssue(
                code="oze.bus_voltage_invalid",
                message=(
                    f"Generator '{generator.name}' — szyna ma nieprawidłowe "
                    f"napięcie: {bus_voltage_kv} kV (musi być > 0)"
                ),
                severity=Severity.ERROR,
                element_id=generator.id,
                field="node_id",
                suggested_fix=(
                    "Ustaw prawidłowe napięcie znamionowe szyny "
                    "(typowe SN: 6, 10, 15, 20, 30 kV)"
                ),
            )
        )
        return issues

    # Sprawdź zgodność z transformatorem blokowym
    if transformer_voltage_lv_kv is not None:
        # Tolerancja 5% na niedopasowanie napięcia
        tolerance = 0.05
        ratio = abs(transformer_voltage_lv_kv - bus_voltage_kv) / bus_voltage_kv
        if ratio > tolerance:
            issues.append(
                ValidationIssue(
                    code="oze.voltage_mismatch",
                    message=(
                        f"Generator '{generator.name}' — niezgodność napięcia: "
                        f"szyna {bus_voltage_kv} kV, strona DN transformatora "
                        f"{transformer_voltage_lv_kv} kV "
                        f"(różnica {ratio * 100:.1f}% > {tolerance * 100}%)"
                    ),
                    severity=Severity.ERROR,
                    element_id=generator.id,
                    field="transformer_ref",
                    suggested_fix=(
                        "Sprawdź napięcia znamionowe szyny i transformatora blokowego. "
                        "Napięcie strony DN transformatora musi odpowiadać napięciu szyny"
                    ),
                )
            )

    return issues


def validate_power_limit(
    generator: GeneratorSN,
    transformer_rated_power_mva: float | None = None,
) -> list[ValidationIssue]:
    """
    Waliduje czy moc generatora nie przekracza mocy znamionowej transformatora.

    Reguła: Moc generatora nie powinna przekraczać mocy znamionowej
    przypisanego transformatora blokowego. Przekroczenie jest WARNING
    (nie BLOCKER), bo solver może to obsłużyć.

    Args:
        generator: Generator SN do walidacji.
        transformer_rated_power_mva: Moc znamionowa transformatora [MVA]
            (opcjonalne — jeśli None, brak walidacji).

    Returns:
        Lista ValidationIssue (pusta jeśli poprawne).

    WARNING gdy:
        - Moc generatora > moc znamionowa transformatora.
    """
    issues: list[ValidationIssue] = []

    if transformer_rated_power_mva is None:
        return issues

    if transformer_rated_power_mva <= 0:
        issues.append(
            ValidationIssue(
                code="oze.transformer_power_invalid",
                message=(
                    f"Generator '{generator.name}' — moc znamionowa "
                    f"transformatora blokowego musi być > 0 MVA"
                ),
                severity=Severity.ERROR,
                element_id=generator.id,
                field="transformer_ref",
                suggested_fix="Ustaw prawidłową moc znamionową transformatora blokowego",
            )
        )
        return issues

    # Porównaj moc generatora z mocą transformatora
    # Generator: rated_power_mw [MW]
    # Transformator: rated_power_mva [MVA]
    # Przybliżenie: P [MW] ~ S [MVA] * cos_phi
    generator_apparent_mva = (
        generator.rated_power_mw / generator.cos_phi
        if generator.cos_phi > 0
        else generator.rated_power_mw
    )

    if generator_apparent_mva > transformer_rated_power_mva:
        overload_pct = (generator_apparent_mva / transformer_rated_power_mva - 1.0) * 100
        issues.append(
            ValidationIssue(
                code="oze.power_exceeds_transformer",
                message=(
                    f"Generator '{generator.name}' — moc pozorna "
                    f"{generator_apparent_mva:.2f} MVA przekracza moc "
                    f"znamionową transformatora {transformer_rated_power_mva:.2f} MVA "
                    f"(przeciążenie {overload_pct:.1f}%)"
                ),
                severity=Severity.WARNING,
                element_id=generator.id,
                field="rated_power_mw",
                suggested_fix=(
                    "Zmniejsz moc generatora lub wymień transformator blokowy "
                    "na jednostkę o wyższej mocy znamionowej"
                ),
            )
        )

    return issues


def validate_bess_parameters(
    generator: GeneratorSN | GeneratorNN,
) -> list[ValidationIssue]:
    """
    Waliduje parametry generatora typu BESS (magazyn energii).

    Reguły specyficzne dla BESS:
    - Moc znamionowa musi być > 0
    - Współczynnik k_sc musi być w zakresie [1.0, 2.0]
    - Dla GeneratorSN: impedancja wewnętrzna musi być zdefiniowana

    Args:
        generator: Generator BESS do walidacji (SN lub nN).

    Returns:
        Lista ValidationIssue (pusta jeśli poprawne).
    """
    issues: list[ValidationIssue] = []

    # Reguła dotyczy tylko BESS
    if generator.generator_type != GeneratorType.BESS:
        return issues

    # Sprawdź moc znamionową
    if isinstance(generator, GeneratorSN):
        if generator.rated_power_mw <= 0:
            issues.append(
                ValidationIssue(
                    code="oze.bess_power_invalid",
                    message=(
                        f"BESS '{generator.name}' — moc znamionowa musi "
                        f"być > 0 MW, aktualnie: {generator.rated_power_mw} MW"
                    ),
                    severity=Severity.ERROR,
                    element_id=generator.id,
                    field="rated_power_mw",
                    suggested_fix="Ustaw moc znamionową BESS > 0 MW",
                )
            )
    elif isinstance(generator, GeneratorNN):
        if generator.rated_power_kw <= 0:
            issues.append(
                ValidationIssue(
                    code="oze.bess_power_invalid",
                    message=(
                        f"BESS '{generator.name}' — moc znamionowa musi "
                        f"być > 0 kW, aktualnie: {generator.rated_power_kw} kW"
                    ),
                    severity=Severity.ERROR,
                    element_id=generator.id,
                    field="rated_power_kw",
                    suggested_fix="Ustaw moc znamionową BESS > 0 kW",
                )
            )

    # Sprawdź k_sc
    if generator.k_sc < 1.0 or generator.k_sc > 2.0:
        issues.append(
            ValidationIssue(
                code="oze.bess_ksc_out_of_range",
                message=(
                    f"BESS '{generator.name}' — współczynnik k_sc = {generator.k_sc} "
                    f"poza dopuszczalnym zakresem [1.0, 2.0]"
                ),
                severity=Severity.WARNING,
                element_id=generator.id,
                field="k_sc",
                suggested_fix=("Ustaw k_sc w zakresie 1.0-2.0 " "(typowo 1.1 dla falownika BESS)"),
            )
        )

    # Dla GeneratorSN: sprawdź impedancję wewnętrzną
    if isinstance(generator, GeneratorSN):
        z = generator.internal_impedance_pu
        if z.real == 0.0 and z.imag == 0.0:
            issues.append(
                ValidationIssue(
                    code="oze.bess_impedance_zero",
                    message=(
                        f"BESS '{generator.name}' (SN) — impedancja wewnętrzna "
                        f"wynosi 0+0j pu. Wymagana dla obliczeń zwarciowych"
                    ),
                    severity=Severity.WARNING,
                    element_id=generator.id,
                    field="internal_impedance_pu",
                    suggested_fix=("Zdefiniuj impedancję wewnętrzną BESS " "(typowo 0.01+0.1j pu)"),
                )
            )

    return issues


def validate_generator_nn_parameters(
    generator: GeneratorNN,
) -> list[ValidationIssue]:
    """
    Waliduje parametry generatora nN (ogólne, niezależnie od typu).

    Reguły:
    - inverter_rated_current_a musi być > 0
    - rated_power_kw musi być > 0
    - power_limit_kw (jeśli podany) musi być > 0

    Args:
        generator: Generator nN do walidacji.

    Returns:
        Lista ValidationIssue (pusta jeśli poprawne).
    """
    issues: list[ValidationIssue] = []

    if generator.rated_power_kw <= 0:
        issues.append(
            ValidationIssue(
                code="oze.nn_power_invalid",
                message=(
                    f"Generator nN '{generator.name}' — moc znamionowa "
                    f"musi być > 0 kW, aktualnie: {generator.rated_power_kw} kW"
                ),
                severity=Severity.ERROR,
                element_id=generator.id,
                field="rated_power_kw",
                suggested_fix="Ustaw moc znamionową generatora > 0 kW",
            )
        )

    if generator.inverter_rated_current_a <= 0:
        issues.append(
            ValidationIssue(
                code="oze.nn_inverter_current_invalid",
                message=(
                    f"Generator nN '{generator.name}' — prąd znamionowy "
                    f"falownika musi być > 0 A, aktualnie: "
                    f"{generator.inverter_rated_current_a} A"
                ),
                severity=Severity.ERROR,
                element_id=generator.id,
                field="inverter_rated_current_a",
                suggested_fix="Ustaw prąd znamionowy falownika > 0 A",
            )
        )

    if generator.power_limit_kw is not None and generator.power_limit_kw <= 0:
        issues.append(
            ValidationIssue(
                code="oze.nn_power_limit_invalid",
                message=(
                    f"Generator nN '{generator.name}' — ograniczenie mocy "
                    f"musi być > 0 kW, aktualnie: {generator.power_limit_kw} kW"
                ),
                severity=Severity.WARNING,
                element_id=generator.id,
                field="power_limit_kw",
                suggested_fix=("Ustaw ograniczenie mocy > 0 kW lub usuń ograniczenie"),
            )
        )

    return issues


# ---------------------------------------------------------------------------
# Registry: mapping GeneratorType -> validation handlers
# ---------------------------------------------------------------------------

_SN_VALIDATORS: dict[GeneratorType, list] = {
    GeneratorType.PV: [validate_pv_has_transformer, validate_bess_parameters],
    GeneratorType.BESS: [validate_bess_parameters],
    GeneratorType.WIND: [validate_pv_has_transformer, validate_bess_parameters],
    GeneratorType.GENSET: [],
    GeneratorType.UPS: [],
    GeneratorType.BIOGAS: [],
}

_NN_VALIDATORS: dict[GeneratorType, list] = {
    GeneratorType.PV: [validate_generator_nn_parameters, validate_bess_parameters],
    GeneratorType.BESS: [validate_generator_nn_parameters, validate_bess_parameters],
    GeneratorType.WIND: [validate_generator_nn_parameters, validate_bess_parameters],
    GeneratorType.GENSET: [validate_generator_nn_parameters],
    GeneratorType.UPS: [validate_generator_nn_parameters],
    GeneratorType.BIOGAS: [validate_generator_nn_parameters],
}


def get_sn_validators_for_type(gen_type: GeneratorType) -> list:
    """Zwraca listę walidatorów dla danego typu generatora SN."""
    return _SN_VALIDATORS.get(gen_type, [])


def get_nn_validators_for_type(gen_type: GeneratorType) -> list:
    """Zwraca listę walidatorów dla danego typu generatora nN."""
    return _NN_VALIDATORS.get(gen_type, [])


def all_generator_types_have_handlers() -> bool:
    """
    Sprawdza czy WSZYSTKIE wartości GeneratorType mają zdefiniowane handlery
    w obu rejestrach (SN i nN).

    Returns:
        True jeśli kompletne, False jeśli brakuje.
    """
    all_types = set(GeneratorType)
    sn_covered = set(_SN_VALIDATORS.keys())
    nn_covered = set(_NN_VALIDATORS.keys())
    return all_types == sn_covered and all_types == nn_covered
