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


# Full registry of ALL 39 canonical operations
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
    # --- Study Case (9 operations) ---
    "create_study_case": OperationSpec(
        canonical_name="create_study_case",
        category=OperationCategory.STUDY_CASE,
        description_pl="Utworzenie nowego przypadku obliczeniowego",
        target_layer="Domain / StudyCase",
        required_fields=("case_name",),
        optional_fields=("config", "description"),
    ),
    "set_case_switch_state": OperationSpec(
        canonical_name="set_case_switch_state",
        category=OperationCategory.STUDY_CASE,
        description_pl="Ustawienie stanu łącznika w kontekście przypadku",
        target_layer="Domain / StudyCase",
        required_fields=("case_id", "switch_ref", "state"),
        creates_elements=False,
    ),
    "set_case_normal_state": OperationSpec(
        canonical_name="set_case_normal_state",
        category=OperationCategory.STUDY_CASE,
        description_pl="Ustawienie stanu normalnego w przypadku",
        target_layer="Domain / StudyCase",
        required_fields=("case_id",),
        creates_elements=False,
    ),
    "set_case_source_mode": OperationSpec(
        canonical_name="set_case_source_mode",
        category=OperationCategory.STUDY_CASE,
        description_pl="Ustawienie trybu pracy źródła w przypadku",
        target_layer="Domain / StudyCase",
        required_fields=("case_id", "source_ref", "mode"),
        creates_elements=False,
    ),
    "set_case_time_profile": OperationSpec(
        canonical_name="set_case_time_profile",
        category=OperationCategory.STUDY_CASE,
        description_pl="Ustawienie profilu czasowego w przypadku",
        target_layer="Domain / StudyCase",
        required_fields=("case_id", "profile"),
        creates_elements=False,
    ),
    "run_short_circuit": OperationSpec(
        canonical_name="run_short_circuit",
        category=OperationCategory.STUDY_CASE,
        description_pl="Uruchomienie obliczeń zwarciowych IEC 60909",
        target_layer="Solver / IEC 60909",
        required_fields=("case_id",),
        optional_fields=("fault_type", "fault_node_ids"),
        mutates_model=False,
        creates_elements=False,
    ),
    "run_power_flow": OperationSpec(
        canonical_name="run_power_flow",
        category=OperationCategory.STUDY_CASE,
        description_pl="Uruchomienie obliczeń rozpływu mocy",
        target_layer="Solver / Power Flow",
        required_fields=("case_id",),
        mutates_model=False,
        creates_elements=False,
    ),
    "run_time_series_power_flow": OperationSpec(
        canonical_name="run_time_series_power_flow",
        category=OperationCategory.STUDY_CASE,
        description_pl="Uruchomienie serii obliczeń rozpływu mocy",
        target_layer="Solver / Power Flow",
        required_fields=("case_id", "time_points"),
        mutates_model=False,
        creates_elements=False,
    ),
    "compare_study_cases": OperationSpec(
        canonical_name="compare_study_cases",
        category=OperationCategory.STUDY_CASE,
        description_pl="Porównanie dwóch przypadków obliczeniowych",
        target_layer="Analysis / Comparison",
        required_fields=("case_a_id", "case_b_id"),
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
    "export_project_artifacts": OperationSpec(
        canonical_name="export_project_artifacts",
        category=OperationCategory.UNIVERSAL,
        description_pl="Eksport pakietu projektu do podpisu",
        target_layer="Application / Export",
        required_fields=("project_id",),
        optional_fields=("include_white_box", "include_comparison"),
        mutates_model=False,
        creates_elements=False,
    ),
    "run_protection_study": OperationSpec(
        canonical_name="run_protection_study",
        category=OperationCategory.PROTECTION,
        description_pl="Uruchomienie analizy ochrony nadprądowej",
        target_layer="Analysis / Protection",
        required_fields=("case_id",),
        mutates_model=False,
        creates_elements=False,
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
    fix_action_id: str | None
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
        fix_action_id="fix_source_voltage",
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
        fix_action_id="fix_source_sk3",
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "sk3_mva"},
    ),
    "source.grid_supply_missing": ReadinessCodeSpec(
        code="source.grid_supply_missing",
        area=ReadinessArea.SOURCES,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Brak źródła zasilania sieciowego (GPZ)",
        fix_action_id="fix_add_source",
        fix_navigation={"panel": "wizard", "modal": "add_grid_source"},
    ),
    "source.connection_missing": ReadinessCodeSpec(
        code="source.connection_missing",
        area=ReadinessArea.SOURCES,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Źródło zasilania nie jest podłączone do szyny",
        fix_action_id="fix_source_connection",
        fix_navigation={"panel": "inspector", "tab": "polaczenia"},
    ),
    # Topology
    "trunk.terminal_missing": ReadinessCodeSpec(
        code="trunk.terminal_missing",
        area=ReadinessArea.TOPOLOGY,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Magistrala nie ma terminala końcowego",
        fix_action_id="fix_trunk_terminal",
        fix_navigation={"panel": "sld"},
    ),
    "trunk.segment_missing": ReadinessCodeSpec(
        code="trunk.segment_missing",
        area=ReadinessArea.TOPOLOGY,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Magistrala nie ma żadnego segmentu",
        fix_action_id="fix_trunk_segment",
        fix_navigation={"panel": "sld"},
    ),
    "trunk.segment_length_missing": ReadinessCodeSpec(
        code="trunk.segment_length_missing",
        area=ReadinessArea.TOPOLOGY,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Odcinek nie ma zdefiniowanej długości",
        fix_action_id="fix_segment_length",
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "length_m"},
    ),
    "trunk.segment_length_invalid": ReadinessCodeSpec(
        code="trunk.segment_length_invalid",
        area=ReadinessArea.TOPOLOGY,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Nieprawidłowa długość odcinka (musi być > 0)",
        fix_action_id="fix_segment_length",
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "length_m"},
    ),
    "trunk.catalog_missing": ReadinessCodeSpec(
        code="trunk.catalog_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Odcinek SN nie ma przypisanego katalogu",
        fix_action_id="fix_line_catalog",
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
        fix_action_id="fix_station_type",
        fix_navigation={"panel": "inspector", "tab": "parametry"},
    ),
    "station.voltage_missing": ReadinessCodeSpec(
        code="station.voltage_missing",
        area=ReadinessArea.STATIONS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Stacja nie ma zdefiniowanego napięcia",
        fix_action_id="fix_station_voltage",
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
        fix_action_id="fix_station_outgoing",
        fix_navigation={"panel": "inspector", "tab": "nn", "modal": "add_nn_outgoing"},
    ),
    "station.required_field_missing": ReadinessCodeSpec(
        code="station.required_field_missing",
        area=ReadinessArea.STATIONS,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Stacja nie ma wymaganego pola SN",
        fix_action_id="fix_station_field",
        fix_navigation={"panel": "inspector", "tab": "pola"},
    ),
    # Transformer
    "transformer.catalog_missing": ReadinessCodeSpec(
        code="transformer.catalog_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Transformator nie ma przypisanego katalogu",
        fix_action_id="fix_transformer_catalog",
        fix_navigation={
            "panel": "inspector",
            "tab": "katalog",
            "modal": "select_catalog",
        },
    ),
    "transformer.connection_missing": ReadinessCodeSpec(
        code="transformer.connection_missing",
        area=ReadinessArea.STATIONS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Transformator nie ma zdefiniowanego połączenia",
        fix_action_id="fix_transformer_connection",
        fix_navigation={"panel": "inspector", "tab": "polaczenia"},
    ),
    # nN
    "nn.bus_missing": ReadinessCodeSpec(
        code="nn.bus_missing",
        area=ReadinessArea.STATIONS,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Stacja wymaga szyny nN",
        fix_action_id="fix_nn_bus",
        fix_navigation={"panel": "inspector", "tab": "nn"},
    ),
    "nn.main_breaker_missing": ReadinessCodeSpec(
        code="nn.main_breaker_missing",
        area=ReadinessArea.STATIONS,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Szyna nN wymaga wyłącznika głównego",
        fix_action_id="fix_nn_breaker",
        fix_navigation={"panel": "inspector", "tab": "nn"},
    ),
    # OZE
    "oze.transformer_required": ReadinessCodeSpec(
        code="oze.transformer_required",
        area=ReadinessArea.GENERATORS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Źródło OZE wymaga transformatora w ścieżce zasilania",
        fix_action_id="fix_oze_transformer",
        fix_navigation={"panel": "inspector", "tab": "transformator"},
    ),
    "oze.nn_bus_required": ReadinessCodeSpec(
        code="oze.nn_bus_required",
        area=ReadinessArea.GENERATORS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Źródło OZE wymaga szyny nN w stacji",
        fix_action_id="fix_oze_nn_bus",
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
        fix_action_id="fix_oze_card_field_acceptance",
        fix_navigation={"panel": "inspector", "tab": "karta_falownika"},
    ),
    # Ring
    "ring.endpoints_missing": ReadinessCodeSpec(
        code="ring.endpoints_missing",
        area=ReadinessArea.TOPOLOGY,
        priority=2,
        level=ReadinessLevel.BLOCKER,
        message_pl="Pierścień nie ma zdefiniowanych punktów końcowych",
        fix_action_id="fix_ring_endpoints",
        fix_navigation={"panel": "sld"},
    ),
    "ring.nop_required": ReadinessCodeSpec(
        code="ring.nop_required",
        area=ReadinessArea.TOPOLOGY,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Pierścień SN wymaga punktu normalnie otwartego (NOP)",
        fix_action_id="fix_ring_nop",
        fix_navigation={"panel": "sld", "modal": "set_normal_open_point"},
    ),
    # Protection
    "protection.ct_required": ReadinessCodeSpec(
        code="protection.ct_required",
        area=ReadinessArea.PROTECTION,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Przekaźnik wymaga przekładnika prądowego (CT)",
        fix_action_id="fix_protection_ct",
        fix_navigation={"panel": "inspector", "tab": "zabezpieczenia"},
    ),
    "protection.vt_required": ReadinessCodeSpec(
        code="protection.vt_required",
        area=ReadinessArea.PROTECTION,
        priority=3,
        level=ReadinessLevel.BLOCKER,
        message_pl="Pole wymaga przekładnika napięciowego (VT)",
        fix_action_id="fix_protection_vt",
        fix_navigation={"panel": "inspector", "tab": "zabezpieczenia"},
    ),
    "protection.settings_incomplete": ReadinessCodeSpec(
        code="protection.settings_incomplete",
        area=ReadinessArea.PROTECTION,
        priority=4,
        level=ReadinessLevel.WARNING,
        message_pl="Nastawy przekaźnika niekompletne",
        fix_action_id="fix_protection_settings",
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
        message_pl=(
            "Brak prądu znamionowego pola — uzupełnij, by wyznaczyć nastawę "
            "rozruchową I> (51)"
        ),
        fix_action_id="fix_protection_nominal_current",
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
        fix_action_id="fix_protection_run_short_circuit",
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
        fix_action_id="fix_connection_power_limit",
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
        fix_action_id="fix_connection_cos_phi",
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
        fix_action_id="fix_connection_run_power_flow",
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
        fix_action_id="fix_conductor_run_short_circuit",
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
        fix_action_id="fix_conductor_fault_duration",
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
        fix_action_id="fix_conductor_thermal_data",
        fix_navigation={"panel": "katalog", "tab": "kable", "focus": "ith_1s_a"},
    ),
    # Earthing / Ground fault (EARTHING-1: most SC_1F -> napięcia dotykowe/krokowe)
    "earthing.electrode_data_missing": ReadinessCodeSpec(
        code="earthing.electrode_data_missing",
        area=ReadinessArea.STATIONS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl="Brak danych uziomu (Z_E, r) — uzupełnij, by policzyć napięcia dotykowe/krokowe",
        fix_action_id="fix_earthing_electrode",
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
        fix_action_id="fix_case_snapshot",
        fix_navigation={"panel": "case_manager"},
    ),
    "analysis.blocked_by_readiness": ReadinessCodeSpec(
        code="analysis.blocked_by_readiness",
        area=ReadinessArea.ANALYSIS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Analiza zablokowana przez niezaspokojone wymagania gotowości",
        fix_action_id=None,
        fix_navigation={"panel": "readiness"},
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
        fix_action_id="fix_verdict_run_analysis",
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
        fix_action_id="fix_verdict_rerun_analysis",
        fix_navigation={"panel": "analizy"},
    ),
    "verdict.run_failed": ReadinessCodeSpec(
        code="verdict.run_failed",
        area=ReadinessArea.ANALYSIS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl="Bieg zakończył się błędem — kryterium nie ma na czym się oprzeć",
        fix_action_id="fix_verdict_rerun_analysis",
        fix_navigation={"panel": "analizy"},
    ),
    "verdict.input_data_missing": ReadinessCodeSpec(
        code="verdict.input_data_missing",
        area=ReadinessArea.ANALYSIS,
        priority=2,
        level=ReadinessLevel.WARNING,
        message_pl="Brak danych wejściowych kryterium — uzupełnij dane wskazane w pozycji werdyktu",
        fix_action_id="fix_verdict_input_data",
        fix_navigation={"panel": "gotowosc"},
    ),
    # Catalog gate — input validation (NOT readiness, blocks operation execution)
    "catalog.ref_required": ReadinessCodeSpec(
        code="catalog.ref_required",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Segment lub transformator wymaga referencji katalogowej przed utworzeniem",
        fix_action_id="fix_catalog_select",
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
        fix_action_id="fix_import_catalog_mapping",
        fix_navigation={"panel": "catalog_mapper", "modal": "IMPORT_CATALOG_MAPPING"},
    ),
    # Phase 8 — Extended validation codes for catalog materialization
    "catalog.binding_version_missing": ReadinessCodeSpec(
        code="catalog.binding_version_missing",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Brak wersji katalogu w wiązaniu elementu obliczeniowego",
        fix_action_id="fix_catalog_version",
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
        fix_action_id="fix_catalog_binding",
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
        fix_action_id="fix_catalog_rematerialize",
        fix_navigation={"panel": "inspector", "tab": "katalog"},
    ),
    # OZE — PV/BESS transformer rule
    "oze.pv_no_transformer": ReadinessCodeSpec(
        code="oze.pv_no_transformer",
        area=ReadinessArea.GENERATORS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Źródło PV nie ma transformatora w ścieżce zasilania (zakaz przyłączenia do SN bez transformatora)",
        fix_action_id="fix_pv_transformer",
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
        fix_action_id="fix_bess_transformer",
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
        fix_action_id="fix_apparatus_sn_catalog",
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
        fix_action_id="fix_apparatus_nn_catalog",
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
        fix_action_id="fix_load_catalog",
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
        fix_action_id="fix_load_power",
        fix_navigation={"panel": "inspector", "tab": "parametry", "focus": "p_kw"},
    ),
    # LV cable
    "nn.cable_catalog_missing": ReadinessCodeSpec(
        code="nn.cable_catalog_missing",
        area=ReadinessArea.CATALOGS,
        priority=3,
        level=ReadinessLevel.WARNING,
        message_pl="Kabel nN nie ma przypisanego katalogu",
        fix_action_id="fix_nn_cable_catalog",
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
        fix_action_id="fix_nn_source_field",
        fix_navigation={"panel": "inspector", "tab": "pole", "focus": "field_ref"},
    ),
    "nn.source.switch_missing": ReadinessCodeSpec(
        code="nn.source.switch_missing",
        area=ReadinessArea.SOURCES,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Pole zrodlowe nN nie posiada aparatu laczeniowego",
        fix_action_id="fix_nn_source_switch",
        fix_navigation={"panel": "inspector", "tab": "pole", "focus": "switch_kind"},
    ),
    "nn.source.catalog_missing": ReadinessCodeSpec(
        code="nn.source.catalog_missing",
        area=ReadinessArea.CATALOGS,
        priority=1,
        level=ReadinessLevel.BLOCKER,
        message_pl="Zrodlo nN nie ma przypisanego katalogu urzadzenia",
        fix_action_id="fix_nn_source_catalog",
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
        fix_action_id="fix_nn_source_parameters",
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
        fix_action_id="fix_nn_bus_voltage",
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
        fix_action_id="fix_pv_control_mode",
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
        fix_action_id="fix_bess_storage_catalog",
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
        fix_action_id="fix_bess_soc_limits",
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
        fix_action_id="fix_ups_backup_time",
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
        fix_action_id="fix_nn_switch_catalog",
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
        fix_action_id="fix_nn_source_measurement",
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
        fix_action_id="fix_genset_fuel_type",
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
    SORTUJ_PO_ELEMENT_ID_NASTEPNIE_PO_PORT_ID = (
        "SORTUJ_PO_ELEMENT_ID_NASTEPNIE_PO_PORT_ID"
    )


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
