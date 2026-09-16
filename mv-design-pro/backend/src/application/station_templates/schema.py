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

import re
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from network_model.pochodne import mva_na_kva


class TemplateCategory(StrEnum):
    """10 kategorii templates per use-case."""

    TYPOWA_SN_NN = "typowa_sn_nn"  # Dystrybucyjne 100-2500 kVA
    SLUPOWA = "slupowa"  # Stacje słupowe ZSP
    ZKSN_WNETRZOWA = "zksn_wnetrzowa"  # ZKSN wnętrzowe
    PROSUMENT_PV = "prosument_pv"  # μPV 5-250 kW
    FARMA_PV = "farma_pv"  # Farmy PV SN 0.5-5 MW
    BESS = "bess"  # Magazyny energii
    HYBRYDOWA = "hybrydowa"  # PV + BESS
    PRZEMYSLOWA = "przemyslowa"  # Odbiorcze przemysłowe
    WIATROWA = "wiatrowa"  # OZE wiatrowe
    SEKCYJNA = "sekcyjna"  # Sekcyjne / pętlowe


#: Etykieta PL kategorii = pole strukturalne "zastosowanie" (KARTA-UI2 §1 p. 12:
#: kontrakt dostaje pola strukturalne zastosowania/mocy/napięcia, nie parsuje
#: `name_pl`). `category` jest ISTNIEJĄCYM polem `StationTemplate` (`to_dict`
#: zwraca `category.value`) — front dotąd nie miał etykiety PL dla filtra.
#: Promowane z `api/station_templates.py::_CATEGORY_LABELS` (ISTNIEJĄCY słownik
#: dotąd używany WYŁĄCZNIE przez `/categories`, treść bez zmian) — warstwa
#: schematu jest właściwym miejscem (API importuje z domeny, nie odwrotnie);
#: `api/station_templates.py` importuje stąd zamiast trzymać drugą kopię.
TEMPLATE_CATEGORY_LABELS_PL: dict[TemplateCategory, str] = {
    TemplateCategory.TYPOWA_SN_NN: "Typowe stacje SN/nN",
    TemplateCategory.SLUPOWA: "Stacje słupowe ZSP",
    TemplateCategory.ZKSN_WNETRZOWA: "Stacje ZKSN wnętrzowe",
    TemplateCategory.PROSUMENT_PV: "Mikroinstalacje PV prosument",
    TemplateCategory.FARMA_PV: "Farmy PV SN",
    TemplateCategory.BESS: "Magazyny BESS",
    TemplateCategory.HYBRYDOWA: "Hybrydy PV + BESS",
    TemplateCategory.PRZEMYSLOWA: "Przemysłowe odbiorcze",
    TemplateCategory.WIATROWA: "Stacje OZE wiatrowe",
    TemplateCategory.SEKCYJNA: "Stacje sekcyjne / pętlowe",
}


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
        default_factory=lambda: TemplateParamInt(
            default=1, min_value=1, max_value=2, label_pl="Liczba transformatorów"
        )
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
        default_factory=lambda: TemplateParamInt(
            default=2, min_value=1, max_value=8, label_pl="Liczba pól SN"
        )
    )
    sn_bay_roles: tuple[BayRoleSpec, ...] = ()
    sn_bay_protection_options: tuple[ProtectionRelaySpec, ...] = ()
    sn_bay_apparatus_options: tuple[CatalogChoice, ...] = ()
    """Aparatura pól SN dostępna w szablonie (APARAT_SN) — B-12.

    Wskazanie aparatu należy do szablonu/projektanta; operacja domenowa NIE
    dobiera go sama. Rola z własnymi `apparatus_options` ma pierwszeństwo przed
    tą listą wspólną. Pusta lista ⇒ szablon nie da się zastosować bez jawnego
    `params_override['sn_bay_apparatus_ref']` (jawny błąd, nie domysł)."""

    # nN side
    nn_feeders_count: TemplateParamInt = field(
        default_factory=lambda: TemplateParamInt(
            default=2, min_value=1, max_value=8, label_pl="Liczba odpływów nN"
        )
    )
    nn_feeder_cb_options: tuple[CatalogChoice, ...] = ()
    nn_load_default_kw: TemplateParamFloat = field(
        default_factory=lambda: TemplateParamFloat(
            default=50.0,
            min_value=0.0,
            max_value=2000.0,
            unit="kW",
            label_pl="Obciążenie per odpływ",
        )
    )

    # DER
    der_options: tuple[DerKindSpec, ...] = ()
    der_total_count: TemplateParamInt = field(
        default_factory=lambda: TemplateParamInt(
            default=0, min_value=0, max_value=20, label_pl="Liczba modułów DER"
        )
    )

    # Protection
    protection_settings_default: str | None = None  # Template ID

    # Measurements
    ct_options: tuple[CatalogChoice, ...] = ()
    vt_options: tuple[CatalogChoice, ...] = ()
    energy_meter_options: tuple[CatalogChoice, ...] = ()

    # Catalog cascade
    manufacturer_profile_default: str = "ZPUE_WLOSZCZOWA"


