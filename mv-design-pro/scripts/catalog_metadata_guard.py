#!/usr/bin/env python3
"""
CI Guard: catalog_metadata_guard.py

Checks that critical catalog groups expose frozen quality metadata and a
minimum industrial width for the supported scope.
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"
sys.path.insert(0, str(BACKEND_SRC))

from network_model.catalog.repository import get_default_mv_catalog  # noqa: E402
from network_model.catalog.types import CATALOG_CONTRACT_VERSION  # noqa: E402

INDUSTRIAL_MIN_WIDTH = {
    "LINIA_SN": 25,
    "KABEL_SN": 50,
    "TRAFO_SN_NN": 34,
    "APARAT_SN": 36,
    "ZRODLO_SN": 14,
    "CONVERTER": 11,
    "FALOWNIK_PV": 4,
    "FALOWNIK_BESS": 4,
    "CT": 3,
    "VT": 2,
    "ZABEZPIECZENIE": 9,
    "KRZYWA_ZABEZPIECZENIA": 2,
    "SZABLON_NASTAW": 2,
    "KABEL_NN": 17,
    "APARAT_NN": 3,
    "OBCIAZENIE": 3,
}


def _groups() -> dict[str, list[object]]:
    repo = get_default_mv_catalog()
    return {
        "LINIA_SN": repo.list_line_types(),
        "KABEL_SN": repo.list_cable_types(),
        "TRAFO_SN_NN": repo.list_transformer_types(),
        "APARAT_SN": repo.list_switch_equipment_types(),
        "CONVERTER": repo.list_converter_types(),
        "ZRODLO_SN": repo.list_source_system_types(),
        "CT": repo.list_ct_types(),
        "VT": repo.list_vt_types(),
        "FALOWNIK_PV": repo.list_pv_inverter_types(),
        "FALOWNIK_BESS": repo.list_bess_inverter_types(),
        "ZABEZPIECZENIE": repo.list_protection_device_types(),
        "KRZYWA_ZABEZPIECZENIA": repo.list_protection_curves(),
        "SZABLON_NASTAW": repo.list_protection_setting_templates(),
        "KABEL_NN": repo.list_lv_cable_types(),
        "APARAT_NN": repo.list_lv_apparatus_types(),
        "OBCIAZENIE": repo.list_load_types(),
    }


def _industrial_width_errors() -> list[str]:
    errors: list[str] = []
    for group, items in _groups().items():
        minimum = INDUSTRIAL_MIN_WIDTH.get(group)
        if minimum is None:
            continue
        active_count = sum(1 for item in items if item.to_dict().get("catalog_status") != "TESTOWY")
        if active_count < minimum:
            errors.append(f"{group}: rekordow={active_count} < minimum={minimum}")
    return errors


def main() -> int:
    errors: list[str] = []
    analytical_groups = {"ZABEZPIECZENIE", "KRZYWA_ZABEZPIECZENIA", "SZABLON_NASTAW"}

    for group, items in _groups().items():
        for item in items:
            data = item.to_dict()
            for field_name in (
                "verification_status",
                "source_reference",
                "catalog_status",
                "contract_version",
            ):
                if not data.get(field_name):
                    errors.append(f"{group}: brak pola {field_name} dla rekordu {data.get('id')}")

            if data.get("contract_version") != CATALOG_CONTRACT_VERSION:
                errors.append(
                    f"{group}: rekord {data.get('id')} ma contract_version={data.get('contract_version')!r}"
                )

            if (
                data.get("catalog_status") == "PRODUKCYJNY_V1"
                and data.get("verification_status") == "NIEWERYFIKOWANY"
            ):
                errors.append(
                    f"{group}: rekord {data.get('id')} jest PRODUKCYJNY_V1 i NIEWERYFIKOWANY"
                )

            if group not in analytical_groups and data.get("catalog_status") == "ANALITYCZNY_V1":
                errors.append(
                    f"{group}: rekord {data.get('id')} nie moze miec ANALITYCZNY_V1 poza grupa ochrony"
                )

    errors.extend(_industrial_width_errors())

    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1

    print("OK: frozen catalog metadata contract preserved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
