"""
Kanoniczny rejestr operacji domenowych MV-DESIGN-PRO.

Status: BINDING (dokument wiazacy)
Wersja: 1.0
Data: 2026-02-17

REGULA: Ten modul jest JEDYNYM ZRODLEM PRAWDY dla:
- nazw kanonicznych operacji
- mapowania aliasow
- kodow gotowosci
- kontraktu odpowiedzi
"""

from __future__ import annotations

import enum
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

# ============================================================
# 1. KANONICZNE NAZWY OPERACJI
# ============================================================


class OperationCategory(enum.Enum):
    """Kategorie operacji domenowych."""

    SN_NETWORK = "sn_network"
    STATION_NN = "station_nn"
    OZE_NN = "oze_nn"
    PROTECTION = "protection"
    STUDY_CASE = "study_case"
    UNIVERSAL = "universal"
    # P0.1 nN (karta P0.1, C §4.1): topologia obwodow nN — sieć generyczna ENM
    # w paśmie ≤1 kV (Bus/Cable/SwitchBranch/FuseBranch/Load istniejące), NIE
    # nowe klasy Lv*. Osobna kategoria od STATION_NN (pole/odpływ nN wpięte w
    # pole stacji) — te operacje budują/zmieniają TOPOLOGIĘ GRAFU nN.
    NN_NETWORK = "nn_network"


@dataclass(frozen=True)
class OperationSpec:
    """Specyfikacja pojedynczej operacji domenowej."""

    canonical_name: str
    category: OperationCategory
    description_pl: str
    target_layer: str
    required_fields: tuple[str, ...]
    optional_fields: tuple[str, ...] = ()
    creates_elements: bool = True
    mutates_model: bool = True


