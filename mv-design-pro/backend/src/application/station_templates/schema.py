"""StationTemplate schema dataclasses — K30-16 fully editable template library.

User K30-15.4 demand: "te template muszą być edytwoalne w zakresie wszystkich
parametrów tj np liczby falowników rozdzauj zabezpieczen, typu rodzielnicy,
mocy/typu TR, wszytko konfikguraowalne".

Schema covers:
- Transformer: type + count + tap (catalog options)
- SN switchgear: manufacturer + bays count + per-pole apparatus
- nN feeders: count (1-8) + per-feeder CB + loads
- DER: count + kind + power + connection variant + NC RfG profile
- Protection: per-pole relay + settings template
- Measurements: CT/VT/energy meter per pole
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class TemplateCategory(str, Enum):
    """10 kategorii templates per use-case."""

    TYPOWA_SN_NN = "typowa_sn_nn"          # Dystrybucyjne 100-2500 kVA
    SLUPOWA = "slupowa"                    # Stacje słupowe ZSP
    ZKSN_WNETRZOWA = "zksn_wnetrzowa"      # ZKSN wnętrzowe
    PROSUMENT_PV = "prosument_pv"          # μPV 5-250 kW
    FARMA_PV = "farma_pv"                  # Farmy PV SN 0.5-5 MW
    BESS = "bess"                          # Magazyny energii
    HYBRYDOWA = "hybrydowa"                # PV + BESS
    PRZEMYSLOWA = "przemyslowa"            # Odbiorcze przemysłowe
    WIATROWA = "wiatrowa"                  # OZE wiatrowe
    SEKCYJNA = "sekcyjna"                  # Sekcyjne / pętlowe


@dataclass(frozen=True)
class TemplateParamInt:
    """Editable integer parameter z range constraints."""

    default: int
    min_value: int
    max_value: int
    step: int = 1
    label_pl: str = ""


@dataclass(frozen=True)
class TemplateParamFloat:
    """Editable float parameter."""

    default: float
    min_value: float
    max_value: float
    step: float = 0.01
    unit: str = ""
    label_pl: str = ""


@dataclass(frozen=True)
class CatalogChoice:
    """Catalog option dla dropdown (np. typ TR 100/250/630 kVA)."""

    catalog_ref: str
    label_pl: str
    namespace: str  # CatalogNamespace
    default: bool = False
    badge_pl: str | None = None  # e.g. "PTPiRE certyfikat"


@dataclass(frozen=True)
class BayRoleSpec:
    """Bay role definition (IN/OUT/TR/MEASUREMENT/COUPLER)."""

    role: str  # 'IN' | 'OUT' | 'TR' | 'MEASUREMENT' | 'COUPLER'
    label_pl: str
    apparatus_options: tuple[CatalogChoice, ...] = ()  # CB/DS/LS choices


@dataclass(frozen=True)
class DerKindSpec:
    """DER inverter kind option."""

    kind: str  # 'PV' | 'BESS' | 'FW'
    label_pl: str
    catalog_options: tuple[CatalogChoice, ...]
    default_count: int = 1
    default_p_mw_each: float = 0.5
    connection_variant_options: tuple[str, ...] = ("nn_side", "block_transformer")


@dataclass(frozen=True)
class ProtectionRelaySpec:
    """Protection relay option per bay."""

    device_catalog_ref: str
    label_pl: str
    vendor: str  # ELEKTROMETAL/SIEMENS/ABB/SCHNEIDER/SEL/GE/ZPAS/ELESTER/etc.
    settings_template_id: str
    badge_pl: str | None = None  # e.g. "PTPiREE / NC RfG"


@dataclass(frozen=True)
class TemplateSchema:
    """Editable parameters dla template — wszystko configurable."""

    # Transformer
    transformer_options: tuple[CatalogChoice, ...]
    transformer_count: TemplateParamInt = field(
        default_factory=lambda: TemplateParamInt(default=1, min_value=1, max_value=2, label_pl="Liczba transformatorów")
    )

    # SN switchgear
    sn_switchgear_manufacturers: tuple[str, ...] = (
        "ZPUE_WLOSZCZOWA",
        "ELEKTROMETAL",
        "ABB",
        "SIEMENS",
        "SCHNEIDER",
    )
    sn_switchgear_default: str = "ZPUE_WLOSZCZOWA"
    sn_bays_count: TemplateParamInt = field(
        default_factory=lambda: TemplateParamInt(default=2, min_value=1, max_value=8, label_pl="Liczba pól SN")
    )
    sn_bay_roles: tuple[BayRoleSpec, ...] = ()
    sn_bay_protection_options: tuple[ProtectionRelaySpec, ...] = ()

    # nN side
    nn_feeders_count: TemplateParamInt = field(
        default_factory=lambda: TemplateParamInt(default=2, min_value=1, max_value=8, label_pl="Liczba odpływów nN")
    )
    nn_feeder_cb_options: tuple[CatalogChoice, ...] = ()
    nn_load_default_kw: TemplateParamFloat = field(
        default_factory=lambda: TemplateParamFloat(
            default=50.0, min_value=0.0, max_value=2000.0, unit="kW", label_pl="Obciążenie per odpływ"
        )
    )

    # DER
    der_options: tuple[DerKindSpec, ...] = ()
    der_total_count: TemplateParamInt = field(
        default_factory=lambda: TemplateParamInt(default=0, min_value=0, max_value=20, label_pl="Liczba modułów DER")
    )

    # Protection
    protection_settings_default: str | None = None  # Template ID

    # Measurements
    ct_options: tuple[CatalogChoice, ...] = ()
    vt_options: tuple[CatalogChoice, ...] = ()
    energy_meter_options: tuple[CatalogChoice, ...] = ()

    # Catalog cascade
    manufacturer_profile_default: str = "ZPUE_WLOSZCZOWA"


@dataclass(frozen=True)
class StationTemplate:
    """Single station template definition."""

    id: str                          # 'tpl_sn_nn_630kva'
    name_pl: str                     # "Stacja SN/nN 630 kVA z RMU 3-pole"
    category: TemplateCategory
    description_pl: str
    use_case_pl: str                 # "Standardowa dystrybucyjna w terenie wiejskim"
    nc_rfg_type: str | None          # 'A' | 'B' | 'C' | 'D' | None
    schema: TemplateSchema
    tags: tuple[str, ...] = ()       # Searchable tags
    icon: str = "station-default"    # Frontend icon hint

    def to_dict(self) -> dict:
        """Serialize to JSON dict dla API."""
        return {
            "id": self.id,
            "name_pl": self.name_pl,
            "category": self.category.value,
            "description_pl": self.description_pl,
            "use_case_pl": self.use_case_pl,
            "nc_rfg_type": self.nc_rfg_type,
            "schema": _schema_to_dict(self.schema),
            "tags": list(self.tags),
            "icon": self.icon,
        }


def _schema_to_dict(schema: TemplateSchema) -> dict:
    """Convert dataclass to plain dict dla JSON serialization."""
    return {
        "transformer_options": [_choice_to_dict(c) for c in schema.transformer_options],
        "transformer_count": _param_int_to_dict(schema.transformer_count),
        "sn_switchgear_manufacturers": list(schema.sn_switchgear_manufacturers),
        "sn_switchgear_default": schema.sn_switchgear_default,
        "sn_bays_count": _param_int_to_dict(schema.sn_bays_count),
        "sn_bay_roles": [_bay_role_to_dict(r) for r in schema.sn_bay_roles],
        "sn_bay_protection_options": [
            _protection_to_dict(p) for p in schema.sn_bay_protection_options
        ],
        "nn_feeders_count": _param_int_to_dict(schema.nn_feeders_count),
        "nn_feeder_cb_options": [_choice_to_dict(c) for c in schema.nn_feeder_cb_options],
        "nn_load_default_kw": _param_float_to_dict(schema.nn_load_default_kw),
        "der_options": [_der_spec_to_dict(d) for d in schema.der_options],
        "der_total_count": _param_int_to_dict(schema.der_total_count),
        "protection_settings_default": schema.protection_settings_default,
        "ct_options": [_choice_to_dict(c) for c in schema.ct_options],
        "vt_options": [_choice_to_dict(c) for c in schema.vt_options],
        "energy_meter_options": [_choice_to_dict(c) for c in schema.energy_meter_options],
        "manufacturer_profile_default": schema.manufacturer_profile_default,
    }


def _choice_to_dict(c: CatalogChoice) -> dict:
    return {
        "catalog_ref": c.catalog_ref,
        "label_pl": c.label_pl,
        "namespace": c.namespace,
        "default": c.default,
        "badge_pl": c.badge_pl,
    }


def _param_int_to_dict(p: TemplateParamInt) -> dict:
    return {
        "default": p.default,
        "min_value": p.min_value,
        "max_value": p.max_value,
        "step": p.step,
        "label_pl": p.label_pl,
    }


def _param_float_to_dict(p: TemplateParamFloat) -> dict:
    return {
        "default": p.default,
        "min_value": p.min_value,
        "max_value": p.max_value,
        "step": p.step,
        "unit": p.unit,
        "label_pl": p.label_pl,
    }


def _bay_role_to_dict(r: BayRoleSpec) -> dict:
    return {
        "role": r.role,
        "label_pl": r.label_pl,
        "apparatus_options": [_choice_to_dict(c) for c in r.apparatus_options],
    }


def _protection_to_dict(p: ProtectionRelaySpec) -> dict:
    return {
        "device_catalog_ref": p.device_catalog_ref,
        "label_pl": p.label_pl,
        "vendor": p.vendor,
        "settings_template_id": p.settings_template_id,
        "badge_pl": p.badge_pl,
    }


def _der_spec_to_dict(d: DerKindSpec) -> dict:
    return {
        "kind": d.kind,
        "label_pl": d.label_pl,
        "catalog_options": [_choice_to_dict(c) for c in d.catalog_options],
        "default_count": d.default_count,
        "default_p_mw_each": d.default_p_mw_each,
        "connection_variant_options": list(d.connection_variant_options),
    }