def transformer_voltages_kv(transformer_ref: str | None) -> tuple[float | None, float | None]:
    """Katalogowe napięcia GN/DN wybranego transformatora [kV] — z REALNEGO
    rekordu katalogu (nie z tokenu id ani z `name_pl`): jedna prawda napięć,
    ta sama którą waliduje `station.insert`
    (`_validate_transformer_voltage_compatibility`). `(None, None)` gdy brak
    referencji/rekordu/katalogu (moduł katalogu niezaimportowany w środowisku
    — uczciwy brak, nie fabrykowana wartość).

    Promowane z `apply.py::_transformer_lv_voltage_kv` (KARTA-UI2 §1 p. 12) —
    ta sama logika, teraz w warstwie schematu i publiczna, żeby `StationTemplate
    .to_dict()` mógł jej użyć bez importu z modułu apply (odwrotny kierunek
    zależności — schema jest WEJŚCIEM apply, nie odwrotnie).
    """
    if not isinstance(transformer_ref, str) or not transformer_ref.strip():
        return None, None
    try:
        from network_model.catalog import get_default_mv_catalog
    except ImportError:
        return None, None
    catalog = get_default_mv_catalog()
    item = catalog.get_transformer_type(transformer_ref)
    if item is None:
        return None, None

    def _pole(*nazwy: str) -> float | None:
        for nazwa in nazwy:
            wartosc = getattr(item, nazwa, None)
            if wartosc is None:
                continue
            try:
                parsed = float(wartosc)
            except (TypeError, ValueError):
                continue
            if parsed > 0:
                return parsed
        return None

    return _pole("voltage_hv_kv", "uhv_kv"), _pole("voltage_lv_kv", "ulv_kv")


def catalog_choice_rated_kva(option: Any) -> tuple[int | None, str | None]:
    """Moc pozorna [kVA] zakodowana w typoszeregu `catalog_ref` (np.
    ``tr_sn_nn_630kva_dyn11`` → 630, ``conv_pv_3p15mva_...`` → 3150 przez MVA).
    `(None, ref)` gdy `catalog_ref` nie koduje mocy; `(None, None)` gdy
    `option` nie niesie `catalog_ref` wcale.

    Promowane z `apply.py::_catalog_choice_rating_kva` (KARTA-UI2 §1 p. 12) —
    ten sam token, teraz publiczny w schema.py.
    """
    ref = getattr(option, "catalog_ref", None)
    if not isinstance(ref, str):
        return None, None
    mva_match = re.search(r"-(\d+(?:p\d+)?)mva-", ref.lower())
    if mva_match is not None:
        return int(round(mva_na_kva(float(mva_match.group(1).replace("p", "."))))), ref
    match = re.search(r"-(\d+)kva-", ref.lower())
    if match is None:
        return None, ref
    return int(match.group(1)), ref


def _domyslna_opcja_transformatora(schema: TemplateSchema) -> CatalogChoice | None:
    """Wybrana domyślnie opcja transformatora szablonu (`default=True`),
    albo pierwsza z listy gdy żadna nie jest oznaczona; `None` gdy szablon
    nie niesie żadnej opcji transformatora (np. czysty punkt DER bez TR
    dedykowanego)."""
    for opcja in schema.transformer_options:
        if opcja.default:
            return opcja
    return schema.transformer_options[0] if schema.transformer_options else None


def structural_fields(template: StationTemplate) -> dict[str, Any]:
    """Pola strukturalne (moc/napięcie/zastosowanie/kategorie ról) wspólne dla
    `StationTemplate.to_dict()` (pełny szczegół) i podsumowania listy
    (`api/station_templates.py::_to_summary`) — JEDNO źródło obliczenia,
    żeby lista i szczegół nigdy nie rozjechały się dla tego samego szablonu
    (reguła KLASA NIE INSTANCJA pkt 3: predykaty z jednego źródła prawdy).
    Zob. `StationTemplate.to_dict` po znaczenie `None`/`[]`.
    """
    domyslny_tr = _domyslna_opcja_transformatora(template.schema)
    moc_kva, _ = catalog_choice_rated_kva(domyslny_tr) if domyslny_tr is not None else (None, None)
    napiecie_gn_kv, napiecie_dn_kv = (
        transformer_voltages_kv(domyslny_tr.catalog_ref)
        if domyslny_tr is not None
        else (None, None)
    )
    return {
        "category_label_pl": TEMPLATE_CATEGORY_LABELS_PL.get(
            template.category, template.category.value
        ),
        "rated_power_kva": moc_kva,
        "voltage_hv_kv": napiecie_gn_kv,
        "voltage_lv_kv": napiecie_dn_kv,
        "bay_role_categories": sorted({rola.role for rola in template.schema.sn_bay_roles}),
    }


@dataclass(frozen=True)
class StationTemplate:
    """Single station template definition."""

    id: str  # 'tpl_sn_nn_630kva'
    name_pl: str  # "Stacja SN/nN 630 kVA z RMU 3-pole"
    category: TemplateCategory
    description_pl: str
    use_case_pl: str  # "Standardowa dystrybucyjna w terenie wiejskim"
    nc_rfg_type: str | None  # 'A' | 'B' | 'C' | 'D' | None
    schema: TemplateSchema
    tags: tuple[str, ...] = ()  # Searchable tags
    icon: str = "station-default"  # Frontend icon hint

    def to_dict(self) -> dict:
        """Serialize to JSON dict dla API.

        KARTA-UI2 §1 p. 12 (zamknięcie): `rated_power_kva`/`voltage_hv_kv`/
        `voltage_lv_kv`/`bay_role_categories`/`category_label_pl` są polami
        STRUKTURALNYMI (moc/napięcie/zastosowanie/kategorie ról) dodanymi na
        żądanie karty — źródłem jest KATALOG (`transformer_voltages_kv`) i
        token identyfikatora (`catalog_choice_rated_kva`), NIGDY parsowanie
        `name_pl`. `None`/`[]` = dana niedostarczona (katalog niedostępny w
        środowisku, szablon bez dedykowanego transformatora) — front pokazuje
        uczciwy brak, nie fabrykuje liczby.
        """
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
            **structural_fields(self),
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
        "sn_bay_apparatus_options": [_choice_to_dict(c) for c in schema.sn_bay_apparatus_options],
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