# Full registry of ALL canonical operations (count enforced by
# scripts/canonical_ops_guard.py: registry <-> handler dicts, both directions)
CANONICAL_OPERATIONS: dict[str, OperationSpec] = {
    # --- SN Network (7 operations) ---
    "add_grid_source_sn": OperationSpec(
        canonical_name="add_grid_source_sn",
        category=OperationCategory.SN_NETWORK,
        description_pl="Dodanie źródła zasilania sieciowego (GPZ) do sieci SN",
        target_layer="Domain / NetworkModel",
        required_fields=("voltage_kv",),
        optional_fields=(
            "source_name",
            "sk3_mva",
            "rx_ratio",
            "catalog_ref",
            "catalog_binding",
            "sections_count",
            "gpz_sections",
            "line_fields_per_section",
            "grounding",
            "zero_sequence",
            "manual_equivalent",
            "short_circuit_mode",
            "source_mode",
            "parameter_source",
            "notes",
        ),
    ),
    "continue_trunk_segment_sn": OperationSpec(
        canonical_name="continue_trunk_segment_sn",
        category=OperationCategory.SN_NETWORK,
        description_pl="Kontynuacja segmentu magistrali SN",
        target_layer="Domain / NetworkModel",
        required_fields=("trunk_ref",),
        optional_fields=("segment_spec", "geometry_hint"),
    ),
    "insert_station_on_segment_sn": OperationSpec(
        canonical_name="insert_station_on_segment_sn",
        category=OperationCategory.SN_NETWORK,
        description_pl="Wstawienie stacji na istniejącym segmencie SN",
        target_layer="Domain / NetworkModel",
        required_fields=("trunk_ref", "segment_target", "station_spec"),
        optional_fields=("sn_fields", "transformer", "nn_block", "embedding_intent"),
    ),
    "start_branch_segment_sn": OperationSpec(
        canonical_name="start_branch_segment_sn",
        category=OperationCategory.SN_NETWORK,
        description_pl="Rozpoczęcie nowego odgałęzienia od magistrali SN",
        target_layer="Domain / NetworkModel",
        required_fields=("from_port_ref",),
        optional_fields=("segment_spec", "branch_role"),
    ),
    "insert_section_switch_sn": OperationSpec(
        canonical_name="insert_section_switch_sn",
        category=OperationCategory.SN_NETWORK,
        description_pl="Wstawienie łącznika sekcyjnego na segmencie SN",
        target_layer="Domain / NetworkModel",
        required_fields=("segment_id", "switch_type"),
        optional_fields=("insert_at", "normal_state", "catalog_binding"),
    ),
    "connect_secondary_ring_sn": OperationSpec(
        canonical_name="connect_secondary_ring_sn",
        category=OperationCategory.SN_NETWORK,
        description_pl="Zamknięcie pierścienia wtórnego",
        target_layer="Domain / NetworkModel",
        required_fields=("a_ref", "b_ref"),
        optional_fields=("nop_required",),
    ),
    "set_normal_open_point": OperationSpec(
        canonical_name="set_normal_open_point",
        category=OperationCategory.SN_NETWORK,
        description_pl="Ustawienie punktu normalnie otwartego (NOP)",
        target_layer="Domain / NetworkModel",
        required_fields=("nop_element_id",),
        optional_fields=("ring_id", "normal_state"),
        creates_elements=False,
    ),
    "add_sn_bay": OperationSpec(
        canonical_name="add_sn_bay",
        category=OperationCategory.SN_NETWORK,
        description_pl="Dodanie pola SN do GPZ, stacji, ZKSN albo pola źródłowego",
        target_layer="Domain / NetworkModel",
        required_fields=("bus_ref",),
        optional_fields=(
            "station_ref",
            "field_name",
            "bay_role",
            "apparatus_kind",
            "gpz_section_id",
            "catalog_binding",
        ),
    ),
    "add_sn_bay_from_catalog": OperationSpec(
        canonical_name="add_sn_bay_from_catalog",
        category=OperationCategory.SN_NETWORK,
        description_pl=(
            "Dodanie pola SN z katalogu rozdzielnic: kompletne pole rodziny "
            "modułowej albo jednostka bloku fabrycznego RMU"
        ),
        target_layer="Domain / NetworkModel",
        required_fields=("bus_ref",),
        optional_fields=(
            "station_ref",
            "complete_bay_template_ref",
            "factory_configuration_ref",
            "factory_unit_index",
            "switchgear_family_ref",
            "field_name",
            "gpz_section_id",
            "catalog_binding",
            "protection_ref",
        ),
    ),
    # --- Station & nN (6 operations) ---
    "add_transformer_sn_nn": OperationSpec(
        canonical_name="add_transformer_sn_nn",
        category=OperationCategory.STATION_NN,
        description_pl="Dodanie transformatora SN/nN",
        target_layer="Domain / NetworkModel",
        required_fields=("hv_bus_ref", "lv_bus_ref"),
        optional_fields=("catalog_binding", "model_flags"),
    ),
    "add_nn_outgoing_field": OperationSpec(
        canonical_name="add_nn_outgoing_field",
        category=OperationCategory.STATION_NN,
        description_pl="Dodanie pola nN z jawną intencją odpływu albo pola źródłowego",
        target_layer="Domain / NetworkModel",
        required_fields=("target_nn_bus_ref",),
        optional_fields=(
            "field_name",
            "field_type",
            "field_role",
            "source_field_kind",
            "catalog_binding",
            "creates_nn_segment",
            "length_m",
        ),
    ),
    "add_nn_load": OperationSpec(
        canonical_name="add_nn_load",
        category=OperationCategory.STATION_NN,
        description_pl="Dodanie obciążenia na szynie nN",
        target_layer="Domain / NetworkModel",
        required_fields=("target_nn_bus_ref",),
        optional_fields=("load_type", "p_kw", "q_kvar", "cos_phi", "profile"),
    ),
    "assign_catalog_to_element": OperationSpec(
        canonical_name="assign_catalog_to_element",
        category=OperationCategory.UNIVERSAL,
        description_pl="Przypisanie typu katalogowego do elementu",
        target_layer="Domain / Catalog",
        required_fields=("element_ref", "catalog_item_id"),
        optional_fields=("catalog_item_version", "policy"),
        creates_elements=False,
    ),
    "update_element_parameters": OperationSpec(
        canonical_name="update_element_parameters",
        category=OperationCategory.UNIVERSAL,
        description_pl="Aktualizacja parametrów elementu",
        target_layer="Domain / NetworkModel",
        required_fields=("element_ref", "parameters"),
        creates_elements=False,
    ),
    # --- OZE nN (5 operations) ---
    "add_converter_source": OperationSpec(
        canonical_name="add_converter_source",
        category=OperationCategory.OZE_NN,
        description_pl="Dodanie źródła przekształtnikowego PV, BESS lub FW",
        target_layer="Domain / NetworkModel",
        required_fields=(
            "source_technology",
            "connection_variant",
            "station_ref",
            "bus_nn_ref",
        ),
        optional_fields=(
            "placement",
            "existing_field_ref",
            "source_field",
            "catalog_binding",
            "materialized_params",
        ),
    ),
    "add_genset_nn": OperationSpec(
        canonical_name="add_genset_nn",
        category=OperationCategory.OZE_NN,
        description_pl="Dodanie zespołu prądotwórczego na szynie nN",
        target_layer="Domain / NetworkModel",
        required_fields=("target_nn_bus_ref",),
        optional_fields=("rated_power_kva", "cos_phi", "catalog_binding"),
    ),
    "add_ups_nn": OperationSpec(
        canonical_name="add_ups_nn",
        category=OperationCategory.OZE_NN,
        description_pl="Dodanie zasilacza UPS na szynie nN",
        target_layer="Domain / NetworkModel",
        required_fields=("target_nn_bus_ref",),
        optional_fields=("rated_power_kva", "backup_time_min", "catalog_binding"),
    ),
    "set_source_operating_mode": OperationSpec(
        canonical_name="set_source_operating_mode",
        category=OperationCategory.OZE_NN,
        description_pl="Ustawienie trybu pracy źródła nN",
        target_layer="Domain / NetworkModel",
        required_fields=("source_ref", "operating_mode"),
        creates_elements=False,
    ),
    "set_dynamic_profile": OperationSpec(
        canonical_name="set_dynamic_profile",
        category=OperationCategory.OZE_NN,
        description_pl="Przypisanie profilu dynamicznego do źródła",
        target_layer="Domain / NetworkModel",
        required_fields=("source_ref", "profile"),
        creates_elements=False,
    ),
    # V12K-238: wiązania wytwórcy wybierane PO jego utworzeniu (konfigurator DER).
    # Bez tej operacji katalog zabezpieczeń, przekładniki CT/VT, dane prądu zwarciowego,
    # model dynamiczny i profile zgodności nie miały GDZIE spłynąć — wybór żył wyłącznie
    # w store przeglądarki, więc sześć osi gotowości opierało werdykt na danych, których
    # model nie zna (pomiar: V12K-237).
    "set_der_catalog_bindings": OperationSpec(
        canonical_name="set_der_catalog_bindings",
        category=OperationCategory.OZE_NN,
        description_pl="Wiązania katalogowe i profile zgodności wytwórcy (DER)",
        target_layer="Domain / NetworkModel",
        required_fields=("generator_ref",),
        optional_fields=(
            "protection_catalog_ref",
            "ct_catalog_ref",
            "vt_catalog_ref",
            "fault_current_data_ref",
            "dynamic_model_ref",
            "nc_rfg_profile_ref",
            "lvrt_curve_ref",
            "hvrt_curve_ref",
            "pf_curve_ref",
        ),
        creates_elements=False,
    ),
    # --- Protection (7 operations) ---
    "add_ct": OperationSpec(
        canonical_name="add_ct",
        category=OperationCategory.PROTECTION,
        description_pl="Dodanie przekładnika prądowego (CT)",
        target_layer="Domain / NetworkModel",
        required_fields=("target_field_ref",),
        optional_fields=("ratio", "accuracy_class", "burden_va", "catalog_binding"),
    ),
    "add_vt": OperationSpec(
        canonical_name="add_vt",
        category=OperationCategory.PROTECTION,
        description_pl="Dodanie przekładnika napięciowego (VT)",
        target_layer="Domain / NetworkModel",
        required_fields=("target_field_ref",),
        optional_fields=("ratio", "accuracy_class", "catalog_binding"),
    ),
    "add_relay": OperationSpec(
        canonical_name="add_relay",
        category=OperationCategory.PROTECTION,
        description_pl="Dodanie przekaźnika zabezpieczeniowego",
        target_layer="Domain / NetworkModel",
        required_fields=("target_ct_ref",),
        optional_fields=("relay_type", "manufacturer", "catalog_binding"),
    ),
    "update_relay_settings": OperationSpec(
        canonical_name="update_relay_settings",
        category=OperationCategory.PROTECTION,
        description_pl="Aktualizacja nastaw przekaźnika",
        target_layer="Domain / NetworkModel",
        required_fields=("relay_ref", "settings"),
        creates_elements=False,
    ),
    "link_relay_to_field": OperationSpec(
        canonical_name="link_relay_to_field",
        category=OperationCategory.PROTECTION,
        description_pl="Powiązanie przekaźnika z polem rozdzielczym",
        target_layer="Domain / NetworkModel",
        required_fields=("relay_ref", "field_ref"),
        creates_elements=False,
    ),
    "calculate_tcc_curve": OperationSpec(
        canonical_name="calculate_tcc_curve",
        category=OperationCategory.PROTECTION,
        description_pl="Obliczenie krzywej czas-prąd (TCC)",
        target_layer="Analysis / Protection",
        required_fields=("relay_ref",),
        mutates_model=False,
        creates_elements=False,
    ),
    "validate_selectivity": OperationSpec(
        canonical_name="validate_selectivity",
        category=OperationCategory.PROTECTION,
        description_pl="Walidacja selektywności między urządzeniami",
        target_layer="Analysis / Protection",
        required_fields=("upstream_ref", "downstream_ref"),
        mutates_model=False,
        creates_elements=False,
    ),
    # --- Universal (4 operations) ---
    "delete_element": OperationSpec(
        canonical_name="delete_element",
        category=OperationCategory.UNIVERSAL,
        description_pl="Usunięcie elementu z modelu sieci",
        target_layer="Domain / NetworkModel",
        required_fields=("element_ref",),
        optional_fields=("cascade",),
        creates_elements=False,
    ),
    "rename_element": OperationSpec(
        canonical_name="rename_element",
        category=OperationCategory.UNIVERSAL,
        description_pl="Zmiana nazwy elementu",
        target_layer="Domain / NetworkModel",
        required_fields=("element_ref", "new_name"),
        creates_elements=False,
    ),
    "set_label": OperationSpec(
        canonical_name="set_label",
        category=OperationCategory.UNIVERSAL,
        description_pl="Ustawienie etykiety na schemacie SLD",
        target_layer="Application / SLD",
        required_fields=("element_ref", "label"),
        creates_elements=False,
    ),
    "set_connection_conditions": OperationSpec(
        canonical_name="set_connection_conditions",
        category=OperationCategory.UNIVERSAL,
        description_pl="Ustawienie warunków przyłączenia OSD (moc przyłączeniowa, cosφ, tryb pracy)",
        target_layer="Domain / NetworkModel",
        required_fields=(),
        creates_elements=False,
    ),
    "append_station_on_endpoint": OperationSpec(
        canonical_name="append_station_on_endpoint",
        category=OperationCategory.SN_NETWORK,
        description_pl="Dołączenie stacji na końcu istniejącego ciągu SN",
        target_layer="Domain / NetworkModel",
        required_fields=(),
        optional_fields=(
            "endpoint_bus_ref",
            "run_ref",
            "station",
            "station_name",
            "transformer",
            "nn_voltage_kv",
            "dry_run",
        ),
        creates_elements=True,
    ),
    "insert_branch_pole_on_segment_sn": OperationSpec(
        canonical_name="insert_branch_pole_on_segment_sn",
        category=OperationCategory.SN_NETWORK,
        description_pl="Wstawienie słupa odgałęźnego na segmencie SN",
        target_layer="Domain / NetworkModel",
        required_fields=(),
        optional_fields=(
            "segment_id",
            "segment_ref",
            "catalog_ref",
            "catalog_binding",
            "switch_state",
            "insert_at",
        ),
        creates_elements=True,
    ),
    "insert_zksn_on_segment_sn": OperationSpec(
        canonical_name="insert_zksn_on_segment_sn",
        category=OperationCategory.SN_NETWORK,
        description_pl="Wstawienie złącza kablowego SN (ZK-SN) na segmencie SN",
        target_layer="Domain / NetworkModel",
        required_fields=(),
        optional_fields=(
            "segment_id",
            "segment_ref",
            "catalog_ref",
            "catalog_binding",
            "switch_state",
            "insert_at",
        ),
        creates_elements=True,
    ),
    "add_gpz_section": OperationSpec(
        canonical_name="add_gpz_section",
        category=OperationCategory.SN_NETWORK,
        description_pl="Dodanie sekcji szyn GPZ (strona SN lub WN) do stacji GPZ",
        target_layer="Domain / NetworkModel",
        required_fields=("substation_ref",),
        optional_fields=(
            "side",
            "section_id",
            "bus_ref",
            "order",
            "name",
            "line_field_name",
        ),
        creates_elements=True,
    ),
    "update_gpz_section": OperationSpec(
        canonical_name="update_gpz_section",
        category=OperationCategory.SN_NETWORK,
        description_pl="Aktualizacja sekcji szyn GPZ (nazwa, kolejność, sprzęgła)",
        target_layer="Domain / NetworkModel",
        required_fields=("substation_ref", "section_id"),
        optional_fields=("side", "updates"),
        creates_elements=False,
    ),
    "delete_gpz_section": OperationSpec(
        canonical_name="delete_gpz_section",
        category=OperationCategory.SN_NETWORK,
        description_pl="Usunięcie sekcji szyn GPZ ze stacji",
        target_layer="Domain / NetworkModel",
        required_fields=("substation_ref", "section_id"),
        optional_fields=("side",),
        creates_elements=False,
    ),
    "add_shunt_compensator_sn": OperationSpec(
        canonical_name="add_shunt_compensator_sn",
        category=OperationCategory.SN_NETWORK,
        description_pl="Dodanie baterii kondensatorów (kompensatora bocznikowego) na szynę SN",
        target_layer="Domain / NetworkModel",
        required_fields=(),
        optional_fields=(
            "bus_ref",
            "bus_nn_ref",
            "catalog_ref",
            "catalog_binding",
            "status",
            "name",
        ),
        creates_elements=True,
    ),
    "add_surge_arrester_sn": OperationSpec(
        canonical_name="add_surge_arrester_sn",
        category=OperationCategory.SN_NETWORK,
        description_pl="Dodanie ogranicznika przepięć w polu SN",
        target_layer="Domain / NetworkModel",
        required_fields=(),
        optional_fields=(
            "field_ref",
            "bay_ref",
            "bus_ref",
            "station_ref",
            "catalog_ref",
            "catalog_binding",
        ),
        creates_elements=True,
    ),
    "refresh_snapshot": OperationSpec(
        canonical_name="refresh_snapshot",
        category=OperationCategory.UNIVERSAL,
        description_pl="Odświeżenie koperty odpowiedzi bez modyfikacji modelu",
        target_layer="Domain / NetworkModel",
        required_fields=(),
        mutates_model=False,
        creates_elements=False,
    ),
    # --- nN Network (9 operations, karta P0.1, C §4.1) ---
    "add_nn_cable_segment": OperationSpec(
        canonical_name="add_nn_cable_segment",
        category=OperationCategory.NN_NETWORK,
        description_pl="Dodanie odcinka kabla nN od szyny/pola do nowej lub istniejącej szyny nN",
        target_layer="Domain / NetworkModel",
        required_fields=("from_bus_ref", "length_m"),
        optional_fields=(
            "from_ref",
            "to_bus_ref",
            "catalog_ref",
            "catalog_binding",
            "n_parallel",
            "name",
            "cable_laying_conditions",
        ),
        creates_elements=True,
    ),
    "add_nn_distribution_board": OperationSpec(
        canonical_name="add_nn_distribution_board",
        category=OperationCategory.NN_NETWORK,
        description_pl="Dodanie podrozdzielnicy/rozdzielnicy nN (RGnN) z szyną główną",
        target_layer="Domain / NetworkModel",
        required_fields=("voltage_kv",),
        optional_fields=("name", "supply", "designation", "construction_type"),
        creates_elements=True,
    ),
    "add_nn_switch_device": OperationSpec(
        canonical_name="add_nn_switch_device",
        category=OperationCategory.NN_NETWORK,
        description_pl="Dodanie aparatu (wyłącznik/rozłącznik/bezpiecznik) w torze nN",
        target_layer="Domain / NetworkModel",
        required_fields=("from_bus_ref", "to_bus_ref"),
        optional_fields=("device_class", "catalog_ref", "catalog_binding", "name"),
        creates_elements=True,
    ),
    "add_nn_section_coupler": OperationSpec(
        canonical_name="add_nn_section_coupler",
        category=OperationCategory.NN_NETWORK,
        description_pl="Dodanie nowej sekcji szyn i sprzęgła w rozdzielnicy nN (RGnN)",
        target_layer="Domain / NetworkModel",
        required_fields=("station_ref",),
        optional_fields=("catalog_ref", "catalog_binding", "name"),
        creates_elements=True,
    ),
    "split_nn_segment": OperationSpec(
        canonical_name="split_nn_segment",
        category=OperationCategory.NN_NETWORK,
        description_pl="Rozcięcie odcinka kabla nN na dwa z nową szyną pośrednią",
        target_layer="Domain / NetworkModel",
        required_fields=("segment_ref", "split_at_m"),
        optional_fields=(),
        creates_elements=True,
    ),
    "merge_nn_segments": OperationSpec(
        canonical_name="merge_nn_segments",
        category=OperationCategory.NN_NETWORK,
        description_pl="Scalenie dwóch odcinków kabla nN tego samego typu przez szynę pośrednią",
        target_layer="Domain / NetworkModel",
        required_fields=("segment_a_ref", "segment_b_ref"),
        optional_fields=(),
        creates_elements=True,
    ),
    "set_nn_cable_laying_conditions": OperationSpec(
        canonical_name="set_nn_cable_laying_conditions",
        category=OperationCategory.NN_NETWORK,
        description_pl="Zapis warunków ułożenia odcinka kabla nN (meta, bez fizyki)",
        target_layer="Domain / NetworkModel",
        required_fields=("segment_ref", "cable_laying_conditions"),
        optional_fields=(),
        creates_elements=False,
    ),
    "remove_nn_element": OperationSpec(
        canonical_name="remove_nn_element",
        category=OperationCategory.NN_NETWORK,
        description_pl="Usunięcie elementu nN (kabel/aparat/szyna-liść/odbiór) z walidacją spójności",
        target_layer="Domain / NetworkModel",
        required_fields=("element_ref",),
        optional_fields=(),
        creates_elements=False,
    ),
    "copy_nn_feeder": OperationSpec(
        canonical_name="copy_nn_feeder",
        category=OperationCategory.NN_NETWORK,
        description_pl="Kopia poddrzewa odpływu nN (od aparatu odpływowego w dół)",
        target_layer="Domain / NetworkModel",
        required_fields=("feeder_apparatus_ref",),
        optional_fields=("name",),
        creates_elements=True,
    ),
}

