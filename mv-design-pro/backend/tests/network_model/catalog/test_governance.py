"""
Testy governance katalogu: tryb importu i bramka katalogowa importu.

W1 (2026-09-09): governance biblioteki typów sieci (P13b — `TypeLibraryManifest`,
`TypeLibraryExport`, `compute_fingerprint`, `sort_types_deterministically`,
końcówki `GET|POST /api/catalog/export|import`) skasowane razem z tabelami typów
w bazie (`line_types`, `cable_types`, `transformer_types`, `switch_equipment_types`,
`inverter_types`) — jedyny konsument końcówek (przyciski eksportu/importu w
`ui/catalog/TypeLibraryBrowser.tsx`) skasowany razem z nimi; w bazie deweloperskiej
0 wierszy w każdej tabeli. Jedyna prawda typów: katalog
statyczny + katalog projektu w ENM (`enm/katalog_projektu.py`). Testy eksportu/
importu zeszły razem z kodem; `ImportMode` zostaje, bo steruje importem biblioteki
zabezpieczeń (`CatalogGovernanceService.import_protection_library`, pin:
`tests/test_protection_library.py`).
"""

import pytest
from network_model.catalog.governance import ImportMode, wymaga_referencji_katalogowej


def test_import_mode_enum():
    """ImportMode enum has MERGE and REPLACE."""
    assert ImportMode.MERGE.value == "merge"
    assert ImportMode.REPLACE.value == "replace"
    assert ImportMode("merge") == ImportMode.MERGE
    assert ImportMode("replace") == ImportMode.REPLACE


@pytest.mark.parametrize(
    "rodzaj", ["cable", "line_overhead", "CABLE", "LINE", " Cable ", "Line_Overhead"]
)
def test_wymaga_referencji_katalogowej_dla_odcinkow_w_obu_nazewnictwach(rodzaj: str) -> None:
    """Bramka importu normalizuje nazewnictwo ENM (`cable`/`line_overhead`) i rdzenia
    (`CABLE`/`LINE`) — jedno źródło prawdy dla każdej drogi wejścia modelu."""
    assert wymaga_referencji_katalogowej(rodzaj) is True


@pytest.mark.parametrize("rodzaj", ["transformer", "TRANSFORMER", "switch", "", None])
def test_wymaga_referencji_katalogowej_nie_dotyczy_pozostalych(rodzaj: str | None) -> None:
    """Transformator rozstrzyga polityka operacji domenowych, nie bramka importu;
    brak rodzaju nie zapala bramki."""
    assert wymaga_referencji_katalogowej(rodzaj) is False
