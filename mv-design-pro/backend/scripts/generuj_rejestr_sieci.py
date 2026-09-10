"""Generuje `docs/reference-networks/REGISTRY_TABLE.md` z rejestru `tests/golden/registry.py`.

Uruchomienie (z `mv-design-pro/backend`): `python scripts/generuj_rejestr_sieci.py`.
Test `tests/golden/test_registry.py` sprawdza, że plik jest aktualny.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "src"))

from tests.golden.registry import tabela_markdown  # noqa: E402

CEL = BACKEND.parent / "docs" / "reference-networks" / "REGISTRY_TABLE.md"


def main() -> int:
    CEL.parent.mkdir(parents=True, exist_ok=True)
    CEL.write_text(tabela_markdown(), encoding="utf-8")
    print(f"zapisano {CEL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