# Canonical operation names as frozen set (for guards)
CANONICAL_OP_NAMES: frozenset[str] = frozenset(CANONICAL_OPERATIONS.keys())

REQUIRED_FIELD_ALIASES: dict[str, dict[str, tuple[str, ...]]] = {
    "add_grid_source_sn": {
        "voltage_kv": ("sn_voltage_kv",),
    }
}


def resolve_operation_name(name: str) -> str:
    """Zwróć kanoniczną nazwę operacji bez translacji aliasów."""
    return name


def is_canonical_operation(name: str) -> bool:
    """Check if name is a canonical operation."""
    return name in CANONICAL_OP_NAMES


# ============================================================
# 3. READINESS CODES (kompletny slownik po polsku)
# ============================================================


class ReadinessLevel(enum.Enum):
    BLOCKER = "BLOCKER"
    WARNING = "WARNING"
    INFO = "INFO"


class ReadinessArea(enum.Enum):
    SOURCES = "SOURCES"
    TOPOLOGY = "TOPOLOGY"
    CATALOGS = "CATALOGS"
    STATIONS = "STATIONS"
    GENERATORS = "GENERATORS"
    PROTECTION = "PROTECTION"
    ANALYSIS = "ANALYSIS"


@dataclass(frozen=True)
class ReadinessCodeSpec:
    """Specyfikacja kodu gotowości."""

    code: str
    area: ReadinessArea
    priority: int  # 1 = highest
    level: ReadinessLevel
    message_pl: str
    fix_navigation: dict[str, str] | None


