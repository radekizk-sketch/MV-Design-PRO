"""Generator fikstury e2e importu arkusza — uruchamiany ręcznie po zmianie kontraktu:

    cd mv-design-pro/backend && PYTHONPATH=.:src python tests/utils/generuj_arkusz_e2e.py

Test `tests/test_xlsx_import.py::TestFiksturaE2E` pilnuje, że plik w repo jest tym,
co generuje ten skrypt (bajt w bajt — znacznik czasu dokumentu jest przypięty).
"""

from __future__ import annotations

from pathlib import Path

from tests.utils.arkusz_xlsx import arkusz_fikstury_e2e

SCIEZKA_FIKSTURY = (
    Path(__file__).resolve().parents[3] / "frontend" / "e2e" / "fixtures" / "arkusz-siec-sn.xlsx"
)

if __name__ == "__main__":
    SCIEZKA_FIKSTURY.parent.mkdir(parents=True, exist_ok=True)
    SCIEZKA_FIKSTURY.write_bytes(arkusz_fikstury_e2e())
    print(f"zapisano {SCIEZKA_FIKSTURY} ({SCIEZKA_FIKSTURY.stat().st_size} B)")
