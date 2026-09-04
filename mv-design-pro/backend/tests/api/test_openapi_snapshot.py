"""Snapshot OpenAPI = kontrakt HTTP platformy (M0-6 / CV-0).

Różnica między schematem generowanym a snapshotem oznacza zmianę kontraktu: świadomą
(uruchom `scripts/generuj_snapshot_openapi.py` i opisz zmianę w commicie) albo regresję.
Snapshot jest też dowodem, że fasada `case_id → klucz projektu` (CV-1) nie zmienia
kontraktu ścieżek `/api/cases/{case_id}/...`.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
SNAPSHOT = BACKEND / "schemas" / "openapi_snapshot.json"


def _generator():
    spec = importlib.util.spec_from_file_location(
        "generuj_snapshot_openapi", BACKEND / "scripts" / "generuj_snapshot_openapi.py"
    )
    modul = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(modul)
    return modul


def test_snapshot_openapi_istnieje_i_jest_aktualny() -> None:
    assert SNAPSHOT.exists(), "brak snapshotu — uruchom scripts/generuj_snapshot_openapi.py"
    biezacy = json.loads(_generator().schemat_kanoniczny())
    zapisany = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    if biezacy != zapisany:
        sciezki_nowe = sorted(set(biezacy["paths"]) - set(zapisany["paths"]))
        sciezki_usuniete = sorted(set(zapisany["paths"]) - set(biezacy["paths"]))
        zmienione = sorted(
            p
            for p in set(biezacy["paths"]) & set(zapisany["paths"])
            if biezacy["paths"][p] != zapisany["paths"][p]
        )
        raise AssertionError(
            "kontrakt OpenAPI rozni sie od snapshotu — swiadoma zmiana? uruchom "
            "scripts/generuj_snapshot_openapi.py i opisz ja w commicie. "
            f"nowe={sciezki_nowe[:10]} usuniete={sciezki_usuniete[:10]} zmienione={zmienione[:10]} "
            f"(schematy: {len(biezacy.get('components', {}).get('schemas', {}))} vs "
            f"{len(zapisany.get('components', {}).get('schemas', {}))})"
        )


def test_snapshot_openapi_jest_deterministyczny() -> None:
    """Dwa generowania w tym samym procesie dają identyczny tekst (klucze posortowane)."""
    generator = _generator()
    assert generator.schemat_kanoniczny() == generator.schemat_kanoniczny()