# Complete canonical readiness codes dictionary
READINESS_CODES: dict[str, ReadinessCodeSpec] = {
    # Sources
    "source.voltage_invalid": ReadinessCodeSpec(
        code="source.voltage_invalid",
        area=ReadinessArea.SOURCES,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Nieprawidłowe napięcie źródła zasilania",
        fix_navigation={
            "panel": "inspector",
            "tab": "parametry",
            "focus": "voltage_kv",
        },
    ),
    "source.sk3_invalid": ReadinessCodeSpec(
        code="source.sk3_invalid",
        area=ReadinessArea.SOURCES,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Nieprawidłowa moc zwarciowa źródła Sk3",
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "sk3_mva"},
    ),
    "source.grid_supply_missing": ReadinessCodeSpec(
        code="source.grid_supply_missing",
        area=ReadinessArea.SOURCES,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Brak źródła zasilania sieciowego (GPZ)",
        fix_navigation={"panel": "wizard", "modal": "add_grid_source"},
    ),
    "source.connection_missing": ReadinessCodeSpec(
        code="source.connection_missing",
        area=ReadinessArea.SOURCES,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Źródło zasilania nie jest podłączone do szyny",
        fix_navigation={"panel": "inspector", "tab": "polaczenia"},
    ),
    # Topology
    "trunk.terminal_missing": ReadinessCodeSpec(
        code="trunk.terminal_missing",
        area=ReadinessArea.TOPOLOGY,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Magistrala nie ma terminala końcowego",
        fix_navigation={"panel": "sld"},
    ),
    "trunk.segment_missing": ReadinessCodeSpec(
        code="trunk.segment_missing",
        area=ReadinessArea.TOPOLOGY,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Magistrala nie ma żadnego segmentu",
        fix_navigation={"panel": "sld"},
    ),
    "trunk.segment_length_missing": ReadinessCodeSpec(
        code="trunk.segment_length_missing",
        area=ReadinessArea.TOPOLOGY,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Odcinek nie ma zdefiniowanej długości",
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "length_m"},
    ),
    "trunk.segment_length_invalid": ReadinessCodeSpec(
        code="trunk.segment_length_invalid",
        area=ReadinessArea.TOPOLOGY,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Nieprawidłowa długość odcinka (musi być > 0)",
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "length_m"},
    ),
    "trunk.catalog_missing": ReadinessCodeSpec(
        code="trunk.catalog_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Odcinek SN nie ma przypisanego katalogu",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "select_catalog",
        },
    ),
    # Stations
    "station.type_invalid": ReadinessCodeSpec(
        code="station.type_invalid",
        area=ReadinessArea.STATIONS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Nieprawidłowy typ stacji",
        fix_navigation={"panel": "inspector", "tab": "parametry"},
    ),
    "station.voltage_missing": ReadinessCodeSpec(
        code="station.voltage_missing",
        area=ReadinessArea.STATIONS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Stacja nie ma zdefiniowanego napięcia",
        fix_navigation={
            "panel": "inspector",
            "tab": "parametry",
            "focus": "voltage_kv",
        },
    ),
    "station.nn_outgoing_min_1": ReadinessCodeSpec(
        code="station.nn_outgoing_min_1",
        area=ReadinessArea.STATIONS,
        priority=4,
        level=ReadinessLevel.WARNING,
        message_pl="Stacja powinna mieć co najmniej 1 odpływ nN",
        fix_navigation={"panel": "inspector", "tab": "nn", "modal": "add_nn_outgoing"},
    ),
    "station.required_field_missing": ReadinessCodeSpec(
        code="station.required_field_missing",
        area=ReadinessArea.STATIONS,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Stacja nie ma wymaganego pola SN",
        fix_navigation={"panel": "inspector", "tab": "pola"},
    ),
    # Transformer
    "transformer.catalog_missing": ReadinessCodeSpec(
        code="transformer.catalog_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Transformator nie ma przypisanego katalogu",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "select_catalog",
        },
    ),
    # KOMPLETNOSC-POLA-TR: transformator przyłączony do szyny SN bez pola roli TR.
    # OSTRZEŻENIE, nie BLOCKER — stan roboczy legalny (koncepcja), lecz zamknięta
    # droga do dokumentacji wykonawczej. Emiter: `enm/validator.py` W041 przez
    # odwzorowanie w `domain/readiness_bridge.py`.
    "transformer.bay_missing": ReadinessCodeSpec(
        code="transformer.bay_missing",
        area=ReadinessArea.STATIONS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Transformator jest połączony elektrycznie z szyną SN, lecz nie posiada "
            "kompletnej konfiguracji pola transformatorowego po stronie SN"
        ),
        fix_navigation={"panel": "inspector", "tab": "pola"},
    ),
    "transformer.connection_missing": ReadinessCodeSpec(
        code="transformer.connection_missing",
        area=ReadinessArea.STATIONS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Transformator nie ma zdefiniowanego połączenia",
        fix_navigation={"panel": "inspector", "tab": "polaczenia"},
    ),
    # nN
    "nn.bus_missing": ReadinessCodeSpec(
        code="nn.bus_missing",
        area=ReadinessArea.STATIONS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Stacja wymaga szyny nN",
        fix_navigation={"panel": "inspector", "tab": "nn"},
    ),
    "nn.main_breaker_missing": ReadinessCodeSpec(
        code="nn.main_breaker_missing",
        area=ReadinessArea.STATIONS,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Szyna nN wymaga wyłącznika głównego",
        fix_navigation={"panel": "inspector", "tab": "nn"},
    ),
    # OZE
    "oze.transformer_required": ReadinessCodeSpec(
        code="oze.transformer_required",
        area=ReadinessArea.GENERATORS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Źródło OZE wymaga transformatora w ścieżce zasilania",
        fix_navigation={"panel": "inspector", "tab": "transformator"},
    ),
    "oze.nn_bus_required": ReadinessCodeSpec(
        code="oze.nn_bus_required",
        area=ReadinessArea.GENERATORS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Źródło OZE wymaga szyny nN w stacji",
        fix_navigation={"panel": "inspector", "tab": "nn"},
    ),
    "oze.card_field_not_accepted": ReadinessCodeSpec(
        code="oze.card_field_not_accepted",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Pole karty falownika ma wartość oszacowaną lub domyślną i wymaga "
            "świadomej akceptacji inżyniera przed dołączeniem do pakietu OSD"
        ),
        fix_navigation={"panel": "inspector", "tab": "karta_falownika"},
    ),
    # Certyfikacja PTPiREE przetwornicy DER (karta P2).
    #
    # OSTRZEZENIE, nie blokada — swiadomy wybor poziomu. Manifest katalogu
    # PTPiREE (`network_model/catalog/mv_ptpiree_catalog.py`,
    # `get_ptpiree_catalog_manifest()["integration_policy"]`) mowi WPROST:
    # „Ostateczna akceptacja przylaczeniowa pozostaje po stronie wlasciwego
    # OSD". Lokalny snapshot wykazu nie jest wiec organem rozstrzygajacym i nie
    # moze zatrzymac obliczen — ale brak powiazanego certyfikatu jest realnym
    # ryzykiem odrzucenia wniosku przez OSD, wiec projektant musi go zobaczyc.
    #
    # Nawigacja prowadzi do konfiguracji DER (wybor urzadzenia z katalogu), bo
    # naprawa polega na wskazaniu przetwornicy o powiazanym certyfikacie —
    # regul waznosci certyfikatow system NIE wyprowadza samodzielnie.
    "der.inverter_certificate_unlinked": ReadinessCodeSpec(
        code="der.inverter_certificate_unlinked",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Przetwornica źródła DER nie ma powiązanego certyfikatu PTPiREE — "
            "wniosek do OSD może zostać odrzucony. Ostateczna akceptacja "
            "przyłączeniowa pozostaje po stronie właściwego OSD"
        ),
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    "der.inverter_certificate_conditional": ReadinessCodeSpec(
        code="der.inverter_certificate_conditional",
        area=ReadinessArea.GENERATORS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Certyfikat PTPiREE przetwornicy DER jest powiązany warunkowo — "
            "rekord wykazu niesie notę o warunkach, którą trzeba potwierdzić "
            "przed warunkami przyłączenia"
        ),
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    # Karta FAB-D2 (D8): rodzaj DER spoza mapowania resolvera profili
    # dynamicznych (`network_model/catalog/der_dynamic/resolver.py`) — BLOKUJE
    # stabilność RMS/FRT-HVRT, bo solver nie ma z czego zbudować modelu
    # dynamicznego. Zastępuje dawny cichy fallback do profilu PV.
    "der.dynamic_profile_missing": ReadinessCodeSpec(
        code="der.dynamic_profile_missing",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Rodzaj źródła DER nie ma mapowania na profil dynamiczny — stabilność "
            "RMS i FRT/LVRT/HVRT nie mogą zbudować modelu tego generatora"
        ),
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "gen_type"},
    ),
    # Profil ROZWIĄZANY, ale z domyślnej wartości katalogu (nie jawnego wyboru
    # projektanta/karty katalogowej) — WARNING z proweniencją, nie blokada:
    # solver ma z czego liczyć, ale założenie jest widoczne do weryfikacji.
    "der.dynamic_profile_default": ReadinessCodeSpec(
        code="der.dynamic_profile_default",
        area=ReadinessArea.GENERATORS,
        priority=4,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Profil dynamiczny źródła DER pochodzi z wartości domyślnej katalogu "
            "(nie z jawnego wskazania) — sprawdź, czy pasuje do rzeczywistego urządzenia"
        ),
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    # Karta FAB-D2 (D3): Q generatora nieznany i niewyprowadzalny z jawnego
    # Q-set-pointu karty katalogowej — 0 Mvar podstawione za brak byłoby
    # WYNIKIEM (generator bezbiernościowy), nie brakiem danej.
    "generator.q_missing": ReadinessCodeSpec(
        code="generator.q_missing",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Moc bierna generatora (Q) nie jest znana ani wyprowadzalna z karty "
            "katalogowej — rozpływ mocy nie może przyjąć jej za zero"
        ),
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "q_mvar"},
    ),
    # Karta CV-4.1b (A3-04): generator w trybie regulacji napięcia
    # (`meta.control_mode == "REGULACJA_NAPIECIA"`) bez nastawy napięcia (`u_set_pu`)
    # albo bez kompletnych/spójnych granic mocy biernej (`q_min_mvar < q_max_mvar`) —
    # tor kanoniczny (`enm/mapping.py`) nie może zbudować węzła PV bez tych danych
    # (solver FROZEN wymaga |U| zadanego i granic Q, nie zgaduje ich).
    "generator.voltage_setpoint_missing": ReadinessCodeSpec(
        code="generator.voltage_setpoint_missing",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Generator w trybie regulacji napięcia nie ma kompletnej nastawy — "
            "wymagana nastawa napięcia u_set_pu w paśmie [0,9; 1,1] pu oraz granice "
            "mocy biernej q_min_mvar < q_max_mvar"
        ),
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "u_set_pu"},
    ),
    # Domknięcie CV-4.1b (odbiór, 2026-09-05): tryb regulacji napięcia jest w kreatorze
    # OZE bramkowany profilem NC RfG operatora (`reactive_power.voltage_control_modes`
    # zawiera `voltage_control`); model bez profilu / z profilem nieznanym albo bez
    # tej zdolności jest stanem, którego UI nie pokazuje — blokada w kanonie zamiast
    # bramki tylko w UI (zero fabrykacji). Emiter: `enm/validator.py`
    # (`generators.voltage_control_profile_missing`/`..._not_permitted`).
    "generator.voltage_control_profile_missing": ReadinessCodeSpec(
        code="generator.voltage_control_profile_missing",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Generator w trybie regulacji napięcia nie ma profilu NC RfG operatora "
            "(albo wskazany profil nie istnieje w katalogu) — tryb wymaga profilu "
            "dopuszczającego regulację napięcia"
        ),
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "nc_rfg_profile_ref"},
    ),
    "generator.voltage_control_not_permitted": ReadinessCodeSpec(
        code="generator.voltage_control_not_permitted",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Profil NC RfG operatora nie dopuszcza trybu regulacji napięcia "
            "(voltage_control) — zmień tryb regulacji albo profil operatora"
        ),
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "control_mode"},
    ),
    # Karta FAB-H: udział zwarciowy falownika k_sc (Ik = k_sc*In, IEC 60909-0) —
    # karta katalogowa konwertera nie niesie k_sc, więc enm/mapping.py przyjmuje
    # 1,1 jako ZAREJESTROWANE ZAŁOŻENIE (ślad WHITE BOX + ta proweniencja), nie
    # cichy numer. WARNING, nie BLOCKER: 1,1 jest udokumentowaną wartością
    # typową IEC dla jednostek z przekształtnikiem, a nie zerem/wynikiem — SC
    # dalej liczy się poprawnie, tylko z wartością przyjętą zamiast zmierzonej.
    "inverter.k_sc_assumed": ReadinessCodeSpec(
        code="inverter.k_sc_assumed",
        area=ReadinessArea.GENERATORS,
        priority=4,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Udział zwarciowy falownika (k_sc) nie jest podany w karcie katalogowej "
            "konwertera — przyjęto wartość domyślną IEC 60909 (1,1) zamiast zmierzonej"
        ),
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    # Karta FAB-H: konwerter BEZ ŻADNEGO katalogu (catalog_ref=None) — brama
    # katalogowa nie wymaga referencji katalogowej dla Generator (E009 pilnuje
    # tylko linii/kabli/transformatorów/źródeł, `enm/validator.py`), więc ten
    # stan jest REALNY (np. tryb EKSPERCKI_RECZNY). Wtedy brakuje nie tylko
    # k_sc, ale całej tabliczki znamionowej źródła zwarciowego — BLOCKER, nie
    # WARNING (różny od inverter.k_sc_assumed powyżej: tam katalog JEST, tu go
    # nie ma wcale).
    "inverter.k_sc_missing": ReadinessCodeSpec(
        code="inverter.k_sc_missing",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Konwerter (PV/BESS/wiatrowy) nie ma żadnej referencji katalogowej — "
            "zwarcia nie mogą zweryfikować tabliczki znamionowej źródła"
        ),
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    # Ring
    "ring.endpoints_missing": ReadinessCodeSpec(
        code="ring.endpoints_missing",
        area=ReadinessArea.TOPOLOGY,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Pierścień nie ma zdefiniowanych punktów końcowych",
        fix_navigation={"panel": "sld"},
    ),
    "ring.nop_required": ReadinessCodeSpec(
        code="ring.nop_required",
        area=ReadinessArea.TOPOLOGY,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Pierścień SN wymaga punktu normalnie otwartego (NOP)",
        fix_navigation={"panel": "sld", "modal": "set_normal_open_point"},
    ),
    # Protection
    "protection.ct_required": ReadinessCodeSpec(
        code="protection.ct_required",
        area=ReadinessArea.PROTECTION,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Przekaźnik wymaga przekładnika prądowego (CT)",
        fix_navigation={"panel": "inspector", "tab": "zabezpieczenia"},
    ),
    "protection.vt_required": ReadinessCodeSpec(
        code="protection.vt_required",
        area=ReadinessArea.PROTECTION,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Pole wymaga przekładnika napięciowego (VT)",
        fix_navigation={"panel": "inspector", "tab": "zabezpieczenia"},
    ),
    "protection.settings_incomplete": ReadinessCodeSpec(
        code="protection.settings_incomplete",
        area=ReadinessArea.PROTECTION,
        priority=4,
        level=ReadinessLevel.WARNING,
        message_pl="Nastawy przekaźnika niekompletne",
        fix_navigation={"panel": "inspector", "tab": "nastawy"},
    ),
    # V12K-189 (decyzja właściciela: „nastawa bez danych powinna być niedostępna").
    # Nastawa zabezpieczenia policzona z wartości zastępczej jest GROŹNIEJSZA niż
    # jej brak, bo wygląda jak wynik obliczeń. Brak danych wejściowych ⇒ nastawa
    # NIEDOSTĘPNA + kod gotowości z akcją naprawczą, nigdy liczba domyślna.
    "protection.nominal_current_missing": ReadinessCodeSpec(
        code="protection.nominal_current_missing",
        area=ReadinessArea.PROTECTION,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl="Brak prądu znamionowego pola — uzupełnij, by wyznaczyć nastawę rozruchową I> (51)",
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "in_a"},
    ),
    "protection.fault_current_missing": ReadinessCodeSpec(
        code="protection.fault_current_missing",
        area=ReadinessArea.PROTECTION,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak prądu zwarciowego z biegu SC — uruchom analizę zwarciową, "
            "by wyznaczyć nastawy bezzwłoczne I>> (50/50N) i ziemnozwarciowe (51N)"
        ),
        fix_navigation={"panel": "analizy", "tab": "zwarciowa"},
    ),
    # Warunki przyłączenia OSD jako kryterium (karta F-K2, znalezisko Z2 audytu FLOW).
    # Moc przyłączeniowa i wymagany cosφ z dokumentu OSD są danymi WEJŚCIOWYMI projektu;
    # bez nich ocena punktu przyłączenia jest NIESPRAWDZONA, a nie spełniona.
    "connection.power_limit_missing": ReadinessCodeSpec(
        code="connection.power_limit_missing",
        area=ReadinessArea.SOURCES,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak mocy przyłączeniowej z warunków OSD — uzupełnij, by ocenić moc "
            "w punkcie przyłączenia"
        ),
        fix_navigation={
            "panel": "projekt",
            "tab": "przylaczenie",
            "focus": "moc_przylaczeniowa_mw",
        },
    ),
    "connection.cos_phi_required_missing": ReadinessCodeSpec(
        code="connection.cos_phi_required_missing",
        area=ReadinessArea.SOURCES,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak wymaganego cosφ z warunków OSD — uzupełnij, by ocenić współczynnik "
            "mocy w punkcie przyłączenia"
        ),
        fix_navigation={
            "panel": "projekt",
            "tab": "przylaczenie",
            "focus": "wymagany_cos_phi",
        },
    ),
    "connection.power_flow_missing": ReadinessCodeSpec(
        code="connection.power_flow_missing",
        area=ReadinessArea.SOURCES,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak zbieżnego biegu rozpływu — uruchom analizę rozpływu mocy, by ocenić "
            "warunki przyłączenia"
        ),
        fix_navigation={"panel": "analizy", "tab": "rozplyw"},
    ),
    # Wytrzymałość zwarciowa przewodu (karta F-K1, IEC 60949). Kryterium wymaga TRZECH
    # danych z trzech różnych etapów projektu: prądu cieplnego (bieg zwarciowy), czasu
    # wyłączenia (analiza zabezpieczeń) i wytrzymałości żyły (katalog). Brak którejkolwiek
    # oznacza, że przekrój jest NIESPRAWDZONY — stan, którego nie wolno mylić ze
    # spełnieniem kryterium.
    "conductor.fault_current_missing": ReadinessCodeSpec(
        code="conductor.fault_current_missing",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak prądu cieplnego z biegu SC — uruchom analizę zwarciową, by sprawdzić "
            "wytrzymałość zwarciową przekroju"
        ),
        fix_navigation={"panel": "analizy", "tab": "zwarciowa"},
    ),
    "conductor.fault_duration_missing": ReadinessCodeSpec(
        code="conductor.fault_duration_missing",
        area=ReadinessArea.PROTECTION,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak czasu wyłączenia zabezpieczenia — bez niego nie da się sprawdzić, "
            "czy przekrój wytrzyma zwarcie"
        ),
        fix_navigation={"panel": "analizy", "tab": "zabezpieczenia"},
    ),
    "conductor.thermal_data_missing": ReadinessCodeSpec(
        code="conductor.thermal_data_missing",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak wytrzymałości cieplnej przewodu w katalogu (Ith/Jth dla 1 s) — "
            "uzupełnij pozycję katalogową"
        ),
        fix_navigation={"panel": "katalog", "tab": "kable", "focus": "ith_1s_a"},
    ),
    # Kryteria WYPOSAŻENIA stacji (karta KD-3, dług §7.4 „zdolności bez dostawcy").
    # Cztery rachunki wróciły z warstwy prezentacji do solverów; każdy brak danej
    # kończy się TYM kodem, nigdy wartością zastępczą — inaczej werdykt doboru
    # przekładnika lub kabla byłby oparty na liczbie, której nikt nie podał.
    "ct.secondary_circuit_missing": ReadinessCodeSpec(
        code="ct.secondary_circuit_missing",
        area=ReadinessArea.PROTECTION,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak danych obwodu wtórnego przekładnika prądowego (długość, przekrój) — "
            "uzupełnij, by policzyć bilans mocy wtórnej"
        ),
        fix_navigation={"panel": "wizard", "tab": "pomiary", "focus": "ct_obwod_wtorny"},
    ),
    "ct.rated_burden_missing": ReadinessCodeSpec(
        code="ct.rated_burden_missing",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak mocy znamionowej przekładnika prądowego w katalogu — "
            "uzupełnij pozycję katalogową"
        ),
        fix_navigation={"panel": "katalog", "tab": "ct", "focus": "burden_va"},
    ),
    "ct.accuracy_limit_missing": ReadinessCodeSpec(
        code="ct.accuracy_limit_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Klasa przekładnika prądowego nie niesie współczynnika granicznego (rdzeń "
            "pomiarowy albo klasa nierozpoznana) — kryterium nasycenia nie ma zastosowania"
        ),
        fix_navigation={"panel": "katalog", "tab": "ct", "focus": "accuracy_class"},
    ),
    "ct.winding_resistance_missing": ReadinessCodeSpec(
        code="ct.winding_resistance_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak rezystancji uzwojenia wtórnego przekładnika — współczynnik graniczny "
            "policzono wariantem uproszczonym (wynik optymistyczny)"
        ),
        fix_navigation={"panel": "katalog", "tab": "ct", "focus": "rct_ohm"},
    ),
    "ct.required_alf_missing": ReadinessCodeSpec(
        code="ct.required_alf_missing",
        area=ReadinessArea.PROTECTION,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak wymaganego współczynnika granicznego z funkcji zabezpieczeniowych pola — "
            "bez niego kryterium nasycenia nie ma odniesienia"
        ),
        fix_navigation={"panel": "analizy", "tab": "zabezpieczenia"},
    ),
    "vt.secondary_circuit_missing": ReadinessCodeSpec(
        code="vt.secondary_circuit_missing",
        area=ReadinessArea.PROTECTION,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak danych obwodu wtórnego przekładnika napięciowego (długość, przekrój) — "
            "uzupełnij, by policzyć zmianę napięcia obwodu"
        ),
        fix_navigation={"panel": "wizard", "tab": "pomiary", "focus": "vt_obwod_wtorny"},
    ),
    "vt.rated_burden_missing": ReadinessCodeSpec(
        code="vt.rated_burden_missing",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak mocy znamionowej uzwojenia przekładnika napięciowego w katalogu — "
            "uzupełnij pozycję katalogową"
        ),
        fix_navigation={"panel": "katalog", "tab": "vt", "focus": "burden_va"},
    ),
    "vt.winding_category_missing": ReadinessCodeSpec(
        code="vt.winding_category_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Nierozpoznana klasa uzwojenia przekładnika napięciowego — bez kategorii "
            "(pomiarowe/zabezpieczeniowe) nie ma limitu zmiany napięcia"
        ),
        fix_navigation={"panel": "katalog", "tab": "vt", "focus": "accuracy_class"},
    ),
    "cable.insulation_data_missing": ReadinessCodeSpec(
        code="cable.insulation_data_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak typu izolacji lub temperatury znamionowej kabla w katalogu — "
            "bez nich nie da się ocenić starzenia izolacji"
        ),
        fix_navigation={"panel": "katalog", "tab": "kable", "focus": "insulation_type"},
    ),
    "cable.operating_temperature_missing": ReadinessCodeSpec(
        code="cable.operating_temperature_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak temperatury pracy żyły — podaj ją, by ocenić względne starzenie izolacji"
        ),
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "temperatura_pracy_c"},
    ),
    "transformer.loss_data_missing": ReadinessCodeSpec(
        code="transformer.loss_data_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak strat jałowych lub obciążeniowych transformatora w katalogu — "
            "uzupełnij pozycję katalogową"
        ),
        fix_navigation={"panel": "katalog", "tab": "transformatory", "focus": "p0_kw"},
    ),
    # Karta FAB-D2 (D2) — konsument RÓŻNY od `transformer.loss_data_missing`
    # powyżej (tamten karmi analizę ekonomiczną β_opt, p0+pk; ten — budowniczy
    # wejścia solvera rozpływu, `solver_input/builder.py`): brak i0_percent
    # LUB p0_kw => gałąź magnesująca transformatora NIEUWZGLĘDNIONA w
    # rozpływie (zapisane jawnie w śladzie White Box), nie BLOCKER — IEC 60909
    # (zwarcia) jej nie potrzebuje, traci wyłącznie dokładność strat jałowych.
    "transformer.no_load_params_missing": ReadinessCodeSpec(
        code="transformer.no_load_params_missing",
        area=ReadinessArea.CATALOGS,
        priority=4,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak prądu jałowego (I0) lub strat jałowych (P0) transformatora — "
            "gałąź magnesująca nie jest uwzględniona w rozpływie mocy"
        ),
        fix_navigation={"panel": "katalog", "tab": "transformatory", "focus": "i0_percent"},
    ),
    # Grupa połączeń nieznana => BLOCKER dla analiz doziemnych/niesymetrycznych
    # (składowa zerowa zależy JAKOŚCIOWO od układu połączeń, nie tylko
    # ilościowo) — nigdy nie zgadywana jako "Dyn11" w materializacji.
    "transformer.vector_group_missing": ReadinessCodeSpec(
        code="transformer.vector_group_missing",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Grupa połączeń transformatora nieznana — analizy doziemne/niesymetryczne "
            "(składowa zerowa) nie mogą wyznaczyć układu bez tej danej"
        ),
        fix_navigation={"panel": "katalog", "tab": "transformatory", "focus": "vector_group"},
    ),
    "transformer.loading_factor_missing": ReadinessCodeSpec(
        code="transformer.loading_factor_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak współczynnika obciążenia transformatora — bez niego nie da się policzyć "
            "strat w punkcie pracy"
        ),
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "beta"},
    ),
    # Powiązanie katalogu kanonicznego z biblioteką krzywych (karta KD-3, poz. 9).
    "protection.curve_library_missing": ReadinessCodeSpec(
        code="protection.curve_library_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Ta pozycja katalogowa zabezpieczenia nie ma odpowiednika w bibliotece "
            "charakterystyk czasowo-prądowych — koordynacja wymaga wyrobu z biblioteki"
        ),
        fix_navigation={"panel": "katalog", "tab": "zabezpieczenia"},
    ),
    "protection.curve_library_ref_broken": ReadinessCodeSpec(
        code="protection.curve_library_ref_broken",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Powiązanie pozycji katalogowej z biblioteką charakterystyk wskazuje wpis, "
            "którego w bibliotece nie ma — dane katalogu wymagają poprawy"
        ),
        fix_navigation={"panel": "katalog", "tab": "zabezpieczenia"},
    ),
    # Earthing / Ground fault (EARTHING-1: most SC_1F -> napięcia dotykowe/krokowe)
    "earthing.electrode_data_missing": ReadinessCodeSpec(
        code="earthing.electrode_data_missing",
        area=ReadinessArea.STATIONS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl="Brak danych uziomu (Z_E, r) — uzupełnij, by policzyć napięcia dotykowe/krokowe",
        fix_navigation={
            "panel": "inspector",
            "tab": "uziemienie",
            "focus": "earth_electrode",
        },
    ),
    # Study Case / Analysis
    "study_case.missing_base_snapshot": ReadinessCodeSpec(
        code="study_case.missing_base_snapshot",
        area=ReadinessArea.ANALYSIS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Przypadek obliczeniowy nie ma bazowego zrzutu stanu",
        fix_navigation={"panel": "case_manager"},
    ),
    "analysis.blocked_by_readiness": ReadinessCodeSpec(
        code="analysis.blocked_by_readiness",
        area=ReadinessArea.ANALYSIS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Analiza zablokowana przez niezaspokojone wymagania gotowości",
        fix_navigation={"panel": "readiness"},
    ),
    # Lokalizacja zwarcia scenariusza NA GAŁĘZI (BRANCH/BRANCH_POINT) — adapter
    # obliczeniowy dziś liczy zwarcie WYŁĄCZNIE dla POJEDYNCZEGO węzła grafu; punkt
    # pośredni na gałęzi wymagałby rozdzielenia jej na dwie impedancje w miejscu
    # zwarcia (assembler), którego solver FROZEN nie ma (karta C6-PERSIST). Jeden
    # kod dla OBU typów lokalizacji gałęziowej — to ta sama klasa ograniczenia
    # bindingu, nie dwa niezależne warunki.
    "fault.location_on_branch_requires_assembler": ReadinessCodeSpec(
        code="fault.location_on_branch_requires_assembler",
        area=ReadinessArea.ANALYSIS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Zwarcie w punkcie na gałęzi wymaga rozdzielenia modelu w miejscu zwarcia "
            "(adapter obliczeniowy) — nieobsługiwane; wybierz lokalizację na węźle"
        ),
        fix_navigation={"panel": "analizy", "tab": "zwarciowa"},
    ),
    # Werdykt projektowy (karta F-K3) — powody braku oceny kryterium. Trzeci stan
    # („niesprawdzone") musi nieść PRZYCZYNĘ, inaczej jest nie do odróżnienia od
    # spełnienia kryterium.
    "verdict.run_missing": ReadinessCodeSpec(
        code="verdict.run_missing",
        area=ReadinessArea.ANALYSIS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Brak zakończonego biegu wymaganego przez kryterium — uruchom obliczenia, "
            "by je ocenić"
        ),
        fix_navigation={"panel": "analizy"},
    ),
    "verdict.run_stale": ReadinessCodeSpec(
        code="verdict.run_stale",
        area=ReadinessArea.ANALYSIS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Model zmienił się po biegu — wynik nie opisuje bieżącego modelu; "
            "uruchom obliczenia ponownie"
        ),
        fix_navigation={"panel": "analizy"},
    ),
    "verdict.run_failed": ReadinessCodeSpec(
        code="verdict.run_failed",
        area=ReadinessArea.ANALYSIS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl="Bieg zakończył się błędem — kryterium nie ma na czym się oprzeć",
        fix_navigation={"panel": "analizy"},
    ),
    "verdict.input_data_missing": ReadinessCodeSpec(
        code="verdict.input_data_missing",
        area=ReadinessArea.ANALYSIS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl="Brak danych wejściowych kryterium — uzupełnij dane wskazane w pozycji werdyktu",
        fix_navigation={"panel": "gotowosc"},
    ),
    # Badanie doboru zaczepów (OLTC §17) — powody, dla których kryterium
    # dopuszczalności pozycji NIE DA SIĘ zbudować z danych. Bez kryterium badanie
    # nie wskazuje pozycji: pasma akceptacji nie wolno zastąpić żadną wartością
    # domyślną (zakaz heurystyk w solverach).
    "oltc.deadband_missing": ReadinessCodeSpec(
        code="oltc.deadband_missing",
        area=ReadinessArea.ANALYSIS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Przełącznik zaczepów nie ma pasma nieczułości regulatora — bez niego nie "
            "wiadomo, jaka odchyłka napięcia jest jeszcze dopuszczalna"
        ),
        fix_navigation={"panel": "inspector", "tab": "regulacja", "focus": "deadband_kv"},
    ),
    "oltc.target_voltage_missing": ReadinessCodeSpec(
        code="oltc.target_voltage_missing",
        area=ReadinessArea.ANALYSIS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl=(
            "Badanie doboru zaczepów nie ma napięcia docelowego — podaj napięcie, "
            "które ma być utrzymywane na szynie regulowanej"
        ),
        fix_navigation={"panel": "analizy", "tab": "oltc", "focus": "napiecie_cel"},
    ),
    # Catalog gate — input validation (NOT readiness, blocks operation execution)
    "catalog.ref_required": ReadinessCodeSpec(
        code="catalog.ref_required",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Segment lub transformator wymaga referencji katalogowej przed utworzeniem",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    # Import — mandatory catalog mapping
    "import.catalog_mapping_required": ReadinessCodeSpec(
        code="import.catalog_mapping_required",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Import wymaga mapowania katalogowego: elementy bez przypisanego katalogu "
            "muszą zostać zmapowane przed dalszą edycją"
        ),
        fix_navigation={"panel": "catalog_mapper", "modal": "IMPORT_CATALOG_MAPPING"},
    ),
    # Phase 8 — Extended validation codes for catalog materialization
    "catalog.binding_version_missing": ReadinessCodeSpec(
        code="catalog.binding_version_missing",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Brak wersji katalogu w wiązaniu elementu obliczeniowego",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    "catalog.binding_missing": ReadinessCodeSpec(
        code="catalog.binding_missing",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Element obliczeniowy nie ma przypisanego katalogu",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    "catalog.materialization_failed": ReadinessCodeSpec(
        code="catalog.materialization_failed",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Materializacja parametrów z katalogu nie powiodła się",
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    # ------------------------------------------------------------------
    # BRAMY KATALOGOWE — kody odrzucenia operacji (karta W4, dług V12K-317)
    # ------------------------------------------------------------------
    # Rejestr znał CZTERY kody przestrzeni `catalog.`, a bramy katalogowe
    # (`api/domain_ops_policy.py`, `api/enm.py`, `enm/domain_operations*.py`,
    # `network_model/catalog/materialization.py`) emitują ich SIEDEMNAŚCIE
    # więcej. Kod bez wpisu dociera do projektanta jako gołe `catalog.<coś>`:
    # bez zdania po polsku i bez wskazania, gdzie to naprawić. Najcięższy
    # przypadek to `catalog.item_not_found` — po ujednoliceniu parytetu torów
    # (V12K-307/315/316) JEDYNY kod złej referencji katalogowej, więc projektant
    # widział go najczęściej i rozumiał najmniej.
    #
    # Treść każdego wpisu pochodzi Z MIEJSCA EMISJI (komunikat bramy), nie z
    # podobieństwa nazwy — dopasowanie „po nazwie" fabrykowałoby treść
    # normatywną (ta sama zasada, co w `domain/readiness_bridge.py`).
    # Kompletność przypina test klasy `tests/domain/test_rejestr_kodow_bram_katalogowych.py`
    # (skan AST kodu bram), więc nowy kod bramy bez wpisu zapala regresję.
    "catalog.item_not_found": ReadinessCodeSpec(
        code="catalog.item_not_found",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Wskazana pozycja katalogowa nie istnieje w katalogu — wskaż pozycję "
            "istniejącą albo uzupełnij rekord katalogowy; operacja nie przyjmie "
            "tabliczki z formularza"
        ),
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    "catalog.ref_missing": ReadinessCodeSpec(
        code="catalog.ref_missing",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Element nie ma wskazanej referencji katalogowej",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    "catalog.item_missing": ReadinessCodeSpec(
        code="catalog.item_missing",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Przypisanie katalogu nie wskazało pozycji katalogowej",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    "catalog.item_id_missing": ReadinessCodeSpec(
        code="catalog.item_id_missing",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Brak identyfikatora rekordu katalogu w wiązaniu elementu",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    "catalog.binding_required": ReadinessCodeSpec(
        code="catalog.binding_required",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Element techniczny wymaga wiązania z katalogiem",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    "catalog.binding_invalid": ReadinessCodeSpec(
        code="catalog.binding_invalid",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Wiązanie katalogowe ma niewłaściwą postać albo nie niesie "
            "identyfikatora pozycji katalogowej"
        ),
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    "catalog.namespace_missing": ReadinessCodeSpec(
        code="catalog.namespace_missing",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Brak kategorii katalogu w wiązaniu elementu",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    "catalog.namespace_required": ReadinessCodeSpec(
        code="catalog.namespace_required",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Nie da się ustalić kategorii katalogu dla elementu — bez kategorii nie ma "
            "czego sprawdzić w katalogu, więc element nie może deklarować pochodzenia "
            "katalogowego"
        ),
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    "catalog.unknown_namespace": ReadinessCodeSpec(
        code="catalog.unknown_namespace",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Nieznana kategoria katalogu — brama nie dobiera kategorii za projektanta; "
            "wskaż kategorię, która istnieje w katalogu"
        ),
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    "catalog.namespace_mismatch": ReadinessCodeSpec(
        code="catalog.namespace_mismatch",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Kategoria katalogu nie pasuje do rodzaju elementu — wskaż pozycję "
            "właściwej kategorii"
        ),
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    "catalog.element_missing": ReadinessCodeSpec(
        code="catalog.element_missing",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Przypisanie katalogu nie wskazało elementu modelu",
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    "catalog.element_not_found": ReadinessCodeSpec(
        code="catalog.element_not_found",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Element wskazany do przypisania katalogu nie istnieje w modelu",
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    "catalog.clear_forbidden": ReadinessCodeSpec(
        code="catalog.clear_forbidden",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Element techniczny nie może istnieć bez przypięcia katalogowego — zamiast "
            "czyścić wiązanie wskaż pozycję zastępczą"
        ),
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    "catalog.materialization_required": ReadinessCodeSpec(
        code="catalog.materialization_required",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Wiązanie wyłącza materializację, a element techniczny musi brać parametry "
            "z katalogu"
        ),
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    "catalog.materialization_incomplete": ReadinessCodeSpec(
        code="catalog.materialization_incomplete",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Materializacja katalogu nie dała wszystkich parametrów wymaganych przez "
            "solver — uzupełnij rekord katalogowy albo wskaż pozycję kompletną"
        ),
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    "catalog.nameplate_mismatch": ReadinessCodeSpec(
        code="catalog.nameplate_mismatch",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Dane tabliczki z formularza przeczą pozycji katalogowej — liczby pochodzą "
            "z katalogu, więc wybierz pozycję o właściwych parametrach"
        ),
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "CatalogPicker",
        },
    ),
    "catalog.gate_result_mismatch": ReadinessCodeSpec(
        code="catalog.gate_result_mismatch",
        area=ReadinessArea.CATALOGS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Model zapisałby dla wskazanej pozycji katalogowej inne wartości niż "
            "zmaterializowane przez bramę katalogową — operacja odrzucona, model bez zmian"
        ),
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    # OZE — PV/BESS transformer rule
    "oze.pv_no_transformer": ReadinessCodeSpec(
        code="oze.pv_no_transformer",
        area=ReadinessArea.GENERATORS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Źródło PV nie ma transformatora w ścieżce zasilania (zakaz przyłączenia do SN bez transformatora)",
        fix_navigation={
            "panel": "inspector",
            "tab": "transformator",
            "modal": "MODAL_WSTAW_STACJE_SN_NN_WARIANT_2",
        },
    ),
    "oze.bess_no_transformer": ReadinessCodeSpec(
        code="oze.bess_no_transformer",
        area=ReadinessArea.GENERATORS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Źródło BESS nie ma transformatora w ścieżce zasilania (zakaz przyłączenia do SN bez transformatora)",
        fix_navigation={
            "panel": "inspector",
            "tab": "transformator",
            "modal": "MODAL_WSTAW_STACJE_SN_NN_WARIANT_2",
        },
    ),
    # Apparatus (aparaty łączeniowe)
    "apparatus.sn_catalog_missing": ReadinessCodeSpec(
        code="apparatus.sn_catalog_missing",
        area=ReadinessArea.STATIONS,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Aparat SN nie ma przypisanego katalogu",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    "apparatus.nn_catalog_missing": ReadinessCodeSpec(
        code="apparatus.nn_catalog_missing",
        area=ReadinessArea.STATIONS,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Aparat nN nie ma przypisanego katalogu",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    # Load
    "load.catalog_missing": ReadinessCodeSpec(
        code="load.catalog_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl="Obciążenie nie ma przypisanego katalogu",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    "load.power_zero": ReadinessCodeSpec(
        code="load.power_zero",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl="Moc czynna obciążenia wynosi 0 kW",
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "p_kw"},
    ),
    # LV cable
    "nn.cable_catalog_missing": ReadinessCodeSpec(
        code="nn.cable_catalog_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl="Kabel nN nie ma przypisanego katalogu",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    # ------------------------------------------------------------------
    # Zrodla nN (karta F-K6, V12K-206). Te kody istnialy DO TEJ PORY WYLACZNIE
    # w tablicy frontu (`ui/engineering-readiness/nnSourceReadinessCodes.ts`),
    # ktora nie miala ANI emitera w backendzie, ANI konsumenta produkcyjnego
    # (uzywaly jej tylko testy struktury). Front nie moze miec wlasnego rejestru
    # gotowosci, bo tylko backend zna stan modelu — dlatego tresc inzynierska
    # zostala przeniesiona TUTAJ, do jedynego kanonu, a tablica frontu usunieta.
    # Kody sa na razie ZAREZERWOWANE (brak emitera w walidatorze ENM); rejestr
    # rezerwacji z powodem trzyma `domain/readiness_bridge.py`, a guard
    # `readiness_consumption_guard.py` pilnuje, by rezerwacja nie byla cicha.
    # ------------------------------------------------------------------
    "nn.source.field_missing": ReadinessCodeSpec(
        code="nn.source.field_missing",
        area=ReadinessArea.SOURCES,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Zrodlo nN nie jest przypiete do pola zrodlowego",
        fix_navigation={"panel": "inspector", "tab": "pole", "focus": "field_ref"},
    ),
    "nn.source.switch_missing": ReadinessCodeSpec(
        code="nn.source.switch_missing",
        area=ReadinessArea.SOURCES,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Pole zrodlowe nN nie posiada aparatu laczeniowego",
        fix_navigation={"panel": "inspector", "tab": "pole", "focus": "switch_kind"},
    ),
    "nn.source.catalog_missing": ReadinessCodeSpec(
        code="nn.source.catalog_missing",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Zrodlo nN nie ma przypisanego katalogu urzadzenia",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    "nn.source.parameters_missing": ReadinessCodeSpec(
        code="nn.source.parameters_missing",
        area=ReadinessArea.SOURCES,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Zrodlo nN nie ma wymaganych parametrow elektrycznych",
        fix_navigation={
            "panel": "inspector",
            "tab": "parametry",
            "focus": "rated_power",
        },
    ),
    "nn.voltage_missing": ReadinessCodeSpec(
        code="nn.voltage_missing",
        area=ReadinessArea.STATIONS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Napiecie szyny nN nie jest okreslone",
        fix_navigation={
            "panel": "inspector",
            "tab": "parametry",
            "focus": "voltage_nn_kv",
        },
    ),
    "pv.control_mode_missing": ReadinessCodeSpec(
        code="pv.control_mode_missing",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Falownik PV nie ma okreslonego trybu regulacji",
        fix_navigation={
            "panel": "inspector",
            "tab": "regulacja",
            "focus": "control_mode",
        },
    ),
    "bess.energy_module_missing": ReadinessCodeSpec(
        code="bess.energy_module_missing",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Falownik BESS nie ma przypisanego modulu magazynu energii",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    "bess.soc_limits_invalid": ReadinessCodeSpec(
        code="bess.soc_limits_invalid",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl=(
            "Ograniczenia SOC magazynu BESS sa nieprawidlowe "
            "(min >= max albo poza zakresem 0-100%)"
        ),
        fix_navigation={
            "panel": "inspector",
            "tab": "parametry",
            "focus": "soc_min_percent",
        },
    ),
    "ups.backup_time_invalid": ReadinessCodeSpec(
        code="ups.backup_time_invalid",
        area=ReadinessArea.GENERATORS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Czas podtrzymania UPS jest nieprawidlowy (musi byc > 0)",
        fix_navigation={
            "panel": "inspector",
            "tab": "parametry",
            "focus": "backup_time_min",
        },
    ),
    "nn.switch.catalog_ref_missing": ReadinessCodeSpec(
        code="nn.switch.catalog_ref_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl="Aparat laczeniowy pola nN nie ma przypisanego katalogu",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "MODAL_ZMIEN_TYP_Z_KATALOGU",
        },
    ),
    "nn.measurement.required_missing": ReadinessCodeSpec(
        code="nn.measurement.required_missing",
        area=ReadinessArea.SOURCES,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl="Zrodlo nN nie ma przypisanego punktu pomiaru energii",
        fix_navigation={
            "panel": "inspector",
            "tab": "pomiary",
            "focus": "measurement_point",
        },
    ),
    "genset.fuel_type_missing": ReadinessCodeSpec(
        code="genset.fuel_type_missing",
        area=ReadinessArea.GENERATORS,
        priority=4,
        level=ReadinessLevel.INFO,
        message_pl="Agregat nie ma okreslonego rodzaju paliwa",
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "fuel_type"},
    ),
}


