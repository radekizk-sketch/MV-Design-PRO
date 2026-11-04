"""Tablica parytetu opisu pól rozdzielnicy sekcji GPZ: `schemas/rozdzielnica_gpz_parytet_v1.json`.

Jedno źródło opisu pól (`enm.rozdzielnica_gpz`) ma lustro we frontendzie
(`ui/workspace/gpz/poleGpzDefinicje.ts`). Test backendu (`tests/enm/test_rozdzielnica_gpz.py`)
porównuje plik z eksportem, test vitest — lustro z plikiem; rozjazd po którejkolwiek stronie
wywraca test. Po świadomej zmianie opisu pól uruchom (z `mv-design-pro/backend`):
`python scripts/eksport_parytetu_rozdzielnicy_gpz.py`.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "src"))

CEL = BACKEND / "schemas" / "rozdzielnica_gpz_parytet_v1.json"


def tresc() -> str:
    import json  # noqa: PLC0415

    from enm.rozdzielnica_gpz import eksport_parytetu_rozdzielnicy  # noqa: PLC0415

    return json.dumps(eksport_parytetu_rozdzielnicy(), ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    CEL.write_text(tresc(), encoding="utf-8")
    print(f"zapisano {CEL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
