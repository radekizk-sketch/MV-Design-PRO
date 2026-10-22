#!/usr/bin/env python3
"""
Dialog Completeness Guard

Ensures that every canonical domain operation that creates/modifies elements
has a corresponding LIVE frontend dialog — a ui2 creator (kreator) component.

SCAN FILES:
  frontend/src/ui2/kreatory/**/*.tsx   (dialog components — kreatory ui2)

CHECKS:
  1. Every model-mutating operation in OPERATION_TO_MODAL names an exact provider
     component that exists as `ui2/kreatory/**/<Komponent>.tsx` (not a test file).
  2. The provider's directory (non-test sources) literally contains the canonical
     operation name — a provider that never sends the operation is not a provider.

Historia: do 2026-10-22 dostawcami były także modale `frontend/src/ui/topology/modals/*.tsx`
(BranchModal, NodeModal, LoadDERModal, MeasurementModal, ProtectionModal, PVInverterModal,
BESSInverterModal, TransformerStationModal, CatalogPicker), dopasowywane fragmentem nazwy.
Żaden z nich nie był montowany (jedynym konsumentem był nierenderowany `TopologyPanel`),
więc strażnik zaliczał operacje `insert_station_on_segment_sn`, `assign_catalog_to_element`,
`add_nn_outgoing_field`, `add_converter_source`, `add_ct`, `add_vt` i `add_relay` na
podstawie martwego kodu. Modale skasowano (karta PODSTAWA-Q, commit 3); każda operacja
wskazuje teraz dokładnie jeden żywy kreator, sprawdzany po pliku i po literale operacji.

EXIT CODES:
  0 = clean (all operations covered)
  1 = violations found
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
# Kanoniczne kreatory ui2 — jedyni dostawcy dialogów operacji domenowych.
CREATORS_DIR = REPO_ROOT / "frontend" / "src" / "ui2" / "kreatory"

# Mapping: canonical operation -> exact provider component(s) (file stem under CREATORS_DIR).
OPERATION_TO_MODAL: dict[str, list[str]] = {
    "add_grid_source_sn": ["KreatorZrodloZasilania"],
    "continue_trunk_segment_sn": ["KreatorMagistralaSn"],
    "insert_station_on_segment_sn": ["KreatorStacjiSnNn"],
    "start_branch_segment_sn": ["KreatorOdgalezienia"],
    "insert_branch_pole_on_segment_sn": ["KreatorSlupaOdgaleznego"],
    "insert_zksn_on_segment_sn": ["KreatorZksn"],
    "insert_section_switch_sn": ["KreatorLacznikaSekcyjnego"],
    "connect_secondary_ring_sn": ["KreatorPierscienia"],
    "add_transformer_sn_nn": ["KreatorTransformatoraSnNn"],
    "assign_catalog_to_element": ["KreatorPrzypisaniaKatalogu"],
    "add_nn_outgoing_field": ["KreatorPolaNn"],
    "add_nn_load": ["KreatorOdbioruNn"],
    "add_converter_source": ["KreatorZrodlaOze"],
    "add_genset_nn": ["KreatorZrodloDyspozycyjne"],
    "add_ups_nn": ["KreatorZrodloDyspozycyjne"],
    "add_shunt_compensator_sn": ["KreatorKompensatoraSn"],
    "add_ct": ["KreatorPomiaru"],
    "add_vt": ["KreatorPomiaru"],
    "add_relay": ["KreatorPrzekaznika"],
    # Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21): pisarz nastaw zabezpieczenia w modelu.
    "update_protection_settings": ["EdytorNastawZabezpieczenia"],
    # P0.9 (nN STUDIO): odcinek/rozdzielnica/aparat/sekcja nN.
    "add_nn_cable_segment": ["KreatorOdcinkaNn"],
    "add_nn_distribution_board": ["KreatorRozdzielnicyNn"],
    "add_nn_switch_device": ["KreatorAparatuNn"],
    "add_nn_rcd": ["KreatorRcdNn"],
    "add_nn_section_coupler": ["KreatorRozdzielnicyNn"],
    # POLA-W-TORZE: akcja naprawcza W042 — przepięcie elementu na zacisk pola.
    "przepnij_element_na_pole": ["KreatorPrzepieciaNaPole"],
}

# Operations that don't need a dedicated modal
NO_MODAL_NEEDED = {
    "set_normal_open_point",  # inline action
    "update_element_parameters",  # PropertyGrid handles this
    "rename_element",  # inline edit
    "set_label",  # inline edit
    "set_source_operating_mode",  # inline edit
    "set_dynamic_profile",  # inline edit
    # P0.9 (nN STUDIO): edycja warunków ułożenia odcinka nN jest edycją INLINE
    # w tabeli ODCINKI, tak jak `update_element_parameters` powyżej — bez
    # osobnego formularza modalnego.
    "set_nn_cable_laying_conditions",
}


def _zrodla_niezalezne_od_testow(katalog: Path) -> list[Path]:
    return sorted(
        plik
        for plik in katalog.glob("*.ts*")
        if "__tests__" not in plik.parts and not plik.name.endswith((".test.ts", ".test.tsx"))
    )


def find_creator_files(creators_dir: Path | None = None) -> dict[str, Path]:
    """Żywe komponenty kreatorów ui2: nazwa komponentu → plik `.tsx` (bez testów)."""
    katalog = creators_dir or CREATORS_DIR
    if not katalog.exists():
        return {}
    pliki: dict[str, Path] = {}
    for plik in sorted(katalog.glob("**/*.tsx")):
        if "__tests__" in plik.parts or plik.name.endswith(".test.tsx"):
            continue
        pliki.setdefault(plik.stem, plik)
    return pliki


def operation_violations(
    operation_to_modal: dict[str, list[str]], creators: dict[str, Path]
) -> list[str]:
    """Operacja bez żywego dostawcy albo dostawca, który operacji nie wysyła."""
    violations: list[str] = []
    for op_name, providers in operation_to_modal.items():
        literal = re.compile(rf"['\"]{re.escape(op_name)}['\"]")
        found = False
        for provider in providers:
            plik = creators.get(provider)
            if plik is None:
                continue
            if any(
                literal.search(zrodlo.read_text(encoding="utf-8"))
                for zrodlo in _zrodla_niezalezne_od_testow(plik.parent)
            ):
                found = True
                break
        if not found:
            violations.append(
                f"Operation '{op_name}' has no live dialog: none of {providers} exists in "
                "ui2/kreatory with the operation literal in its directory"
            )
    return violations


def main() -> int:
    creators = find_creator_files()
    if not creators:
        print(f"VIOLATION: no creator components found in {CREATORS_DIR}")
        return 1

    violations = operation_violations(OPERATION_TO_MODAL, creators)

    if violations:
        print(f"\n{'='*60}")
        print(f"DIALOG COMPLETENESS GUARD: {len(violations)} violation(s)")
        print(f"{'='*60}\n")
        for v in violations:
            print(f"  VIOLATION: {v}")
        print()
        return 1

    print(
        f"Dialog Completeness Guard: OK ({len(creators)} creator components, "
        f"{len(OPERATION_TO_MODAL)} operations covered)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