def get_blockers_for_analysis(analysis_type: str) -> tuple[str, ...]:
    """Return readiness code keys that block a specific analysis type."""
    area_map = {
        "SC_3F": {
            ReadinessArea.TOPOLOGY,
            ReadinessArea.SOURCES,
            ReadinessArea.CATALOGS,
        },
        "SC_2F": {
            ReadinessArea.TOPOLOGY,
            ReadinessArea.SOURCES,
            ReadinessArea.CATALOGS,
        },
        "SC_1F": {
            ReadinessArea.TOPOLOGY,
            ReadinessArea.SOURCES,
            ReadinessArea.CATALOGS,
        },
        "LOAD_FLOW": {
            ReadinessArea.TOPOLOGY,
            ReadinessArea.SOURCES,
            ReadinessArea.CATALOGS,
            ReadinessArea.GENERATORS,
        },
        "PROTECTION": {
            ReadinessArea.TOPOLOGY,
            ReadinessArea.SOURCES,
            ReadinessArea.CATALOGS,
            ReadinessArea.PROTECTION,
        },
    }
    required_areas = area_map.get(analysis_type, set())
    return tuple(
        code
        for code, spec in READINESS_CODES.items()
        if spec.level == ReadinessLevel.BLOCKER and spec.area in required_areas
    )


