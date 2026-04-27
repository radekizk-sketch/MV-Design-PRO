"""
Field & Device Domain Contracts V1 — Polish taxonomy (PoleV1/AparatV1).

RUN #3F: industrial-grade fields and apparatus modeling.

CANONICAL: Kontrakty pól i aparatów rozdzielni SN/nN — polska taksonomia OSD.
ALIGNMENT: frontend/src/ui/sld/core/fieldDeviceContracts.ts

INVARIANTS:
- Immutable (frozen dataclass).
- Deterministic (sorted by id, stable enums).
- ZAKAZ auto-uzupelnien: brak danych → FixAction (stabilny kod PL).
- ZAKAZ fabrykowania urzadzen.
- catalogRef wymagany dla kazdego aparatu — brak → CATALOG_REF_MISSING.
- PV/BESS zawsze przez transformator (wariant A: nN + TR stacyjny, lub B: TR blokowy do SN).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

# ---------------------------------------------------------------------------
# PoleTypeV1 — Polish field type taxonomy
# ---------------------------------------------------------------------------


class PoleTypeV1(str, Enum):
    """Typ pola rozdzielczego — polska taksonomia OSD."""

    # SN
    POLE_LINIOWE_SN = "POLE_LINIOWE_SN"
    POLE_TRANSFORMATOROWE_SN_NN = "POLE_TRANSFORMATOROWE_SN_NN"
    POLE_POMIAROWE_SN = "POLE_POMIAROWE_SN"
    POLE_SPRZEGLOWE_SN = "POLE_SPRZEGLOWE_SN"
    POLE_ZRODLA_PV_SN = "POLE_ZRODLA_PV_SN"
    POLE_ZRODLA_BESS_SN = "POLE_ZRODLA_BESS_SN"
    POLE_LACZNIKA_SZYN_SN = "POLE_LACZNIKA_SZYN_SN"

    # nN
    POLE_GLOWNE_NN = "POLE_GLOWNE_NN"
    POLE_ODPLYWOWE_NN = "POLE_ODPLYWOWE_NN"
    POLE_ZRODLA_PV_NN = "POLE_ZRODLA_PV_NN"
    POLE_ZRODLA_BESS_NN = "POLE_ZRODLA_BESS_NN"


class FieldRoleV1(str, Enum):
    """Rola pola (backwards-compatible, EN naming)."""

    LINE_IN = "LINE_IN"
    LINE_OUT = "LINE_OUT"
    LINE_BRANCH = "LINE_BRANCH"
    GPZ_LINE_BAY = "GPZ_LINE_BAY"
    TRANSFORMER_SN_NN = "TRANSFORMER_SN_NN"
    MEASUREMENT_SN = "MEASUREMENT_SN"
    PV_SN = "PV_SN"
    BESS_SN = "BESS_SN"
    COUPLER_SN = "COUPLER_SN"
    BUS_TIE = "BUS_TIE"
    MAIN_NN = "MAIN_NN"
    FEEDER_NN = "FEEDER_NN"
    PV_NN = "PV_NN"
    BESS_NN = "BESS_NN"


# Polish field type → FieldRole mapping
POLE_TO_FIELD_ROLE: dict[PoleTypeV1, FieldRoleV1] = {
    PoleTypeV1.POLE_LINIOWE_SN: FieldRoleV1.LINE_IN,
    PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN: FieldRoleV1.TRANSFORMER_SN_NN,
    PoleTypeV1.POLE_POMIAROWE_SN: FieldRoleV1.MEASUREMENT_SN,
    PoleTypeV1.POLE_SPRZEGLOWE_SN: FieldRoleV1.COUPLER_SN,
    PoleTypeV1.POLE_ZRODLA_PV_SN: FieldRoleV1.PV_SN,
    PoleTypeV1.POLE_ZRODLA_BESS_SN: FieldRoleV1.BESS_SN,
    PoleTypeV1.POLE_LACZNIKA_SZYN_SN: FieldRoleV1.BUS_TIE,
    PoleTypeV1.POLE_GLOWNE_NN: FieldRoleV1.MAIN_NN,
    PoleTypeV1.POLE_ODPLYWOWE_NN: FieldRoleV1.FEEDER_NN,
    PoleTypeV1.POLE_ZRODLA_PV_NN: FieldRoleV1.PV_NN,
    PoleTypeV1.POLE_ZRODLA_BESS_NN: FieldRoleV1.BESS_NN,
}

FIELD_ROLE_TO_POLE: dict[FieldRoleV1, PoleTypeV1] = {
    FieldRoleV1.LINE_IN: PoleTypeV1.POLE_LINIOWE_SN,
    FieldRoleV1.LINE_OUT: PoleTypeV1.POLE_LINIOWE_SN,
    FieldRoleV1.LINE_BRANCH: PoleTypeV1.POLE_LINIOWE_SN,
    FieldRoleV1.GPZ_LINE_BAY: PoleTypeV1.POLE_LINIOWE_SN,
    FieldRoleV1.TRANSFORMER_SN_NN: PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN,
    FieldRoleV1.MEASUREMENT_SN: PoleTypeV1.POLE_POMIAROWE_SN,
    FieldRoleV1.PV_SN: PoleTypeV1.POLE_ZRODLA_PV_SN,
    FieldRoleV1.BESS_SN: PoleTypeV1.POLE_ZRODLA_BESS_SN,
    FieldRoleV1.COUPLER_SN: PoleTypeV1.POLE_SPRZEGLOWE_SN,
    FieldRoleV1.BUS_TIE: PoleTypeV1.POLE_LACZNIKA_SZYN_SN,
    FieldRoleV1.MAIN_NN: PoleTypeV1.POLE_GLOWNE_NN,
    FieldRoleV1.FEEDER_NN: PoleTypeV1.POLE_ODPLYWOWE_NN,
    FieldRoleV1.PV_NN: PoleTypeV1.POLE_ZRODLA_PV_NN,
    FieldRoleV1.BESS_NN: PoleTypeV1.POLE_ZRODLA_BESS_NN,
}


# ---------------------------------------------------------------------------
# AparatTypeV1 — Polish apparatus type taxonomy
# ---------------------------------------------------------------------------


class AparatTypeV1(str, Enum):
    """Typ aparatu — polska taksonomia OSD."""

    WYLACZNIK = "WYLACZNIK"
    ODLACZNIK = "ODLACZNIK"
    ROZLACZNIK = "ROZLACZNIK"
    BEZPIECZNIK = "BEZPIECZNIK"
    UZIEMNIK = "UZIEMNIK"
    PRZEKLADNIK_PRADOWY = "PRZEKLADNIK_PRADOWY"
    PRZEKLADNIK_NAPIECIOWY = "PRZEKLADNIK_NAPIECIOWY"
    ZABEZPIECZENIE = "ZABEZPIECZENIE"
    TRANSFORMATOR = "TRANSFORMATOR"
    GLOWICA_KABLOWA = "GLOWICA_KABLOWA"
    GENERATOR_PV = "GENERATOR_PV"
    GENERATOR_BESS = "GENERATOR_BESS"
    PCS = "PCS"
    BATERIA = "BATERIA"
    ACB = "ACB"


class DeviceTypeV1(str, Enum):
    """Typ urzadzenia (backwards-compatible, EN naming)."""

    CB = "CB"
    DS = "DS"
    ES = "ES"
    CT = "CT"
    VT = "VT"
    RELAY = "RELAY"
    LOAD_SWITCH = "LOAD_SWITCH"
    FUSE = "FUSE"
    CABLE_HEAD = "CABLE_HEAD"
    TRANSFORMER_DEVICE = "TRANSFORMER_DEVICE"
    GENERATOR_PV = "GENERATOR_PV"
    GENERATOR_BESS = "GENERATOR_BESS"
    PCS = "PCS"
    BATTERY = "BATTERY"
    ACB = "ACB"


APARAT_TO_DEVICE_TYPE: dict[AparatTypeV1, DeviceTypeV1] = {
    AparatTypeV1.WYLACZNIK: DeviceTypeV1.CB,
    AparatTypeV1.ODLACZNIK: DeviceTypeV1.DS,
    AparatTypeV1.ROZLACZNIK: DeviceTypeV1.LOAD_SWITCH,
    AparatTypeV1.BEZPIECZNIK: DeviceTypeV1.FUSE,
    AparatTypeV1.UZIEMNIK: DeviceTypeV1.ES,
    AparatTypeV1.PRZEKLADNIK_PRADOWY: DeviceTypeV1.CT,
    AparatTypeV1.PRZEKLADNIK_NAPIECIOWY: DeviceTypeV1.VT,
    AparatTypeV1.ZABEZPIECZENIE: DeviceTypeV1.RELAY,
    AparatTypeV1.TRANSFORMATOR: DeviceTypeV1.TRANSFORMER_DEVICE,
    AparatTypeV1.GLOWICA_KABLOWA: DeviceTypeV1.CABLE_HEAD,
    AparatTypeV1.GENERATOR_PV: DeviceTypeV1.GENERATOR_PV,
    AparatTypeV1.GENERATOR_BESS: DeviceTypeV1.GENERATOR_BESS,
    AparatTypeV1.PCS: DeviceTypeV1.PCS,
    AparatTypeV1.BATERIA: DeviceTypeV1.BATTERY,
    AparatTypeV1.ACB: DeviceTypeV1.ACB,
}

DEVICE_TYPE_TO_APARAT: dict[DeviceTypeV1, AparatTypeV1] = {
    v: k for k, v in APARAT_TO_DEVICE_TYPE.items()
}


# ---------------------------------------------------------------------------
# Polish labels
# ---------------------------------------------------------------------------


POLE_TYPE_LABELS_PL: dict[PoleTypeV1, str] = {
    PoleTypeV1.POLE_LINIOWE_SN: "Pole liniowe SN",
    PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN: "Pole transformatorowe SN/nN",
    PoleTypeV1.POLE_POMIAROWE_SN: "Pole pomiarowe SN",
    PoleTypeV1.POLE_SPRZEGLOWE_SN: "Pole sprzęgła sekcyjnego SN",
    PoleTypeV1.POLE_ZRODLA_PV_SN: "Pole źródła PV (SN)",
    PoleTypeV1.POLE_ZRODLA_BESS_SN: "Pole źródła BESS (SN)",
    PoleTypeV1.POLE_LACZNIKA_SZYN_SN: "Pole łącznika szyn SN",
    PoleTypeV1.POLE_GLOWNE_NN: "Pole główne nN (ACB)",
    PoleTypeV1.POLE_ODPLYWOWE_NN: "Pole odpływowe nN",
    PoleTypeV1.POLE_ZRODLA_PV_NN: "Pole źródła PV (nN)",
    PoleTypeV1.POLE_ZRODLA_BESS_NN: "Pole źródła BESS (nN)",
}

APARAT_TYPE_LABELS_PL: dict[AparatTypeV1, str] = {
    AparatTypeV1.WYLACZNIK: "Wyłącznik",
    AparatTypeV1.ODLACZNIK: "Odłącznik",
    AparatTypeV1.ROZLACZNIK: "Rozłącznik",
    AparatTypeV1.BEZPIECZNIK: "Bezpiecznik",
    AparatTypeV1.UZIEMNIK: "Uziemnik",
    AparatTypeV1.PRZEKLADNIK_PRADOWY: "Przekładnik prądowy",
    AparatTypeV1.PRZEKLADNIK_NAPIECIOWY: "Przekładnik napięciowy",
    AparatTypeV1.ZABEZPIECZENIE: "Zabezpieczenie",
    AparatTypeV1.TRANSFORMATOR: "Transformator",
    AparatTypeV1.GLOWICA_KABLOWA: "Głowica kablowa",
    AparatTypeV1.GENERATOR_PV: "Generator PV",
    AparatTypeV1.GENERATOR_BESS: "Generator BESS",
    AparatTypeV1.PCS: "PCS (power conversion system)",
    AparatTypeV1.BATERIA: "Bateria",
    AparatTypeV1.ACB: "Wyłącznik nN (ACB)",
}


# ---------------------------------------------------------------------------
# Validation: PV/BESS always through transformer (§0 rule 3)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GeneratorFieldValidationV1:
    """Walidacja przyłączenia generatora (PV/BESS) do stacji."""

    generator_id: str
    generator_type: str
    connection_variant: str | None
    has_blocking_transformer: bool
    station_ref: str | None
    is_valid: bool
    fix_code: str | None
    fix_message_pl: str | None


def validate_generator_field_connection(
    *,
    generator_id: str,
    generator_type: str,
    connection_variant: str | None,
    blocking_transformer_ref: str | None,
    station_ref: str | None,
) -> GeneratorFieldValidationV1:
    """Validate PV/BESS connection variant.

    Rule: PV/BESS ALWAYS through transformer:
    - Variant A (nn_side): via station transformer SN/nN → requires station_ref
    - Variant B (block_transformer): via dedicated blocking transformer → requires blocking_transformer_ref

    Returns validation result with fix_code if invalid.
    """
    if generator_type not in ("pv_inverter", "bess", "PV", "BESS"):
        return GeneratorFieldValidationV1(
            generator_id=generator_id,
            generator_type=generator_type,
            connection_variant=connection_variant,
            has_blocking_transformer=blocking_transformer_ref is not None,
            station_ref=station_ref,
            is_valid=True,
            fix_code=None,
            fix_message_pl=None,
        )

    if connection_variant is None:
        return GeneratorFieldValidationV1(
            generator_id=generator_id,
            generator_type=generator_type,
            connection_variant=None,
            has_blocking_transformer=False,
            station_ref=station_ref,
            is_valid=False,
            fix_code="generator.connection_variant_missing",
            fix_message_pl=(
                f"Generator {generator_id}: brak wariantu przyłączenia "
                f"(wymagane LV_BEHIND_STATION_TRANSFORMER, DEDICATED_MV_CONNECTION "
                f"albo SOURCE_CONNECTION_STATION)"
            ),
        )

    lv_variants = {"nn_side", "LV_BEHIND_STATION_TRANSFORMER", "SOURCE_CONNECTION_STATION"}
    dedicated_mv_variants = {"block_transformer", "DEDICATED_MV_CONNECTION"}

    if connection_variant in lv_variants:
        if station_ref is None:
            return GeneratorFieldValidationV1(
                generator_id=generator_id,
                generator_type=generator_type,
                connection_variant=connection_variant,
                has_blocking_transformer=False,
                station_ref=None,
                is_valid=False,
                fix_code="generator.station_ref_missing",
                fix_message_pl=(f"Generator {generator_id} (nn_side): brak referencji do stacji"),
            )

    if connection_variant in dedicated_mv_variants:
        if blocking_transformer_ref is None:
            return GeneratorFieldValidationV1(
                generator_id=generator_id,
                generator_type=generator_type,
                connection_variant=connection_variant,
                has_blocking_transformer=False,
                station_ref=station_ref,
                is_valid=False,
                fix_code="generator.block_transformer_missing",
                fix_message_pl=(
                    f"Generator {generator_id} ({connection_variant}): "
                    f"brak referencji do transformatora przylaczeniowego"
                ),
            )

    return GeneratorFieldValidationV1(
        generator_id=generator_id,
        generator_type=generator_type,
        connection_variant=connection_variant,
        has_blocking_transformer=blocking_transformer_ref is not None,
        station_ref=station_ref,
        is_valid=True,
        fix_code=None,
        fix_message_pl=None,
    )
