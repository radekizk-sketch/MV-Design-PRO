"""Snapshot OpenAPI aplikacji (M0-6 / CV-0): `schemas/openapi_snapshot.json`.

Kontrakt HTTP jest częścią platformy — zmiana kontraktu ma być WIDOCZNA w diffie, nie
odkrywana przez klienta. Test `tests/api/test_openapi_snapshot.py` porównuje schemat
generowany z aplikacji ze snapshotem; różnica = albo świadoma zmiana kontraktu (wtedy
uruchom ten skrypt i opisz zmianę w commicie), albo regresja.

Uruchomienie (z `mv-design-pro/backend`): `python scripts/generuj_snapshot_openapi.py`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "src"))

CEL = BACKEND / "schemas" / "openapi_snapshot.json"


def schemat_kanoniczny() -> str:
    from api.main import app  # noqa: PLC0415 — import po ustawieniu sys.path

    schemat = app.openapi()
    return json.dumps(schemat, ensure_ascii=False, sort_keys=True, indent=1) + "\n"


def main() -> int:
    CEL.write_text(schemat_kanoniczny(), encoding="utf-8")
    dane = json.loads(CEL.read_text(encoding="utf-8"))
    print(
        f"zapisano {CEL}: {len(dane.get('paths', {}))} sciezek, {len(dane.get('components', {}).get('schemas', {}))} schematow"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