# ============================================================
# 4. RESPONSE CONTRACT
# ============================================================


@dataclass(frozen=True)
class OperationResponseContract:
    """Canonical response contract for ALL domain operations.

    Every operation MUST return this structure.
    """

    snapshot: Mapping[str, object]  # New ENM snapshot (immutable)
    logical_views: dict[str, Any]  # Deterministic projections
    readiness: dict[str, Any]  # Readiness codes with priorities
    fix_actions: list[dict[str, Any]]  # Fix action list
    changes: dict[str, list[str]]  # created/updated/deleted element IDs
    selection_hint: dict[str, Any] | None  # What to select after operation
    audit_trail: list[str]  # Human-readable audit log
    domain_events: list[dict[str, Any]]  # Machine-readable events
    materialized_params: dict[str, Any]  # Catalog-resolved parameters
    layout: dict[str, Any]  # layout_hash + render data


# ============================================================
# 5. TRUNK CONTRACT (for SN operations)
# ============================================================


class CutMode(enum.Enum):
    FRACTION = "FRACTION"
    DISTANCE_M = "DISTANCE_M"
    WORLD_POINT = "WORLD_POINT"


class CutThresholdPolicy(enum.Enum):
    PRZYKLEJ_DO_WEZLA = "PRZYKLEJ_DO_WEZLA"
    ODRZUC_Z_BLEDEM = "ODRZUC_Z_BLEDEM"


