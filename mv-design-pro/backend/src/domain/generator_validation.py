"""
Generator Connection Validation — PV/BESS canonical rules (KROK 2-3).

CANONICAL RULES (BINDING):
A) PV/BESS nigdy nie jest 'bezposrednio do SN' (zawsze przez transformator).
B) Wariant A (nn_side): PV/BESS po stronie nN stacji → przez transformator stacji SN/nN.
   Wymagane: station_ref (wskazuje stacje SN/nN).
C) Wariant B (block_transformer): PV/BESS przez transformator blokowy → do SN.
   Wymagane: blocking_transformer_ref (wskazuje transformator blokowy) + catalog_ref transformatora.
D) Brak connection_variant → FixAction generator.connection_variant_missing.
E) Generatory synchroniczne NIE wymagaja connection_variant.
F) Brak catalog_ref generatora → FixAction catalog.ref_missing.

INVARIANTS:
- Zero fabrication: brak danych → ReadinessIssue, nigdy domyslna wartosc.
- Deterministic: sorted by element_id.
- Immutable output.
"""

from __future__ import annotations

from domain.readiness import (
    ReadinessAreaV1,
    ReadinessIssueV1,
    ReadinessPriority,
)

# Generator types that REQUIRE connection_variant
_OZE_GEN_TYPES = frozenset(
    {"pv_inverter", "wind_inverter", "fw_pmsg", "fw_dfig", "fw_scig", "bess"}
)
_LV_VARIANTS = frozenset({"nn_side", "LV_BEHIND_STATION_TRANSFORMER"})
_SOURCE_STATION_VARIANTS = frozenset({"SOURCE_CONNECTION_STATION"})
_DEDICATED_MV_VARIANTS = frozenset({"block_transformer", "DEDICATED_MV_CONNECTION"})


def validate_generator_connections(
    generators: list[dict],
    transformers_by_ref: dict[str, dict],
    stations_by_ref: dict[str, dict],
) -> list[ReadinessIssueV1]:
    """Validate PV/BESS connection rules.

    Args:
        generators: list of generator dicts with keys:
            ref_id, name, gen_type, bus_ref, catalog_ref,
            connection_variant, blocking_transformer_ref, station_ref
        transformers_by_ref: ref_id → transformer dict
        stations_by_ref: ref_id → station dict

    Returns:
        List of ReadinessIssueV1 (sorted by element_id).
    """
    issues: list[ReadinessIssueV1] = []

    for gen in sorted(generators, key=lambda g: g.get("ref_id", "")):
        ref_id = gen.get("ref_id", "")
        name = gen.get("name", ref_id)
        gen_type = gen.get("gen_type")
        catalog_ref = gen.get("catalog_ref")
        connection_variant = gen.get("connection_variant")
        blocking_tr_ref = gen.get("blocking_transformer_ref")
        station_ref = gen.get("station_ref")

        # Catalog ref required for all generators
        if not catalog_ref:
            issues.append(
                ReadinessIssueV1(
                    code="catalog.ref_missing",
                    area=ReadinessAreaV1.CATALOGS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=f"Generator '{name}' ({ref_id}): brak referencji katalogowej",
                    element_id=ref_id,
                    element_type="GENERATOR",
                    fix_hint_pl="Przypisz typ z katalogu do generatora",
                    wizard_step="K6",
                )
            )

        # Synchronous generators don't need connection_variant
        if gen_type not in _OZE_GEN_TYPES:
            continue

        # OZE generators MUST have connection_variant
        if not connection_variant:
            issues.append(
                ReadinessIssueV1(
                    code="generator.connection_variant_missing",
                    area=ReadinessAreaV1.GENERATORS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=(
                        f"Generator OZE '{name}' ({ref_id}): brak wariantu przylaczenia "
                        f"(nn_side lub block_transformer)"
                    ),
                    element_id=ref_id,
                    element_type="GENERATOR",
                    fix_hint_pl="Wybierz wariant przylaczenia w kreatorze",
                    wizard_step="K6",
                )
            )
            continue

        if connection_variant in _LV_VARIANTS or connection_variant in _SOURCE_STATION_VARIANTS:
            # Variant A: must have station_ref
            if not station_ref:
                issues.append(
                    ReadinessIssueV1(
                        code="generator.station_ref_missing",
                        area=ReadinessAreaV1.GENERATORS,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl=(
                            f"Generator OZE '{name}' ({ref_id}): wariant 'po stronie nN' "
                            f"wymaga wskazania stacji (station_ref)"
                        ),
                        element_id=ref_id,
                        element_type="GENERATOR",
                        fix_hint_pl="Wskazz stacje SN/nN w kreatorze",
                        wizard_step="K6",
                    )
                )
            elif station_ref not in stations_by_ref:
                issues.append(
                    ReadinessIssueV1(
                        code="generator.station_ref_invalid",
                        area=ReadinessAreaV1.GENERATORS,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl=(
                            f"Generator OZE '{name}' ({ref_id}): stacja '{station_ref}' "
                            f"nie istnieje w modelu"
                        ),
                        element_id=ref_id,
                        element_type="GENERATOR",
                        fix_hint_pl="Popraw referencje do stacji w kreatorze",
                        wizard_step="K6",
                    )
                )

        elif connection_variant in _DEDICATED_MV_VARIANTS:
            # Variant B: must have blocking_transformer_ref
            if not blocking_tr_ref:
                issues.append(
                    ReadinessIssueV1(
                        code="generator.block_transformer_missing",
                        area=ReadinessAreaV1.GENERATORS,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl=(
                            f"Generator OZE '{name}' ({ref_id}): wariant 'transformator blokowy' "
                            f"wymaga wskazania transformatora (blocking_transformer_ref)"
                        ),
                        element_id=ref_id,
                        element_type="GENERATOR",
                        fix_hint_pl="Wskazz transformator blokowy w kreatorze",
                        wizard_step="K6",
                    )
                )
            elif blocking_tr_ref not in transformers_by_ref:
                issues.append(
                    ReadinessIssueV1(
                        code="generator.block_transformer_invalid",
                        area=ReadinessAreaV1.GENERATORS,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl=(
                            f"Generator OZE '{name}' ({ref_id}): transformator blokowy "
                            f"'{blocking_tr_ref}' nie istnieje w modelu"
                        ),
                        element_id=ref_id,
                        element_type="GENERATOR",
                        fix_hint_pl="Dodaj transformator blokowy w kreatorze",
                        wizard_step="K5",
                    )
                )

        else:
            issues.append(
                ReadinessIssueV1(
                    code="generator.connection_variant_invalid",
                    area=ReadinessAreaV1.GENERATORS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=(
                        f"Generator OZE '{name}' ({ref_id}): nieznany wariant przylaczenia "
                        f"'{connection_variant}' (dozwolone: nn_side, block_transformer)"
                    ),
                    element_id=ref_id,
                    element_type="GENERATOR",
                    fix_hint_pl="Popraw wariant przylaczenia w kreatorze",
                    wizard_step="K6",
                )
            )

    return issues
