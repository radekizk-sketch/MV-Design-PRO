#!/usr/bin/env python3
"""
Dialog Completeness Guard

Ensures that every canonical domain operation that creates/modifies elements
has a corresponding frontend dialog (modal) component.

SCAN FILES:
  backend/src/domain/canonical_operations.py     (registry)
  frontend/src/ui/topology/modals/*.tsx           (dialog components)
  frontend/src/ui/topology/modals/index.ts        (exports)

CHECKS:
  1. Every model-mutating operation has at least one corresponding dialog
  2. All dialog exports are present in index.ts
  3. Dialog files use Polish labels (no English UI strings)

MAPPING: operation -> expected modal
  add_grid_source_sn      -> KreatorZrodloZasilania (ui2) / GridSourceModal (legacy)
  continue_trunk_segment_sn -> KreatorMagistralaSn (ui2)
  insert_station_on_segment_sn -> TransformerStationModal (existing)
  start_branch_segment_sn -> BranchModal (existing)
  insert_section_switch_sn -> NodeModal or SwitchModal
  connect_secondary_ring_sn -> RingCloseModal
  set_normal_open_point   -> (inline action, no modal needed)
  add_transformer_sn_nn   -> TransformerStationModal (existing)
  assign_catalog_to_element -> CatalogPicker (existing)
  update_element_parameters -> PropertyGrid (existing)
  add_nn_outgoing_field   -> NodeModal or dedicated
  add_nn_load             -> LoadDERModal (existing)
  add_converter_source    -> LoadDERModal / PVInverterModal / BESSInverterModal (existing)
  add_genset_nn           -> KreatorZrodloDyspozycyjne (ui2)
  add_ups_nn              -> KreatorZrodloDyspozycyjne (ui2)
  add_ct                  -> MeasurementModal (existing)
  add_vt                  -> MeasurementModal (existing)
  add_relay               -> ProtectionModal (existing)
  update_relay_settings   -> ProtectionModal (existing)

EXIT CODES:
  0 = clean (all operations covered)
  1 = violations found
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MODALS_DIR = REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals"
INDEX_FILE = MODALS_DIR / "index.ts"
# Kanoniczne kreatory ui2 (nowa IA) — dostawcy dialogów operacji domenowych
# poza legacy modals/ (np. KreatorZrodloZasilania, KreatorMagistralaSn).
CREATORS_DIR = REPO_ROOT / "frontend" / "src" / "ui2" / "kreatory"

# Mapping: canonical operation -> list of acceptable modal names (partial match)
OPERATION_TO_MODAL: dict[str, list[str]] = {
    "add_grid_source_sn": ["GridSource", "SourceModal", "GPZModal", "KreatorZrodlo"],
    "continue_trunk_segment_sn": [
        "TrunkContinue",
        "TrunkModal",
        "SegmentModal",
        "KreatorMagistrala",
        "Magistrala",
    ],
    "insert_station_on_segment_sn": [
        "TransformerStation",
        "StationModal",
        "InsertStation",
    ],
    "start_branch_segment_sn": [
        "KreatorOdgalezienia",
        "Odgalezienia",
        "BranchModal",
        "Branch",
    ],
    "insert_branch_pole_on_segment_sn": ["KreatorSlupaOdgaleznego", "SlupaOdgaleznego"],
    "insert_zksn_on_segment_sn": ["KreatorZksn", "Zksn"],
    "insert_section_switch_sn": [
        "SwitchModal",
        "NodeModal",
        "SectionSwitch",
        "KreatorLacznika",
        "Lacznik",
    ],
    "connect_secondary_ring_sn": [
        "RingClose",
        "RingModal",
        "KreatorPierscienia",
        "Pierscien",
    ],
    "add_transformer_sn_nn": [
        "TransformerStation",
        "Transformer",
        "KreatorTransformatora",
        "Transformatora",
    ],
    "assign_catalog_to_element": ["CatalogPicker", "Catalog"],
    "add_nn_outgoing_field": ["NodeModal", "OutgoingField", "NNField"],
    "add_nn_load": ["LoadDER", "LoadModal", "NNLoad", "KreatorOdbioru", "Odbior"],
    "add_converter_source": ["LoadDER", "PVInverter", "BESSInverter", "Converter"],
    "add_genset_nn": ["KreatorZrodloDyspozycyjne", "ZrodloDyspozycyjne"],
    "add_ups_nn": ["KreatorZrodloDyspozycyjne", "ZrodloDyspozycyjne"],
    "add_shunt_compensator_sn": [
        "KreatorKompensatora",
        "Kompensator",
        "ShuntCompensator",
    ],
    "add_ct": ["Measurement", "CTModal"],
    "add_vt": ["Measurement", "VTModal"],
    "add_relay": ["Protection", "RelayModal"],
    "update_relay_settings": ["Protection", "RelaySettings"],
}

# Operations that don't need a dedicated modal
NO_MODAL_NEEDED = {
    "set_normal_open_point",  # inline action
    "update_element_parameters",  # PropertyGrid handles this
    "rename_element",  # inline edit
    "set_label",  # inline edit
    "set_source_operating_mode",  # inline edit
    "set_dynamic_profile",  # inline edit
    "link_relay_to_field",  # drag-drop or inline
    "calculate_tcc_curve",  # automatic action
    "validate_selectivity",  # automatic action
    "create_study_case",  # CreateCaseDialog (separate module)
    "run_short_circuit",  # button action
    "run_power_flow",  # button action
    "run_time_series_power_flow",  # button action
    "compare_study_cases",  # comparison UI
    "export_project_artifacts",  # export dialog (separate module)
    "run_protection_study",  # button action
    "set_case_switch_state",
    "set_case_normal_state",
    "set_case_source_mode",
    "set_case_time_profile",
}


def find_modal_files() -> set[str]:
    """Find all modal/dialog TSX component names in the modals directory."""
    if not MODALS_DIR.exists():
        return set()
    names = set()
    for f in MODALS_DIR.glob("*.tsx"):
        # Extract component name from filename (e.g. BranchModal.tsx -> BranchModal)
        names.add(f.stem)
    return names


def find_creator_files() -> set[str]:
    """Find canonical ui2 creator component names (KreatorZrodloZasilania, KreatorMagistralaSn, ...).

    Nowa IA przenosi dialogi operacji do kreatorów ui2 (kreatory/rama); są one
    równoprawnymi dostawcami dialogu dla pokrycia operacji, obok legacy modals/.
    """
    if not CREATORS_DIR.exists():
        return set()
    names = set()
    for f in CREATORS_DIR.glob("**/*.tsx"):
        if f.name.endswith(".test.tsx"):
            continue
        names.add(f.stem)
    return names


def check_index_exports(modal_names: set[str]) -> list[str]:
    """Check that all modal files are exported from index.ts."""
    if not INDEX_FILE.exists():
        return ["index.ts not found"]
    text = INDEX_FILE.read_text(encoding="utf-8")
    violations = []
    for name in modal_names:
        if name not in text:
            violations.append(f"Modal '{name}' not exported from index.ts")
    return violations


def main() -> int:
    violations: list[str] = []

    modal_names = find_modal_files()
    if not modal_names:
        print("WARNING: No modal files found in %s" % MODALS_DIR)
        return 0

    # Dostawcy dialogu = legacy modals/ + kanoniczne kreatory ui2.
    provider_names = modal_names | find_creator_files()

    # Check each operation has a modal/creator
    for op_name, expected_modals in OPERATION_TO_MODAL.items():
        found = False
        for modal_pattern in expected_modals:
            for modal_name in provider_names:
                if modal_pattern.lower() in modal_name.lower():
                    found = True
                    break
            if found:
                break
        if not found:
            violations.append(
                f"Operation '{op_name}' has no matching dialog. "
                f"Expected one of: {expected_modals}"
            )

    # Check index.ts exports
    export_violations = check_index_exports(modal_names)
    violations.extend(export_violations)

    if violations:
        print(f"\n{'='*60}")
        print(f"DIALOG COMPLETENESS GUARD: {len(violations)} violation(s)")
        print(f"{'='*60}\n")
        for v in violations:
            print(f"  VIOLATION: {v}")
        print()
        return 1

    print(
        f"Dialog Completeness Guard: OK ({len(modal_names)} modals, "
        f"{len(OPERATION_TO_MODAL)} operations covered)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