class CutPortPolicy(enum.Enum):
    PRZYKLEJ_DO_PORTU = "PRZYKLEJ_DO_PORTU"
    PRZYKLEJ_DO_WEZLA = "PRZYKLEJ_DO_WEZLA"


class TieBreaker(enum.Enum):
    SORTUJ_PO_ELEMENT_ID_NASTEPNIE_PO_PORT_ID = "SORTUJ_PO_ELEMENT_ID_NASTEPNIE_PO_PORT_ID"


class EmbeddingContinuity(enum.Enum):
    CIAGLOSC_IN_OUT = "CIAGLOSC_IN_OUT"
    ODNOGA = "ODNOGA"


@dataclass(frozen=True)
class CutResolutionPolicy:
    snap_to_existing_node_threshold_m: float
    if_within_threshold: CutThresholdPolicy
    if_hits_port_exactly: CutPortPolicy
    deterministic_tie_breaker: TieBreaker


@dataclass(frozen=True)
class SegmentTarget:
    segment_id: str
    segment_length: dict[str, Any]  # {value, unit:"m"}
    cut: dict[str, Any]  # {mode, fraction_0_1 | distance_m | world_point}
    cut_resolution_policy: CutResolutionPolicy


@dataclass(frozen=True)
class TrunkRef:
    trunk_id: str
    terminal_id: str
    segment_order_index_expected: int | None = None


@dataclass(frozen=True)
class EmbeddingIntent:
    continuity: EmbeddingContinuity
    branch_ports_allowed: bool = False


# ============================================================
# 6. VALIDATION HELPERS
# ============================================================


def validate_operation_payload(op_name: str, payload: dict[str, Any]) -> list[str]:
    """Validate that payload contains all required fields for the operation."""
    resolved = resolve_operation_name(op_name)
    spec = CANONICAL_OPERATIONS.get(resolved)
    if spec is None:
        return [f"Nieznana operacja: {op_name}"]
    errors = []
    alias_map = REQUIRED_FIELD_ALIASES.get(resolved, {})
    for field_name in spec.required_fields:
        if field_name in payload and payload[field_name] is not None:
            continue

        aliases = alias_map.get(field_name, ())
        if any(alias in payload and payload[alias] is not None for alias in aliases):
            continue

        if aliases:
            errors.append(
                f"Brak wymaganego pola: {field_name} (alias kompatybilnosci: {', '.join(aliases)})"
            )
        else:
            errors.append(f"Brak wymaganego pola: {field_name}")
    return errors
