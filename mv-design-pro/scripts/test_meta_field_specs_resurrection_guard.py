"""Self-test guarda wskrzeszenia dawnych słowników pól (karta W5-B): czerwona iniekcja
na kopii drzewa (kod i dane, każdy klucz i każdy wariant nazwy) + zielone czyste drzewo.

Uruchomienie (z `mv-design-pro`): `python -m pytest -q scripts/test_meta_field_specs_resurrection_guard.py`.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from meta_field_specs_resurrection_guard import (
    ALLOWLIST,
    KATALOGI_KODU,
    sprawdz,
)  # noqa: E402

INIEKCJE_KOD: tuple[tuple[str, str], ...] = (
    ("backend/src/enm/x.py", 'specs = sub["meta"].get("field_specs")\n'),
    ("backend/src/application/y.py", "# czyta nn_field_specs stacji\n"),
    ("backend/scripts/z.py", 'params["switchgear_field_specs"] = []\n'),
    ("backend/tests/t.py", '"field_specs": [],\n'),
    ("frontend/src/ui/a.ts", "const fieldSpecs = station.meta?.field_specs;\n"),
    ("frontend/src/ui/b.tsx", "type X = { nnFieldSpecs?: unknown[] };\n"),
    ("frontend/e2e/c.spec.ts", "const f = meta.field_specs[0];\n"),
    ("frontend/scripts/d.mjs", "const s = station?.meta?.field_specs ?? [];\n"),
    ("scripts/e.py", "WZORZEC = 'switchgearFieldSpecs'\n"),
)

INIEKCJE_DANE: tuple[tuple[str, object], ...] = (
    (
        "frontend/public/test-fixtures/f.enm.json",
        {"substations": [{"meta": {"field_specs": []}}]},
    ),
    (
        "frontend/src/harness-fixtures/generated/g.json",
        {"enm": {"substations": [{"meta": {"nn_field_specs": [{"field_ref": "x"}]}}]}},
    ),
    (
        "backend/tests/fixtures/h.json",
        {"branch_points": [{"materialized_params": {"switchgear_field_specs": []}}]},
    ),
)


def _czyste_drzewo(tmp: Path) -> None:
    for rel in KATALOGI_KODU:
        (tmp / rel).mkdir(parents=True, exist_ok=True)
    (tmp / "backend/src/enm").mkdir(parents=True, exist_ok=True)
    (tmp / "backend/src/enm/pola.py").write_text(
        "bays = enm.get('bays')\n", encoding="utf-8"
    )
    (tmp / "frontend/public/test-fixtures").mkdir(parents=True, exist_ok=True)
    (tmp / "frontend/public/test-fixtures/czysty.enm.json").write_text(
        json.dumps({"bays": [{"ref_id": "p1", "substation_ref": "s1"}]}),
        encoding="utf-8",
    )


def test_czyste_drzewo_zielone() -> None:
    with tempfile.TemporaryDirectory() as katalog:
        tmp = Path(katalog)
        _czyste_drzewo(tmp)
        assert sprawdz(tmp) == []


def test_kazda_iniekcja_kodu_czerwona() -> None:
    for rel, tresc in INIEKCJE_KOD:
        with tempfile.TemporaryDirectory() as katalog:
            tmp = Path(katalog)
            _czyste_drzewo(tmp)
            plik = tmp / rel
            plik.parent.mkdir(parents=True, exist_ok=True)
            plik.write_text(tresc, encoding="utf-8")
            naruszenia = sprawdz(tmp)
            assert naruszenia and naruszenia[0].startswith(f"KOD {rel}:"), (
                rel,
                naruszenia,
            )


def test_kazda_iniekcja_danych_czerwona() -> None:
    for rel, dane in INIEKCJE_DANE:
        with tempfile.TemporaryDirectory() as katalog:
            tmp = Path(katalog)
            _czyste_drzewo(tmp)
            plik = tmp / rel
            plik.parent.mkdir(parents=True, exist_ok=True)
            plik.write_text(json.dumps(dane), encoding="utf-8")
            naruszenia = sprawdz(tmp)
            assert naruszenia == [
                f"DANE {rel}: obiekt z kluczem dawnego nośnika pól"
            ], (
                rel,
                naruszenia,
            )


def test_allowlista_przepuszcza_tylko_nazwane_pliki() -> None:
    with tempfile.TemporaryDirectory() as katalog:
        tmp = Path(katalog)
        _czyste_drzewo(tmp)
        for rel in ALLOWLIST:
            plik = tmp / rel
            plik.parent.mkdir(parents=True, exist_ok=True)
            plik.write_text('KLUCZ = "field_specs"\n', encoding="utf-8")
        assert sprawdz(tmp) == []
        obcy = tmp / "backend/src/enm/migrations/inna.py"
        obcy.write_text('KLUCZ = "field_specs"\n', encoding="utf-8")
        assert len(sprawdz(tmp)) == 1


def test_allowlista_jest_zamknieta() -> None:
    """Zapadka tylko w dół: cztery nazwane pliki (migracja, jej test, guard, self-test)."""
    assert ALLOWLIST == frozenset(
        {
            "backend/src/enm/migrations/field_specs_promocja.py",
            "backend/tests/enm/migrations/test_field_specs_promocja.py",
            "scripts/meta_field_specs_resurrection_guard.py",
            "scripts/test_meta_field_specs_resurrection_guard.py",
        }
    )


def test_realne_drzewo_repo() -> None:
    """Realne drzewo repo jest czyste (dowód kasacji; czerwone = wskrzeszenie)."""
    root = Path(__file__).resolve().parents[1]
    naruszenia = sprawdz(root)
    assert naruszenia == [], "\n".join(naruszenia[:40])
